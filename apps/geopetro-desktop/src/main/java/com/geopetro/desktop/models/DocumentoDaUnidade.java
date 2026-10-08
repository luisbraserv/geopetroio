package com.geopetro.desktop.models;

/**
 * O que os documentos de configuração de uma Unidade têm em comum.
 *
 * <p>Hoje há <b>um</b>: {@link CardsDaUnidade}, o que a unidade lê. O ciclo de vida dele é o que esta
 * interface descreve — chega pelo canal de tempo real, só substitui o anterior se a revisão for
 * maior, e é guardado em disco para sobreviver a um reinício sem rede.
 *
 * <p>⚠️ <b>Eram dois.</b> O documento de limites de alarme saiu em 2026-09-09: o alarme da estação
 * passou a ser configurado na estação
 * ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.3}), e buscar no servidor uma faixa para
 * tocar um beep nesta máquina era uma volta pela rede para responder o que já estava respondido
 * aqui.
 *
 * <p>A abstração fica: a mecânica de cache com guarda de revisão é sutil, e escrevê-la de novo para
 * um segundo documento — se um dia voltar a haver — é como ela diverge.
 */
public interface DocumentoDaUnidade {

	/** A unidade a que este documento pertence. */
	long unidadeId();

	/**
	 * Revisão do documento. Só substitui o que está em memória se for <b>maior</b>.
	 *
	 * <p>Zero significa "nunca configurado" — estado normal de uma unidade nova.
	 */
	long revisao();
}
