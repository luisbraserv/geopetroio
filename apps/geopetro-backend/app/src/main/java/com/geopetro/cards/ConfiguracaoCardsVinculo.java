package com.geopetro.cards;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.vinculos.VinculoDaUnidade;

/** Cards configurados contam como uso da unidade — RN-116. */
@Component
public class ConfiguracaoCardsVinculo implements VinculoDaUnidade {

	private final ConfiguracaoCardsRepository repository;

	public ConfiguracaoCardsVinculo(ConfiguracaoCardsRepository repository) {
		this.repository = repository;
	}

	@Override
	public Optional<String> descrever(long unidadeId) {
		return repository.existsById(unidadeId) ? Optional.of("cards configurados") : Optional.empty();
	}
}
