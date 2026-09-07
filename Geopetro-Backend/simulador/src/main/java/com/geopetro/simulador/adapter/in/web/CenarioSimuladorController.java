package com.geopetro.simulador.adapter.in.web;

import com.geopetro.simulador.adapter.in.web.request.CenarioRequest;
import com.geopetro.simulador.adapter.in.web.response.CenarioResponse;
import com.geopetro.simulador.application.service.CenarioSimuladorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/simulador/cenarios")
@Tag(name = "Simulador — Cenários")
@SecurityRequirement(name = "bearerAuth")
public class CenarioSimuladorController {

    private final CenarioSimuladorService service;

    public CenarioSimuladorController(CenarioSimuladorService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "Listar cenários (opcionalmente filtrado por pasta)")
    public List<CenarioResponse> listar(
            @RequestParam String operacao,
            @RequestParam(required = false) Long pastaId) {
        return service.listar(operacao, pastaId).stream().map(CenarioResponse::de).toList();
    }

    @GetMapping("/sem-pasta")
    @Operation(summary = "Listar cenários sem pasta")
    public List<CenarioResponse> listarSemPasta(@RequestParam String operacao) {
        return service.listarSemPasta(operacao).stream().map(CenarioResponse::de).toList();
    }

    @GetMapping("/{id}")
    @Operation(summary = "Buscar cenário por id")
    public CenarioResponse buscar(@PathVariable Long id) {
        return CenarioResponse.de(service.buscar(id));
    }

    @PostMapping
    @Operation(summary = "Criar cenário")
    public CenarioResponse criar(@RequestBody @Valid CenarioRequest request, Authentication authentication) {
        return CenarioResponse.de(service.criar(request, authentication.getName()));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Atualizar cenário")
    public CenarioResponse atualizar(@PathVariable Long id, @RequestBody @Valid CenarioRequest request) {
        return CenarioResponse.de(service.atualizar(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Excluir cenário")
    public ResponseEntity<Void> excluir(@PathVariable Long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
