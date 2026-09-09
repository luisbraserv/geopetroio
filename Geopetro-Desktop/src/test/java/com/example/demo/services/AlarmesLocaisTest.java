package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.example.demo.models.CardsDaUnidade.Tipo;
import com.example.demo.models.ConfiguracaoSondaRemota;
import com.example.demo.models.ConfiguracaoSondaRemota.Limite;
import com.example.demo.services.AvaliadorLocalDeAlarme.Severidade;
import com.example.demo.services.LeituraDeCards.Grandeza;

/**
 * O alarme da estacao ligando leitura e limite — passo 3 de {@code specs/features/alarmes.md}.
 *
 * <p>⚠️ <b>Nada aqui grava ou publica.</b> O historico de eventos tem um produtor so, o Backend; a
 * estacao sinaliza para quem esta ao lado do equipamento, inclusive sem rede.
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

	private SinalFalso sinal;
	private AlarmesLocais alarmes;

	@BeforeEach
	void setup() {
		sinal = new SinalFalso();
		alarmes = new AlarmesLocais(sinal);
	}

	private static Grandeza grandeza(String dispositivoId, String serie, Double valor) {
		return new Grandeza(dispositivoId, dispositivoId, Tipo.PRESSAO, serie, "DBW10", true,
				valor, "psi", 0, valor == null ? "sem calibracao" : null);
	}

	private static ConfiguracaoSondaRemota documento(Limite... limites) {
		return new ConfiguracaoSondaRemota(1, 7, 1, List.of(limites), "ana", "2026-09-09T11:00:00Z");
	}

	/** Sem tempo minimo: cada teste examina o encaixe, nao a contagem — essa e do avaliador. */
	private static Limite pressao(boolean ativo) {
		return new Limite("PRESSAO_01", null, null, 100.0, null, 120.0, 0, 0, ativo);
	}

	private void ciclo(ConfiguracaoSondaRemota limites, int segundo, Grandeza... grandezas) {
		alarmes.avaliar(List.of(grandezas), limites, T0.plusSeconds(segundo));
	}

	@Test
	@DisplayName("a leitura acende o alarme da grandeza correspondente")
	void acendeEApagaConformeALeitura() {
		var doc = documento(pressao(true));

		ciclo(doc, 0, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, 130.0)));
		assertEquals(1, alarmes.quantidade());

		ciclo(doc, 1, grandeza("PRESSAO_01", null, 90.0));
		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 90.0)));
		assertEquals(0, alarmes.quantidade());
	}

	@Test
	void grandezaSemLimiteNaoAlarma() {
		ciclo(documento(pressao(true)), 0, grandeza("TEMPERATURA_01", null, 9999.0));
		assertNull(alarmes.severidadeDe(grandeza("TEMPERATURA_01", null, 9999.0)));
	}

	/** Sonda sem limite configurado nao alarma, e isso e estado normal — nao pendencia. */
	@Test
	void semDocumentoNadaAlarma() {
		alarmes.avaliar(List.of(grandeza("PRESSAO_01", null, 500.0)), null, T0);
		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 500.0)));
		assertEquals(0, sinal.vezes);
	}

	/** Limite desativado hiberna com o card (RN-091): nao avalia. */
	@Test
	void limiteDesativadoNaoAlarma() {
		ciclo(documento(pressao(false)), 0, grandeza("PRESSAO_01", null, 500.0));
		assertNull(alarmes.severidadeDe(grandeza("PRESSAO_01", null, 500.0)));
	}

	/**
	 * ⚠️ Grandeza sem valor nao e avaliada. Trata-la como dentro da faixa apagaria um alarme aceso
	 * por FALTA DE DADO — e RN-099 ja diz que a ausencia e lacuna honesta, nao zero.
	 */
	@Test
	void grandezaSemValorNaoApagaOAlarmeAceso() {
		var doc = documento(pressao(true));
		ciclo(doc, 0, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, 130.0)));

		ciclo(doc, 1, grandeza("PRESSAO_01", null, null));
		assertEquals(Severidade.CRITICO, alarmes.severidadeDe(grandeza("PRESSAO_01", null, null)),
				"o alarme segue aceso: nao houve medicao que o desminta");
	}

	/**
	 * RN-098: as tres series de um contador compartilham o dispositivoId. Sem a serie na chave, o
	 * limite da vazao acenderia o card do volume acumulado.
	 */
	@Test
	void aSerieDecideQualCardAcende() {
		var vazao = new Limite("CONTADOR_STROKE_01", "vazao", null, 8.0, null, null, 0, 0, true);
		var doc = documento(vazao);

		ciclo(doc, 0,
				grandeza("CONTADOR_STROKE_01", "vazao", 9.0),
				grandeza("CONTADOR_STROKE_01", "volumeAcumulado", 900.0));

		assertEquals(Severidade.ATENCAO, alarmes.severidadeDe(grandeza("CONTADOR_STROKE_01", "vazao", 9.0)));
		assertNull(alarmes.severidadeDe(grandeza("CONTADOR_STROKE_01", "volumeAcumulado", 900.0)));
	}

	/**
	 * ⚠️ O som toca no agravamento, nao enquanto o alarme durar: um bipe por segundo faria o
	 * operador desligar o som da estacao, e o proximo alarme nao avisaria ninguem.
	 */
	@Test
	void oSomTocaAoAgravarENaoACadaCiclo() {
		var doc = documento(pressao(true));

		ciclo(doc, 0, grandeza("PRESSAO_01", null, 105.0));
		assertEquals(1, sinal.vezes, "abriu em atencao");

		ciclo(doc, 1, grandeza("PRESSAO_01", null, 105.0));
		ciclo(doc, 2, grandeza("PRESSAO_01", null, 105.0));
		assertEquals(1, sinal.vezes, "seguiu em atencao: nao repete");

		ciclo(doc, 3, grandeza("PRESSAO_01", null, 130.0));
		assertEquals(2, sinal.vezes, "escalou para critico");

		ciclo(doc, 4, grandeza("PRESSAO_01", null, 105.0));
		ciclo(doc, 5, grandeza("PRESSAO_01", null, 90.0));
		assertEquals(2, sinal.vezes, "reduzir e fechar nao tocam");
	}

	@Test
	void aPiorSeveridadeDaUnidadeSaiParaOAvisoDoTopo() {
		var peso = new Limite("PESO_01", null, null, 100.0, null, 120.0, 0, 0, true);
		var doc = documento(pressao(true), peso);

		ciclo(doc, 0, grandeza("PRESSAO_01", null, 105.0), grandeza("PESO_01", null, 130.0));

		assertEquals(Severidade.CRITICO, alarmes.pior());
		assertEquals(2, alarmes.quantidade());
	}

	@Test
	void semAlarmeNenhumNaoHaPior() {
		assertNull(alarmes.pior());
		assertEquals(0, alarmes.quantidade());
	}
}
