package com.geopetro.configuracoes;

import com.geopetro.core.exception.BusinessException;
import com.geopetro.recuperacao.SmtpRecoveryMail;
import jakarta.persistence.EntityManagerFactory;
import java.nio.file.*;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.mock.env.MockEnvironment;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import static com.geopetro.configuracoes.SmtpSettingsController.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = SmtpSettingsServiceTest.Config.class)
class SmtpSettingsServiceTest {
    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = SmtpSettingsRepository.class)
    static class Config {
        @Bean(destroyMethod = "close") com.zaxxer.hikari.HikariDataSource dataSource() {
            var source = new com.zaxxer.hikari.HikariDataSource();
            source.setJdbcUrl("jdbc:h2:mem:smtp-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
            return source;
        }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource source) {
            var factory = new LocalContainerEntityManagerFactoryBean(); factory.setDataSource(source);
            factory.setPackagesToScan(SmtpSettingsEntity.class.getPackageName());
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "create-drop"));
            return factory;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
    }
    @Autowired SmtpSettingsRepository repository;
    @Autowired PlatformTransactionManager manager;
    @TempDir Path temp;
    private SmtpSettingsService service;
    private SmtpSecretCipher secrets;
    private MockEnvironment environment;
    @BeforeEach void setup() {
        repository.deleteAll();
        secrets = new SmtpSecretCipher(temp.resolve("smtp.key").toString(), "");
        environment = new MockEnvironment().withProperty("spring.mail.password", "environment-only");
        service = new SmtpSettingsService(repository, secrets, environment);
    }
    private View save(Update update) {
        return new TransactionTemplate(manager).execute(status -> service.save(update));
    }
    private Update update(Long version, String password, boolean enabled, boolean clear) {
        return new Update(enabled, "smtp.example.test", 587, SmtpSettings.Transport.STARTTLS, true,
            "mailer", password, clear, "mailer@example.test", "https://app.example.test/", version);
    }
    @Test void defaultsShowPasswordPresenceWithoutReturningOrPersistingTheSecret() {
        View view = service.view();
        assertTrue(view.passwordConfigured()); assertNull(view.version());
        assertFalse(view.toString().contains("environment-only"));
        assertEquals(0, repository.count()); assertFalse(Files.exists(temp.resolve("smtp.key")));
    }
    @Test void persistsEncryptedCredentialAndReadsItAfterServiceRestart() {
        var view = save(update(null, "secret-only-for-test", true, false));
        var entity = repository.findById(1L).orElseThrow();
        assertFalse(entity.passwordEncrypted.contains("secret-only-for-test"));
        assertTrue(entity.passwordEncrypted.startsWith("v1:"));
        assertTrue(view.passwordConfigured()); assertNotNull(view.version());
        assertFalse(view.toString().contains("secret-only-for-test"));
        var restarted = new SmtpSettingsService(repository, new SmtpSecretCipher(temp.resolve("smtp.key").toString(), ""), environment);
        assertEquals("secret-only-for-test", restarted.current().password());
        assertEquals("https://app.example.test", restarted.current().frontendUrl());
    }
    @Test void supportsTheFullUnicodePasswordLimitAfterEncryption() {
        String password = "\u5bc6".repeat(1024);
        save(update(null, password, true, false));
        assertEquals(password, service.current().password());
        assertTrue(repository.findById(1L).orElseThrow().passwordEncrypted.length() > 4096);
    }
    @Test void blankPasswordPreservesCredentialAndExplicitClearRemovesIt() {
        var first = save(update(null, "original", true, false));
        var next = save(update(first.version(), "", true, false));
        assertEquals("original", service.current().password());
        assertTrue(next.version() > first.version());
        var cleared = save(update(next.version(), "", false, true));
        assertFalse(cleared.passwordConfigured()); assertEquals("", service.current().password());
        assertNull(repository.findById(1L).orElseThrow().passwordEncrypted);
    }
    @Test void firstSaveCanPreserveEnvironmentCredentialWithoutReturningItToBrowser() {
        save(update(null, "", true, false));
        assertEquals("environment-only", service.current().password());
        assertFalse(repository.findById(1L).orElseThrow().passwordEncrypted.contains("environment-only"));
    }
    @Test void rejectsStaleEditAndDoesNotOverwriteCurrentPassword() {
        var first = save(update(null, "original", true, false));
        save(update(first.version(), "newer", true, false));
        assertEquals(409, assertThrows(BusinessException.class, () -> save(update(first.version(), "stale", true, false))).getStatus().value());
        assertEquals("newer", service.current().password());
        assertThrows(BusinessException.class, () -> save(update(null, "stale", true, false)));
    }
    @Test void rejectsMissingCredentialsInsecureAuthenticationAndUntrustedOrigins() {
        assertThrows(BusinessException.class, () -> save(update(null, "", true, true)));
        var base = update(null, "pass", true, false);
        for (String origin : new String[]{"http://corp.example.test", "https://app.example.test/path", "https://user@app.example.test"}) {
            assertThrows(BusinessException.class, () -> save(new Update(true, base.host(), 587,
                SmtpSettings.Transport.STARTTLS, true, base.username(), "pass", false, base.from(), origin, null)));
        }
        assertThrows(BusinessException.class, () -> save(new Update(true, base.host(), 25,
            SmtpSettings.Transport.NONE, true, "mailer", "pass", false, base.from(), base.frontendUrl(), null)));
        assertEquals(0, repository.count());
    }
    @Test void disabledDraftCanBeIncompleteAndOverridesEnabledEnvironment() {
        environment.withProperty("recovery.enabled", "true");
        save(new Update(false, "", 587, SmtpSettings.Transport.STARTTLS, true, "", "", true, "", "", null));
        assertFalse(service.current().enabled());
        assertFalse(service.view().passwordConfigured());
    }
    @Test void recoveryImmediatelyUsesTheSavedSettingsAndStopsWhenDisabled() {
        var sender = mock(SmtpTransport.class);
        var recovery = new SmtpRecoveryMail(service, sender);
        assertFalse(recovery.available());
        var saved = save(update(null, "test-password", true, false));
        assertTrue(recovery.available());
        recovery.sendLink("ana@example.test", "x".repeat(43));
        var config = org.mockito.ArgumentCaptor.forClass(SmtpSettings.class);
        verify(sender).send(config.capture(), any());
        assertEquals("smtp.example.test", config.getValue().host());
        assertEquals("test-password", config.getValue().password());
        save(update(saved.version(), "", false, false));
        assertFalse(recovery.available());
        assertThrows(IllegalStateException.class, () -> recovery.sendLink("ana@example.test", "x".repeat(43)));
        verifyNoMoreInteractions(sender);
    }
    @Test void cipherUsesRandomNoncesRejectsTamperingAndNeverCreatesMissingKeyWhileReading() throws Exception {
        String a = secrets.encrypt("same"), b = secrets.encrypt("same");
        assertNotEquals(a, b); assertEquals("same", secrets.decrypt(a));
        byte[] corrupted = Base64.getDecoder().decode(a.substring(3)); corrupted[corrupted.length - 1] ^= 1;
        assertThrows(IllegalStateException.class, () -> secrets.decrypt("v1:" + Base64.getEncoder().encodeToString(corrupted)));
        Files.delete(temp.resolve("smtp.key"));
        assertThrows(IllegalStateException.class, () -> secrets.decrypt(a));
        assertFalse(Files.exists(temp.resolve("smtp.key")));
    }
    @Test void explicitlyManagedKeyMustBe32BytesAndCanDecryptAfterRestart() {
        String key = Base64.getEncoder().encodeToString(new byte[32]);
        var managed = new SmtpSecretCipher(temp.resolve("unused.key").toString(), key);
        var encrypted = managed.encrypt("secret");
        assertEquals("secret", new SmtpSecretCipher(temp.resolve("elsewhere.key").toString(), key).decrypt(encrypted));
        assertFalse(Files.exists(temp.resolve("unused.key")));
        assertThrows(IllegalStateException.class, () -> new SmtpSecretCipher("", "bad").encrypt("secret"));
        assertFalse(update(null, "private-value", true, false).toString().contains("private-value"));
    }
}
