package com.geopetro.alarmes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
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
import com.geopetro.core.exception.BusinessException;

import jakarta.persistence.EntityManagerFactory;

/**
 * O historico agrupado em excursoes — RN-056.
 *
 * <p>A supervisao pergunta "quantas vezes a pressao saiu da faixa no turno?". Um episodio que abriu
 * em atencao, escalou e fechou sao TRES linhas e UMA excursao; devolver as tres soltas faria cada
 * tela reconstruir o agrupamento, e a primeira que errasse contaria tres alarmes.
 */
@ExtendWith(SpringExtension.class)
@ContextConfiguration(classes = HistoricoDeAlarmesTest.Config.class)
class HistoricoDeAlarmesTest {

	@Configuration
	@EnableJpaRepositories(basePackageClasses = EventoAlarmeRepository.class)
	static class Config {
		@Bean(destroyMethod = "close")
		com.zaxxer.hikari.HikariDataSource dataSource() {
			var source = new com.zaxxer.hikari.HikariDataSource();
			source.setJdbcUrl("jdbc:h2:mem:historico-" + UUID.randomUUID() + ";DB_CLOSE_DELAY=-1");
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
	private static final Instant T0 = Instant.parse("2026-09-09T12:00:00Z");
	private static final Instant JANELA_INICIO = Instant.parse("2026-09-09T11:00:00Z");
	private static final Instant JANELA_FIM = Instant.parse("2026-09-09T13:00:00Z");

	@Autowired
	EventoAlarmeRepository repository;

	HistoricoDeAlarmes historico;

	@BeforeEach
	void setup() {
		repository.deleteAll();
		historico = new HistoricoDeAlarmes(repository);
	}

	private void gravar(String episodio, Tipo tipo, Severidade severidade, int segundos, double valor) {
		gravar(episodio, tipo, severidade, segundos, valor, LimiteViolado.MAX, "PRESSAO_01", null);
	}

	private void gravar(String episodio, Tipo tipo, Severidade severidade, int segundos, double valor,
			LimiteViolado lado, String dispositivoId, String serie) {
		repository.save(EventoAlarmeEntity.de(new EventoAlarme(null, episodio, UNIDADE, dispositivoId,
				serie, tipo, severidade, T0.plusSeconds(segundos), valor, lado)));
	}

	private List<EpisodioAlarme> consultar() {
		return historico.consultar(UNIDADE, JANELA_INICIO, JANELA_FIM).episodios();
	}

	@Test
	@DisplayName("tres fatos viram uma excursao, com a historia junto")
	void agrupaOsFatosNumEpisodioSo() {
		gravar("ep-1", Tipo.ABRIU, Severidade.ATENCAO, 0, 105);
		gravar("ep-1", Tipo.ESCALOU, Severidade.CRITICO, 60, 130);
		gravar("ep-1", Tipo.FECHOU, Severidade.CRITICO, 300, 90);

		assertThat(consultar()).singleElement().satisfies(episodio -> {
			assertThat(episodio.abertoEm()).isEqualTo(T0);
			assertThat(episodio.fechadoEm()).isEqualTo(T0.plusSeconds(300));
			assertThat(episodio.aberto()).isFalse();
			assertThat(episodio.severidadeMaxima())
					.as("o pior que chegou a ser, nao o que era ao fechar")
					.isEqualTo(Severidade.CRITICO);
			assertThat(episodio.valorExtremo()).isEqualTo(130.0);
			assertThat(episodio.fatos()).extracting(EpisodioAlarme.Fato::tipo)
					.containsExactly(Tipo.ABRIU, Tipo.ESCALOU, Tipo.FECHOU);
		});
	}

	@Test
	void episodioSemFechouAparaceComoAberto() {
		gravar("ep-1", Tipo.ABRIU, Severidade.CRITICO, 0, 200);

		assertThat(consultar()).singleElement().satisfies(episodio -> {
			assertThat(episodio.aberto()).isTrue();
			assertThat(episodio.fechadoEm()).isNull();
		});
	}

	/**
	 * ⚠️ Este e o motivo da segunda consulta.
	 *
	 * <p>Filtrar os fatos pela janela faria o episodio aparecer comecando por ESCALOU — uma escalada
	 * sem a abertura que a explica —, e o "desde" da tela seria a hora errada.
	 */
	@Test
	void episodioQueAbriuAntesDaJanelaVemInteiro() {
		gravar("ep-1", Tipo.ABRIU, Severidade.ATENCAO, -7200, 105); // 10:00, fora da janela
		gravar("ep-1", Tipo.ESCALOU, Severidade.CRITICO, 60, 130); // 12:01, dentro

		assertThat(consultar()).singleElement().satisfies(episodio -> {
			assertThat(episodio.abertoEm())
					.as("a abertura real, ainda que anterior a janela consultada")
					.isEqualTo(T0.minusSeconds(7200));
			assertThat(episodio.fatos()).hasSize(2);
		});
	}

	@Test
	void ordenaDoFatoMaisRecenteParaOMaisAntigo() {
		// Uma excursao que abriu antes mas escalou agora interessa mais que uma que ja fechou.
		gravar("antigo", Tipo.ABRIU, Severidade.ATENCAO, 0, 105);
		gravar("antigo", Tipo.FECHOU, Severidade.ATENCAO, 30, 90);
		gravar("recente", Tipo.ABRIU, Severidade.ATENCAO, 10, 106);
		gravar("recente", Tipo.ESCALOU, Severidade.CRITICO, 600, 130);

		assertThat(consultar()).extracting(EpisodioAlarme::episodioId)
				.containsExactly("recente", "antigo");
	}

	@Test
	void limiteDeMinimoTemComoExtremoOMenorValor() {
		gravar("ep-1", Tipo.ABRIU, Severidade.ATENCAO, 0, 1800, LimiteViolado.MIN, "PESO_01", null);
		gravar("ep-1", Tipo.ESCALOU, Severidade.CRITICO, 60, 1200, LimiteViolado.MIN, "PESO_01", null);
		gravar("ep-1", Tipo.FECHOU, Severidade.CRITICO, 300, 5200, LimiteViolado.MIN, "PESO_01", null);

		assertThat(consultar()).singleElement().satisfies(episodio -> {
			assertThat(episodio.limiteViolado()).isEqualTo(LimiteViolado.MIN);
			assertThat(episodio.valorExtremo())
					.as("o valor que fechou esta dentro da faixa e nao pode virar o extremo")
					.isEqualTo(1200.0);
		});
	}

	/** RN-098: duas series do mesmo contador sao excursoes distintas. */
	@Test
	void seriesDoMesmoContadorNaoSeMisturam() {
		gravar("vazao", Tipo.ABRIU, Severidade.ATENCAO, 0, 9, LimiteViolado.MAX, "CONTADOR_STROKE_01", "vazao");
		gravar("volume", Tipo.ABRIU, Severidade.ATENCAO, 10, 600, LimiteViolado.MAX, "CONTADOR_STROKE_01",
				"volumeAcumulado");

		assertThat(consultar()).extracting(EpisodioAlarme::serie)
				.containsExactlyInAnyOrder("vazao", "volumeAcumulado");
	}

	@Test
	void periodoSemExcursaoDevolveListaVaziaENaoErro() {
		assertThat(historico.consultar(UNIDADE, JANELA_INICIO, JANELA_FIM))
				.satisfies(pagina -> {
					assertThat(pagina.episodios()).isEmpty();
					assertThat(pagina.truncado()).isFalse();
				});
	}

	/**
	 * ⚠️ O log e append-only e nao tem retencao (OQ-051). Sem teto, a consulta funcionaria por meses
	 * e depois derrubaria a tela de uma sonda movimentada, sem nada anunciando a mudanca.
	 */
	@Test
	void acimaDoTetoARespostaVemCortadaEODiz() {
		for (int i = 0; i < HistoricoDeAlarmes.MAXIMO_EPISODIOS + 5; i++) {
			gravar("ep-" + i, Tipo.ABRIU, Severidade.ATENCAO, i, 105);
		}

		var pagina = historico.consultar(UNIDADE, JANELA_INICIO, JANELA_FIM);
		assertThat(pagina.episodios()).hasSize(HistoricoDeAlarmes.MAXIMO_EPISODIOS);
		assertThat(pagina.truncado()).isTrue();
	}

	@Test
	void janelaInvalidaOuLongaDemaisERecusada() {
		assertThatThrownBy(() -> historico.consultar(UNIDADE, JANELA_FIM, JANELA_INICIO))
				.isInstanceOf(BusinessException.class);
		assertThatThrownBy(() -> historico.consultar(UNIDADE, null, JANELA_FIM))
				.isInstanceOf(BusinessException.class);
		assertThatThrownBy(() -> historico.consultar(UNIDADE, T0.minusSeconds(400L * 86400), T0))
				.isInstanceOf(BusinessException.class);
	}

	@Test
	void historicoDeOutraUnidadeNaoEntraNaResposta() {
		gravar("ep-1", Tipo.ABRIU, Severidade.ATENCAO, 0, 105);
		repository.save(EventoAlarmeEntity.de(new EventoAlarme(null, "ep-outra", 8L, "PRESSAO_01", null,
				Tipo.ABRIU, Severidade.CRITICO, T0, 200, LimiteViolado.MAX)));

		assertThat(consultar()).extracting(EpisodioAlarme::episodioId).containsExactly("ep-1");
	}
}
