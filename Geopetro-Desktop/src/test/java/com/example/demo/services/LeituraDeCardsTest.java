package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.models.CardsDaUnidade.Parametros;
import com.example.demo.models.CardsDaUnidade.Tipo;
import com.example.demo.models.ChaveHidraulicaConfig;
import com.example.demo.models.PesoColunaConfig;
import com.example.demo.models.TipoMovimento;
import com.example.demo.services.LeituraDeCards.Grandeza;
import com.sourceforge.snap7.moka7.S7;

/**
 * A conversão dirigida pelo documento de cards — passo 3b.
 *
 * <p>O que se quer provar é que cada card converte com <b>a sua</b> escala e <b>a sua</b>
 * calibração, e que a falta de qualquer uma delas produz <b>ausência de valor</b>, não zero. Zero é
 * um número: entraria no histórico e passaria por leitura real.
 */
class LeituraDeCardsTest {

	@TempDir
	Path pasta;

	private CalibracaoDeCards calibracoes;

	private LeituraDeCards leitura() {
		calibracoes = new CalibracaoDeCards(pasta.resolve("calibracao.json"));
		return new LeituraDeCards(calibracoes, new StrokeCalculatorService(), new FlowRateCalculatorService());
	}

	// ============================================================ apoio

	private static Parametros range(double bar) {
		return new Parametros(bar, null, null, null, null, null, null, null, null, null, null, null);
	}

	private static Parametros constante(double bblPorStroke) {
		return new Parametros(null, null, null, null, null, null, null, null, null, null, null, bblPorStroke);
	}

	private static Card card(String id, Tipo tipo, int byteInicial, Parametros p) {
		return new Card(id, id, tipo, byteInicial, true, true, 0, p);
	}

	/** Um DB montado à mão: escreve os valores nos endereços pedidos. */
	private static BlocoDeLeitura bloco(int inicio, int tamanho, java.util.function.Consumer<byte[]> escrita) {
		byte[] bytes = new byte[tamanho];
		escrita.accept(bytes);
		return BlocoDeLeitura.de(bytes, inicio);
	}

	private static PesoColunaConfig sargento() {
		PesoColunaConfig c = new PesoColunaConfig();
		c.setAreaEfetivaSensorPol2(3.5);
		c.setBracoSensorPol(12.0);
		c.setDiametroTamborPol(11.0);
		c.setDiametroCaboPol(1.125);
		c.setNumeroLinhas(8);
		c.setPesoCatarinaLbf(9500);
		c.setFatorCalibracao(1.0);
		return c;
	}

	private static ChaveHidraulicaConfig chave() {
		ChaveHidraulicaConfig c = new ChaveHidraulicaConfig();
		c.setDiametroPistaoIn(2.5);
		c.setDiametroHasteIn(1.25);
		c.setBracoAlavancaFt(3.0);
		c.setTipoMovimento(TipoMovimento.AVANCO);
		return c;
	}

	// ============================================================ faixa

	@Test
	@DisplayName("a faixa cobre do menor endereco ao fim do maior")
	void faixaCobreTudo() {
		var faixa = LeituraDeCards.faixaDe(List.of(
				card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, 0, null),
				card("PRESSAO_01", Tipo.PRESSAO, 10, null)));

		assertEquals(0, faixa.inicio());
		// 10 + 2 bytes da Word = 12.
		assertEquals(12, faixa.tamanho());
	}

	@Test
	@DisplayName("card desativado nao entra na faixa — e pode encolher a leitura")
	void desativadoNaoEntraNaFaixa() {
		var cards = List.of(
				card("PRESSAO_01", Tipo.PRESSAO, 4, range(400)),
				new Card("TEMPERATURA_01", "Temp", Tipo.TEMPERATURA, 40, false, true, 1, null));

		var ativos = LeituraDeCards.ativos(cards);

		assertEquals(1, ativos.size());
		// Com o card de 40 ativo, a faixa iria ate 42. Desativado, para em 6.
		assertEquals(6, LeituraDeCards.faixaDe(ativos).tamanho() + LeituraDeCards.faixaDe(ativos).inicio());
	}

	@Test
	@DisplayName("sem card ativo nao ha faixa: quem chama nao deve ir ao CLP")
	void semCardAtivo() {
		assertThrows(IllegalArgumentException.class, () -> LeituraDeCards.faixaDe(List.of()));
	}

	// ============================================================ pressão

	@Test
	@DisplayName("pressao converte com o range do proprio card")
	void pressaoUsaORangeDoCard() {
		var a = card("PRESSAO_01", Tipo.PRESSAO, 0, range(100));
		var b = card("PRESSAO_02", Tipo.PRESSAO, 2, range(400));
		// Mesmo Ax nos dois enderecos: so o range difere.
		var bloco = bloco(0, 4, bytes -> {
			S7.SetWordAt(bytes, 0, 350);
			S7.SetWordAt(bytes, 2, 350);
		});

		var grandezas = leitura().converter(List.of(a, b), bloco);

		assertTrue(grandezas.get(0).temValor());
		// Range 4x maior, mesma posicao no laco: pressao 4x maior.
		assertEquals(4.0, grandezas.get(1).valor() / grandezas.get(0).valor(), 0.0001);
	}

	@Test
	@DisplayName("dois cards no mesmo endereco leem o mesmo bruto, com escalas diferentes")
	void doisCardsNoMesmoEndereco() {
		// Decisao de 2026-09-07: permitido. O caso real e a mesma leitura em escalas diferentes.
		var bomba = card("PRESSAO_01", Tipo.PRESSAO, 10, range(250));
		var escp = card("PRESSAO_02", Tipo.PRESSAO, 10, range(400));
		var bloco = bloco(10, 2, bytes -> S7.SetWordAt(bytes, 0, 350));

		var grandezas = leitura().converter(List.of(bomba, escp), bloco);

		assertEquals(grandezas.get(0).bruto(), grandezas.get(1).bruto(), "o bruto e o mesmo");
		assertTrue(grandezas.get(1).valor() > grandezas.get(0).valor(), "as escalas diferem");
	}

	@Test
	@DisplayName("card sem range nao converte, e o motivo fica dito")
	void semRangeNaoConverte() {
		var bloco = bloco(0, 2, bytes -> S7.SetWordAt(bytes, 0, 350));

		var g = leitura().converter(List.of(card("PRESSAO_01", Tipo.PRESSAO, 0, null)), bloco).get(0);

		assertFalse(g.temValor());
		assertTrue(g.semValorPorque().contains("range"));
		assertEquals(350.0, g.bruto(), "o bruto continua visivel");
	}

	// ============================================================ peso e torque

	@Test
	@DisplayName("peso converte com a geometria do proprio card")
	void pesoUsaSuaGeometria() {
		var leitura = leitura();
		calibracoes.gravar("PESO_01", CalibracaoDeCards.Calibracao.padrao().comPeso(sargento()));
		var bloco = bloco(4, 2, bytes -> S7.SetWordAt(bytes, 0, 400));

		var g = leitura.converter(List.of(card("PESO_01", Tipo.PESO, 4, range(400))), bloco).get(0);

		assertTrue(g.temValor());
		assertEquals("lbf", g.unidade());
	}

	@Test
	@DisplayName("⚠️ peso sem calibracao devolve AUSENCIA, nao zero")
	void pesoSemCalibracao() {
		var bloco = bloco(4, 2, bytes -> S7.SetWordAt(bytes, 0, 400));

		var g = leitura().converter(List.of(card("PESO_01", Tipo.PESO, 4, range(400))), bloco).get(0);

		// Zero entraria no historico, apareceria no grafico e passaria por leitura real. A ausencia
		// e visivel; o zero, nao.
		assertFalse(g.temValor());
		assertTrue(g.semValorPorque().contains("sargento"));
	}

	@Test
	@DisplayName("dois cards de torque nao trocam de calibracao")
	void torquesNaoSeMisturam() {
		var leitura = leitura();
		ChaveHidraulicaConfig grande = chave();
		grande.setDiametroPistaoIn(5.0);
		calibracoes.gravar("TORQUE_01", CalibracaoDeCards.Calibracao.padrao().comChave(chave()));
		calibracoes.gravar("TORQUE_02", CalibracaoDeCards.Calibracao.padrao().comChave(grande));

		var bloco = bloco(6, 4, bytes -> {
			S7.SetWordAt(bytes, 0, 400);
			S7.SetWordAt(bytes, 2, 400);
		});

		var grandezas = leitura.converter(List.of(
				card("TORQUE_01", Tipo.TORQUE, 6, range(400)),
				card("TORQUE_02", Tipo.TORQUE, 8, range(400))), bloco);

		// Mesmo Ax e mesmo range: se a calibracao fosse a mesma, os torques seriam iguais. Pistao
		// maior tem area maior, entao torque maior.
		assertTrue(grandezas.get(1).valor() > grandezas.get(0).valor());
	}

	@Test
	@DisplayName("torque sem calibracao devolve ausencia")
	void torqueSemCalibracao() {
		var bloco = bloco(6, 2, bytes -> S7.SetWordAt(bytes, 0, 400));

		var g = leitura().converter(List.of(card("TORQUE_01", Tipo.TORQUE, 6, range(400))), bloco).get(0);

		assertFalse(g.temValor());
		assertTrue(g.semValorPorque().contains("chave"));
	}

	@Test
	@DisplayName("a sensibilidade do card entra na conversao")
	void sensibilidadePorCard() {
		var leitura = leitura();
		calibracoes.gravar("PRESSAO_02", CalibracaoDeCards.Calibracao.padrao().comSensibilidade(2.0));
		var bloco = bloco(0, 4, bytes -> {
			S7.SetWordAt(bytes, 0, 350);
			S7.SetWordAt(bytes, 2, 350);
		});

		var grandezas = leitura.converter(List.of(
				card("PRESSAO_01", Tipo.PRESSAO, 0, range(400)),
				card("PRESSAO_02", Tipo.PRESSAO, 2, range(400))), bloco);

		assertEquals(2.0, grandezas.get(1).valor() / grandezas.get(0).valor(), 0.0001);
	}

	// ============================================================ contador de stroke

	@Test
	@DisplayName("um card de stroke produz TRES series")
	void strokeProduzTresSeries() {
		var bloco = bloco(0, 4, bytes -> S7.SetDIntAt(bytes, 0, 1_000));

		var grandezas = leitura().converter(
				List.of(card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, 0, constante(0.125))), bloco);

		assertEquals(3, grandezas.size());
		assertEquals(List.of(LeituraDeCards.SERIE_STROKE, LeituraDeCards.SERIE_VAZAO, LeituraDeCards.SERIE_VOLUME),
				grandezas.stream().map(Grandeza::serie).toList());
		assertEquals(List.of("stroke", "bbl/min", "bbl"), grandezas.stream().map(Grandeza::unidade).toList());
	}

	@Test
	@DisplayName("o volume acumulado e o contador cumulativo vezes a constante")
	void volumeAcumulado() {
		var bloco = bloco(0, 4, bytes -> S7.SetDIntAt(bytes, 0, 2_000));

		var grandezas = leitura().converter(
				List.of(card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, 0, constante(0.125))), bloco);

		assertEquals(250.0, grandezas.get(2).valor(), 0.0001, "2000 strokes x 0,125 bbl");
	}

	@Test
	@DisplayName("duas bombas mantem contagens separadas")
	void duasBombas() {
		var leitura = leitura();
		var a = card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, 0, constante(0.1));
		var b = card("CONTADOR_STROKE_02", Tipo.CONTADOR_STROKE, 4, constante(0.5));

		// Primeira leitura: as duas comecam do zero.
		leitura.converter(List.of(a, b), bloco(0, 8, bytes -> {
			S7.SetDIntAt(bytes, 0, 1_000);
			S7.SetDIntAt(bytes, 4, 500_000);
		}));

		var grandezas = leitura.converter(List.of(a, b), bloco(0, 8, bytes -> {
			S7.SetDIntAt(bytes, 0, 1_010);
			S7.SetDIntAt(bytes, 4, 500_025);
		}));

		// Com estado compartilhado, a leitura de B subtrairia o cumulativo de A.
		assertEquals(10.0, grandezas.get(0).valor(), "delta de A");
		assertEquals(25.0, grandezas.get(3).valor(), "delta de B");
	}

	@Test
	@DisplayName("stroke sem constante ainda conta, mas nao produz vazao nem volume")
	void strokeSemConstante() {
		var bloco = bloco(0, 4, bytes -> S7.SetDIntAt(bytes, 0, 1_000));

		var grandezas = leitura().converter(
				List.of(card("CONTADOR_STROKE_01", Tipo.CONTADOR_STROKE, 0, null)), bloco);

		assertTrue(grandezas.get(0).temValor(), "a contagem nao depende da constante");
		assertFalse(grandezas.get(1).temValor());
		assertFalse(grandezas.get(2).temValor());
		assertTrue(grandezas.get(2).semValorPorque().contains("constante"));
	}

	// ============================================================ tipos do passo 7

	@Test
	@DisplayName("temperatura e tanque ainda nao convertem, e dizem isso em vez de devolver zero")
	void tiposDoPasso7() {
		var bloco = bloco(12, 4, bytes -> {
			S7.SetWordAt(bytes, 0, 400);
			S7.SetWordAt(bytes, 2, 300);
		});

		var grandezas = leitura().converter(List.of(
				card("TEMPERATURA_01", Tipo.TEMPERATURA, 12, null),
				card("NIVEL_TANQUE_01", Tipo.NIVEL_TANQUE, 14, null)), bloco);

		grandezas.forEach(g -> {
			assertFalse(g.temValor());
			assertTrue(g.semValorPorque().contains("ainda nao implementada"));
		});
		assertEquals(400.0, grandezas.get(0).bruto(), "o bruto ja aparece");
	}

	// ============================================================ limites

	@Test
	@DisplayName("endereco fora do bloco lido lanca, em vez de devolver zero")
	void enderecoForaDoBloco() {
		var bloco = bloco(0, 4, bytes -> S7.SetWordAt(bytes, 0, 350));

		// Faixa calculada errado e erro de programacao: um zero silencioso viraria uma grandeza
		// plausivel e errada.
		assertThrows(IllegalStateException.class, () -> leitura()
				.converter(List.of(card("PRESSAO_01", Tipo.PRESSAO, 100, range(400))), bloco));
	}

	@Test
	@DisplayName("o bruto vem com sinal: a escala do amplificador comeca em -50")
	void brutoComSinal() {
		var bloco = bloco(0, 2, bytes -> S7.SetWordAt(bytes, 0, 0xFFCE)); // -50

		var g = leitura().converter(List.of(card("PRESSAO_01", Tipo.PRESSAO, 0, range(400))), bloco).get(0);

		// Lido como Word sem sinal, -50 viraria 65486 e a pressao sairia enorme e plausivel.
		assertEquals(-50.0, g.bruto());
		assertEquals(0.0, g.valor(), 0.0001, "-50 e o zero da escala");
	}
}
