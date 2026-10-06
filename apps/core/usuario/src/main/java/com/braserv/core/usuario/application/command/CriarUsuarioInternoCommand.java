package com.braserv.core.usuario.application.command;

import java.util.Set;

import com.braserv.core.usuario.domain.model.Email;
import com.braserv.core.usuario.domain.model.Endereco;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Telefone;

public record CriarUsuarioInternoCommand(Integer matricula, String username, String password, String nome,
		Telefone telefone, Email email, Endereco endereco, Set<Role> roles) {
}
