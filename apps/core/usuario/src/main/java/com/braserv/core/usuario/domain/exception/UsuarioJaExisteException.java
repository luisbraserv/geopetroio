package com.braserv.core.usuario.domain.exception;

import org.springframework.http.HttpStatus;

import com.braserv.core.comum.exception.RegraNegocioException;

public class UsuarioJaExisteException extends RegraNegocioException {

	public UsuarioJaExisteException(String username) {
		super("Já existe um usuário com esse username.", HttpStatus.CONFLICT);
	}
}
