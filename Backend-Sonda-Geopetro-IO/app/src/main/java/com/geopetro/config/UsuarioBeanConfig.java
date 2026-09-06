package com.geopetro.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.geopetro.core.port.EmpresaConsultaPort;
import com.geopetro.core.port.UnidadeSondaConsultaPort;
import com.geopetro.usuario.adapter.out.persistence.mapper.UsuarioPersistenceMapper;
import com.geopetro.usuario.application.port.out.PasswordEncoderPort;
import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.application.usecase.AtivarUsuarioUseCase;
import com.geopetro.usuario.application.usecase.AlterarSenhaUsuarioUseCase;
import com.geopetro.usuario.application.usecase.AtualizarUsuarioUseCase;
import com.geopetro.usuario.application.usecase.BuscarUsuarioUseCase;
import com.geopetro.usuario.application.usecase.CriarUsuarioUseCase;
import com.geopetro.usuario.application.usecase.DesativarUsuarioUseCase;

@Configuration
public class UsuarioBeanConfig {

	@Bean
	UsuarioPersistenceMapper usuarioPersistenceMapper() {
		return new UsuarioPersistenceMapper();
	}

	@Bean
	CriarUsuarioUseCase criarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort,
			PasswordEncoderPort passwordEncoderPort, EmpresaConsultaPort empresaConsultaPort,
			UnidadeSondaConsultaPort unidadeSondaConsultaPort) {
		return new CriarUsuarioUseCase(usuarioRepositoryPort, passwordEncoderPort, empresaConsultaPort,
				unidadeSondaConsultaPort);
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
			EmpresaConsultaPort empresaConsultaPort, UnidadeSondaConsultaPort unidadeSondaConsultaPort) {
		return new AtualizarUsuarioUseCase(usuarioRepositoryPort, empresaConsultaPort, unidadeSondaConsultaPort);
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
