package com.geopetro.monitoramento.dto;

import java.time.Instant;

/**
 * Resposta de "esta sonda tem historico?" — RN-072.
 *
 * <p>Espelha {@code ...telemetria.geopetroio.adapter.in.web.dto.ExistenciaSerieDTO} no
 * Backend-Telemetria. Ver specs/contracts/rest-monitoramento.md §7.
 *
 * <p>As datas sao nulas quando {@code possuiSerie} e falso.
 */
public record ExistenciaSerieDTO(
		String idSondaUnidade,
		boolean possuiSerie,
		Instant primeiroPonto,
		Instant ultimoPonto) {
}
