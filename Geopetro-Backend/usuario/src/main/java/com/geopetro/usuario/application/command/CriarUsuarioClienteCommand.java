package com.geopetro.usuario.application.command;

import java.util.Set;

import com.geopetro.usuario.domain.model.Email;
import com.geopetro.usuario.domain.model.Endereco;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.Telefone;

public record CriarUsuarioClienteCommand(Integer id, Long empresaId, String empresa, String username, String password,
		String nome, Telefone telefone, Email email, Endereco endereco, Set<Role> roles,
		Set<Long> unidadeSondaIds) {
}
