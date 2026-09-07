package com.geopetro.usuario.domain.model;

public enum Role {
	CLIENTE,
	INTERNO,
	ADMIN,
	CIMENTACAO,
	SONDA,
	GERENCIA,
	DIRETORIA,

	/**
	 * Suporte — RN-086. Configura o sistema sem administrar cadastro: hoje alcanca as
	 * configuracoes ({@code /api/configuracoes/**}), e passara a alcancar os cards da unidade
	 * quando eles existirem.
	 *
	 * <p><b>Nao</b> enxerga usuarios, empresas nem os demais cadastros — isso segue exclusivo de
	 * {@code ADMIN}.
	 */
	SUPORTE,
}
