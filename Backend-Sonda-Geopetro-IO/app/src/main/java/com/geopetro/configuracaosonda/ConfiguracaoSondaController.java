package com.geopetro.configuracaosonda;
import java.security.Principal;
import org.springframework.web.bind.annotation.*;
import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.simp.annotation.SubscribeMapping;

@RestController
public class ConfiguracaoSondaController {
    private final ConfiguracaoSondaService service;
    public ConfiguracaoSondaController(ConfiguracaoSondaService service) { this.service = service; }
    @GetMapping("/api/sondas/{id}/configuracao")
    public ConfiguracaoSonda ler(@PathVariable long id, Principal principal) { return service.ler(principal.getName(), id); }
    @PutMapping("/api/sondas/{id}/configuracao")
    public ConfiguracaoSonda salvar(@PathVariable long id, @RequestBody ConfiguracaoSonda.Alteracao update, Principal principal) {
        return service.salvar(principal.getName(), id, update);
    }
    @SubscribeMapping("/config/unidades-sondas/{id}")
    public ConfiguracaoSonda snapshot(@DestinationVariable long id, Principal principal) {
        return service.ler(principal == null ? null : principal.getName(), id);
    }
}
