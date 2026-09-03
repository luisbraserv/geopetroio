package com.geopetro.usuario.domain.exception;

import org.springframework.http.HttpStatus;

import com.geopetro.core.exception.RegraNegocioException;

public class UsuarioJaExisteException extends RegraNegocioException {

	public UsuarioJaExisteException(String username) {
		super("Já existe um usuário com esse username.", HttpStatus.CONFLICT);
	}
}
