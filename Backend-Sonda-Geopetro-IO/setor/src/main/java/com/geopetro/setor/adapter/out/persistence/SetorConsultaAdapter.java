package com.geopetro.setor.adapter.out.persistence;

import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.SetorConsultaPort;
import com.geopetro.setor.adapter.out.persistence.repository.SetorJpaRepository;

@Component
public class SetorConsultaAdapter implements SetorConsultaPort {

	private final SetorJpaRepository setorJpaRepository;

	public SetorConsultaAdapter(SetorJpaRepository setorJpaRepository) {
		this.setorJpaRepository = setorJpaRepository;
	}

	@Override
	public List<SetorResumo> buscarPorIds(Set<Long> ids) {
		return setorJpaRepository.findAllById(ids).stream()
				.map(s -> new SetorResumo(s.getId(), s.getNome(),
						s.getRegional() == null ? null : s.getRegional().getId(),
						s.getRegional() == null ? null : s.getRegional().getNome()))
				.toList();
	}
}
