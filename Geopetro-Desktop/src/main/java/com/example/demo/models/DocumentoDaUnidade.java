package com.example.demo.models;

/**
 * O que os documentos de configuração de uma Unidade/Sonda têm em comum.
 *
 * <p>São dois — {@link ConfiguracaoSondaRemota} (limites de alarme) e {@link CardsDaUnidade} (o que
 * a unidade lê) —, separados de propósito porque têm autoridades diferentes para gravar
 * ({@code RN-089}). Mas o <b>ciclo de vida</b> dos dois é idêntico: chegam pelo canal de tempo real,
 * só substituem o anterior se a revisão for maior, e são guardados em disco para sobreviver a um
 * reinício sem rede.
 *
 * <p>Esta interface existe para que essa mecânica seja escrita <b>uma vez</b>. A base já teve o fator
 * bar-PSI declarado duas vezes com precisões diferentes, e uma ficou para trás — cache com guarda de
 * revisão é bem mais sutil que uma constante.
 */
public interface DocumentoDaUnidade {

	/** A unidade a que este documento pertence. */
	long unidadeSondaId();

	/**
	 * Revisão do documento. Só substitui o que está em memória se for <b>maior</b>.
	 *
	 * <p>Zero significa "nunca configurado" — estado normal de uma unidade nova.
	 */
	long revisao();
}
