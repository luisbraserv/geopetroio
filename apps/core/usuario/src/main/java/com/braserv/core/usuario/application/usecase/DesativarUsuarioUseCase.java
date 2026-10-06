package com.braserv.core.usuario.application.usecase;

import com.braserv.core.usuario.application.dto.UsuarioOutput;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;
import com.braserv.core.usuario.domain.model.Usuario;

public class DesativarUsuarioUseCase {

	private final UsuarioRepositoryPort usuarioRepositoryPort;

	public DesativarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
	}

	public UsuarioOutput desativar(String username) {
		Usuario usuario = usuarioRepositoryPort.buscarPorUsername(username)
				.orElseThrow(() -> new UsuarioInvalidoException("Usuario nao encontrado."));
		usuario.desativar();
		return UsuarioOutput.de(usuarioRepositoryPort.salvar(usuario));
	}
}
