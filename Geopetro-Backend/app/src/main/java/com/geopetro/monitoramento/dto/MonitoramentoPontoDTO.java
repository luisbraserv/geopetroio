package com.geopetro.monitoramento.dto;

import java.time.Instant;

public record MonitoramentoPontoDTO(Instant dataHora, Double valor) {}
