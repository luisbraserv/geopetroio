package com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto;

import java.time.Instant;

/**
 * Um ponto da serie.
 *
 * <p>O formato espelha exatamente o record de mesmo nome no Backend-Sonda
 * ({@code com.geopetro.monitoramento.dto.MonitoramentoPontoDTO}), que e quem desserializa esta
 * resposta. Alterar nomes de campo ou tipos quebra a tela de monitoramento.
 *
 * <p>{@code dataHora} e um instante em UTC — o cliente ja trabalha com {@link Instant}.
 */
public record MonitoramentoPontoDTO(Instant dataHora, Double valor) {
}
