package com.geopetro.security.domain;

import org.springframework.http.HttpStatus;

import com.geopetro.core.exception.RegraNegocioException;

public class AutenticacaoInvalidaException extends RegraNegocioException {

	public AutenticacaoInvalidaException() {
		super("Usuário ou senha inválidos.", HttpStatus.UNAUTHORIZED);
	}
}
