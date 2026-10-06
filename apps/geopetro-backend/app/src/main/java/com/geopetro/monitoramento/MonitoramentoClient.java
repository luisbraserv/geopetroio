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

    /**
     * @param serie qual das series do dispositivo; {@code null} significa a serie unica.
     *              ⚠️ Um card de stroke grava tres sob o mesmo {@code dispositivoId} (RN-098), e
     *              omitir o filtro devolve vazio em vez das tres misturadas — ver o contrato em
     *              specs/SDD/software/apis/rest-monitoramento.md
     */
    public Optional<MonitoramentoSerieDTO> consultarSerie(String idUnidade, String dispositivoId,
                                                           String serie, Instant inicio, Instant fim) {
        try {
            MonitoramentoSerieDTO result = webClient.get()
                    .uri(uriBuilder -> {
                        uriBuilder
                                .path("/api/monitoramentos/unidades/{idUnidade}/series")
                                .queryParam("dispositivoId", dispositivoId)
                                .queryParam("inicio", inicio.toString())
                                .queryParam("fim", fim.toString());
                        // Ausente e diferente de vazio: a Telemetria trata a ausencia como "a serie
                        // unica", e uma string vazia filtraria por uma serie que ninguem gravou.
                        if (serie != null && !serie.isBlank()) {
                            uriBuilder.queryParam("serie", serie);
                        }
                        return uriBuilder.build(idUnidade);
                    })
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
     * Pergunta se a unidade possui serie gravada — RN-072.
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
    public Optional<ExistenciaSerieDTO> consultarExistencia(String idUnidade) {
        try {
            ExistenciaSerieDTO resultado = webClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .path("/api/monitoramentos/unidades/{idUnidade}/existe")
                            .build(idUnidade))
                    .retrieve()
                    .bodyToMono(ExistenciaSerieDTO.class)
                    .block();
            return Optional.ofNullable(resultado);
        } catch (WebClientResponseException e) {
            log.error("Erro HTTP ao verificar historico da unidade {}: {} {}",
                    idUnidade, e.getStatusCode(), e.getMessage());
            return Optional.empty();
        } catch (Exception e) {
            log.error("Aplicacao Monitoramento indisponivel ao verificar historico da unidade {}: {}",
                    idUnidade, e.getMessage());
            return Optional.empty();
        }
    }
}
