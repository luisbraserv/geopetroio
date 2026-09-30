package com.geopetro.simulador;

import com.geopetro.core.exception.*;
import com.geopetro.simulador.adapter.in.web.request.*;
import com.geopetro.simulador.adapter.in.web.response.CenarioResponse;
import com.geopetro.simulador.adapter.out.persistence.entity.*;
import com.geopetro.simulador.adapter.out.persistence.repository.*;
import com.geopetro.simulador.application.service.*;
import jakarta.persistence.EntityManagerFactory;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.context.annotation.*;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.jdbc.datasource.embedded.*;
import org.springframework.orm.jpa.*;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.transaction.*;
import org.springframework.transaction.annotation.EnableTransactionManagement;
import org.springframework.transaction.support.TransactionTemplate;
import javax.sql.DataSource;
import java.util.Map;
import static org.assertj.core.api.Assertions.*;

@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = PocoPersistenceTest.Config.class)
class PocoPersistenceTest {
    @Configuration @EnableTransactionManagement
    @EnableJpaRepositories(basePackageClasses = PocoJpaRepository.class)
    static class Config {
        @Bean DataSource dataSource() { return new EmbeddedDatabaseBuilder().generateUniqueName(true).setType(EmbeddedDatabaseType.H2).build(); }
        @Bean LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource dataSource) {
            var factory = new LocalContainerEntityManagerFactoryBean();
            factory.setDataSource(dataSource);
            factory.setPackagesToScan(PocoEntity.class.getPackageName());
            factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
            factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "create-drop"));
            return factory;
        }
        @Bean PlatformTransactionManager transactionManager(EntityManagerFactory factory) { return new JpaTransactionManager(factory); }
        @Bean PocoService pocos(PocoJpaRepository repository, CenarioSimuladorJpaRepository cenarios) { return new PocoService(repository, cenarios); }
        @Bean CenarioSimuladorService cenarios(CenarioSimuladorJpaRepository repository, PastaSimuladorJpaRepository pastas, PocoService pocos) {
            return new CenarioSimuladorService(repository, pastas, pocos);
        }
    }
    @org.springframework.beans.factory.annotation.Autowired PocoService pocos;
    @org.springframework.beans.factory.annotation.Autowired CenarioSimuladorService cenarios;
    @org.springframework.beans.factory.annotation.Autowired PlatformTransactionManager tm;
    @org.springframework.beans.factory.annotation.Autowired PocoJpaRepository pocoRepository;

    @Test void sharedGeometryIsResolvedAfterUpdateAndLegacyRemainsUnchanged() {
        var poco = pocos.criar(new PocoRequest("Poço A", PocoGeometryTest.vertical(1500), null), "ana");
        var a = cenarios.criar(request("Squeeze", "squeeze", poco, "{\"fases\":[],\"trajectory\":{},\"wellFinalMD\":1,\"wellFinalTVD\":1,\"density\":15.8}"), "ana");
        var b = cenarios.criar(request("Tampão", "tampao", poco, "{\"density\":16}"), "bruno");
        var legacy = cenarios.criar(request("Legado", "tampao", null, "{\"wellFinalMD\":1234}"), "ana");
        assertThat(a.getFormValue()).isEqualTo("{\"density\":15.8}");
        var updated = pocos.atualizar(poco.getId(), new PocoRequest("Poço corrigido", PocoGeometryTest.vertical(1600), poco.getVersion()), "bruno");
        assertThat(updated.getVersion()).isGreaterThan(poco.getVersion());
        for (var id : new Long[]{a.getId(), b.getId()}) {
            var current = CenarioResponse.de(cenarios.buscar(id));
            assertThat(current.poco().geometria().wellFinalMD()).isEqualTo(1600);
            assertThat(current.poco().nome()).isEqualTo("Poço corrigido");
            assertThat(current.poco().atualizadoPor()).isEqualTo("bruno");
        }
        assertThat(cenarios.buscar(legacy.getId()).getPoco()).isNull();
        assertThat(cenarios.buscar(legacy.getId()).getFormValue()).isEqualTo("{\"wellFinalMD\":1234}");
        assertThatThrownBy(() -> pocos.excluir(poco.getId())).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> new TransactionTemplate(tm).executeWithoutResult(status -> {
            pocoRepository.deleteById(poco.getId());
            pocoRepository.flush();
        })).isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
        cenarios.excluir(a.getId());
        cenarios.excluir(b.getId());
        pocos.excluir(poco.getId());
        assertThatThrownBy(() -> pocos.buscar(poco.getId())).isInstanceOf(ResourceNotFoundException.class);
    }
    @Test void rejectsStaleVersionsMissingReferencesAndInvalidGeometry() {
        var poco = pocos.criar(new PocoRequest("Poço B", PocoGeometryTest.vertical(1500), null), "ana");
        pocos.atualizar(poco.getId(), new PocoRequest("Poço B", PocoGeometryTest.vertical(1600), poco.getVersion()), "bruno");
        assertThatThrownBy(() -> pocos.atualizar(poco.getId(), new PocoRequest("Desatualizado", PocoGeometryTest.vertical(1400), poco.getVersion()), "ana"))
                .isInstanceOfSatisfying(BusinessException.class, e -> assertThat(e.getStatus().value()).isEqualTo(409));
        assertThatThrownBy(() -> cenarios.criar(request("Velho", "squeeze", poco, "{}"), "ana"))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> pocos.paraVincular(-1L, 0L)).isInstanceOf(ResourceNotFoundException.class);
        assertThatThrownBy(() -> pocos.criar(new PocoRequest("Inválido", PocoGeometryTest.vertical(-1), null), "ana"))
                .isInstanceOf(BusinessException.class);
        assertThat(pocos.buscar(poco.getId()).getGeometria().wellFinalMD()).isEqualTo(1600);
    }
    private static CenarioRequest request(String name, String operation, PocoEntity poco, String form) {
        return new CenarioRequest(name, operation, null, form, poco == null ? null : poco.getId(),
                poco == null ? null : poco.getVersion(), null);
    }
}
