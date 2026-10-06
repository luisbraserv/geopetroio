package com.braserv.core.empresa.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.braserv.core.comum.port.EmpresaConsultaPort;
import com.braserv.core.empresa.adapter.out.persistence.repository.EmpresaJpaRepository;

@Component
public class EmpresaConsultaAdapter implements EmpresaConsultaPort {

	private final EmpresaJpaRepository empresaJpaRepository;

	public EmpresaConsultaAdapter(EmpresaJpaRepository empresaJpaRepository) {
		this.empresaJpaRepository = empresaJpaRepository;
	}

	@Override
	public Optional<EmpresaResumo> buscarPorId(Long id) {
		return empresaJpaRepository.findById(id)
				.map(e -> new EmpresaResumo(e.getId(), e.getNome()));
	}
}
