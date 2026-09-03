package com.geopetro.regional.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.RegionalBuscaPort;
import com.geopetro.regional.adapter.out.persistence.repository.RegionalJpaRepository;

@Component
public class RegionalBuscaAdapter implements RegionalBuscaPort {

	private final RegionalJpaRepository repository;

	public RegionalBuscaAdapter(RegionalJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public Optional<RegionalResumo> buscarPorId(Long id) {
		return repository.findById(id)
				.map(r -> new RegionalResumo(r.getId(), r.getNome()));
	}
}
