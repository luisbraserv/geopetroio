package com.geopetro.core.port;

import java.util.List;
import java.util.Set;

public interface SetorConsultaPort {

	List<SetorResumo> buscarPorIds(Set<Long> ids);

	record SetorResumo(Long id, String nome, Long regionalId, String regionalNome) {
	}
}
