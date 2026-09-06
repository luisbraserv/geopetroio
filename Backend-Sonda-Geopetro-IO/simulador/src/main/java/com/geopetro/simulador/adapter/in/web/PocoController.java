package com.geopetro.simulador.adapter.in.web;

import com.geopetro.simulador.adapter.in.web.request.PocoRequest;
import com.geopetro.simulador.adapter.in.web.response.PocoResponse;
import com.geopetro.simulador.application.service.PocoService;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.*;
import java.util.List;

@RestController
@RequestMapping("/api/simulador/pocos")
public class PocoController {
    private final PocoService service;
    public PocoController(PocoService service) { this.service = service; }
    @GetMapping public List<PocoResponse> listar() {
        return service.listar().stream().map(PocoResponse::de).toList();
    }
    @GetMapping("/{id}") public PocoResponse buscar(@PathVariable Long id) { return PocoResponse.de(service.buscar(id)); }
    @PostMapping public ResponseEntity<PocoResponse> criar(@Valid @RequestBody PocoRequest request, Authentication auth) {
        PocoResponse result = PocoResponse.de(service.criar(request, auth.getName()));
        return ResponseEntity.created(java.net.URI.create("/api/simulador/pocos/" + result.id())).body(result);
    }
    @PutMapping("/{id}") public PocoResponse atualizar(@PathVariable Long id,
            @Valid @RequestBody PocoRequest request, Authentication auth) {
        return PocoResponse.de(service.atualizar(id, request, auth.getName()));
    }
    @DeleteMapping("/{id}") public ResponseEntity<Void> excluir(@PathVariable Long id) {
        service.excluir(id);
        return ResponseEntity.noContent().build();
    }
}
