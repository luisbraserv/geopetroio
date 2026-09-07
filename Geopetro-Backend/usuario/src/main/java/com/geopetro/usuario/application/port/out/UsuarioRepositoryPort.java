package com.geopetro.usuario.application.port.out;

import java.util.Optional;

import com.geopetro.usuario.application.dto.PaginaOutput;
import com.geopetro.usuario.domain.model.StatusUsuario;
import com.geopetro.usuario.domain.model.Usuario;

public interface UsuarioRepositoryPort {

	Usuario salvar(Usuario usuario);

	Optional<Usuario> buscarPorUsername(String username);

	Optional<Usuario> buscarPorEmail(String email);

	boolean existePorUsername(String username);

	/** Consulta so o status, sem materializar o usuario inteiro — RN-062. */
	Optional<StatusUsuario> buscarStatusPorUsername(String username);

	PaginaOutput<Usuario> listar(int pagina, int tamanho, String busca);
}
