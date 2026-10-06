package com.braserv.core.usuario.application.usecase;

import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;

import com.braserv.core.comum.port.EmpresaConsultaPort;
import com.braserv.core.comum.port.EmpresaConsultaPort.EmpresaResumo;
import com.braserv.core.comum.port.UnidadeConsultaPort;
import com.braserv.core.comum.port.UnidadeConsultaPort.UnidadeResumo;
import com.braserv.core.usuario.application.command.AtualizarUsuarioCommand;
import com.braserv.core.usuario.application.dto.UsuarioOutput;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Usuario;
import com.braserv.core.usuario.domain.model.UsuarioCliente;
import com.braserv.core.usuario.domain.model.UsuarioInterno;

public class AtualizarUsuarioUseCase {

	private final UsuarioRepositoryPort usuarioRepositoryPort;
	private final EmpresaConsultaPort empresaConsultaPort;
	private final UnidadeConsultaPort unidadeConsultaPort;

	public AtualizarUsuarioUseCase(UsuarioRepositoryPort usuarioRepositoryPort,
			EmpresaConsultaPort empresaConsultaPort, UnidadeConsultaPort unidadeConsultaPort) {
		this.usuarioRepositoryPort = usuarioRepositoryPort;
		this.empresaConsultaPort = empresaConsultaPort;
		this.unidadeConsultaPort = unidadeConsultaPort;
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
			if (command.unidadeIds() != null) {
				Set<Long> jaConcedidas = new LinkedHashSet<>(cliente.getUnidadeIds());
				cliente.setUnidades(resolverUnidades(command.unidadeIds(), jaConcedidas));
			}
		}
	}

	/**
	 * @param jaConcedidas unidades que o cliente ja tinha. Uma delas inativa continua aceita: inativar
	 *                     nao revoga concessao (RN-116); o que se recusa e conceder uma inativa agora.
	 */
	private List<UsuarioCliente.UnidadeRef> resolverUnidades(Set<Long> ids, Set<Long> jaConcedidas) {
		Set<Long> filtrados = ids.stream().filter(id -> id != null && id > 0)
				.collect(Collectors.toCollection(LinkedHashSet::new));
		if (filtrados.isEmpty()) return List.of();

		List<UnidadeResumo> encontrados = unidadeConsultaPort.buscarPorIds(filtrados);
		if (encontrados.size() != filtrados.size()) {
			throw new UsuarioInvalidoException("Uma ou mais unidades informadas nao existem.");
		}
		List<String> inativasNovas = encontrados.stream()
				.filter(u -> !u.ativa() && !jaConcedidas.contains(u.id()))
				.map(UnidadeResumo::nome)
				.toList();
		if (!inativasNovas.isEmpty()) {
			throw new UsuarioInvalidoException("Unidade inativa nao pode ser concedida: " + String.join(", ", inativasNovas) + ".");
		}
		return encontrados.stream()
				.map(u -> new UsuarioCliente.UnidadeRef(u.id(), u.nome(), u.apelido()))
				.toList();
	}

	private Set<Role> rolesComTipoObrigatorio(Usuario usuario, Set<Role> roles) {
		Set<Role> rolesTratadas = new LinkedHashSet<>(roles);
		if (usuario instanceof UsuarioInterno) rolesTratadas.add(Role.INTERNO);
		if (usuario instanceof UsuarioCliente) rolesTratadas.add(Role.CLIENTE);
		return rolesTratadas;
	}
}
