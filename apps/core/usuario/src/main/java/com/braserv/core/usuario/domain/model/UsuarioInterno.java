package com.braserv.core.usuario.domain.model;

import java.util.Set;

import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;

/**
 * Usuario interno da Braserv.
 *
 * <p><b>Sem vinculo organizacional</b> — RN-064. A regional principal, a lista de regionais e a
 * lista de setores sairam do modelo em 2026-09-06: desde 2026-08-27 nenhuma delas influenciava
 * qualquer decisao do sistema, e campo preenchido que nao faz nada e divida silenciosa — alguem
 * assume que restringe acesso.
 *
 * <p>O que decide visibilidade continua sendo a <b>role</b> (RN-047) e, para o cliente, a
 * <b>concessao explicita de unidades</b> (RN-048). Ambas inalteradas.
 */
public class UsuarioInterno extends Usuario {

	private Integer matricula;

	public UsuarioInterno() {
	}

	public UsuarioInterno(Integer matricula, String username, String password, String nome, Telefone telefone,
			Email email, Endereco endereco, Set<Role> roles) {
		super(username, password, roles, nome, telefone, email, endereco);
		this.matricula = validarMatricula(matricula);
	}

	public Integer getMatricula() { return matricula; }
	public void setMatricula(Integer matricula) { this.matricula = validarMatricula(matricula); }

	private static Integer validarMatricula(Integer matricula) {
		if (matricula == null || matricula <= 0) {
			throw new UsuarioInvalidoException("Matricula do usuario interno deve ser maior que zero.");
		}
		return matricula;
	}
}
