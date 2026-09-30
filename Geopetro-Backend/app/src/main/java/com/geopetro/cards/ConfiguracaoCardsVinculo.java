package com.geopetro.cards;

import com.geopetro.core.port.VinculoCadastroPort;
import java.util.Optional;
import org.springframework.stereotype.Component;

/** Cards configurados impedem a exclusao da unidade — RN-063. */
@Component
public class ConfiguracaoCardsVinculo implements VinculoCadastroPort {
    private final ConfiguracaoCardsRepository repository;
    public ConfiguracaoCardsVinculo(ConfiguracaoCardsRepository repository) { this.repository = repository; }
    @Override public Cadastro cadastro() { return Cadastro.UNIDADE_SONDA; }
    @Override public Optional<String> descreverVinculo(Long id) {
        return repository.existsById(id) ? Optional.of("cards configurados") : Optional.empty();
    }
}
