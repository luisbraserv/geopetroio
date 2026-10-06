package com.braserv.core.comum.exception;

import org.springframework.http.HttpStatus;

public class BusinessException extends RegraNegocioException {

	public BusinessException(String message) {
		super(message, HttpStatus.BAD_REQUEST);
	}

	public BusinessException(String message, HttpStatus status) {
		super(message, status);
	}
}
