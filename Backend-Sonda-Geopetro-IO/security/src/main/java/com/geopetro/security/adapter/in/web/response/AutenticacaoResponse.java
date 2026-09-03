package com.geopetro.security.adapter.in.web.response;

import java.util.Set;

import com.geopetro.usuario.domain.model.Role;

public record AutenticacaoResponse(String token, String username, String nome, String email, String endereco,
		String telefone, Set<Role> roles, Long regionalId, String regionalNome) {
}
