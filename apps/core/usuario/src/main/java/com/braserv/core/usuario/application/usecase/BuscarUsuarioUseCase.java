package com.braserv.core.usuario.application.usecase;

import java.util.Optional;

import com.braserv.core.usuario.application.dto.PaginaOutput;
import com.braserv.core.usuario.application.dto.UsuarioOutput;
import com.braserv.core.usuario.application.port.in.BuscarUsuarioInputPort;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;
import com.braserv.core.usuario.domain.model.Usuario;

public class BuscarUsuarioUseCase implements BuscarUsuarioInputPort {

	private final UsuarioRepositoryPort usuarioRepositoryPort;

	public BuscarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
	}

	@Override
	public Optional<UsuarioOutput> buscarPorUsername(String username) {
		return usuarioRepositoryPort.buscarPorUsername(username).map(UsuarioOutput::de);
	}

	@Override
	public PaginaOutput<UsuarioOutput> listar(int pagina, int tamanho, String busca) {
		if (pagina < 0) {
			throw new UsuarioInvalidoException("Pagina nao pode ser negativa.");
		}

		if (tamanho <= 0) {
			throw new UsuarioInvalidoException("Tamanho da pagina deve ser maior que zero.");
		}

		PaginaOutput<Usuario> usuarios = usuarioRepositoryPort.listar(pagina, tamanho, busca);

		return new PaginaOutput<>(usuarios.conteudo().stream().map(UsuarioOutput::de).toList(), usuarios.pagina(),
				usuarios.tamanho(), usuarios.totalElementos(), usuarios.totalPaginas(), usuarios.primeira(),
				usuarios.ultima());
	}
}
