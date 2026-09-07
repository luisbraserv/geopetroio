package com.geopetro.recuperacao;

import com.geopetro.core.exception.BusinessException;
import com.geopetro.usuario.adapter.out.persistence.entity.*;
import com.geopetro.usuario.application.port.out.PasswordEncoderPort;
import com.geopetro.usuario.domain.model.*;
import jakarta.persistence.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.embedded.*;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.time.*;
import java.util.*;
import java.util.concurrent.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = RecoveryServiceTest.Config.class)
class RecoveryServiceTest {
    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = RecoveryTokenRepository.class)
    static class Config {
        @Bean(destroyMethod = "close") com.zaxxer.hikari.HikariDataSource dataSource() {
            var source = new com.zaxxer.hikari.HikariDataSource();
            source.setJdbcUrl("jdbc:h2:mem:recovery-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
            return source;
        }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource source) {
            var factory = new LocalContainerEntityManagerFactoryBean();
            factory.setDataSource(source);
            factory.setPackagesToScan("com.geopetro");
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "create-drop"));
            return factory;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
    }
    @Autowired RecoveryUserRepository users;
    @Autowired RecoveryTokenRepository tokens;
    @Autowired PlatformTransactionManager manager;
    @Autowired EntityManagerFactory factory;
    private RecoveryService service;
    private RecoveryMail mail;
    private ExecutorService executor;
    private final Queue<Runnable> queue = new ConcurrentLinkedQueue<>();
    private MutableClock clock;
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);
    private static final String OLD = "Anterior1!", NEW = "NovaSenha2!";
    private String link;
    private TransactionTemplate tx;
    static class MutableClock extends Clock {
        Instant now = Instant.parse("2026-09-06T12:00:00Z");
        public ZoneId getZone() { return ZoneOffset.UTC; }
        public Clock withZone(ZoneId zone) { return this; }
        public Instant instant() { return now; }
        void advance(long seconds) { now = now.plusSeconds(seconds); }
    }
    @BeforeEach void setup() {
        tx = new TransactionTemplate(manager);
        tokens.deleteAll();
        tx.executeWithoutResult(status -> {
            var em = EntityManagerFactoryUtils.getTransactionalEntityManager(factory);
            em.createQuery("delete from UsuarioEntity").executeUpdate();
        });
        queue.clear(); clock = new MutableClock();
        mail = mock(RecoveryMail.class); when(mail.available()).thenReturn(true);
        doAnswer(call -> { link = call.getArgument(1); return null; }).when(mail).sendLink(anyString(), anyString());
        executor = mock(ExecutorService.class);
        doAnswer(call -> { queue.add(call.getArgument(0)); return null; }).when(executor).execute(any());
        PasswordEncoderPort passwords = new PasswordEncoderPort() {
            public String encode(String raw) { return encoder.encode(raw); }
            public boolean matches(String raw, String encoded) { return encoder.matches(raw, encoded); }
        };
        service = new RecoveryService(users, tokens, passwords, mail, executor, clock, manager);
        seed("ana", "ana@example.test", StatusUsuario.ATIVO);
    }
    private void seed(String username, String email, StatusUsuario status) {
        tx.executeWithoutResult(s -> {
            var user = new UsuarioInternoEntity();
            user.setUsername(username); user.setPassword(encoder.encode(OLD)); user.setEmail(email);
            user.setNome("Ana"); user.setTelefone("71999999999"); user.setStatus(status);
            EntityManagerFactoryUtils.getTransactionalEntityManager(factory).persist(user);
        });
    }
    private void change(java.util.function.Consumer<UsuarioEntity> edit) {
        tx.executeWithoutResult(s -> edit.accept(users.locked("ana").orElseThrow()));
    }
    private String password() { return tx.execute(s -> users.locked("ana").orElseThrow().getPassword()); }
    private void issue() { service.issue("ana@example.test"); }
    private void confirm() { service.confirm(link, NEW, NEW); }

    @Test void requestQueuesWorkAndNormalizesEmailWithoutChangingPassword() {
        service.request("  ANA@EXAMPLE.TEST ");
        verify(mail, never()).sendLink(anyString(), anyString());
        assertEquals(0, tokens.count());
        queue.remove().run();
        verify(mail).sendLink(eq("ana@example.test"), anyString());
        assertTrue(encoder.matches(OLD, password()));
    }
    @Test void persistsOnlyHashAndConsumesLinkOnSuccessfulChange() {
        issue();
        assertTrue(link.matches("[A-Za-z0-9_-]{43}"));
        var saved = tokens.findById("ana").orElseThrow();
        assertNotEquals(link, saved.tokenHash);
        assertEquals(RecoveryService.hash(link), saved.tokenHash);
        assertEquals(clock.instant().plusSeconds(1800), saved.expiresAt);
        confirm();
        assertTrue(encoder.matches(NEW, password()));
        assertNull(tokens.findById("ana").orElseThrow().tokenHash);
        assertThrows(BusinessException.class, this::confirm);
        queue.remove().run();
        verify(mail).sendConfirmation("ana@example.test");
    }
    @Test void expiresAtExactlyThirtyMinutes() {
        issue(); clock.advance(1800);
        assertThrows(BusinessException.class, this::confirm);
        assertTrue(encoder.matches(OLD, password()));
    }
    @Test void failedValidationDoesNotConsumeToken() {
        issue();
        assertThrows(com.geopetro.usuario.domain.exception.UsuarioInvalidoException.class, () -> service.confirm(link, "weak", "weak"));
        assertThrows(BusinessException.class, () -> service.confirm(link, NEW, "Different3!"));
        assertThrows(BusinessException.class, () -> service.confirm(link, OLD, OLD));
        confirm();
    }
    @Test void rejectsTamperedMissingAndUnknownTokens() {
        issue();
        for (String value : Arrays.asList(null, "", "../bad", "x".repeat(43))) {
            assertThrows(BusinessException.class, () -> service.confirm(value, NEW, NEW));
        }
        assertTrue(encoder.matches(OLD, password()));
    }
    @Test void newIssueSupersedesOldLinkAndHonorsDatabaseCooldown() {
        issue(); String oldLink = link;
        service.issue("ana@example.test"); assertEquals(oldLink, link);
        clock.advance(60); issue();
        assertNotEquals(oldLink, link);
        assertThrows(BusinessException.class, () -> service.confirm(oldLink, NEW, NEW));
        confirm();
    }
    @Test void failedSmtpRollsBackIssueAndPreservesPreviousLink() {
        issue(); String oldLink = link; clock.advance(60);
        doThrow(new IllegalStateException("simulated SMTP failure")).when(mail).sendLink(anyString(), anyString());
        assertThrows(IllegalStateException.class, this::issue);
        assertEquals(RecoveryService.hash(oldLink), tokens.findById("ana").orElseThrow().tokenHash);
        service.confirm(oldLink, NEW, NEW);
    }
    @Test void skipsUnknownInactiveAndAmbiguousEmails() {
        service.issue("unknown@example.test");
        change(user -> user.setStatus(StatusUsuario.INATIVO)); issue();
        change(user -> user.setStatus(StatusUsuario.ATIVO));
        seed("other", "ANA@example.test", StatusUsuario.ATIVO); issue();
        verify(mail, never()).sendLink(anyString(), anyString());
        assertEquals(0, tokens.count());
    }
    @Test void laterPasswordEmailOrStatusChangeInvalidatesLink() {
        issue(); change(user -> user.setPassword(encoder.encode("Manual3!")));
        assertThrows(BusinessException.class, this::confirm);
        clock.advance(60); issue(); change(user -> user.setEmail("changed@example.test"));
        assertThrows(BusinessException.class, this::confirm);
        change(user -> user.setEmail("ana@example.test"));
        clock.advance(60); issue(); change(user -> user.setStatus(StatusUsuario.INATIVO));
        assertThrows(BusinessException.class, this::confirm);
    }
    @Test void limitsPerEmailWithoutRevealingWhetherItExists() {
        for (int i = 0; i < 4; i++) service.request(" ANA@example.test ");
        assertEquals(3, queue.size());
        clock.advance(900); service.request("ana@example.test");
        assertEquals(4, queue.size());
    }
    @Test void disabledSenderFullQueueAndGlobalLimitReturnUnavailable() {
        when(mail.available()).thenReturn(false);
        assertEquals(503, assertThrows(BusinessException.class, () -> service.request("ana@example.test")).getStatus().value());
        when(mail.available()).thenReturn(true);
        for (int i = 0; i < 60; i++) service.request("user" + i + "@example.test");
        assertEquals(503, assertThrows(BusinessException.class, () -> service.request("extra@example.test")).getStatus().value());
        clock.advance(60);
        doThrow(new RejectedExecutionException()).when(executor).execute(any());
        assertEquals(503, assertThrows(BusinessException.class, () -> service.request("extra@example.test")).getStatus().value());
    }
    @Test void notificationFailureDoesNotUndoPasswordChange() {
        issue(); doThrow(new IllegalStateException("simulated")).when(mail).sendConfirmation(anyString());
        confirm(); assertDoesNotThrow(() -> queue.remove().run());
        assertTrue(encoder.matches(NEW, password()));
    }
    @Test void concurrentConfirmationHasExactlyOneWinner() throws Exception {
        issue();
        try (var pool = Executors.newFixedThreadPool(2)) {
            var start = new CountDownLatch(1);
            Callable<Boolean> attempt = () -> { start.await(); try { confirm(); return true; } catch (BusinessException e) { return false; } };
            var one = pool.submit(attempt); var two = pool.submit(attempt); start.countDown();
            assertNotEquals(one.get(10, TimeUnit.SECONDS), two.get(10, TimeUnit.SECONDS));
            assertTrue(encoder.matches(NEW, password()));
        }
    }
}
