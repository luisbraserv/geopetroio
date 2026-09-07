package com.geopetro.monitoramento;

import com.geopetro.monitoramento.dto.ExistenciaSerieDTO;
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

    /**
     * Pergunta se a sonda possui serie gravada — RN-072.
     *
     * <p><b>O vazio aqui significa outra coisa que em {@link #consultarSerie}.</b> La, falhar
     * devolvendo vazio custa uma tela sem grafico, e a degradacao graciosa e desejavel. Aqui a
     * resposta decide se um cadastro e apagado: {@code Optional.empty()} quer dizer
     * <b>"nao consegui perguntar"</b>, nunca "nao tem historico". Quem chama precisa recusar a
     * exclusao nesse caso — assumir que nao ha historico porque ninguem respondeu apaga um cadastro
     * que nao podia ser apagado, e so um dos dois erros tem volta.
     *
     * @return a resposta da Telemetria, ou vazio quando o servico nao pode ser consultado
     */
    public Optional<ExistenciaSerieDTO> consultarExistencia(String idSondaUnidade) {
        try {
            ExistenciaSerieDTO resultado = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/monitoramentos/sondas/{idSondaUnidade}/existe")
                            .build(idSondaUnidade))
                    .retrieve()
                    .bodyToMono(ExistenciaSerieDTO.class)
                    .block();
            return Optional.ofNullable(resultado);
        } catch (WebClientResponseException e) {
            log.error("Erro HTTP ao verificar historico da sonda {}: {} {}",
                    idSondaUnidade, e.getStatusCode(), e.getMessage());
            return Optional.empty();
        } catch (Exception e) {
            log.error("Aplicacao Monitoramento indisponivel ao verificar historico da sonda {}: {}",
                    idSondaUnidade, e.getMessage());
            return Optional.empty();
        }
    }
}
