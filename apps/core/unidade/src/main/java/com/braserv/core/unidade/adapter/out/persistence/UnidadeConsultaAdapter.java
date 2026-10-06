package com.braserv.core.unidade.adapter.out.persistence;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.braserv.core.comum.port.UnidadeConsultaPort;
import com.braserv.core.unidade.repository.UnidadeJpaRepository;

@Component
public class UnidadeConsultaAdapter implements UnidadeConsultaPort {

	private final UnidadeJpaRepository unidadeJpaRepository;

	public UnidadeConsultaAdapter(UnidadeJpaRepository unidadeJpaRepository) {
		this.unidadeJpaRepository = unidadeJpaRepository;
	}

	@Override
	public List<UnidadeResumo> buscarPorIds(Set<Long> ids) {
		return unidadeJpaRepository.findAllById(ids).stream()
				.map(u -> new UnidadeResumo(u.getId(), u.getNome(), u.getApelido(), u.ativa()))
				.toList();
	}
}
