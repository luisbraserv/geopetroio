package com.geopetro.configuracaosonda;
import java.security.Principal;
import org.springframework.web.bind.annotation.*;

/**
 * Os limites de alarme, por REST — RN-069.
 *
 * <p>⚠️ <b>Sem canal STOMP, e não por esquecimento.</b> Este documento tinha um tópico
 * ({@code /topic/config/unidades-sondas/{id}}) e um snapshot por {@code @SubscribeMapping}, ambos
 * criados para o Geopetro-Desktop, que avaliava os limites localmente. Em 2026-09-09 o alarme da
 * estação passou a ser configurado <b>na estação</b>
 * ({@code specs/features/configuracao-da-estacao.md §3.3}) e a assinatura saiu de lá; o Front nunca
 * assinou — lê e grava por aqui. Sem assinante, o canal virou código morto e foi removido.
 *
 * <p>O documento <b>continua vivo</b>: {@code MotorDeAlarmes} o lê a cada ciclo de tempo real, e é
 * ele quem alarma no servidor (RN-102).
 */
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
}
