package com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto;

import java.util.List;

/**
 * Serie temporal de um dispositivo numa sonda.
 *
 * <p>Espelha {@code com.geopetro.monitoramento.dto.MonitoramentoSerieDTO} no Geopetro-Backend.
 * Ver specs/contracts/rest-monitoramento.md.
 */
public record MonitoramentoSerieDTO(
		String idSondaUnidade,
		String dispositivoId,
		List<MonitoramentoPontoDTO> pontos) {
}
