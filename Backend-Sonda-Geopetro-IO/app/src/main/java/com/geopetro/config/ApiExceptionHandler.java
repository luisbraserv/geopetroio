package com.geopetro.config;

import java.time.LocalDateTime;
import java.util.List;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.geopetro.core.exception.RegraNegocioException;

import jakarta.servlet.http.HttpServletRequest;

@RestControllerAdvice
public class ApiExceptionHandler {

    @ExceptionHandler(org.springframework.http.converter.HttpMessageNotReadableException.class)
    ResponseEntity<ApiErrorResponse> handleUnreadable(HttpServletRequest request) {
        return build(HttpStatus.BAD_REQUEST, "Corpo da requisição inválido.", request.getRequestURI(), List.of());
    }

    @ExceptionHandler(org.springframework.dao.OptimisticLockingFailureException.class)
    ResponseEntity<ApiErrorResponse> handleConcurrentChange(HttpServletRequest request) {
        return build(HttpStatus.CONFLICT, "O registro foi alterado. Recarregue antes de salvar.", request.getRequestURI(), List.of());
    }

	@ExceptionHandler(RegraNegocioException.class)
	ResponseEntity<ApiErrorResponse> handleRegraNegocio(RegraNegocioException exception, HttpServletRequest request) {
		return build(exception.getStatus(), exception.getMessage(), request.getRequestURI(), List.of());
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ApiErrorResponse> handleIllegalArgument(IllegalArgumentException exception,
			HttpServletRequest request) {
		return build(HttpStatus.BAD_REQUEST, exception.getMessage(), request.getRequestURI(), List.of());
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<ApiErrorResponse> handleValidation(MethodArgumentNotValidException exception,
			HttpServletRequest request) {
		List<String> details = exception.getBindingResult().getFieldErrors().stream()
				.map(error -> error.getField() + ": " + error.getDefaultMessage())
				.toList();

		return build(HttpStatus.BAD_REQUEST, "Requisição inválida.", request.getRequestURI(), details);
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<ApiErrorResponse> handleException(Exception exception, HttpServletRequest request) {
		return build(HttpStatus.INTERNAL_SERVER_ERROR, "Erro interno do servidor.", request.getRequestURI(), List.of());
	}

	private ResponseEntity<ApiErrorResponse> build(HttpStatus status, String message, String path,
			List<String> details) {
		ApiErrorResponse body = new ApiErrorResponse(LocalDateTime.now(), status.value(), status.getReasonPhrase(),
				message, path, details);

		return ResponseEntity.status(status).body(body);
	}
}
