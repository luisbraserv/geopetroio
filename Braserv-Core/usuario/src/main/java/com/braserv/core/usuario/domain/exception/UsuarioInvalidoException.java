package com.braserv.core.usuario.domain.exception;

import org.springframework.http.HttpStatus;

import com.braserv.core.comum.exception.RegraNegocioException;

public class UsuarioInvalidoException extends RegraNegocioException {

	public UsuarioInvalidoException(String mensagem) {
		super(mensagem, HttpStatus.BAD_REQUEST);
	}
}
