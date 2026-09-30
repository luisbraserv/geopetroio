package com.geopetro.unidadesonda.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

/** Unidades/Sondas impedem a exclusao do Setor a que pertencem — RN-063. */
@Component
public class UnidadeSondaSetorVinculoAdapter implements VinculoCadastroPort {

	private final UnidadeSondaJpaRepository repository;

	public UnidadeSondaSetorVinculoAdapter(UnidadeSondaJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.SETOR;
	}

	@Override
	public Optional<String> descreverVinculo(Long setorId) {
		long total = repository.countBySetorId(setorId);
		if (total == 0) {
			return Optional.empty();
		}
		return Optional.of(total == 1 ? "1 unidade/sonda vinculada" : total + " unidades/sondas vinculadas");
	}
}
