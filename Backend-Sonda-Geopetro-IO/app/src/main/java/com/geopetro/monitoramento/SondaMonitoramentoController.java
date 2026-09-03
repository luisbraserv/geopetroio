package com.geopetro.monitoramento;

import com.geopetro.monitoramento.dto.MonitoramentoSerieDTO;
import com.geopetro.monitoramento.dto.SondaDisponivelDTO;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.time.Instant;
import java.util.List;

@RestController
@RequestMapping("/api/sondas")
@Tag(name = "Monitoramento de Sondas", description = "Consulta de sondas autorizadas e séries de telemetria")
@SecurityRequirement(name = "bearerAuth")
public class SondaMonitoramentoController {

    private final SondaMonitoramentoService service;

    public SondaMonitoramentoController(SondaMonitoramentoService service) {
        this.service = service;
    }

    @GetMapping("/minhas")
    @Operation(
            summary = "Listar sondas do usuário logado",
            description = "Retorna apenas as sondas vinculadas ao setor/empresa do usuário autenticado.",
            responses = @ApiResponse(responseCode = "200", description = "Lista retornada")
    )
    public List<SondaDisponivelDTO> minhas(Authentication authentication) {
        return service.listarSondasDoUsuario(authentication.getName());
    }

    @GetMapping("/{idSondaUnidade}/monitoramentos/series")
    @Operation(
            summary = "Consultar série temporal de telemetria",
            description = """
                    Valida se o usuário tem acesso à sonda e consulta a série temporal na aplicação Monitoramento.
                    Retorna 403 se o usuário não tiver acesso.
                    """,
            responses = {
                    @ApiResponse(responseCode = "200", description = "Série retornada"),
                    @ApiResponse(responseCode = "403", description = "Acesso negado à sonda"),
                    @ApiResponse(responseCode = "502", description = "Aplicação Monitoramento indisponível")
            }
    )
    public ResponseEntity<MonitoramentoSerieDTO> consultarSerie(
            @Parameter(description = "ID da sonda/unidade; corresponde ao nome cadastrado da sonda", example = "UC-01")
            @PathVariable String idSondaUnidade,

            @Parameter(description = "ID do dispositivo", example = "PRESSAO-01")
            @RequestParam String dispositivoId,

            @Parameter(description = "Início (ISO-8601 UTC)", example = "2026-05-29T07:00:00Z")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant inicio,

            @Parameter(description = "Fim (ISO-8601 UTC)", example = "2026-05-29T08:00:00Z")
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant fim,

            Authentication authentication
    ) {
        return service.consultarSerie(authentication.getName(), idSondaUnidade, dispositivoId, inicio, fim)
                .map(ResponseEntity::ok)
                .orElseGet(() -> {
                    if (!service.usuarioPossuiAcessoASonda(authentication.getName(), idSondaUnidade)) {
                        return ResponseEntity.status(403).build();
                    }
                    return ResponseEntity.status(502).build();
                });
    }
}
