package com.geopetro.usuario.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;

/** Usuarios cliente impedem a exclusao da Empresa a que pertencem — RN-063. */
@Component
public class UsuarioEmpresaVinculoAdapter implements VinculoCadastroPort {

	private final UsuarioJpaRepository repository;

	public UsuarioEmpresaVinculoAdapter(UsuarioJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.EMPRESA;
	}

	@Override
	public Optional<String> descreverVinculo(Long empresaId) {
		long total = repository.countByEmpresaId(empresaId);
		if (total == 0) {
			return Optional.empty();
		}
		return Optional.of(total == 1 ? "1 usuario vinculado" : total + " usuarios vinculados");
	}
}
