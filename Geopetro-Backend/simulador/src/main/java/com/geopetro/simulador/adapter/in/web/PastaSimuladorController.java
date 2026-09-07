package com.geopetro.simulador.adapter.in.web;

import com.geopetro.simulador.adapter.in.web.request.PastaRequest;
import com.geopetro.simulador.adapter.in.web.response.PastaResponse;
import com.geopetro.simulador.application.service.PastaSimuladorService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.security.SecurityRequirement;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/simulador/pastas")
@Tag(name = "Simulador — Pastas")
@SecurityRequirement(name = "bearerAuth")
public class PastaSimuladorController {

    private final PastaSimuladorService service;

    public PastaSimuladorController(PastaSimuladorService service) {
        this.service = service;
    }

    @GetMapping
    @Operation(summary = "Listar pastas por operação")
    public List<PastaResponse> listar(@RequestParam String operacao) {
        return service.listar(operacao).stream().map(PastaResponse::de).toList();
    }

    @PostMapping
    @Operation(summary = "Criar pasta")
    public PastaResponse criar(@RequestBody @Valid PastaRequest request, Authentication authentication) {
        return PastaResponse.de(service.criar(request, authentication.getName()));
    }

    @PutMapping("/{id}")
    @Operation(summary = "Renomear pasta")
    public PastaResponse renomear(@PathVariable Long id, @RequestBody @Valid PastaRequest request) {
        return PastaResponse.de(service.renomear(id, request));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Excluir pasta (remove cenários dentro)")
    public ResponseEntity<Void> excluir(@PathVariable Long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
