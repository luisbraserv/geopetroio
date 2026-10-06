package com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto;

import java.util.List;

/**
 * Serie temporal de um dispositivo numa sonda.
 *
 * <p>Espelha {@code com.geopetro.monitoramento.dto.MonitoramentoSerieDTO} no Geopetro-Backend.
 * Ver specs/SDD/software/apis/rest-monitoramento.md.
 */
public record MonitoramentoSerieDTO(
		String idSondaUnidade,
		String dispositivoId,
		/** Qual das series do dispositivo — RN-098. {@code null} para card de uma grandeza so. */
		String serie,
		List<MonitoramentoPontoDTO> pontos) {
}
