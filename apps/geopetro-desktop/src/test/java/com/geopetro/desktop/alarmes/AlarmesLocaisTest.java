package com.geopetro.desktop.alarmes;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.geopetro.desktop.models.CardsDaUnidade.Tipo;
import com.geopetro.desktop.alarmes.AlarmesDaEstacao.AlarmeLocal;
import com.geopetro.desktop.alarmes.AvaliadorLocalDeAlarme.Severidade;
import com.geopetro.desktop.services.LeituraDeCards.Grandeza;

/**
 * O alarme da estacao ligando leitura e faixa —
 * {@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3}.
 *
 * <p>⚠️ <b>Nada aqui grava ou publica.</b> O historico de eventos tem um produtor so, o Backend; a
 * estacao sinaliza para quem esta ao lado do equipamento, inclusive sem rede.
 *
 * <p>⚠️ <b>A faixa vem desta estacao</b>, e nao do documento do servidor. Ate 2026-09-09 vinha, e
 * uma unidade que nunca recebeu aquele documento nao alarmava nada.
 */
class AlarmesLocaisTest {

	private static final Instant T0 = Instant.parse("2026-09-09T12:00:00Z");

	/** Conta os avisos sonoros, em vez de fazer barulho no build. */
	private static class SinalFalso extends SinalSonoro {
		int vezes;

		@Override
		public void alertar() {
			vezes++;
		}
	}

	@TempDir
	Path dir;

	private SinalFalso sinal;
	private AlarmesDaEstacao estacao;
	private AlarmesLocais alarmes;

	@BeforeEach
	void setup() {
		sinal = new SinalFalso();
		estacao = new AlarmesDaEstacao(dir.resolve("alarmes-locais.json"));
		alarmes = new AlarmesLocais(sinal, estacao);
	}

	private static Grandeza grandeza(String dispositivoId, String serie, Double valor) {
		return new Grandeza(dispositivoId, dispositivoId, Tipo.PRESSAO, serie, "DBW10", true,
				valor, "psi", 0, valor == null ? "sem calibracao" : null);
	}

	/** Pressao: apita acima de 120. O tempo minimo e fixo — 3 s para abrir, 5 s para fechar. */
	private void configurarPressao(boolean ativo) {
		estacao.gravar(new AlarmeLocal("PRESSAO_01", null, null, 120.0, ativo));
	}

	private void ciclo(int segundo, Grandeza... grandezas) {
		alarmes.avaliar(List.of(grandezas), T0.plusSeconds(segundo));
	}

	@Test
	@DisplayName("a leitura acende o alarme depois do tempo minimo, e apaga depois dele tambem")
	void acendeEApagaConformeALeitura() {
		configurarPressao(true);

		ciclo(0, grandeza("PRESSAO_01", null, 130.0));
		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 130.0)),
				"1 s fora da faixa nao acende: o minimo e 3 s");

		ciclo(3, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, 130.0)));
		assertEquals(1, alarmes.quantidade());

		ciclo(4, grandeza("PRESSAO_01", null, 90.0));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, 90.0)),
				"voltou a faixa agora: fechar espera 5 s");

		ciclo(9, grandeza("PRESSAO_01", null, 90.0));
		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 90.0)));
		assertEquals(0, alarmes.quantidade());
	}

	@Test
	void grandezaSemAlarmeConfiguradoNaoAlarma() {
		configurarPressao(true);
		ciclo(0, grandeza("TEMPERATURA_01", null, 9999.0));
		ciclo(5, grandeza("TEMPERATURA_01", null, 9999.0));
		assertNull(alarmes.severidadeDe(grandeza("TEMPERATURA_01", null, 9999.0)));
	}

	/** Estacao sem alarme configurado nao alarma, e isso e estado normal — nao pendencia. */
	@Test
	void semConfiguracaoNenhumaNadaAlarma() {
		ciclo(0, grandeza("PRESSAO_01", null, 500.0));
		ciclo(5, grandeza("PRESSAO_01", null, 500.0));
		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 500.0)));
		assertEquals(0, sinal.vezes);
	}

	/** Desligar no sininho para de avaliar — e a faixa fica guardada para quando voltar. */
	@Test
	void alarmeDesligadoNaoAlarma() {
		configurarPressao(false);
		ciclo(0, grandeza("PRESSAO_01", null, 500.0));
		ciclo(5, grandeza("PRESSAO_01", null, 500.0));
		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 500.0)));
	}

	/**
	 * ⚠️ Ativo sem faixa nenhuma nao vigia coisa alguma.
	 *
	 * <p>E o engano mais facil de cometer na tela: marcar o sininho e sair sem digitar numero.
	 * Acender por isso prometeria uma vigilancia que nao existe.
	 */
	@Test
	void ativoSemFaixaNaoVigia() {
		estacao.gravar(new AlarmeLocal("PRESSAO_01", null, null, null, true));

		ciclo(0, grandeza("PRESSAO_01", null, 9999.0));
		ciclo(5, grandeza("PRESSAO_01", null, 9999.0));

		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 9999.0)));
		assertEquals(0, alarmes.quantidade());
	}

	/**
	 * ⚠️ Grandeza sem valor nao e avaliada. Trata-la como dentro da faixa apagaria um alarme aceso
	 * por FALTA DE DADO — e RN-099 ja diz que a ausencia e lacuna honesta, nao zero.
	 */
	@Test
	void grandezaSemValorNaoApagaOAlarmeAceso() {
		configurarPressao(true);
		ciclo(0, grandeza("PRESSAO_01", null, 130.0));
		ciclo(3, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, 130.0)));

		ciclo(4, grandeza("PRESSAO_01", null, null));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, null)),
				"o alarme segue aceso: nao houve medicao que o desminta");
	}

	/**
	 * ⚠️ Card desativado hiberna o alarme junto (RN-091), e o destaque precisa apagar.
	 *
	 * <p>Card desativado sai do ciclo <b>por completo</b> — nao volta nem sem valor. Sem esta regra
	 * o destaque dele ficaria aceso para sempre, porque nunca mais haveria leitura que o desmentisse.
	 */
	@Test
	@DisplayName("card desativado apaga o destaque, em vez de deixa-lo aceso para sempre")
	void cardDesativadoApagaODestaque() {
		configurarPressao(true);
		ciclo(0, grandeza("PRESSAO_01", null, 130.0));
		ciclo(3, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, 130.0)));

		// O card saiu do documento: o ciclo seguinte nao o traz mais, nem sem valor.
		ciclo(4);

		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 130.0)));
		assertEquals(0, alarmes.quantidade());
	}

	/**
	 * RN-098: as tres series de um contador compartilham o dispositivoId. Sem a serie na chave, a
	 * faixa da vazao acenderia o card do volume acumulado.
	 */
	@Test
	void aSerieDecideQualCardAcende() {
		estacao.gravar(new AlarmeLocal("CONTADOR_STROKE_01", "vazao", null, 8.0, true));

		ciclo(0,
				grandeza("CONTADOR_STROKE_01", "vazao", 9.0),
				grandeza("CONTADOR_STROKE_01", "volumeAcumulado", 900.0));
		ciclo(3,
				grandeza("CONTADOR_STROKE_01", "vazao", 9.0),
				grandeza("CONTADOR_STROKE_01", "volumeAcumulado", 900.0));

		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("CONTADOR_STROKE_01", "vazao", 9.0)));
		assertNull(alarmes.severidadeDe(grandeza("CONTADOR_STROKE_01", "volumeAcumulado", 900.0)));
	}

	/**
	 * ⚠️ O som toca no agravamento, nao enquanto o alarme durar: um bipe por segundo faria o
	 * operador desligar o som da estacao, e o proximo alarme nao avisaria ninguem.
	 */
	@Test
	void oSomTocaAoAcenderENaoACadaCiclo() {
		configurarPressao(true);

		ciclo(0, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(0, sinal.vezes, "ainda nao acendeu: tempo minimo");

		ciclo(3, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(1, sinal.vezes, "acendeu");

		ciclo(4, grandeza("PRESSAO_01", null, 130.0));
		ciclo(5, grandeza("PRESSAO_01", null, 200.0));
		assertEquals(1, sinal.vezes, "segue aceso: nao repete");

		ciclo(6, grandeza("PRESSAO_01", null, 90.0));
		ciclo(11, grandeza("PRESSAO_01", null, 90.0));
		assertEquals(1, sinal.vezes, "fechar nao toca");
	}

	@Test
	void aPiorSeveridadeDaUnidadeSaiParaOAvisoDoTopo() {
		configurarPressao(true);
		estacao.gravar(new AlarmeLocal("PESO_01", null, null, 120.0, true));

		ciclo(0, grandeza("PRESSAO_01", null, 130.0), grandeza("PESO_01", null, 130.0));
		ciclo(3, grandeza("PRESSAO_01", null, 130.0), grandeza("PESO_01", null, 130.0));

		assertEquals(Severidade.CRITICO, alarmes.pior());
		assertEquals(2, alarmes.quantidade());
	}

	@Test
	void semAlarmeNenhumNaoHaPior() {
		assertNull(alarmes.pior());
		assertEquals(0, alarmes.quantidade());
	}
}
