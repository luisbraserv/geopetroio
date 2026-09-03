package com.geopetro.usuario.application.usecase;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.geopetro.core.port.EmpresaConsultaPort;
import com.geopetro.core.port.EmpresaConsultaPort.EmpresaResumo;
import com.geopetro.core.port.RegionalBuscaPort;
import com.geopetro.core.port.RegionalBuscaPort.RegionalResumo;
import com.geopetro.core.port.SetorConsultaPort;
import com.geopetro.core.port.SetorConsultaPort.SetorResumo;
import com.geopetro.core.port.UnidadeSondaConsultaPort;
import com.geopetro.core.port.UnidadeSondaConsultaPort.UnidadeSondaResumo;
import com.geopetro.usuario.application.command.CriarUsuarioClienteCommand;
import com.geopetro.usuario.application.command.CriarUsuarioInternoCommand;
import com.geopetro.usuario.application.dto.UsuarioOutput;
import com.geopetro.usuario.application.port.in.CriarUsuarioInputPort;
import com.geopetro.usuario.application.port.out.PasswordEncoderPort;
import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;
import com.geopetro.usuario.domain.exception.UsuarioJaExisteException;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.Usuario;
import com.geopetro.usuario.domain.model.UsuarioCliente;
import com.geopetro.usuario.domain.model.UsuarioInterno;

public class CriarUsuarioUseCase implements CriarUsuarioInputPort {

	private final UsuarioRepositoryPort usuarioRepositoryPort;
	private final PasswordEncoderPort passwordEncoderPort;
	private final EmpresaConsultaPort empresaConsultaPort;
	private final RegionalBuscaPort regionalBuscaPort;
	private final SetorConsultaPort setorConsultaPort;
	private final UnidadeSondaConsultaPort unidadeSondaConsultaPort;

	public CriarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort, PasswordEncoderPort passwordEncoderPort,
			EmpresaConsultaPort empresaConsultaPort, RegionalBuscaPort regionalBuscaPort,
			SetorConsultaPort setorConsultaPort, UnidadeSondaConsultaPort unidadeSondaConsultaPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
		this.passwordEncoderPort = passwordEncoderPort;
		this.empresaConsultaPort = empresaConsultaPort;
		this.regionalBuscaPort = regionalBuscaPort;
		this.setorConsultaPort = setorConsultaPort;
		this.unidadeSondaConsultaPort = unidadeSondaConsultaPort;
	}

	@Override
	public UsuarioOutput criarCliente(CriarUsuarioClienteCommand command) {
		validarUsernameDisponivel(command.username());
		EmpresaResumo empresa = buscarEmpresa(command.empresaId());

		Usuario usuario = new UsuarioCliente(command.id(), empresa.id(), empresa.nome(), command.username(),
				passwordEncoderPort.encode(command.password()), command.nome(), command.telefone(), command.email(),
				command.endereco(), rolesComTipoObrigatorio(command.roles(), Role.CLIENTE),
				resolverUnidadesSondas(command.unidadeSondaIds()));

		return UsuarioOutput.de(usuarioRepositoryPort.salvar(usuario));
	}

	@Override
	public UsuarioOutput criarInterno(CriarUsuarioInternoCommand command) {
		validarUsernameDisponivel(command.username());
		RegionalResumo principal = buscarRegional(command.regionalId());
		List<UsuarioInterno.RegionalRef> regionais = resolverRegionais(command.regionalIds(), principal);
		List<UsuarioInterno.SetorRef> setores = resolverSetores(command.setorIds());

		UsuarioInterno interno = new UsuarioInterno(command.matricula(),
				principal != null ? principal.id() : null,
				principal != null ? principal.nome() : null,
				regionais, setores,
				command.username(), passwordEncoderPort.encode(command.password()), command.nome(),
				command.telefone(), command.email(), command.endereco(),
				rolesComTipoObrigatorio(command.roles(), Role.INTERNO));

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

	private RegionalResumo buscarRegional(Long regionalId) {
		if (regionalId == null || regionalId <= 0) return null;
		return regionalBuscaPort.buscarPorId(regionalId)
				.orElseThrow(() -> new UsuarioInvalidoException("Regional informada nao existe."));
	}

	// A regional principal sempre faz parte das regionais do usuario.
	private List<UsuarioInterno.RegionalRef> resolverRegionais(Set<Long> ids, RegionalResumo principal) {
		Set<Long> todos = new LinkedHashSet<>();
		if (principal != null) todos.add(principal.id());
		if (ids != null) ids.stream().filter(id -> id != null && id > 0).forEach(todos::add);

		List<UsuarioInterno.RegionalRef> refs = new ArrayList<>();
		for (Long id : todos) {
			RegionalResumo r = regionalBuscaPort.buscarPorId(id)
					.orElseThrow(() -> new UsuarioInvalidoException("Regional informada nao existe."));
			refs.add(new UsuarioInterno.RegionalRef(r.id(), r.nome()));
		}
		return refs;
	}

	/**
	 * Resolve as Unidades/Sondas que o cliente podera visualizar.
	 *
	 * <p>Lista vazia e valida: significa um cliente cadastrado que ainda nao recebeu acesso a
	 * nenhuma sonda. Ja um id inexistente e erro — indica formulario dessincronizado do cadastro.
	 */
	private List<UsuarioCliente.UnidadeSondaRef> resolverUnidadesSondas(Set<Long> ids) {
		if (ids == null || ids.isEmpty()) return List.of();
		Set<Long> filtrados = ids.stream().filter(id -> id != null && id > 0)
				.collect(Collectors.toCollection(LinkedHashSet::new));
		if (filtrados.isEmpty()) return List.of();

		List<UnidadeSondaResumo> encontrados = unidadeSondaConsultaPort.buscarPorIds(filtrados);
		if (encontrados.size() != filtrados.size()) {
			throw new UsuarioInvalidoException("Uma ou mais unidades/sondas informadas nao existem.");
		}
		return encontrados.stream()
				.map(u -> new UsuarioCliente.UnidadeSondaRef(u.id(), u.nome(), u.apelido()))
				.toList();
	}

	private List<UsuarioInterno.SetorRef> resolverSetores(Set<Long> ids) {
		if (ids == null || ids.isEmpty()) return List.of();
		Set<Long> filtrados = ids.stream().filter(id -> id != null && id > 0)
				.collect(Collectors.toCollection(LinkedHashSet::new));
		if (filtrados.isEmpty()) return List.of();

		List<SetorResumo> encontrados = setorConsultaPort.buscarPorIds(filtrados);
		if (encontrados.size() != filtrados.size()) {
			throw new UsuarioInvalidoException("Um ou mais setores informados nao existem.");
		}
		return encontrados.stream()
				.map(s -> new UsuarioInterno.SetorRef(s.id(), s.nome(), s.regionalId(), s.regionalNome()))
				.toList();
	}
}
