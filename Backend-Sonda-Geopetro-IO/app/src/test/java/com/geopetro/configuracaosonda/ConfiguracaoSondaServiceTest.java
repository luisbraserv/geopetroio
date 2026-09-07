package com.geopetro.configuracaosonda;

import com.geopetro.core.exception.BusinessException;
import jakarta.persistence.EntityManagerFactory;
import java.util.*;
import javax.sql.DataSource;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.transaction.*;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import static com.geopetro.configuracaosonda.ConfiguracaoSonda.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = ConfiguracaoSondaServiceTest.Config.class)
class ConfiguracaoSondaServiceTest {
    @Configuration @EnableJpaRepositories(basePackageClasses = ConfiguracaoSondaRepository.class)
    static class Config {
        @Bean(destroyMethod = "close") com.zaxxer.hikari.HikariDataSource dataSource() {
            var source = new com.zaxxer.hikari.HikariDataSource();
            source.setJdbcUrl("jdbc:h2:mem:config-sonda-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
            return source;
        }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource source) {
            var factory = new LocalContainerEntityManagerFactoryBean(); factory.setDataSource(source);
            factory.setPackagesToScan(ConfiguracaoSondaEntity.class.getPackageName());
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "create-drop")); return factory;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
    }
    @Autowired ConfiguracaoSondaRepository repository;
    @Autowired PlatformTransactionManager manager;
    ConfiguracaoSondaService service;
    ConfiguracaoSondaAccess access;
    SimpMessagingTemplate messages;
    @BeforeEach void setup() {
        repository.deleteAll(); access = mock(ConfiguracaoSondaAccess.class); messages = mock(SimpMessagingTemplate.class);
        service = new ConfiguracaoSondaService(repository, access, messages);
    }
    ConfiguracaoSonda save(long revision, List<Limite> limits) {
        return new TransactionTemplate(manager).execute(status -> service.salvar("ana", 7, new Alteracao(revision, limits)));
    }
    @Test void emptyUnitDoesNotInventLimitsOrWriteToDatabase() {
        var view = service.ler("ana", 7);
        assertEquals(0, view.revisao()); assertTrue(view.limites().isEmpty()); assertNull(view.atualizadoEm());
        assertEquals(0, repository.count()); verify(access).exigir("ana", 7); verifyNoInteractions(messages);
        assertTrue(new ConfiguracaoSondaVinculo(repository).descreverVinculo(7L).isEmpty());
    }
    @Test void persistsRevisionAuthorAndLimitsAndPublishesOnlyAfterCommit() {
        var limit = new Limite("PRESSAO_01", null, 100.0, null, 120.0, 3, 5, true);
        var first = new TransactionTemplate(manager).execute(status -> {
            var saved = service.salvar("ana", 7, new Alteracao(0, List.of(limit)));
            verifyNoInteractions(messages); return saved;
        });
        assertEquals(1, first.revisao()); assertEquals("ana", first.atualizadoPor()); assertNotNull(first.atualizadoEm());
        verify(messages).convertAndSend("/topic/config/unidades-sondas/7", first);
        var restarted = new ConfiguracaoSondaService(repository, access, messages);
        assertEquals(List.of(limit), restarted.ler("ana", 7).limites());
        assertEquals(2, save(1, List.of()).revisao());
        assertEquals(409, assertThrows(BusinessException.class, () -> save(1, List.of(limit))).getStatus().value());
        assertTrue(service.ler("ana", 7).limites().isEmpty());
        assertTrue(new ConfiguracaoSondaVinculo(repository).descreverVinculo(7L).isPresent());
    }
    @Test void rollbackNeverPublishesUncommittedConfiguration() {
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            service.salvar("ana", 7, new Alteracao(0, List.of())); status.setRollbackOnly();
        });
        assertEquals(0, repository.count()); verifyNoInteractions(messages);
    }
    @Test void brokerFailureDoesNotLoseTheCommittedSnapshot() {
        doThrow(new IllegalStateException("offline")).when(messages).convertAndSend(anyString(), any(ConfiguracaoSonda.class));
        assertEquals(1, save(0, List.of()).revisao());
        assertEquals(1, service.ler("ana", 7).revisao());
    }
    @Test void authorizationRunsBeforeReadAndWrite() {
        doThrow(new BusinessException("denied")).when(access).exigir("ana", 7);
        assertThrows(BusinessException.class, () -> service.ler("ana", 7));
        assertThrows(BusinessException.class, () -> save(0, List.of()));
        assertEquals(0, repository.count()); verifyNoInteractions(messages);
    }
    @Test void rejectsMalformedLimitsWithoutPersistingThem() {
        for (var limit : List.of(
            new Limite(null, null, 10.0, null, null, 0, 0, true),
            new Limite("UNKNOWN", null, 10.0, null, null, 0, 0, true),
            new Limite("PRESSAO_01", null, Double.NaN, null, null, 0, 0, true),
            new Limite("PRESSAO_01", null, null, null, null, 0, 0, true),
            new Limite("PRESSAO_01", 5.0, 10.0, 6.0, null, 0, 0, true),
            new Limite("PRESSAO_01", 10.0, 10.0, null, null, 0, 0, true),
            new Limite("PRESSAO_01", null, 20.0, null, 10.0, 0, 0, true),
            new Limite("PRESSAO_01", null, 10.0, null, null, -1, 0, true))) {
            assertThrows(BusinessException.class, () -> save(0, List.of(limit)));
        }
        var valid = new Limite("VAZAO_01", null, 10.0, null, null, 0, 0, true);
        assertThrows(BusinessException.class, () -> save(0, List.of(valid, valid)));
        assertThrows(BusinessException.class, () -> save(0, null));
        assertEquals(0, repository.count()); verifyNoInteractions(messages);
    }
}
