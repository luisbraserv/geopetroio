package com.geopetro.desktop.aquisicao;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * RN-095 — a leitura do CLP passa a ser em bloco.
 *
 * <p>Estes casos existem porque a troca de cinco leituras por uma move a aritmetica de endereco do
 * driver para o nosso codigo. Errar o deslocamento nao produz excecao no CLP: produz um numero
 * plausivel e errado, que e o pior desfecho possivel numa grandeza de operacao.
 */
class BlocoDeLeituraTest {

	/** Mapeamento de hoje: DBD0 (stroke) e DBW4/6/8/10 (canais analogicos). */
	private static final int[] ENDERECOS = { 0, 4, 6, 8, 10 };
	private static final int[] TAMANHOS = { 4, 2, 2, 2, 2 };

	@Test
	@DisplayName("a faixa cobre do primeiro byte ao fim do ultimo endereco")
	void faixaCobreTudo() {
		var faixa = BlocoDeLeitura.faixaQueCobre(ENDERECOS, TAMANHOS);

		assertEquals(0, faixa.inicio());
		assertEquals(12, faixa.tamanho(), "DBW10 ocupa os bytes 10 e 11, entao a faixa vai ate 12");
	}

	@Test
	@DisplayName("faixa que nao comeca em zero desloca o inicio, sem ler o que veio antes")
	void faixaDeslocada() {
		var faixa = BlocoDeLeitura.faixaQueCobre(new int[] { 20, 24 }, new int[] { 2, 4 });

		assertEquals(20, faixa.inicio());
		assertEquals(8, faixa.tamanho());
	}

	@Test
	@DisplayName("um DB esparso e lido inteiro entre os extremos")
	void dbEsparso() {
		// Ler os bytes intermediarios que ninguem pediu custa menos que uma viagem por grandeza.
		var faixa = BlocoDeLeitura.faixaQueCobre(new int[] { 0, 100 }, new int[] { 2, 2 });

		assertEquals(0, faixa.inicio());
		assertEquals(102, faixa.tamanho());
	}

	@Test
	@DisplayName("as words saem nos mesmos valores que cinco leituras separadas dariam")
	void fatiaAsWordsNasPosicoesCertas() {
		byte[] bytes = new byte[12];
		escreverWord(bytes, 4, 250);   // meio da faixa do amplificador
		escreverWord(bytes, 6, -250);  // 4 mA, inicio da faixa
		escreverWord(bytes, 8, 750);   // 20 mA, fundo de escala
		escreverWord(bytes, 10, 123);

		var bloco = BlocoDeLeitura.de(bytes, 0);

		assertEquals(250, bloco.word(4));
		assertEquals(-250, bloco.word(6));
		assertEquals(750, bloco.word(8));
		assertEquals(123, bloco.word(10));
	}

	@Test
	@DisplayName("o Ax negativo continua sendo lido com sinal")
	void axNegativoTemSinal() {
		byte[] bytes = new byte[12];
		escreverWord(bytes, 4, -250);

		// Lido como Word sem sinal, -250 viraria 65286 e a pressao sairia no fundo da escala.
		assertEquals(-250, BlocoDeLeitura.de(bytes, 0).word(4));
	}

	@Test
	@DisplayName("o contador cumulativo sai como DWord")
	void contadorCumulativo() {
		byte[] bytes = new byte[12];
		escreverDword(bytes, 0, 123_456);

		assertEquals(123_456, BlocoDeLeitura.de(bytes, 0).dword(0));
	}

	@Test
	@DisplayName("bloco deslocado converte o endereco absoluto para o offset interno")
	void blocoDeslocado() {
		byte[] bytes = new byte[8];
		escreverWord(bytes, 0, 111); // endereco absoluto 20
		escreverWord(bytes, 2, 222); // endereco absoluto 22

		var bloco = BlocoDeLeitura.de(bytes, 20);

		assertEquals(111, bloco.word(20));
		assertEquals(222, bloco.word(22));
	}

	@Test
	@DisplayName("endereco fora do bloco lanca, em vez de devolver um numero plausivel")
	void foraDoBlocoLanca() {
		var bloco = BlocoDeLeitura.de(new byte[12], 0);

		assertThrows(IllegalStateException.class, () -> bloco.word(12), "depois do fim");
		assertThrows(IllegalStateException.class, () -> bloco.word(11), "word que cruza o fim");
		assertThrows(IllegalStateException.class, () -> bloco.dword(10), "dword que cruza o fim");

		var deslocado = BlocoDeLeitura.de(new byte[8], 20);
		assertThrows(IllegalStateException.class, () -> deslocado.word(18), "antes do inicio");
	}

	@Test
	@DisplayName("faixa invalida e recusada na montagem")
	void faixaInvalida() {
		assertThrows(IllegalArgumentException.class,
				() -> BlocoDeLeitura.faixaQueCobre(new int[] {}, new int[] {}));
		assertThrows(IllegalArgumentException.class,
				() -> BlocoDeLeitura.faixaQueCobre(new int[] { 0 }, new int[] { 2, 2 }));
		assertThrows(IllegalArgumentException.class,
				() -> BlocoDeLeitura.faixaQueCobre(new int[] { -1 }, new int[] { 2 }));
		assertThrows(IllegalArgumentException.class,
				() -> BlocoDeLeitura.faixaQueCobre(new int[] { 0 }, new int[] { 0 }));
	}

	private static void escreverWord(byte[] destino, int offset, int valor) {
		destino[offset] = (byte) (valor >> 8);
		destino[offset + 1] = (byte) valor;
	}

	private static void escreverDword(byte[] destino, int offset, int valor) {
		destino[offset] = (byte) (valor >> 24);
		destino[offset + 1] = (byte) (valor >> 16);
		destino[offset + 2] = (byte) (valor >> 8);
		destino[offset + 3] = (byte) valor;
	}
}
