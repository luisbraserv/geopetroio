package com.geopetro.alarmes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import javax.sql.DataSource;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.jpa.repository.config.EnableJpaRepositories;
import org.springframework.orm.jpa.JpaTransactionManager;
import org.springframework.orm.jpa.LocalContainerEntityManagerFactoryBean;
import org.springframework.orm.jpa.vendor.HibernateJpaVendorAdapter;
import org.springframework.test.context.ContextConfiguration;
import org.springframework.test.context.junit.jupiter.SpringExtension;
import org.springframework.transaction.PlatformTransactionManager;

import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;
import com.geopetro.alarmes.EventoAlarme.Tipo;
import com.geopetro.configuracaosonda.ConfiguracaoSonda.Limite;
import com.geopetro.configuracaosonda.LimitesDeclarados;
import com.geopetro.realtime.dto.EstadoRealtimeDTO.LeituraRealtimeDTO;

import jakarta.persistence.EntityManagerFactory;

/** O motor ligando leitura, limite e log — passo 2 de alarmes. */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = MotorDeAlarmesTest.Config.class)
class MotorDeAlarmesTest {

	@Configuration
	@EnableJpaRepositories(basePackageClasses = EventoAlarmeRepository.class)
	static class Config {
		@Bean(destroyMethod = "close")
		com.zaxxer.hikari.HikariDataSource dataSource() {
			var source = new com.zaxxer.hikari.HikariDataSource();
			source.setJdbcUrl("jdbc:h2:mem:alarmes-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
			return source;
		}

		@Bean
		LocalContainerEntityManagerFactoryBean entityManagerFactory(DataSource source) {
			var factory = new LocalContainerEntityManagerFactoryBean();
			factory.setDataSource(source);
			factory.setPackagesToScan(EventoAlarmeEntity.class.getPackageName());
			factory.setJpaVendorAdapter(new HibernateJpaVendorAdapter());
			factory.setJpaPropertyMap(Map.of("hibernate.hbm2ddl.auto", "create-drop"));
			return factory;
		}

		@Bean
		PlatformTransactionManager transactionManager(EntityManagerFactory factory) {
			return new JpaTransactionManager(factory);
		}
	}

	private static final long UNIDADE = 7L;

	@Autowired
	EventoAlarmeRepository repository;

	LimitesDeclarados limites;
	MotorDeAlarmes motor;

	@BeforeEach
	void setup() {
		repository.deleteAll();
		limites = mock(LimitesDeclarados.class);
		motor = new MotorDeAlarmes(repository, limites);
	}

	/** Pressao: atencao acima de 100, critico acima de 120, sem tempo minimo. */
	private static Limite pressao() {
		return new Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 0, 0, true);
	}

	private static LeituraRealtimeDTO leitura(String dispositivoId, String serie, Double valor) {
		return new LeituraRealtimeDTO(dispositivoId, serie, "PRESSAO", "psi", "DBW10", valor, null);
	}

	private void declara(Limite... declarados) {
		when(limites.de(UNIDADE)).thenReturn(List.of(declarados));
	}

	private List<EventoAlarme> gravados() {
		return repository.findAll().stream().map(EventoAlarmeEntity::paraDominio)
				.sorted((a, b) -> Long.compare(a.id(), b.id())).toList();
	}

	@Test
	@DisplayName("uma excursao vira quatro fatos, nao uma linha por leitura")
	void umaExcursaoGravaAsTransicoesENadaMais() {
		declara(pressao());

		for (int i = 0; i < 5; i++) {
			motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 105.0)));
		}
		for (int i = 0; i < 5; i++) {
			motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));
		}
		for (int i = 0; i < 5; i++) {
			motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 90.0)));
		}

		assertThat(gravados()).extracting(EventoAlarme::tipo)
				.as("15 leituras, 3 fatos: abriu, escalou e fechou")
				.containsExactly(Tipo.ABRIU, Tipo.ESCALOU, Tipo.FECHOU);
		assertThat(gravados()).extracting(EventoAlarme::episodioId).containsOnly(gravados().get(0).episodioId());
		assertThat(motor.ativos(UNIDADE)).isEmpty();
	}

	@Test
	void grandezaSemLimiteNaoProduzFatoNenhum() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("TEMPERATURA_01", null, 9999.0)));
		assertThat(gravados()).isEmpty();
	}

	/** Grandeza sem valor nao e publicada (RN-099); se vier assim mesmo, nao e medicao. */
	@Test
	void leituraSemValorOuNaoFinitaNaoAlarma() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(
				leitura("PRESSAO_01", null, null),
				leitura("PRESSAO_01", null, Double.NaN)));
		assertThat(gravados()).isEmpty();
	}

	/**
	 * ⚠️ As tres series de um contador compartilham o dispositivoId. Sem a serie na chave, a leitura
	 * de volume acumulado — que so cresce — dispararia o limite pensado para a vazao.
	 */
	@Test
	void aSerieDecideQualLimiteVale() {
		var vazao = new Limite("CONTADOR_STROKE_01", "vazao", null, 8.0, null, null, 0, 0, true);
		var volume = new Limite("CONTADOR_STROKE_01", "volumeAcumulado", null, 500.0, null, null, 0, 0, true);
		declara(vazao, volume);

		motor.avaliar(UNIDADE, List.of(
				leitura("CONTADOR_STROKE_01", "volumeAcumulado", 300.0),
				leitura("CONTADOR_STROKE_01", "vazao", 9.0)));

		assertThat(gravados()).singleElement()
				.satisfies(evento -> assertThat(evento.serie()).isEqualTo("vazao"));
		assertThat(motor.ativos(UNIDADE)).singleElement()
				.satisfies(ativo -> assertThat(ativo.serie()).isEqualTo("vazao"));
	}

	/**
	 * Desativar o limite fecha o episodio. ⚠️ Sem isto ele ficaria na tela para sempre, sobre um
	 * limite que ja nao existe, e nada no sistema o fecharia.
	 */
	@Test
	void desativarOLimiteFechaOQueEstavaAberto() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));
		assertThat(motor.ativos(UNIDADE)).hasSize(1);

		declara(new Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 0, 0, false));
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));

		assertThat(gravados()).extracting(EventoAlarme::tipo).containsExactly(Tipo.ABRIU, Tipo.FECHOU);
		assertThat(gravados().get(1).valor())
				.as("o FECHOU registra o extremo do episodio: nao houve leitura nova")
				.isEqualTo(130.0);
		assertThat(motor.ativos(UNIDADE)).isEmpty();
	}

	/**
	 * ⚠️ O reinicio no meio de uma excursao e o caso que obriga a projecao a ser reconstruida.
	 *
	 * <p>Com a memoria limpa, a proxima leitura acima do limite abriria um SEGUNDO episodio para a
	 * mesma excursao, e o historico contaria duas vezes o que aconteceu uma.
	 */
	@Test
	void aProjecaoEReconstruidaDosEpisodiosQueNuncaFecharam() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));
		String episodio = gravados().get(0).episodioId();

		var reiniciado = new MotorDeAlarmes(repository, limites);
		assertThat(reiniciado.ativos(UNIDADE)).as("sem reconstruir, o motor nao sabe de nada").isEmpty();

		reiniciado.reconstruirProjecao();
		assertThat(reiniciado.ativos(UNIDADE)).singleElement().satisfies(ativo -> {
			assertThat(ativo.episodioId()).isEqualTo(episodio);
			assertThat(ativo.severidadeAtual()).isEqualTo(Severidade.CRITICO);
			assertThat(ativo.limiteViolado()).isEqualTo(LimiteViolado.MAX);
			assertThat(ativo.valorExtremo()).isEqualTo(130.0);
		});

		reiniciado.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 90.0)));
		assertThat(gravados()).extracting(EventoAlarme::tipo)
				.as("a volta a faixa fecha o episodio que ja existia, sem abrir outro")
				.containsExactly(Tipo.ABRIU, Tipo.FECHOU);
		assertThat(gravados()).extracting(EventoAlarme::episodioId).containsOnly(episodio);
	}

	/** Episodio fechado nao volta como aberto na reconstrucao. */
	@Test
	void episodioFechadoFicaForaDaReconstrucao() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 90.0)));

		var reiniciado = new MotorDeAlarmes(repository, limites);
		reiniciado.reconstruirProjecao();
		assertThat(reiniciado.ativos(UNIDADE)).isEmpty();
	}

	/** O vinculo diz o que impede a exclusao da unidade, em vez de estourar violacao de FK — RN-063. */
	@Test
	void oHistoricoDeAlarmesImpedeAExclusaoDaUnidade() {
		var vinculo = new EventoAlarmeVinculo(repository);
		assertThat(vinculo.descreverVinculo(UNIDADE)).isEmpty();

		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));

		assertThat(vinculo.descreverVinculo(UNIDADE)).contains("historico de alarmes");
	}
}
