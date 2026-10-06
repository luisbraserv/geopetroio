package com.geopetro.monitoramento;

import java.time.Instant;
import java.util.List;

import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.geopetro.monitoramento.dto.MonitoramentoSerieDTO;
import com.geopetro.monitoramento.dto.UnidadeDisponivelDTO;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;

@RestController
@RequestMapping("/api/monitoramento/unidades")
@Tag(name = "Monitoramento de Unidades", description = "Unidades que o usuario acompanha e series de telemetria")
@SecurityRequirement(name = "bearerAuth")
public class UnidadeMonitoramentoController {

    private final UnidadeMonitoramentoService service;

    public UnidadeMonitoramentoController(UnidadeMonitoramentoService service) {
        this.service = service;
    }

    @GetMapping("/minhas")
    @Operation(
            summary = "Listar unidades do usuario logado",
            description = "Unidades ativas que o usuario enxerga: a frota inteira para conta interna com monitoramento, so as concedidas para cliente.",
            responses = @ApiResponse(responseCode = "200", description = "Lista retornada")
    )
    public List<UnidadeDisponivelDTO> minhas(Authentication authentication) {
        return service.listarUnidadesDoUsuario(authentication.getName());
    }

    @GetMapping("/{id}/series")
    @Operation(
            summary = "Consultar serie temporal de telemetria",
            description = "Valida se o usuario enxerga a unidade e consulta a serie na Geopetro-Telemetria.",
            responses = {
                    @ApiResponse(responseCode = "200", description = "Serie retornada"),
                    @ApiResponse(responseCode = "403", description = "Usuario nao enxerga a unidade"),
                    @ApiResponse(responseCode = "502", description = "Telemetria indisponivel")
            }
    )
    public ResponseEntity<MonitoramentoSerieDTO> consultarSerie(
            @Parameter(description = "Id da unidade no Braserv-Core", example = "3")
            @PathVariable long id,
            @Parameter(description = "ID do card, gerado como <TIPO>_<NN>", example = "PRESSAO_01")
            @RequestParam String dispositivoId,
            @Parameter(description = """
                    Qual das series do dispositivo: stroke, vazao ou volumeAcumulado num card
                    CONTADOR_STROKE (RN-098). Omitir significa a serie unica do dispositivo — nao
                    "todas": um card de stroke consultado sem este parametro devolve vazio, em vez
                    das tres misturadas na mesma linha do tempo.
                    """, example = "vazao")
            @RequestParam(required = false) String serie,
            @Parameter(description = "Inicio (ISO-8601 UTC)", example = "2026-05-29T07:00:00Z")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant inicio,
            @Parameter(description = "Fim (ISO-8601 UTC)", example = "2026-05-29T08:00:00Z")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant fim,
            Authentication authentication
    ) {
        String username = authentication.getName();
        if (!service.usuarioPossuiAcessoAUnidade(username, id)) {
            return ResponseEntity.status(403).build();
        }
        return service.consultarSerie(username, id, dispositivoId, serie, inicio, fim)
                .map(ResponseEntity::ok)
                .orElseGet(() -> ResponseEntity.status(502).build());
    }
}
