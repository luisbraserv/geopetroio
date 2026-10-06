package com.braserv.core.unidade.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.braserv.core.comum.port.VinculoCadastroPort;
import com.braserv.core.unidade.repository.UnidadeJpaRepository;

/** Unidades impedem a exclusao do Setor a que pertencem — RN-063. */
@Component
public class UnidadeSetorVinculoAdapter implements VinculoCadastroPort {

	private final UnidadeJpaRepository repository;

	public UnidadeSetorVinculoAdapter(UnidadeJpaRepository repository) {
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
		return Optional.of(total == 1 ? "1 unidade vinculada" : total + " unidades vinculadas");
	}
}
