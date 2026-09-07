package com.geopetro.unidadesonda.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;

/**
 * Unidades/Sondas impedem a exclusao da Regional e do Setor a que pertencem — RN-063.
 *
 * <p>Duas portas em uma classe seriam impossiveis: cada bean responde por um {@link Cadastro}. Por
 * isso o vinculo com o Setor mora em {@link UnidadeSondaSetorVinculoAdapter}.
 */
@Component
public class UnidadeSondaVinculoAdapter implements VinculoCadastroPort {

	private final UnidadeSondaJpaRepository repository;

	public UnidadeSondaVinculoAdapter(UnidadeSondaJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.REGIONAL;
	}

	@Override
	public Optional<String> descreverVinculo(Long regionalId) {
		long total = repository.countBySetor_RegionalId(regionalId);
		if (total == 0) {
			return Optional.empty();
		}
		return Optional.of(total == 1 ? "1 unidade/sonda vinculada" : total + " unidades/sondas vinculadas");
	}
}
