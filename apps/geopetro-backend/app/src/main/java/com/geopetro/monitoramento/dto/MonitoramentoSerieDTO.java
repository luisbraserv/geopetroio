package com.geopetro.monitoramento.dto;

import java.util.List;

public record MonitoramentoSerieDTO(
        String idSondaUnidade,
        String dispositivoId,
        /** Qual das series do dispositivo — RN-098. {@code null} para card de uma grandeza so. */
        String serie,
        List<MonitoramentoPontoDTO> pontos
) {}
