package com.geopetro.core.exception;

import org.springframework.http.HttpStatus;

public class RegraNegocioException extends RuntimeException {

	private final HttpStatus status;

	public RegraNegocioException(String mensagem, HttpStatus status) {
		super(mensagem);
		this.status = status;
	}

	public HttpStatus getStatus() {
		return status;
	}
}
