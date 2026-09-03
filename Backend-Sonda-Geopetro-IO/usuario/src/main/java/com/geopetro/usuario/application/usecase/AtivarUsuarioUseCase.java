package com.geopetro.usuario.application.usecase;

import com.geopetro.usuario.application.dto.UsuarioOutput;
import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;
import com.geopetro.usuario.domain.model.Usuario;

public class AtivarUsuarioUseCase {

	private final UsuarioRepositoryPort usuarioRepositoryPort;

	public AtivarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
	}

	public UsuarioOutput ativar(String username) {
		Usuario usuario = usuarioRepositoryPort.buscarPorUsername(username)
				.orElseThrow(() -> new UsuarioInvalidoException("Usuario nao encontrado."));
		usuario.ativar();
		return UsuarioOutput.de(usuarioRepositoryPort.salvar(usuario));
	}
}
