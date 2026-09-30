package com.geopetro.security.adapter.in.web.response;

import java.util.Set;

import com.geopetro.usuario.domain.model.Role;

/**
 * RN-064 — {@code regionalId} e {@code regionalNome} sairam desta resposta junto com o vinculo
 * organizacional do usuario. Eram guardados no {@code AuthState} do front sem nenhum consumidor.
 */
public record AutenticacaoResponse(String token, String username, String nome, String email, String endereco,
		String telefone, Set<Role> roles) {
}
