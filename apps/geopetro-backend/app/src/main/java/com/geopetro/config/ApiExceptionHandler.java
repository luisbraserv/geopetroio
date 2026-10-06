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

    @ExceptionHandler({org.springframework.web.servlet.NoHandlerFoundException.class,
        org.springframework.web.servlet.resource.NoResourceFoundException.class})
    ResponseEntity<ApiErrorResponse> handleNotFound(HttpServletRequest request) {
        return build(HttpStatus.NOT_FOUND, "Recurso não encontrado.", request.getRequestURI(), List.of());
    }

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

	/**
	 * Parâmetro obrigatório que não veio — 400, e não 500.
	 *
	 * <p>Sem este handler, {@code GET /api/sondas/1/alarmes/historico} sem {@code inicio} caía no
	 * {@code Exception} genérico abaixo e respondia "Erro interno do servidor": o cliente não tinha
	 * como distinguir uma chamada malfeita — que ele corrige — de um servidor com problema, que ele
	 * só pode reportar.
	 */
	@ExceptionHandler(org.springframework.web.bind.MissingServletRequestParameterException.class)
	ResponseEntity<ApiErrorResponse> handleParametroAusente(
			org.springframework.web.bind.MissingServletRequestParameterException exception,
			HttpServletRequest request) {
		return build(HttpStatus.BAD_REQUEST, "Parâmetro obrigatório ausente.", request.getRequestURI(),
				List.of(exception.getParameterName() + ": obrigatório"));
	}

	/**
	 * Parâmetro presente e ilegível — {@code inicio=invalid} num campo de data, por exemplo.
	 *
	 * <p>A conversão falha antes de o controller rodar, então nenhuma validação de negócio a alcança.
	 * ⚠️ A resposta nomeia o parâmetro e <b>não</b> devolve a mensagem da exceção: ela carrega o nome
	 * da classe alvo e o valor recebido, detalhe interno que não ajuda quem chamou.
	 */
	@ExceptionHandler(org.springframework.web.method.annotation.MethodArgumentTypeMismatchException.class)
	ResponseEntity<ApiErrorResponse> handleParametroIlegivel(
			org.springframework.web.method.annotation.MethodArgumentTypeMismatchException exception,
			HttpServletRequest request) {
		return build(HttpStatus.BAD_REQUEST, "Parâmetro inválido.", request.getRequestURI(),
				List.of(exception.getName() + ": valor inválido"));
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
