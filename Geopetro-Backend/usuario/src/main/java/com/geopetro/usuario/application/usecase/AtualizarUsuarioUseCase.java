package com.geopetro.usuario.application.usecase;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.geopetro.core.port.EmpresaConsultaPort;
import com.geopetro.core.port.EmpresaConsultaPort.EmpresaResumo;
import com.geopetro.core.port.UnidadeSondaConsultaPort;
import com.geopetro.core.port.UnidadeSondaConsultaPort.UnidadeSondaResumo;
import com.geopetro.usuario.application.command.AtualizarUsuarioCommand;
import com.geopetro.usuario.application.dto.UsuarioOutput;
import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;
import com.geopetro.usuario.domain.model.Role;
import com.geopetro.usuario.domain.model.Usuario;
import com.geopetro.usuario.domain.model.UsuarioCliente;
import com.geopetro.usuario.domain.model.UsuarioInterno;

public class AtualizarUsuarioUseCase {

	private final UsuarioRepositoryPort usuarioRepositoryPort;
	private final EmpresaConsultaPort empresaConsultaPort;
	private final UnidadeSondaConsultaPort unidadeSondaConsultaPort;

	public AtualizarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort,
			EmpresaConsultaPort empresaConsultaPort, UnidadeSondaConsultaPort unidadeSondaConsultaPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
		this.empresaConsultaPort = empresaConsultaPort;
		this.unidadeSondaConsultaPort = unidadeSondaConsultaPort;
	}

	public UsuarioOutput atualizar(String username, AtualizarUsuarioCommand command) {
		Usuario usuario = usuarioRepositoryPort.buscarPorUsername(username)
				.orElseThrow(() -> new UsuarioInvalidoException("Usuario nao encontrado."));

		usuario.setNome(command.nome());
		usuario.setTelefone(command.telefone());
		usuario.setEmail(command.email());
		usuario.setEndereco(command.endereco());
		atualizarDadosEspecificos(usuario, command);

		if (command.roles() != null) {
			usuario.setRoles(rolesComTipoObrigatorio(usuario, command.roles()));
		}

		return UsuarioOutput.de(usuarioRepositoryPort.salvar(usuario));
	}

	private void atualizarDadosEspecificos(Usuario usuario, AtualizarUsuarioCommand command) {
		if (usuario instanceof UsuarioInterno interno && command.matricula() != null) {
			interno.setMatricula(command.matricula());
		}

		if (usuario instanceof UsuarioCliente cliente) {
			if (command.id() != null) {
				cliente.setId(command.id());
			}
			if (command.empresa() != null && !command.empresa().isBlank()) {
				cliente.setEmpresa(command.empresa());
			}
			if (command.empresaId() != null) {
				EmpresaResumo empresa = empresaConsultaPort.buscarPorId(command.empresaId())
						.orElseThrow(() -> new UsuarioInvalidoException("Empresa informada nao existe."));
				cliente.setEmpresaId(empresa.id());
				cliente.setEmpresa(empresa.nome());
			}
			// null = campo nao enviado, mantem o vinculo atual.
			// Lista vazia = revogar o acesso a todas as sondas — operacao legitima.
			if (command.unidadeSondaIds() != null) {
				cliente.setUnidadesSondas(resolverUnidadesSondas(command.unidadeSondaIds()));
			}
		}
	}

	private List<UsuarioCliente.UnidadeSondaRef> resolverUnidadesSondas(Set<Long> ids) {
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

	private Set<Role> rolesComTipoObrigatorio(Usuario usuario, Set<Role> roles) {
		Set<Role> rolesTratadas = new LinkedHashSet<>(roles);
		if (usuario instanceof UsuarioInterno) rolesTratadas.add(Role.INTERNO);
		if (usuario instanceof UsuarioCliente) rolesTratadas.add(Role.CLIENTE);
		return rolesTratadas;
	}
}
