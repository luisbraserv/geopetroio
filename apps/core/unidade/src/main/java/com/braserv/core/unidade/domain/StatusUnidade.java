package com.braserv.core.unidade.domain;

/**
 * Se a unidade esta em uso — RN-116.
 *
 * <p>Inativar e o caminho normal para tirar uma unidade de uso: preserva limites, cards, alarmes e
 * telemetria dela, nos outros sistemas, e e reversivel. A exclusao fisica so vale para unidade que
 * nunca foi usada.
 */
public enum StatusUnidade {
	ATIVA,
	/** Some das listas de selecao e nao recebe concessao nova; o historico continua consultavel. */
	INATIVA
}
