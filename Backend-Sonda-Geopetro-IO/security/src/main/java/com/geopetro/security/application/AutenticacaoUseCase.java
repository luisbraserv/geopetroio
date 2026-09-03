package com.geopetro.security.application;

import org.springframework.stereotype.Service;

import com.geopetro.security.adapter.in.web.request.AutenticacaoRequest;
import com.geopetro.security.adapter.in.web.response.AutenticacaoResponse;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.security.domain.AutenticacaoInvalidaException;
import com.geopetro.usuario.application.port.out.PasswordEncoderPort;
import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.domain.model.Usuario;
import com.geopetro.usuario.domain.model.UsuarioInterno;

@Service
public class AutenticacaoUseCase {

	private final UsuarioRepositoryPort usuarioRepositoryPort;
	private final PasswordEncoderPort passwordEncoderPort;
	private final TokenPort tokenPort;

	public AutenticacaoUseCase(UsuarioRepositoryPort usuarioRepositoryPort, PasswordEncoderPort passwordEncoderPort,
			TokenPort tokenPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
		this.passwordEncoderPort = passwordEncoderPort;
		this.tokenPort = tokenPort;
	}

	public AutenticacaoResponse autenticar(AutenticacaoRequest request) {
		String identificador = request.username();
		Usuario usuario = (identificador.contains("@")
				? usuarioRepositoryPort.buscarPorEmail(identificador)
				: usuarioRepositoryPort.buscarPorUsername(identificador))
				.orElseThrow(AutenticacaoInvalidaException::new);

		if (!passwordEncoderPort.matches(request.password(), usuario.getPassword())) {
			throw new AutenticacaoInvalidaException();
		}

		String endereco = usuario.getEndereco() == null ? null : usuario.getEndereco().formatado();
		Long regionalId = usuario instanceof UsuarioInterno interno ? interno.getRegionalId() : null;
		String regionalNome = usuario instanceof UsuarioInterno interno ? interno.getRegionalNome() : null;

		return new AutenticacaoResponse(tokenPort.gerar(usuario), usuario.getUsername(), usuario.getNome(),
				usuario.getEmail().formatado(), endereco, usuario.getTelefone().formatado(), usuario.getRoles(),
				regionalId, regionalNome);
	}
}
