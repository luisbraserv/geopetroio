package com.geopetro.unidadesonda.adapter.out.persistence;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.RegionalConsultaPort;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

@Component
public class UnidadeSondaRegionalConsultaAdapter implements RegionalConsultaPort {

	private final UnidadeSondaJpaRepository repository;

	public UnidadeSondaRegionalConsultaAdapter(UnidadeSondaJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public boolean existeVinculoParaRegional(Long regionalId) {
		return repository.existsBySetor_RegionalId(regionalId);
	}
}
