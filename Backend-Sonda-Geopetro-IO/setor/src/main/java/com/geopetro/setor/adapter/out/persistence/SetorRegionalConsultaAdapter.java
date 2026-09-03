package com.geopetro.setor.adapter.out.persistence;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.RegionalConsultaPort;
import com.geopetro.setor.adapter.out.persistence.repository.SetorJpaRepository;

@Component
public class SetorRegionalConsultaAdapter implements RegionalConsultaPort {

	private final SetorJpaRepository repository;

	public SetorRegionalConsultaAdapter(SetorJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public boolean existeVinculoParaRegional(Long regionalId) {
		return repository.existsByRegionalId(regionalId);
	}
}
