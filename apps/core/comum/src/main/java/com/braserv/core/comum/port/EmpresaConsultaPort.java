package com.braserv.core.comum.port;

import java.util.Optional;

public interface EmpresaConsultaPort {

	Optional<EmpresaResumo> buscarPorId(Long id);

	record EmpresaResumo(Long id, String nome) {
	}
}
