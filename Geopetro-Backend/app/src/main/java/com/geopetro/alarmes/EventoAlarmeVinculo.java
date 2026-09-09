package com.geopetro.alarmes;

import java.util.Optional;

import org.springframework.stereotype.Component;

import com.geopetro.core.port.VinculoCadastroPort;

/**
 * Histórico de alarmes impede a exclusão da unidade — RN-063.
 *
 * <p>Sem esta porta a exclusão quebraria em violação de FK, devolvendo {@code 500} genérico. Com
 * ela, quem tenta excluir lê <b>o que</b> impede.
 */
@Component
public class EventoAlarmeVinculo implements VinculoCadastroPort {

	private final EventoAlarmeRepository repository;

	public EventoAlarmeVinculo(EventoAlarmeRepository repository) {
		this.repository = repository;
	}

	@Override
	public Cadastro cadastro() {
		return Cadastro.UNIDADE_SONDA;
	}

	@Override
	public Optional<String> descreverVinculo(Long id) {
		return repository.existsByUnidadeSondaId(id) ? Optional.of("historico de alarmes") : Optional.empty();
	}
}
