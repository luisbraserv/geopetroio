package com.example.demo.services;

import com.sourceforge.snap7.moka7.S7;

/**
 * Uma faixa contigua do Data Block, lida de uma vez e fatiada em memoria — RN-095.
 *
 * <h2>Por que ler em bloco</h2>
 * Ate aqui eram <b>cinco</b> chamadas {@code ReadArea} por ciclo, uma por grandeza. Duas razoes
 * para trocar:
 *
 * <ol>
 *   <li><b>Coerencia.</b> Cinco idas sequenciais podem pegar o CLP em estados diferentes e compor
 *       um ciclo que nunca existiu — peso de um instante, pressao de outro. Uma leitura so devolve
 *       um retrato.</li>
 *   <li><b>Custo.</b> Com cards configuraveis o numero de grandezas deixa de ser conhecido; N
 *       chamadas por segundo cresceriam com a configuracao.</li>
 * </ol>
 *
 * <h2>Sobre os limites</h2>
 * Fatiar fora da faixa lida e erro de programacao, nao de operacao: significa que a faixa foi
 * calculada errado. Por isso lanca, em vez de devolver zero — um zero silencioso viraria uma
 * grandeza plausivel e errada, que e o pior desfecho possivel aqui.
 */
final class BlocoDeLeitura {

	/** Tamanho de uma Word: os canais analogicos do amplificador. */
	static final int TAMANHO_WORD = 2;

	/** Tamanho de uma DWord: o contador cumulativo de stroke. */
	static final int TAMANHO_DWORD = 4;

	private final byte[] bytes;
	private final int enderecoInicial;

	private BlocoDeLeitura(byte[] bytes, int enderecoInicial) {
		this.bytes = bytes;
		this.enderecoInicial = enderecoInicial;
	}

	static BlocoDeLeitura de(byte[] bytes, int enderecoInicial) {
		if (bytes == null || enderecoInicial < 0) {
			throw new IllegalArgumentException("Bloco invalido.");
		}
		return new BlocoDeLeitura(bytes, enderecoInicial);
	}

	/**
	 * Faixa que cobre todos os enderecos pedidos, do menor ao fim do maior.
	 *
	 * <p>Le tambem os bytes intermediarios que ninguem pediu — o custo de um DB esparso e ler
	 * alguns bytes a mais numa viagem, contra uma viagem a mais por grandeza.
	 */
	static Faixa faixaQueCobre(int[] enderecos, int[] tamanhos) {
		if (enderecos == null || tamanhos == null || enderecos.length != tamanhos.length || enderecos.length == 0) {
			throw new IllegalArgumentException("Enderecos e tamanhos devem ter o mesmo tamanho e nao ser vazios.");
		}
		int inicio = Integer.MAX_VALUE;
		int fim = Integer.MIN_VALUE;
		for (int i = 0; i < enderecos.length; i++) {
			if (enderecos[i] < 0 || tamanhos[i] <= 0) {
				throw new IllegalArgumentException("Endereco negativo ou tamanho nao positivo.");
			}
			inicio = Math.min(inicio, enderecos[i]);
			fim = Math.max(fim, enderecos[i] + tamanhos[i]);
		}
		return new Faixa(inicio, fim - inicio);
	}

	/** Onde comecar a ler e quantos bytes trazer. */
	record Faixa(int inicio, int tamanho) {
	}

	/**
	 * Word com sinal, no endereco absoluto do DB.
	 *
	 * <p>Com sinal de proposito: a escala do amplificador comeca em -50, e lida como Word sem sinal
	 * {@code -50} viraria {@code 65486}.
	 */
	short word(int endereco) {
		return ConversaoPressao.axComoSigned(S7.GetWordAt(bytes, deslocamento(endereco, TAMANHO_WORD)));
	}

	/** DWord com sinal, no endereco absoluto do DB. */
	long dword(int endereco) {
		return S7.GetDIntAt(bytes, deslocamento(endereco, TAMANHO_DWORD));
	}

	private int deslocamento(int endereco, int tamanho) {
		int offset = endereco - enderecoInicial;
		if (offset < 0 || offset + tamanho > bytes.length) {
			throw new IllegalStateException("Endereco DB%d fora do bloco lido [%d..%d): %d"
					.formatted(tamanho, enderecoInicial, enderecoInicial + bytes.length, endereco));
		}
		return offset;
	}
}
