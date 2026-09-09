package com.geopetro.prontidao;

import java.time.Instant;

/**
 * O que falta para uma Unidade/Sonda estar de pé — resposta de
 * [OQ-049](../../../../../../specs/open-questions.md).
 *
 * <h2>Duas perguntas que ninguém conseguia responder de fora</h2>
 * <ul>
 *   <li><b>"A migração dos cards terminou?"</b> A frota nasce vazia e cada unidade fica muda até
 *       alguém configurá-la pela tela do Desktop (RN-088, RN-092). Uma unidade esquecida ficava sem
 *       telemetria <b>sem que nada acusasse</b>.</li>
 *   <li><b>"Esta sonda alarma?"</b> Sonda sem limite não alarma, e isso é estado normal, não
 *       pendência sinalizada ({@code alarmes.md §4}) — o que significa que o silêncio de uma sonda
 *       mal configurada era indistinguível do silêncio de uma sonda em ordem.</li>
 * </ul>
 *
 * <h2>⚠️ O que este relatório NÃO responde</h2>
 * Se a unidade <b>está publicando</b>. Configurada e muda são coisas diferentes: um CLP desligado,
 * um cabo solto ou uma estação sem energia aparecem aqui como prontas. O tempo real e o histórico é
 * que respondem "está chegando dado?" — ver
 * [OQ-049](../../../../../../specs/open-questions.md#oq-049--como-saber-quais-unidades-da-frota-já-foram-configuradas).
 *
 * @param cardsAtivos      o que a unidade lê de fato; {@code cardsDeclarados} inclui os desativados
 * @param limitesAtivos    o que vigia de fato; {@code limitesDeclarados} inclui os que hibernam
 * @param revisaoCards     {@code 0} quando não há documento — a unidade nunca foi configurada
 */
public record ProntidaoDaUnidade(
		long unidadeSondaId,
		String nome,
		String apelido,
		long revisaoCards,
		int cardsAtivos,
		int cardsDeclarados,
		String cardsAtualizadosPor,
		Instant cardsAtualizadosEm,
		long revisaoLimites,
		int limitesAtivos,
		int limitesDeclarados,
		String limitesAtualizadosPor,
		Instant limitesAtualizadosEm) {

	/**
	 * A unidade lê alguma coisa.
	 *
	 * <p>⚠️ Ter documento não basta: um documento com todos os cards desativados não produz leitura
	 * nenhuma, e a unidade fica tão muda quanto uma nunca configurada.
	 */
	public boolean produzTelemetria() {
		return cardsAtivos > 0;
	}

	/** Alguém vigia alguma grandeza desta unidade. */
	public boolean alarma() {
		return limitesAtivos > 0;
	}

	/** Nunca recebeu a visita de configuração — o estado inicial de toda a frota. */
	public boolean nuncaConfigurada() {
		return revisaoCards == 0;
	}
}
