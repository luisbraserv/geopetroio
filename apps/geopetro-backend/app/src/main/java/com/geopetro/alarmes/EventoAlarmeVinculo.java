package com.geopetro.alarmes;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.vinculos.VinculoDaUnidade;

/** O historico de alarmes conta como uso da unidade — RN-116. */
@Component
public class EventoAlarmeVinculo implements VinculoDaUnidade {

	private final EventoAlarmeRepository repository;

	public EventoAlarmeVinculo(EventoAlarmeRepository repository) {
		this.repository = repository;
	}

	@Override
	public Optional<String> descrever(long unidadeId) {
		return repository.existsByUnidadeId(unidadeId) ? Optional.of("historico de alarmes") : Optional.empty();
	}
}
