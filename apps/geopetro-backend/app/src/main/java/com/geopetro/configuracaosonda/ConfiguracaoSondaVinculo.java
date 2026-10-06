package com.geopetro.configuracaosonda;
import com.geopetro.core.port.VinculoCadastroPort;
import java.util.Optional;
import org.springframework.stereotype.Component;
@Component
public class ConfiguracaoSondaVinculo implements VinculoCadastroPort {
    private final ConfiguracaoSondaRepository repository;
    public ConfiguracaoSondaVinculo(ConfiguracaoSondaRepository repository) { this.repository = repository; }
    @Override public Cadastro cadastro() { return Cadastro.UNIDADE_SONDA; }
    @Override public Optional<String> descreverVinculo(Long id) {
        return repository.existsById(id) ? Optional.of("configuracao remota vinculada a unidade") : Optional.empty();
    }
}
