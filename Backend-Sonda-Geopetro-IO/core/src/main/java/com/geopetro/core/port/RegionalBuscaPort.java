package com.geopetro.core.port;

import java.util.Optional;

public interface RegionalBuscaPort {

	Optional<RegionalResumo> buscarPorId(Long id);

	record RegionalResumo(Long id, String nome) {
	}
}
