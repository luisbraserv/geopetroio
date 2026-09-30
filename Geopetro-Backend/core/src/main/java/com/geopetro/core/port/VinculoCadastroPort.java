package com.geopetro.core.port;

import java.util.Optional;

/**
 * Uma fonte de vinculo capaz de impedir a exclusao de um cadastro — RN-063.
 *
 * <p>Substitui o antigo {@code RegionalConsultaPort}, que respondia apenas {@code boolean} e apenas
 * para Regional. Duas mudancas:
 *
 * <ol>
 *   <li><b>Vale para os quatro cadastros.</b> Antes, so a Regional bloqueava; Setor, Unidade/Sonda e
 *       Empresa quebravam em violacao de FK, devolvendo {@code 500} generico.</li>
 *   <li><b>A resposta diz o que impede</b>, nao apenas que impede. Quem implementa conhece o
 *       vinculo e sabe descreve-lo — o servico so junta as descricoes.</li>
 * </ol>
 *
 * <p>Uma implementacao nao precisa ser relacional: o historico de telemetria vive no InfluxDB, em
 * outro servico, e entra por esta mesma porta ({@link Cadastro#UNIDADE_SONDA}, RN-072).
 */
public interface VinculoCadastroPort {

	/** Qual cadastro esta porta sabe examinar. */
	Cadastro cadastro();

	/**
	 * @param id identificador do registro que se pretende excluir
	 * @return descricao do que impede a exclusao — um sintagma nominal como {@code "2 setores"} ou
	 *         {@code "telemetria de 01/03/2026 a 05/09/2026"} —, ou vazio se nada impede
	 */
	Optional<String> descreverVinculo(Long id);

	enum Cadastro {
		EMPRESA,
		REGIONAL,
		SETOR,
		UNIDADE_SONDA
	}
}
