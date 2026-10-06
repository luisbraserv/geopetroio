package com.braserv.core.usuario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.List;
import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.braserv.core.comum.port.EmpresaConsultaPort;
import com.braserv.core.comum.port.EmpresaConsultaPort.EmpresaResumo;
import com.braserv.core.comum.port.UnidadeConsultaPort;
import com.braserv.core.comum.port.UnidadeConsultaPort.UnidadeResumo;
import com.braserv.core.usuario.application.command.AtualizarUsuarioCommand;
import com.braserv.core.usuario.application.command.CriarUsuarioClienteCommand;
import com.braserv.core.usuario.application.port.out.PasswordEncoderPort;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.application.usecase.AtualizarUsuarioUseCase;
import com.braserv.core.usuario.application.usecase.CriarUsuarioUseCase;
import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;
import com.braserv.core.usuario.domain.model.Email;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Telefone;
import com.braserv.core.usuario.domain.model.Usuario;
import com.braserv.core.usuario.domain.model.UsuarioCliente;

/** RN-116: unidade inativa nao recebe concessao nova, mas inativar nao revoga a que existe. */
class ConcessaoDeUnidadeInativaTest {

	private final UsuarioRepositoryPort repositorio = mock(UsuarioRepositoryPort.class);
	private final EmpresaConsultaPort empresas = mock(EmpresaConsultaPort.class);
	private final UnidadeConsultaPort unidades = mock(UnidadeConsultaPort.class);
	private final PasswordEncoderPort encoder = mock(PasswordEncoderPort.class);

	private static final UnidadeResumo ATIVA = new UnidadeResumo(8L, "SPT-145", null, true);
	private static final UnidadeResumo INATIVA_JA_CONCEDIDA = new UnidadeResumo(7L, "SPT-144", null, false);
	private static final UnidadeResumo INATIVA_NOVA = new UnidadeResumo(9L, "BK-21", null, false);

	private UsuarioCliente clienteComA7() {
		return new UsuarioCliente(1, 3L, "Petro", "cli", "Senha@123", "Cliente", Telefone.comTratamento("71999999999"),
				Email.comTratamento("cli@example.test"), null, Set.of(Role.CLIENTE),
				List.of(new UsuarioCliente.UnidadeRef(7L, "SPT-144", null)));
	}

	private AtualizarUsuarioCommand atualizarCom(Set<Long> unidadeIds) {
		return new AtualizarUsuarioCommand("Cliente", Telefone.comTratamento("71999999999"),
				Email.comTratamento("cli@example.test"), null, null, null, null, null, null, unidadeIds);
	}

	@Test
	@DisplayName("criar cliente com unidade inativa e recusado")
	void criarComInativaRecusado() {
		when(repositorio.existePorUsername("novo")).thenReturn(false);
		when(empresas.buscarPorId(3L)).thenReturn(Optional.of(new EmpresaResumo(3L, "Petro")));
		when(unidades.buscarPorIds(Set.of(8L, 9L))).thenReturn(List.of(ATIVA, INATIVA_NOVA));
		var useCase = new CriarUsuarioUseCase(repositorio, encoder, empresas, unidades);
		var comando = new CriarUsuarioClienteCommand(1, 3L, null, "novo", "Senha@123", "Novo",
				Telefone.comTratamento("71999999999"), Email.comTratamento("novo@example.test"), null,
				Set.of(Role.CLIENTE), Set.of(8L, 9L));

		assertThatThrownBy(() -> useCase.criarCliente(comando))
				.isInstanceOf(UsuarioInvalidoException.class)
				.hasMessage("Unidade inativa nao pode ser concedida: BK-21.");
		verify(repositorio, never()).salvar(any());
	}

	@Test
	@DisplayName("atualizar mantendo uma concessao que ficou inativa e aceito")
	void manterConcessaoInativaAceito() {
		when(repositorio.buscarPorUsername("cli")).thenReturn(Optional.of(clienteComA7()));
		when(repositorio.salvar(any())).thenAnswer(i -> i.getArgument(0));
		when(unidades.buscarPorIds(Set.of(7L, 8L))).thenReturn(List.of(INATIVA_JA_CONCEDIDA, ATIVA));
		var useCase = new AtualizarUsuarioUseCase(repositorio, empresas, unidades);

		useCase.atualizar("cli", atualizarCom(Set.of(7L, 8L)));

		var salvo = org.mockito.ArgumentCaptor.forClass(Usuario.class);
		verify(repositorio).salvar(salvo.capture());
		assertThat(((UsuarioCliente) salvo.getValue()).getUnidadeIds()).containsExactlyInAnyOrder(7L, 8L);
	}

	@Test
	@DisplayName("atualizar acrescentando uma unidade inativa e recusado")
	void acrescentarInativaRecusado() {
		when(repositorio.buscarPorUsername("cli")).thenReturn(Optional.of(clienteComA7()));
		when(unidades.buscarPorIds(Set.of(7L, 9L))).thenReturn(List.of(INATIVA_JA_CONCEDIDA, INATIVA_NOVA));
		var useCase = new AtualizarUsuarioUseCase(repositorio, empresas, unidades);

		assertThatThrownBy(() -> useCase.atualizar("cli", atualizarCom(Set.of(7L, 9L))))
				.isInstanceOf(UsuarioInvalidoException.class)
				.hasMessage("Unidade inativa nao pode ser concedida: BK-21.");
		verify(repositorio, never()).salvar(any());
	}
}
