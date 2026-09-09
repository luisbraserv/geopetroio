package com.geopetro.prontidao;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.cards.CardsDeclarados;
import com.geopetro.configuracaosonda.LimitesDeclarados;
import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.monitoramento.dto.SondaDisponivelDTO;

/**
 * O relatorio que responde OQ-049.
 *
 * <p>"A migracao terminou" era uma afirmacao sem como conferir. O que esta classe precisa acertar e
 * o caso de BORDA: a unidade que nao tem documento nenhum. E ela que a tela existe para encontrar, e
 * um join que a deixasse de fora responderia "tudo pronto" com sondas mudas na frota.
 */
class ProntidaoServiceTest {

	private static final Instant ONTEM = Instant.parse("2026-09-08T10:00:00Z");
	private static final Instant HOJE = Instant.parse("2026-09-09T10:00:00Z");

	private SondaMonitoramentoService sondas;
	private CardsDeclarados cards;
	private LimitesDeclarados limites;
	private ProntidaoService service;

	@BeforeEach
	void setup() {
		sondas = mock(SondaMonitoramentoService.class);
		cards = mock(CardsDeclarados.class);
		limites = mock(LimitesDeclarados.class);
		service = new ProntidaoService(sondas, cards, limites);
		when(cards.resumos()).thenReturn(List.of());
		when(limites.resumos()).thenReturn(List.of());
	}

	private void frota(SondaDisponivelDTO... unidades) {
		when(sondas.listarSondasDoUsuario("ana")).thenReturn(List.of(unidades));
	}

	private static SondaDisponivelDTO sonda(long id, String nome) {
		return new SondaDisponivelDTO(id, nome, nome, nome + " (apelido)");
	}

	/** ⚠️ A unidade sem documento e a razao de a tela existir: ela PRECISA aparecer. */
	@Test
	@DisplayName("unidade nunca configurada aparece, com revisao zero")
	void unidadeSemDocumentoNenhumAparece() {
		frota(sonda(7, "SPT-145"));

		assertThat(service.daFrota("ana")).singleElement().satisfies(prontidao -> {
			assertThat(prontidao.nuncaConfigurada()).isTrue();
			assertThat(prontidao.produzTelemetria()).isFalse();
			assertThat(prontidao.alarma()).isFalse();
			assertThat(prontidao.revisaoCards()).isZero();
			assertThat(prontidao.cardsAtualizadosPor()).isNull();
		});
	}

	@Test
	void unidadeConfiguradaTrazContagensEAutoria() {
		frota(sonda(7, "SPT-145"));
		when(cards.resumos()).thenReturn(List.of(new CardsDeclarados.Resumo(7, 4, 3, 5, "ana", ONTEM)));
		when(limites.resumos()).thenReturn(List.of(new LimitesDeclarados.Resumo(7, 2, 1, 2, "bruno", HOJE)));

		assertThat(service.daFrota("ana")).singleElement().satisfies(prontidao -> {
			assertThat(prontidao.produzTelemetria()).isTrue();
			assertThat(prontidao.cardsAtivos()).isEqualTo(3);
			assertThat(prontidao.cardsDeclarados()).as("os desativados continuam no documento").isEqualTo(5);
			assertThat(prontidao.cardsAtualizadosPor()).isEqualTo("ana");
			assertThat(prontidao.alarma()).isTrue();
			assertThat(prontidao.limitesAtivos()).isEqualTo(1);
			assertThat(prontidao.limitesAtualizadosPor()).isEqualTo("bruno");
		});
	}

	/**
	 * ⚠️ Ter documento nao basta. Um documento com TODOS os cards desativados nao produz leitura
	 * nenhuma, e a unidade fica tao muda quanto uma nunca configurada — mas nao aparece como
	 * "nunca configurada", porque alguem esteve la.
	 */
	@Test
	void documentoComTodosOsCardsDesativadosNaoProduzTelemetria() {
		frota(sonda(7, "SPT-145"));
		when(cards.resumos()).thenReturn(List.of(new CardsDeclarados.Resumo(7, 6, 0, 4, "ana", ONTEM)));

		assertThat(service.daFrota("ana")).singleElement().satisfies(prontidao -> {
			assertThat(prontidao.nuncaConfigurada()).isFalse();
			assertThat(prontidao.produzTelemetria()).isFalse();
			assertThat(prontidao.cardsDeclarados()).isEqualTo(4);
		});
	}

	/** Sonda que le e nao vigia: e o buraco que alarmes.md §4 registra e ninguem via de fora. */
	@Test
	void unidadeComCardsESemLimitesApareceComoSemAlarme() {
		frota(sonda(7, "SPT-145"));
		when(cards.resumos()).thenReturn(List.of(new CardsDeclarados.Resumo(7, 4, 3, 3, "ana", ONTEM)));

		assertThat(service.daFrota("ana")).singleElement().satisfies(prontidao -> {
			assertThat(prontidao.produzTelemetria()).isTrue();
			assertThat(prontidao.alarma()).isFalse();
			assertThat(prontidao.revisaoLimites()).isZero();
		});
	}

	/** Todos os limites hibernando com os cards desativados: existe documento, e nada vigia. */
	@Test
	void limitesTodosDesativadosNaoAlarmam() {
		frota(sonda(7, "SPT-145"));
		when(limites.resumos()).thenReturn(List.of(new LimitesDeclarados.Resumo(7, 3, 0, 2, "ana", HOJE)));

		assertThat(service.daFrota("ana")).singleElement()
				.satisfies(prontidao -> assertThat(prontidao.alarma()).isFalse());
	}

	/**
	 * ⚠️ O escopo e o do monitoramento (RN-047). Documento de unidade fora do escopo nao pode
	 * aparecer — nem pelo nome: seria vazar a existencia da sonda de outro cliente.
	 */
	@Test
	void documentoDeUnidadeForaDoEscopoNaoEntraNaResposta() {
		frota(sonda(7, "SPT-145"));
		when(cards.resumos()).thenReturn(List.of(
				new CardsDeclarados.Resumo(7, 4, 3, 3, "ana", ONTEM),
				new CardsDeclarados.Resumo(8, 9, 6, 6, "outro", ONTEM)));

		assertThat(service.daFrota("ana")).extracting(ProntidaoDaUnidade::unidadeSondaId)
				.containsExactly(7L);
	}

	@Test
	void preservaAOrdemEOsNomesQueOMonitoramentoJaDevolve() {
		frota(sonda(7, "SPT-145"), sonda(8, "SPT-146"));

		assertThat(service.daFrota("ana"))
				.extracting(ProntidaoDaUnidade::nome, ProntidaoDaUnidade::apelido)
				.containsExactly(
						org.assertj.core.groups.Tuple.tuple("SPT-145", "SPT-145 (apelido)"),
						org.assertj.core.groups.Tuple.tuple("SPT-146", "SPT-146 (apelido)"));
	}

	@Test
	void usuarioSemSondaNenhumaRecebeListaVazia() {
		frota();
		assertThat(service.daFrota("ana")).isEmpty();
	}
}
