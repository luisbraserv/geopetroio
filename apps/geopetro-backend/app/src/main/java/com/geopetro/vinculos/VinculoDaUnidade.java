package com.geopetro.vinculos;

import java.util.Optional;

/**
 * Uma fonte de uso de uma unidade neste backend — RN-116, contrato braserv-core §5.
 *
 * <p>Cada implementacao conhece o proprio dado e sabe descreve-lo; o endpoint de vinculos so junta
 * as descricoes. Adicionar uma fonte nova e um {@code @Component} a mais.
 */
public interface VinculoDaUnidade {

	/**
	 * @return descricao do que mostra o uso — um sintagma nominal como {@code "historico de alarmes"} —,
	 *         ou vazio se esta fonte nao tem nada da unidade
	 * @throws FonteIndisponivelException se nao foi possivel conferir
	 */
	Optional<String> descrever(long unidadeId);

	/** A fonte nao conseguiu conferir. Responder "sem uso" nesse caso apagaria o que nao podia. */
	class FonteIndisponivelException extends RuntimeException {
		public FonteIndisponivelException(String mensagem) {
			super(mensagem);
		}
	}
}
