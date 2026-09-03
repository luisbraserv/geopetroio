package com.geopetro.usuario.domain.exception;

import org.springframework.http.HttpStatus;

import com.geopetro.core.exception.RegraNegocioException;

public class UsuarioInvalidoException extends RegraNegocioException {

	public UsuarioInvalidoException(String mensagem) {
		super(mensagem, HttpStatus.BAD_REQUEST);
	}
}
