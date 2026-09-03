package com.braservpetroleo.telemetria.geopetroio.adapter.in.web;

import java.time.Instant;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.influxdb.exceptions.InfluxException;

/**
 * Padroniza os erros da API.
 *
 * <p>O formato espelha o ApiErrorResponse do Backend-Sonda, para que os dois servicos falem a mesma
 * lingua de erro.
 */
@RestControllerAdvice
public class ApiExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(ApiExceptionHandler.class);

	/** Identificador fora do alfabeto aceito, intervalo invertido, etc. */
	@ExceptionHandler(IllegalArgumentException.class)
	public ResponseEntity<Map<String, Object>> tratarArgumentoInvalido(IllegalArgumentException e) {
		return montar(HttpStatus.BAD_REQUEST, e.getMessage());
	}

	/**
	 * Falha do InfluxDB vira 503, nao 500: o problema esta na dependencia, e o Backend-Sonda ja
	 * traduz indisponibilidade em 502 para o frontend.
	 */
	@ExceptionHandler(InfluxException.class)
	public ResponseEntity<Map<String, Object>> tratarFalhaInflux(InfluxException e) {
		log.error("Falha ao consultar o InfluxDB: {}", e.getMessage(), e);
		return montar(HttpStatus.SERVICE_UNAVAILABLE, "Banco de series temporais indisponivel.");
	}

	@ExceptionHandler(Exception.class)
	public ResponseEntity<Map<String, Object>> tratarErroInterno(Exception e) {
		// O Spring MVC ja classifica os proprios erros — rota inexistente (404), metodo nao
		// permitido (405), tipo de midia invalido (415) — implementando ErrorResponse. Sem esta
		// checagem, o catch-all transformaria todo 404 em 500, escondendo erro de cliente como
		// falha de servidor. Usar a interface cobre todos esses casos de uma vez.
		if (e instanceof ErrorResponse erro) {
			HttpStatus status = HttpStatus.valueOf(erro.getStatusCode().value());
			return montar(status, status.getReasonPhrase());
		}
		log.error("Erro interno: {}", e.getMessage(), e);
		return montar(HttpStatus.INTERNAL_SERVER_ERROR, "Erro interno do servidor.");
	}

	private ResponseEntity<Map<String, Object>> montar(HttpStatus status, String mensagem) {
		return ResponseEntity.status(status).body(Map.of(
				"timestamp", Instant.now().toString(),
				"status", status.value(),
				"error", status.getReasonPhrase(),
				"message", mensagem == null ? "" : mensagem));
	}
}
