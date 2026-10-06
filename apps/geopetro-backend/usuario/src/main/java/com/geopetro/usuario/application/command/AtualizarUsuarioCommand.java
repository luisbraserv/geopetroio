package com.geopetro.usuario.application.command;

import java.util.Set;

import com.geopetro.usuario.domain.model.Email;
import com.geopetro.usuario.domain.model.Endereco;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.Telefone;

public record AtualizarUsuarioCommand(String nome, Telefone telefone, Email email, Endereco endereco, Set<Role> roles,
		Integer id, Long empresaId, String empresa, Integer matricula, Set<Long> unidadeSondaIds) {
}
