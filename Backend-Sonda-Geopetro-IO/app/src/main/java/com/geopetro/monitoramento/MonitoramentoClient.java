package com.geopetro.monitoramento;

import com.geopetro.monitoramento.dto.MonitoramentoSerieDTO;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.time.Instant;
import java.util.Optional;

@Component
public class MonitoramentoClient {

    private static final Logger log = LoggerFactory.getLogger(MonitoramentoClient.class);

    private final WebClient webClient;

    public MonitoramentoClient(WebClient monitoramentoWebClient) {
        this.webClient = monitoramentoWebClient;
    }

    public Optional<MonitoramentoSerieDTO> consultarSerie(String idSondaUnidade, String dispositivoId,
                                                           Instant inicio, Instant fim) {
        try {
            MonitoramentoSerieDTO result = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/monitoramentos/sondas/{idSondaUnidade}/series")
                            .queryParam("dispositivoId", dispositivoId)
                            .queryParam("inicio", inicio.toString())
                            .queryParam("fim", fim.toString())
                            .build(idSondaUnidade))
                    .retrieve()
                    .bodyToMono(MonitoramentoSerieDTO.class)
                    .block();
            return Optional.ofNullable(result);
        } catch (WebClientResponseException e) {
            log.error("Erro HTTP ao consultar telemetria: {} {}", e.getStatusCode(), e.getMessage());
            return Optional.empty();
        } catch (Exception e) {
            log.error("Aplicacao Monitoramento indisponivel: {}", e.getMessage());
            return Optional.empty();
        }
    }
}
