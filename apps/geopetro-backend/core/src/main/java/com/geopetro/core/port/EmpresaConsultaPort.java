package com.geopetro.core.port;

import java.util.Optional;

public interface EmpresaConsultaPort {

	Optional<EmpresaResumo> buscarPorId(Long id);

	record EmpresaResumo(Long id, String nome) {
	}
}
