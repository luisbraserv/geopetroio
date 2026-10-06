package com.braserv.core.usuario.adapter.in.web.request;

import java.util.Set;

import com.braserv.core.usuario.application.command.CriarUsuarioInternoCommand;
import com.braserv.core.usuario.domain.model.Email;
import com.braserv.core.usuario.domain.model.Endereco;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Telefone;

public record CriarUsuarioInternoRequest(Integer matricula, String username, String password, String nome,
		String telefone, String email, String cep, String logradouro, String bairro, String cidade, String estado,
		String numero, String complemento, Set<Role> roles) {

	public CriarUsuarioInternoCommand toCommand() {
		return new CriarUsuarioInternoCommand(matricula, username, password, nome,
				Telefone.comTratamento(telefone), Email.comTratamento(email),
				Endereco.comTratamento(cep, logradouro, bairro, cidade, estado, numero, complemento), roles);
	}
}
