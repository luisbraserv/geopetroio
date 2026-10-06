package com.braserv.core.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.braserv.core.comum.port.EmpresaConsultaPort;
import com.braserv.core.comum.port.UnidadeConsultaPort;
import com.braserv.core.usuario.adapter.out.persistence.mapper.UsuarioPersistenceMapper;
import com.braserv.core.usuario.application.port.out.PasswordEncoderPort;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.application.usecase.AtivarUsuarioUseCase;
import com.braserv.core.usuario.application.usecase.AlterarSenhaUsuarioUseCase;
import com.braserv.core.usuario.application.usecase.AtualizarUsuarioUseCase;
import com.braserv.core.usuario.application.usecase.BuscarUsuarioUseCase;
import com.braserv.core.usuario.application.usecase.CriarUsuarioUseCase;
import com.braserv.core.usuario.application.usecase.DesativarUsuarioUseCase;

@Configuration
public class UsuarioBeanConfig {

	@Bean
	UsuarioPersistenceMapper usuarioPersistenceMapper() {
		return new UsuarioPersistenceMapper();
	}

	@Bean
	CriarUsuarioUseCase criarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort,
			PasswordEncoderPort passwordEncoderPort, EmpresaConsultaPort empresaConsultaPort,
			UnidadeConsultaPort unidadeConsultaPort) {
		return new CriarUsuarioUseCase(usuarioRepositoryPort, passwordEncoderPort, empresaConsultaPort,
				unidadeConsultaPort);
	}

	@Bean
	BuscarUsuarioUseCase buscarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort) {
		return new BuscarUsuarioUseCase(usuarioRepositoryPort);
	}

	@Bean
	AtivarUsuarioUseCase ativarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort) {
		return new AtivarUsuarioUseCase(usuarioRepositoryPort);
	}

	@Bean
	AtualizarUsuarioUseCase atualizarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort,
			EmpresaConsultaPort empresaConsultaPort, UnidadeConsultaPort unidadeConsultaPort) {
		return new AtualizarUsuarioUseCase(usuarioRepositoryPort, empresaConsultaPort, unidadeConsultaPort);
	}

	@Bean
	DesativarUsuarioUseCase desativarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort) {
		return new DesativarUsuarioUseCase(usuarioRepositoryPort);
	}

	@Bean
	AlterarSenhaUsuarioUseCase alterarSenhaUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort,
			PasswordEncoderPort passwordEncoderPort) {
		return new AlterarSenhaUsuarioUseCase(usuarioRepositoryPort, passwordEncoderPort);
	}
}
