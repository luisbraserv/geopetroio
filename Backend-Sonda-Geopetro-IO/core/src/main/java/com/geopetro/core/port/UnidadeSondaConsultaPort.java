package com.geopetro.core.port;

import java.util.List;
import java.util.Set;

/**
 * Consulta de Unidades/Sondas por outros modulos.
 *
 * <p>Existe para que o modulo {@code usuario} possa validar as unidades vinculadas a um
 * {@code UsuarioCliente} sem inverter o grafo de dependencias — o adapter vive em
 * {@code unidade-sonda}, que ja depende de {@code core}.
 */
public interface UnidadeSondaConsultaPort {

	List<UnidadeSondaResumo> buscarPorIds(Set<Long> ids);

	record UnidadeSondaResumo(Long id, String nome, String apelido) {
	}
}
