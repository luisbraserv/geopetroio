package com.geopetro.configuracaosonda;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.vinculos.VinculoDaUnidade;

/** Limites de alarme configurados contam como uso da unidade — RN-116. */
@Component
public class ConfiguracaoSondaVinculo implements VinculoDaUnidade {

	private final ConfiguracaoSondaRepository repository;

	public ConfiguracaoSondaVinculo(ConfiguracaoSondaRepository repository) {
		this.repository = repository;
	}

	@Override
	public Optional<String> descrever(long unidadeId) {
		return repository.existsById(unidadeId) ? Optional.of("limites de alarme configurados") : Optional.empty();
	}
}
