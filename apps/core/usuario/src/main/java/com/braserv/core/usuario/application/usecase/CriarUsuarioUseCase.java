package com.braserv.core.usuario.application.usecase;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.braserv.core.comum.port.EmpresaConsultaPort;
import com.braserv.core.comum.port.EmpresaConsultaPort.EmpresaResumo;
import com.braserv.core.comum.port.UnidadeConsultaPort;
import com.braserv.core.comum.port.UnidadeConsultaPort.UnidadeResumo;
import com.braserv.core.usuario.application.command.CriarUsuarioClienteCommand;
import com.braserv.core.usuario.application.command.CriarUsuarioInternoCommand;
import com.braserv.core.usuario.application.dto.UsuarioOutput;
import com.braserv.core.usuario.application.port.in.CriarUsuarioInputPort;
import com.braserv.core.usuario.application.port.out.PasswordEncoderPort;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;
import com.braserv.core.usuario.domain.exception.UsuarioJaExisteException;
import com.braserv.core.usuario.domain.model.PoliticaSenha;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Usuario;
import com.braserv.core.usuario.domain.model.UsuarioCliente;
import com.braserv.core.usuario.domain.model.UsuarioInterno;

public class CriarUsuarioUseCase implements CriarUsuarioInputPort {

	private final UsuarioRepositoryPort usuarioRepositoryPort;
	private final PasswordEncoderPort passwordEncoderPort;
	private final EmpresaConsultaPort empresaConsultaPort;
	private final UnidadeConsultaPort unidadeConsultaPort;

	public CriarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort, PasswordEncoderPort passwordEncoderPort,
			EmpresaConsultaPort empresaConsultaPort, UnidadeConsultaPort unidadeConsultaPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
		this.passwordEncoderPort = passwordEncoderPort;
		this.empresaConsultaPort = empresaConsultaPort;
		this.unidadeConsultaPort = unidadeConsultaPort;
	}

	@Override
	public UsuarioOutput criarCliente(CriarUsuarioClienteCommand command) {
		validarUsernameDisponivel(command.username());
		PoliticaSenha.validar(command.password());
		EmpresaResumo empresa = buscarEmpresa(command.empresaId());

		Usuario usuario = new UsuarioCliente(command.id(), empresa.id(), empresa.nome(), command.username(),
				passwordEncoderPort.encode(command.password()), command.nome(), command.telefone(), command.email(),
				command.endereco(), rolesComTipoObrigatorio(command.roles(), Role.CLIENTE),
				resolverUnidades(command.unidadeIds()));

		return UsuarioOutput.de(usuarioRepositoryPort.salvar(usuario));
	}

	@Override
	public UsuarioOutput criarInterno(CriarUsuarioInternoCommand command) {
		validarUsernameDisponivel(command.username());
		PoliticaSenha.validar(command.password());

		UsuarioInterno interno = new UsuarioInterno(command.matricula(), command.username(),
				passwordEncoderPort.encode(command.password()), command.nome(), command.telefone(), command.email(),
				command.endereco(), rolesComTipoObrigatorio(command.roles(), Role.INTERNO));

		return UsuarioOutput.de(usuarioRepositoryPort.salvar(interno));
	}

	private void validarUsernameDisponivel(String username) {
		if (usuarioRepositoryPort.existePorUsername(username)) {
			throw new UsuarioJaExisteException(username);
		}
	}

	private Set<Role> rolesComTipoObrigatorio(Set<Role> roles, Role tipoUsuario) {
		Set<Role> rolesTratadas = new LinkedHashSet<>();
		if (roles != null) rolesTratadas.addAll(roles);
		rolesTratadas.add(tipoUsuario);
		return rolesTratadas;
	}

	private EmpresaResumo buscarEmpresa(Long empresaId) {
		if (empresaId == null) {
			throw new UsuarioInvalidoException("Empresa do cliente e obrigatoria.");
		}
		return empresaConsultaPort.buscarPorId(empresaId)
				.orElseThrow(() -> new UsuarioInvalidoException("Empresa informada nao existe."));
	}

	/**
	 * Resolve as Unidades que o cliente podera visualizar.
	 *
	 * <p>Lista vazia e valida: significa um cliente cadastrado que ainda nao recebeu acesso a
	 * nenhuma sonda. Ja um id inexistente e erro — indica formulario dessincronizado do cadastro.
	 */
	private List<UsuarioCliente.UnidadeRef> resolverUnidades(Set<Long> ids) {
		if (ids == null || ids.isEmpty()) return List.of();
		Set<Long> filtrados = ids.stream().filter(id -> id != null && id > 0)
				.collect(Collectors.toCollection(LinkedHashSet::new));
		if (filtrados.isEmpty()) return List.of();

		List<UnidadeResumo> encontrados = unidadeConsultaPort.buscarPorIds(filtrados);
		if (encontrados.size() != filtrados.size()) {
			throw new UsuarioInvalidoException("Uma ou mais unidades informadas nao existem.");
		}
		return encontrados.stream()
				.map(u -> new UsuarioCliente.UnidadeRef(u.id(), u.nome(), u.apelido()))
				.toList();
	}
}
