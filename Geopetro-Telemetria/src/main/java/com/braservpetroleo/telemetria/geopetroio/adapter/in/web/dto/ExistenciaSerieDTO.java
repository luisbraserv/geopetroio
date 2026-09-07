package com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto;

import java.time.Instant;

/**
 * Resposta de "esta sonda tem historico?" — RN-072.
 *
 * <p>As datas vao junto de proposito: permitem ao Geopetro-Backend recusar a exclusao dizendo
 * <i>"ha telemetria de 01/03/2026 a 05/09/2026"</i>, em vez de um "existe vinculo" que nao diz o
 * que. Sao nulas quando {@code possuiSerie} e falso.
 *
 * <p>Espelha {@code com.geopetro.monitoramento.dto.ExistenciaSerieDTO} no Geopetro-Backend.
 * Ver specs/contracts/rest-monitoramento.md §7.
 */
public record ExistenciaSerieDTO(
		String idSondaUnidade,
		boolean possuiSerie,
		Instant primeiroPonto,
		Instant ultimoPonto) {

	public static ExistenciaSerieDTO vazia(String idSondaUnidade) {
		return new ExistenciaSerieDTO(idSondaUnidade, false, null, null);
	}
}
