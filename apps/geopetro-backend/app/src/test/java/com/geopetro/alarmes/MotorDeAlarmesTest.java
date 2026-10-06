package com.geopetro.alarmes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
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
import org.springframework.transaction.TransactionSystemException;
import org.springframework.transaction.support.DefaultTransactionStatus;
import org.springframework.transaction.support.TransactionTemplate;

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

	@Autowired
	ExtremoDoEpisodioRepository extremos;

	@Autowired
	PlatformTransactionManager transacoes;

	@Autowired
	EntityManagerFactory factory;

	LimitesDeclarados limites;
	MotorDeAlarmes motor;

	@BeforeEach
	void setup() {
		repository.deleteAll();
		extremos.deleteAll();
		limites = mock(LimitesDeclarados.class);
		motor = new MotorDeAlarmes(repository, extremos, limites, transacoes);
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

	private MotorDeAlarmes reiniciado() {
		return new MotorDeAlarmes(repository, extremos, limites, transacoes);
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

		var reiniciado = reiniciado();
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

		var reiniciado = reiniciado();
		reiniciado.reconstruirProjecao();
		assertThat(reiniciado.ativos(UNIDADE)).isEmpty();
	}

	/** O historico de alarmes conta como uso: o core nao apaga a unidade — RN-116. */
	@Test
	void oHistoricoDeAlarmesImpedeAExclusaoDaUnidade() {
		var vinculo = new EventoAlarmeVinculo(repository);
		assertThat(vinculo.descrever(UNIDADE)).isEmpty();

		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));

		assertThat(vinculo.descrever(UNIDADE)).contains("historico de alarmes");
	}

	// --- A02: o pico medido entre duas transicoes -------------------------------

	/**
	 * ⚠️ O pico de uma excursao quase nunca e um fato.
	 *
	 * <p>130 abre em critico, 200 continua critico e nao gera transicao nenhuma, 90 fecha. O log tem
	 * ABRIU(130) e FECHOU(90) — e nenhum dos dois e 200. Deduzir o extremo dos fatos diria 130, com
	 * todas as leituras tendo chegado corretamente ao servidor.
	 */
	@Test
	@DisplayName("o extremo do episodio sobrevive mesmo sem virar fato")
	void oPicoEntreTransicoesFicaGravado() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));
		String episodio = gravados().get(0).episodioId();

		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 200.0)));

		assertThat(gravados()).as("200 nao muda severidade: nenhum fato novo")
				.extracting(EventoAlarme::tipo).containsExactly(Tipo.ABRIU);
		assertThat(motor.ativos(UNIDADE)).singleElement()
				.satisfies(ativo -> assertThat(ativo.valorExtremo()).isEqualTo(200.0));
		assertThat(extremos.findById(episodio)).get()
				.satisfies(linha -> assertThat(linha.valor).isEqualTo(200.0));

		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 90.0)));
		assertThat(extremos.findById(episodio)).as("fechar nao rebaixa o pico para a leitura de volta")
				.get().satisfies(linha -> assertThat(linha.valor).isEqualTo(200.0));
	}

	/** ⚠️ Reiniciar depois do pico reduzia a projecao ao valor do ABRIU. */
	@Test
	void oReinicioNaoRebaixaOExtremoAoUltimoFato() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 200.0)));

		var reiniciado = reiniciado();
		reiniciado.reconstruirProjecao();

		assertThat(reiniciado.ativos(UNIDADE)).singleElement()
				.satisfies(ativo -> assertThat(ativo.valorExtremo())
						.as("o ultimo fato gravado vale 130; o pico medido foi 200")
						.isEqualTo(200.0));
	}

	/** Uma leitura que nao bate o recorde nao escreve nada: o extremo e recorde, nao ultimo valor. */
	@Test
	void leituraMenosExtremaNaoRegridiOPico() {
		declara(pressao());
		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 200.0)));
		String episodio = gravados().get(0).episodioId();

		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 150.0)));

		assertThat(extremos.findById(episodio)).get()
				.satisfies(linha -> assertThat(linha.valor).isEqualTo(200.0));
	}

	// --- A03: a projecao so muda depois do commit -------------------------------

	/**
	 * ⚠️ {@code saveAll} ter retornado nao prova que a transacao confirmou.
	 *
	 * <p>Antes, o mapa era atualizado dentro da transacao: uma falha na confirmacao deixava a tela
	 * anunciando um episodio que o banco nao tinha, e a proxima leitura na mesma severidade nao
	 * gerava outro ABRIU porque a memoria ja o considerava ocorrido.
	 */
	@Test
	@DisplayName("rollback nao deixa alarme na memoria sem evento gravado")
	void falhaNoCommitNaoPublicaAProjecao() {
		declara(pressao());
		var comFalhaNoCommit = new MotorDeAlarmes(repository, extremos, limites,
				new TransactionTemplate(gerenciadorQueFalhaAoConfirmar()));

		assertThatThrownBy(() -> comFalhaNoCommit.avaliar(UNIDADE,
				List.of(leitura("PRESSAO_01", null, 130.0))))
				.isInstanceOf(TransactionSystemException.class);

		assertThat(gravados()).as("a transacao voltou atras").isEmpty();
		assertThat(comFalhaNoCommit.ativos(UNIDADE))
				.as("e a memoria nao pode afirmar o que o banco nao guardou").isEmpty();
	}

	/** Depois da falha, a proxima leitura tenta de novo — e desta vez o episodio existe de fato. */
	@Test
	void depoisDoRollbackAProximaLeituraAbreOEpisodio() {
		declara(pressao());
		var comFalhaNoCommit = new MotorDeAlarmes(repository, extremos, limites,
				new TransactionTemplate(gerenciadorQueFalhaAoConfirmar()));
		assertThatThrownBy(() -> comFalhaNoCommit.avaliar(UNIDADE,
				List.of(leitura("PRESSAO_01", null, 130.0)))).isInstanceOf(RuntimeException.class);

		motor.avaliar(UNIDADE, List.of(leitura("PRESSAO_01", null, 130.0)));

		assertThat(gravados()).extracting(EventoAlarme::tipo).containsExactly(Tipo.ABRIU);
		assertThat(motor.ativos(UNIDADE)).hasSize(1);
	}

	/** Confirma de verdade e depois estoura: o efeito e o rollback do que o ciclo escreveu. */
	private PlatformTransactionManager gerenciadorQueFalhaAoConfirmar() {
		return new JpaTransactionManager(factory) {
			@Override
			protected void doCommit(DefaultTransactionStatus status) {
				super.doRollback(status);
				throw new TransactionSystemException("Falha simulada na confirmacao.");
			}
		};
	}

	// --- A04: identidade repetida no mesmo ciclo --------------------------------

	/**
	 * ⚠️ Duas leituras da mesma grandeza no mesmo ciclo liam ambas o mapa anterior — vazio — e
	 * abriam episodios diferentes, um deles sem estado correspondente para fechar depois.
	 */
	@Test
	@DisplayName("identidade repetida no ciclo nao abre dois episodios")
	void identidadeRepetidaNoCicloEncadeiaOEstado() {
		declara(pressao());

		motor.avaliar(UNIDADE, List.of(
				leitura("PRESSAO_01", null, 130.0),
				leitura("PRESSAO_01", null, 130.0)));

		assertThat(gravados()).extracting(EventoAlarme::tipo)
				.as("uma excursao, um ABRIU").containsExactly(Tipo.ABRIU);
		assertThat(motor.ativos(UNIDADE)).hasSize(1);
		assertThat(gravados().get(0).episodioId())
				.isEqualTo(motor.ativos(UNIDADE).get(0).episodioId());
	}

	/** E a segunda leitura do ciclo continua contando para o extremo. */
	@Test
	void aSegundaLeituraDoCicloAindaAvancaOExtremo() {
		declara(pressao());

		motor.avaliar(UNIDADE, List.of(
				leitura("PRESSAO_01", null, 130.0),
				leitura("PRESSAO_01", null, 200.0)));

		assertThat(motor.ativos(UNIDADE)).singleElement()
				.satisfies(ativo -> assertThat(ativo.valorExtremo()).isEqualTo(200.0));
	}
}
