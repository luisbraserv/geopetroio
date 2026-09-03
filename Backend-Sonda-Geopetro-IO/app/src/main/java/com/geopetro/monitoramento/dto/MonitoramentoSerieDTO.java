package com.geopetro.monitoramento.dto;

import java.util.List;

public record MonitoramentoSerieDTO(
        String idSondaUnidade,
        String dispositivoId,
        List<MonitoramentoPontoDTO> pontos
) {}
