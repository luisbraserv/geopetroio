package com.geopetro.usuario.adapter.in.web.request;

import java.util.Set;

import com.geopetro.usuario.application.command.AtualizarUsuarioCommand;
import com.geopetro.usuario.domain.model.Email;
import com.geopetro.usuario.domain.model.Endereco;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.Telefone;

public record AtualizarUsuarioRequest(String nome, String telefone, String email, String cep, String logradouro,
		String bairro, String cidade, String estado, String numero, String complemento, Set<Role> roles, Integer id,
		Long empresaId, String empresa, Integer matricula, Set<Long> unidadeSondaIds) {

	public AtualizarUsuarioCommand toCommand() {
		return new AtualizarUsuarioCommand(nome, Telefone.comTratamento(telefone), Email.comTratamento(email),
				criarEndereco(), roles, id, empresaId, empresa, matricula, unidadeSondaIds);
	}

	private Endereco criarEndereco() {
		if (isBlank(cep) && isBlank(logradouro) && isBlank(bairro) && isBlank(cidade) && isBlank(estado)
				&& isBlank(numero) && isBlank(complemento)) {
			return null;
		}
		return Endereco.comTratamento(cep, logradouro, bairro, cidade, estado, numero, complemento);
	}

	private static boolean isBlank(String valor) {
		return valor == null || valor.isBlank();
	}
}
