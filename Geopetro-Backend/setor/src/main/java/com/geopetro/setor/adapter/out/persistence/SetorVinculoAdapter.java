package com.geopetro.setor.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.setor.adapter.out.persistence.repository.SetorJpaRepository;

/** Setores impedem a exclusao da Regional a que pertencem — RN-063. */
@Component
public class SetorVinculoAdapter implements VinculoCadastroPort {

	private final SetorJpaRepository repository;

	public SetorVinculoAdapter(SetorJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.REGIONAL;
	}

	@Override
	public Optional<String> descreverVinculo(Long regionalId) {
		long total = repository.countByRegionalId(regionalId);
		if (total == 0) {
			return Optional.empty();
		}
		return Optional.of(total == 1 ? "1 setor vinculado" : total + " setores vinculados");
	}
}
