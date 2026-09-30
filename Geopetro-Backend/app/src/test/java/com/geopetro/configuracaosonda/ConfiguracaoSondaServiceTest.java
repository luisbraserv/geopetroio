package com.geopetro.configuracaosonda;

import com.geopetro.cards.CardsDeclarados;
import com.geopetro.cards.ConfiguracaoCards.Card;
import com.geopetro.cards.ConfiguracaoCards.Tipo;
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
    CardsDeclarados cards;

    /** Um card por tipo, mais um desativado — o vocabulario que a unidade 7 declara nos testes. */
    static Card card(String id, Tipo tipo, boolean ativo) {
        return new Card(id, id, tipo, 10, ativo, true, 0, null);
    }
    void declara(Card... declarados) { when(cards.de(7L)).thenReturn(List.of(declarados)); }

    @BeforeEach void setup() {
        repository.deleteAll(); access = mock(ConfiguracaoSondaAccess.class);
        cards = mock(CardsDeclarados.class);
        service = new ConfiguracaoSondaService(repository, access, cards);
        declara(card("PRESSAO_01", Tipo.PRESSAO, true), card("TEMPERATURA_01", Tipo.TEMPERATURA, true));
    }
    ConfiguracaoSonda save(long revision, List<Limite> limits) {
        return new TransactionTemplate(manager).execute(status -> service.salvar("ana", 7, new Alteracao(revision, limits)));
    }
    @Test void emptyUnitDoesNotInventLimitsOrWriteToDatabase() {
        var view = service.ler("ana", 7);
        assertEquals(0, view.revisao()); assertTrue(view.limites().isEmpty()); assertNull(view.atualizadoEm());
        assertEquals(0, repository.count()); verify(access).exigir("ana", 7);
        assertTrue(new ConfiguracaoSondaVinculo(repository).descreverVinculo(7L).isEmpty());
    }
    @Test void persistsRevisionAuthorAndLimitsAndSurvivesRestart() {
        var limit = new Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 3, 5, true);
        var first = new TransactionTemplate(manager).execute(status -> {
            var saved = service.salvar("ana", 7, new Alteracao(0, List.of(limit)));
            return saved;
        });
        assertEquals(1, first.revisao()); assertEquals("ana", first.atualizadoPor()); assertNotNull(first.atualizadoEm());
        var restarted = new ConfiguracaoSondaService(repository, access, cards);
        assertEquals(List.of(limit), restarted.ler("ana", 7).limites());
        assertEquals(2, save(1, List.of()).revisao());
        assertEquals(409, assertThrows(BusinessException.class, () -> save(1, List.of(limit))).getStatus().value());
        assertTrue(service.ler("ana", 7).limites().isEmpty());
        assertTrue(new ConfiguracaoSondaVinculo(repository).descreverVinculo(7L).isPresent());
    }
    @Test void rollbackNaoDeixaConfiguracaoPelaMetade() {
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            service.salvar("ana", 7, new Alteracao(0, List.of())); status.setRollbackOnly();
        });
        assertEquals(0, repository.count());
    }
    // ⚠️ `brokerFailureDoesNotLoseTheCommittedSnapshot` saiu em 2026-09-09 junto com a publicacao
    // que ele cobria: este documento nao viaja mais por STOMP, entao nao ha broker que possa falhar.
    // O que ele protegia — o snapshot sobreviver ao commit — continua coberto pelo teste de
    // persistencia acima, que relê o documento com um service novo.
    @Test void authorizationRunsBeforeReadAndWrite() {
        doThrow(new BusinessException("denied")).when(access).exigir("ana", 7);
        assertThrows(BusinessException.class, () -> service.ler("ana", 7));
        assertThrows(BusinessException.class, () -> save(0, List.of()));
        assertEquals(0, repository.count());
    }
    @Test void rejectsMalformedLimitsWithoutPersistingThem() {
        for (var limit : List.of(
            new Limite("PRESSAO_01", null, null, Double.NaN, null, null, 0, 0, true),
            new Limite("PRESSAO_01", null, null, null, null, null, 0, 0, true),
            new Limite("PRESSAO_01", null, 5.0, 10.0, 6.0, null, 0, 0, true),
            new Limite("PRESSAO_01", null, 10.0, 10.0, null, null, 0, 0, true),
            new Limite("PRESSAO_01", null, null, 20.0, null, 10.0, 0, 0, true),
            new Limite("PRESSAO_01", null, null, 10.0, null, null, -1, 0, true))) {
            assertThrows(BusinessException.class, () -> save(0, List.of(limit)));
        }
        var semDispositivo = new Limite(null, null, null, 10.0, null, null, 0, 0, true);
        assertThrows(BusinessException.class, () -> save(0, List.of(semDispositivo)));
        var valid = new Limite("PRESSAO_01", null, null, 10.0, null, null, 0, 0, true);
        assertThrows(BusinessException.class, () -> save(0, List.of(valid, valid)));
        assertThrows(BusinessException.class, () -> save(0, null));
        assertEquals(0, repository.count());
    }

    /**
     * O vocabulario e da unidade, nao do sistema — RN-089.
     *
     * <p>Ate 2026-09-08 a lista era fixa em cinco ids: uma unidade com card de temperatura nao
     * conseguia limite nenhum para ele, e um id daquela lista passava mesmo sem card que o
     * produzisse — um limite orfao, vigiando uma grandeza que nunca chega.
     */
    @Test void aLimitOnlyExistsForAGrandezaTheUnitDeclares() {
        var temperatura = new Limite("TEMPERATURA_01", null, null, 80.0, null, 95.0, 0, 0, true);
        assertEquals(1, save(0, List.of(temperatura)).revisao(), "a unidade declara o card de temperatura");

        var naoDeclarado = new Limite("NIVEL_TANQUE_01", null, null, 80.0, null, null, 0, 0, true);
        var erro = assertThrows(BusinessException.class, () -> save(1, List.of(naoDeclarado)));
        assertTrue(erro.getMessage().contains("NIVEL_TANQUE_01"), erro.getMessage());

        // O id que a lista fixa antiga aceitava nao passa mais sem um card que o declare.
        declara();
        assertThrows(BusinessException.class, () -> save(1, List.of(temperatura)));
        assertEquals(1, service.ler("ana", 7).revisao(), "nenhuma das recusas gravou");
    }

    /**
     * As tres series de um contador sao limites distintos — RN-098.
     *
     * <p>Sem a serie na chave, "acima de 8" nao diria se fala de vazao — alarme plausivel — ou de
     * volume acumulado, que so cresce: dispararia uma vez e nunca mais fecharia.
     */
    @Test void theThreeStrokeSeriesAreSeparateLimits() {
        declara(card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, true));
        var stroke = new Limite("CONTADOR_STROKE_01", "stroke", null, 120.0, null, null, 0, 0, true);
        var vazao = new Limite("CONTADOR_STROKE_01", "vazao", null, 8.0, null, 10.0, 2, 4, true);
        var volume = new Limite("CONTADOR_STROKE_01", "volumeAcumulado", null, 500.0, null, null, 0, 0, true);
        assertEquals(3, save(0, List.of(stroke, vazao, volume)).limites().size());

        assertThrows(BusinessException.class, () -> save(1, List.of(vazao, vazao)), "mesma serie duas vezes");
        assertThrows(BusinessException.class,
            () -> save(1, List.of(new Limite("CONTADOR_STROKE_01", "torque", null, 8.0, null, null, 0, 0, true))),
            "serie que o card nao produz");
        assertThrows(BusinessException.class,
            () -> save(1, List.of(new Limite("CONTADOR_STROKE_01", null, null, 8.0, null, null, 0, 0, true))),
            "sem serie o limite seria ambiguo entre as tres");
    }

    /**
     * Card desativado mantem o limite hibernando — RN-091.
     *
     * <p>Recusar o limite de um card desativado obrigaria a apaga-lo para salvar qualquer outro, e
     * quem reativasse o card no dia seguinte encontraria a grandeza sem vigilancia nenhuma.
     */
    @Test void aDeactivatedCardKeepsItsLimitHibernating() {
        declara(card("PRESSAO_01", Tipo.PRESSAO, false));
        var limit = new Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 3, 5, true);
        assertEquals(List.of(limit), save(0, List.of(limit)).limites());
    }

    /** O teto de cinco caiu junto com a lista fixa: ele era a contagem daquelas cinco grandezas. */
    @Test void moreThanFiveLimitsFitWhenTheUnitDeclaresThem() {
        declara(card("PRESSAO_01", Tipo.PRESSAO, true), card("PRESSAO_02", Tipo.PRESSAO, true),
            card("TORQUE_01", Tipo.TORQUE, true), card("TORQUE_02", Tipo.TORQUE, true),
            card("TORQUE_03", Tipo.TORQUE, true), card("PESO_01", Tipo.PESO, true),
            card("TEMPERATURA_01", Tipo.TEMPERATURA, true));
        var limites = new ArrayList<Limite>();
        for (var id : List.of("PRESSAO_01", "PRESSAO_02", "TORQUE_01", "TORQUE_02", "TORQUE_03", "PESO_01", "TEMPERATURA_01")) {
            limites.add(new Limite(id, null, null, 100.0, null, null, 0, 0, true));
        }
        assertEquals(7, save(0, limites).limites().size());
    }
}
