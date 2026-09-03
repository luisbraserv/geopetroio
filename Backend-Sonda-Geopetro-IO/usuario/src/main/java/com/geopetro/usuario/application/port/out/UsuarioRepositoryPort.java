package com.geopetro.usuario.application.port.out;

import java.util.Optional;

import com.geopetro.usuario.application.dto.PaginaOutput;
import com.geopetro.usuario.domain.model.Usuario;

public interface UsuarioRepositoryPort {

	Usuario salvar(Usuario usuario);

	Optional<Usuario> buscarPorUsername(String username);

	Optional<Usuario> buscarPorEmail(String email);

	boolean existePorUsername(String username);

	PaginaOutput<Usuario> listar(int pagina, int tamanho, String busca);
}
