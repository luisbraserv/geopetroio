package com.geopetro.comum.exception;

import org.springframework.http.HttpStatus;

public class ResourceNotFoundException extends RegraNegocioException {

	public ResourceNotFoundException(String message) {
		super(message, HttpStatus.NOT_FOUND);
	}
}
