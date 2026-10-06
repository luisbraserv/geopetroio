package com.geopetro.usuario.adapter.out.persistence;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.VinculoCadastroPort;
import com.geopetro.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;

/**
 * Clientes com a sonda concedida impedem a exclusao dela — RN-063.
 *
 * <p>A concessao em {@code usuario_cliente_unidades} e o que define o que o CLIENTE enxerga
 * (RN-048). Apagar a sonda por baixo dela deixaria o vinculo pendurado; a FK ja recusava, mas com
 * {@code 500} generico.
 */
@Component
public class UsuarioVinculoAdapter implements VinculoCadastroPort {

	private final UsuarioJpaRepository repository;

	public UsuarioVinculoAdapter(UsuarioJpaRepository repository) {
		this.repository = repository;
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.UNIDADE_SONDA;
	}

	@Override
	public Optional<String> descreverVinculo(Long unidadeSondaId) {
		long total = repository.countClientesComUnidadeSonda(unidadeSondaId);
		if (total == 0) {
			return Optional.empty();
		}
		return Optional.of(total == 1
				? "1 cliente com acesso concedido"
				: total + " clientes com acesso concedido");
	}
}
