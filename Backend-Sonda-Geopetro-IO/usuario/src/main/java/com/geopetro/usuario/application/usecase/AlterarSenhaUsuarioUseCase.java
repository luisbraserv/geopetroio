package com.geopetro.usuario.application.usecase;

import com.geopetro.usuario.application.command.AlterarSenhaCommand;
import com.geopetro.usuario.application.dto.UsuarioOutput;
import com.geopetro.usuario.application.port.out.PasswordEncoderPort;
import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;
import com.geopetro.usuario.domain.model.PoliticaSenha;

public class AlterarSenhaUsuarioUseCase {

	private final UsuarioRepositoryPort usuarioRepositoryPort;
	private final PasswordEncoderPort passwordEncoderPort;

	public AlterarSenhaUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort,
			PasswordEncoderPort passwordEncoderPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
		this.passwordEncoderPort = passwordEncoderPort;
	}

	public UsuarioOutput alterar(String username, AlterarSenhaCommand command) {
		if (command == null) {
			throw new UsuarioInvalidoException("Dados de senha sao obrigatorios.");
		}

		var usuario = usuarioRepositoryPort.buscarPorUsername(username)
				.orElseThrow(() -> new UsuarioInvalidoException("Usuario nao encontrado."));

		if (isBlank(command.senhaAtual()) || isBlank(command.novaSenha()) || isBlank(command.confirmacaoSenha())) {
			throw new UsuarioInvalidoException("Preencha todos os campos de senha.");
		}

		if (!passwordEncoderPort.matches(command.senhaAtual(), usuario.getPassword())) {
			throw new UsuarioInvalidoException("Senha atual invalida.");
		}

		if (command.novaSenha() == null || !command.novaSenha().equals(command.confirmacaoSenha())) {
			throw new UsuarioInvalidoException("Nova senha e confirmacao nao conferem.");
		}

		PoliticaSenha.validar(command.novaSenha());

		if (passwordEncoderPort.matches(command.novaSenha(), usuario.getPassword())) {
			throw new UsuarioInvalidoException("A nova senha deve ser diferente da senha atual.");
		}

		usuario.setPassword(passwordEncoderPort.encode(command.novaSenha()));
		return UsuarioOutput.de(usuarioRepositoryPort.salvar(usuario));
	}

	private boolean isBlank(String value) {
		return value == null || value.isBlank();
	}
}
