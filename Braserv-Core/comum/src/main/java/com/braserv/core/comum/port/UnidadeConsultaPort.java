package com.braserv.core.comum.port;

import java.util.List;
import java.util.Set;

/**
 * Consulta de Unidades por outros modulos.
 *
 * <p>Existe para que o modulo {@code usuario} possa validar as unidades vinculadas a um
 * {@code UsuarioCliente} sem inverter o grafo de dependencias — o adapter vive em
 * {@code unidade}, que ja depende de {@code comum}.
 */
public interface UnidadeConsultaPort {

	List<UnidadeResumo> buscarPorIds(Set<Long> ids);

	record UnidadeResumo(Long id, String nome, String apelido) {
	}
}
