package com.geopetro.desktop.services;

import java.util.ArrayList;
import java.util.List;

import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.models.CardsDaUnidade.Card;
import com.geopetro.desktop.models.CardsDaUnidade.Conexao;

/**
 * Copia a configuração de cards de uma unidade para outra — a mitigação decidida em
 * {@code cards-configuraveis.md §10}.
 *
 * <p>A frota nasce vazia por decisão de produto: cada unidade é configurada individualmente, e entre
 * o deploy e a visita de quem a configura ela não produz telemetria (RN-088). Sondas iguais têm o
 * mesmo mapeamento — copiar de uma já configurada tira a maior parte do trabalho repetido.
 *
 * <p>Função pura, sem HTTP e sem tela, porque é aqui que o erro seria caro e silencioso: um card
 * copiado com o endereço de outra unidade lê bytes válidos e devolve um número plausível.
 */
public final class CopiaDeCards {

	private CopiaDeCards() {
	}

	/** Copiar sobre cards ativos duplicaria as séries, e RN-091 impede desfazer. */
	public static class CopiaRecusadaException extends RuntimeException {
		public CopiaRecusadaException(String mensagem) {
			super(mensagem);
		}
	}

	/**
	 * O rascunho que a tela passa a editar, já pronto para virar {@code Alteracao}.
	 *
	 * <p>A conexão vem separada dos cards porque tem regra própria: veja {@link #conexaoPara}.
	 */
	public record Rascunho(Conexao conexao, List<Card> cards) {
	}

	/**
	 * @param origem  unidade já configurada, de onde se copia
	 * @param destino o que a unidade de destino tem hoje — normalmente vazio
	 * @throws CopiaRecusadaException se a origem não tem card ativo, ou se o destino já tem
	 */
	public static Rascunho copiar(CardsDaUnidade origem, CardsDaUnidade destino) {
		if (origem == null || destino == null) {
			throw new CopiaRecusadaException("Escolha a unidade de origem.");
		}
		if (origem.unidadeId() == destino.unidadeId()) {
			throw new CopiaRecusadaException("A unidade de origem e a de destino sao a mesma.");
		}

		List<Card> aCopiar = origem.cards().stream().filter(Card::ativo).toList();
		if (aCopiar.isEmpty()) {
			throw new CopiaRecusadaException("A unidade de origem nao tem card ativo para copiar.");
		}

		// RN-091: card nao se exclui, se desativa. Se o destino ja le alguma coisa, copiar por cima
		// criaria um segundo conjunto lendo os mesmos enderecos, e nao ha como remover o primeiro.
		if (destino.cards().stream().anyMatch(Card::ativo)) {
			throw new CopiaRecusadaException(
					"Esta unidade ja tem cards ativos. Copiar criaria um conjunto duplicado, e card "
							+ "nao pode ser removido — apenas desativado. Desative os atuais antes de copiar.");
		}

		int proximaOrdem = destino.cards().stream().mapToInt(Card::ordem).max().orElse(-1) + 1;

		List<Card> copiados = new ArrayList<>();
		for (Card card : aCopiar) {
			copiados.add(new Card(
					// O id pertence a unidade de origem e ao historico dela (RN-081). O destino
					// recebe null e o backend numera a partir do que ja existe la.
					null,
					card.nome(),
					card.tipo(),
					card.byteInicial(),
					true,
					card.visivel(),
					proximaOrdem++,
					card.parametros()));
		}

		List<Card> rascunho = new ArrayList<>(destino.cards());
		rascunho.addAll(copiados);
		return new Rascunho(conexaoPara(origem.conexao(), destino.conexao()), List.copyOf(rascunho));
	}

	/**
	 * A conexão é copiada <b>sem o IP</b>.
	 *
	 * <p>⚠️ Rack, slot, número do DB e intervalo descrevem o <b>modelo de CLP</b> e o mapeamento —
	 * é justamente o que se quer repetir entre sondas iguais. O IP descreve <b>qual</b> CLP, e é
	 * diferente em cada unidade. Copiá-lo apontaria o Desktop da unidade B para o CLP da unidade A:
	 * a conexão teria sucesso, os endereços existiriam, e a unidade B publicaria a leitura da A sob
	 * o próprio nome. Nenhum alarme dispararia.
	 *
	 * <p>O IP que o destino já tinha é preservado; se não tinha, fica em branco para ser digitado.
	 */
	static Conexao conexaoPara(Conexao origem, Conexao destino) {
		Conexao base = origem == null ? Conexao.padrao() : origem;
		String ip = destino == null || destino.ip() == null ? "" : destino.ip();
		return new Conexao(ip, base.rack(), base.slot(), base.dbNumero(), base.intervaloLeituraMs(),
				base.tsapLocal(), base.tsapRemoto());
	}
}
