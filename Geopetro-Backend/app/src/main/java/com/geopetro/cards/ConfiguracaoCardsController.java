package com.geopetro.cards;

import java.security.Principal;

import org.springframework.messaging.handler.annotation.DestinationVariable;
import org.springframework.messaging.simp.annotation.SubscribeMapping;
import org.springframework.web.bind.annotation.*;

/**
 * Documento de cards, em recurso proprio — RN-089.
 *
 * <p>Separado de {@code /api/sondas/{id}/configuracao}, que carrega os limites de alarme: as duas
 * coisas tem autoridades diferentes para gravar, e um documento so exigiria comparar campo a campo
 * para descobrir se quem salvou podia mexer no que mexeu.
 */
@RestController
public class ConfiguracaoCardsController {

    private final ConfiguracaoCardsService service;

    public ConfiguracaoCardsController(ConfiguracaoCardsService service) { this.service = service; }

    @GetMapping("/api/sondas/{id}/cards")
    public ConfiguracaoCards ler(@PathVariable long id, Principal principal) {
        return service.ler(principal.getName(), id);
    }

    @PutMapping("/api/sondas/{id}/cards")
    public ConfiguracaoCards salvar(@PathVariable long id,
            @RequestBody ConfiguracaoCards.Alteracao update, Principal principal) {
        return service.salvar(principal.getName(), id, update);
    }

    /** Snapshot entregue direto a quem assina, sem esperar a proxima alteracao. */
    @SubscribeMapping("/config/unidades-sondas/{id}/cards")
    public ConfiguracaoCards snapshot(@DestinationVariable long id, Principal principal) {
        return service.ler(principal == null ? null : principal.getName(), id);
    }
}
