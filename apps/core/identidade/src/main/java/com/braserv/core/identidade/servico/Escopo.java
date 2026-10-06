package com.braserv.core.identidade.servico;

import java.util.Set;

/**
 * Escopos de um token de servico — RN-117. Cada escopo abre um grupo de rotas internas.
 */
public final class Escopo {

	/** {@code GET /internal/v1/usuarios/{username}/acesso} no core. */
	public static final String ACESSO_LER = "acesso:ler";

	/** {@code GET /internal/v1/unidades} e {@code /{id}} no core. */
	public static final String UNIDADES_LER = "unidades:ler";

	/**
	 * {@code GET /internal/v1/unidades/{id}/vinculos} no <b>Geopetro-Backend</b>. So o proprio core o
	 * recebe, no token que ele assina para perguntar se uma unidade pode ser excluida; nenhum
	 * cliente de servico pode pedi-lo.
	 */
	public static final String UNIDADES_VINCULOS = "unidades:vinculos";

	/** O que um cliente de servico pode receber. */
	public static final Set<String> CONCEDIVEIS = Set.of(ACESSO_LER, UNIDADES_LER);

	/** Prefixo da authority no Spring Security: {@code ESCOPO_acesso:ler}. */
	public static final String PREFIXO_AUTHORITY = "ESCOPO_";

	private Escopo() {
	}
}
