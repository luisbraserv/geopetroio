package com.geopetro.unidadesonda.adapter.out.persistence;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.UnidadeSondaConsultaPort;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

@Component
public class UnidadeSondaConsultaAdapter implements UnidadeSondaConsultaPort {

	private final UnidadeSondaJpaRepository unidadeSondaJpaRepository;

	public UnidadeSondaConsultaAdapter(UnidadeSondaJpaRepository unidadeSondaJpaRepository) {
		this.unidadeSondaJpaRepository = unidadeSondaJpaRepository;
	}

	@Override
	public List<UnidadeSondaResumo> buscarPorIds(Set<Long> ids) {
		return unidadeSondaJpaRepository.findAllById(ids).stream()
				.map(u -> new UnidadeSondaResumo(u.getId(), u.getNome(), u.getApelido()))
				.toList();
	}
}
