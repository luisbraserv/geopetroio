package com.geopetro.monitoramento;

import static org.assertj.core.api.Assertions.assertThat;
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

import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.unidadesonda.repository.UnidadeSondaJpaRepository;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioClienteEntity;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioInternoEntity;
import com.geopetro.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;
import com.geopetro.usuario.domain.model.Role;

/**
 * Regra de escopo do monitoramento.
 *
 * <p>É a decisão de autorização mais sensível do sistema depois do login: define qual cliente
 * enxerga qual sonda. Um erro aqui expõe dados operacionais de uma empresa a outra.
 */
class SondaMonitoramentoServiceTest {

	private final UnidadeSondaJpaRepository unidadeSondaRepository = mock(UnidadeSondaJpaRepository.class);
	private final UsuarioJpaRepository usuarioRepository = mock(UsuarioJpaRepository.class);
	private final MonitoramentoClient monitoramentoClient = mock(MonitoramentoClient.class);

	private final SondaMonitoramentoService service =
			new SondaMonitoramentoService(unidadeSondaRepository, usuarioRepository, monitoramentoClient);

	// --- Perfis com acesso total ------------------------------------------------

	@Test
	@DisplayName("ADMIN enxerga toda a frota")
	void adminVeTodaFrota() {
		darUsuario(interno("admin", Role.ADMIN, Role.INTERNO));
		when(unidadeSondaRepository.findAll()).thenReturn(List.of(unidade(1L, "SPT-144"), unidade(2L, "UC-01")));

		assertThat(service.listarSondasDoUsuario("admin"))
				.extracting(dto -> dto.idSondaUnidade())
				.containsExactly("SPT-144", "UC-01");
		assertThat(service.usuarioPossuiAcessoASonda("admin", "UC-01")).isTrue();
	}

	@Test
	@DisplayName("SONDA, CIMENTACAO, GERENCIA e DIRETORIA enxergam toda a frota")
	void perfisOperacionaisVeemTodaFrota() {
		for (Role role : List.of(Role.SONDA, Role.CIMENTACAO, Role.GERENCIA, Role.DIRETORIA)) {
			UsuarioInternoEntity usuario = interno("user-" + role, role, Role.INTERNO);
			when(usuarioRepository.findById(usuario.getUsername())).thenReturn(Optional.of(usuario));
			when(unidadeSondaRepository.findAll()).thenReturn(List.of(unidade(1L, "SPT-144")));

			assertThat(service.listarSondasDoUsuario(usuario.getUsername()))
					.as("perfil %s deve ver a frota", role)
					.hasSize(1);
			assertThat(service.usuarioPossuiAcessoASonda(usuario.getUsername(), "SPT-144"))
					.as("perfil %s deve acessar qualquer sonda", role)
					.isTrue();
		}
	}

	@Test
	@DisplayName("acesso total ignora a regional do usuario")
	void acessoTotalIgnoraRegional() {
		// Ate 2026-08-27 o interno era limitado a sua regional. A regra mudou: os perfis
		// operacionais veem a frota inteira, independentemente do vinculo regional.
		darUsuario(interno("op", Role.SONDA, Role.INTERNO));
		when(unidadeSondaRepository.findAll()).thenReturn(List.of(unidade(1L, "SPT-144"), unidade(2L, "UC-01")));

		assertThat(service.listarSondasDoUsuario("op")).hasSize(2);
		verify(unidadeSondaRepository, never()).findBySetor_RegionalIdOrderByNomeAsc(any());
	}

	// --- CLIENTE: escopo restrito ----------------------------------------------

	@Test
	@DisplayName("CLIENTE enxerga apenas as unidades concedidas")
	void clienteVeApenasUnidadesConcedidas() {
		darUsuario(cliente("cliente", unidade(1L, "SPT-144")));

		assertThat(service.listarSondasDoUsuario("cliente"))
				.extracting(dto -> dto.idSondaUnidade())
				.containsExactly("SPT-144");
	}

	@Test
	@DisplayName("CLIENTE nao acessa sonda fora do seu vinculo")
	void clienteNaoAcessaSondaDeOutro() {
		darUsuario(cliente("cliente", unidade(1L, "SPT-144")));

		assertThat(service.usuarioPossuiAcessoASonda("cliente", "SPT-144")).isTrue();
		assertThat(service.usuarioPossuiAcessoASonda("cliente", "UC-01")).isFalse();
	}

	@Test
	@DisplayName("CLIENTE sem vinculo nao enxerga nenhuma sonda")
	void clienteSemVinculoNaoVeNada() {
		darUsuario(cliente("cliente"));

		assertThat(service.listarSondasDoUsuario("cliente")).isEmpty();
		assertThat(service.usuarioPossuiAcessoASonda("cliente", "SPT-144")).isFalse();
	}

	@Test
	@DisplayName("consulta de serie e bloqueada quando o cliente nao tem acesso")
	void consultaBloqueadaSemAcesso() {
		darUsuario(cliente("cliente", unidade(1L, "SPT-144")));

		assertThat(service.consultarSerie("cliente", "UC-01", "VAZAO_01", null, null)).isEmpty();
		// Nao pode nem chegar a bater no servico de telemetria.
		verify(monitoramentoClient, never()).consultarSerie(any(), any(), any(), any());
	}

	@Test
	@DisplayName("CLIENTE que tambem for ADMIN enxerga toda a frota")
	void clienteComAdminVeTudo() {
		// A role de maior alcance vence: ADMIN nao deve ser limitado pelo vinculo de cliente.
		UsuarioClienteEntity usuario = cliente("misto", unidade(1L, "SPT-144"));
		usuario.setRoles(Set.of(Role.CLIENTE, Role.ADMIN));
		darUsuario(usuario);
		when(unidadeSondaRepository.findAll()).thenReturn(List.of(unidade(1L, "SPT-144"), unidade(2L, "UC-01")));

		assertThat(service.listarSondasDoUsuario("misto")).hasSize(2);
		assertThat(service.usuarioPossuiAcessoASonda("misto", "UC-01")).isTrue();
	}

	// --- Perfis sem acesso ------------------------------------------------------

	@Test
	@DisplayName("perfil apenas INTERNO nao enxerga sondas")
	void internoPuroNaoVeSondas() {
		darUsuario(interno("interno", Role.INTERNO));

		assertThat(service.listarSondasDoUsuario("interno")).isEmpty();
		assertThat(service.usuarioPossuiAcessoASonda("interno", "SPT-144")).isFalse();
	}

	// --- Helpers ----------------------------------------------------------------

	private void darUsuario(UsuarioEntity usuario) {
		when(usuarioRepository.findById(usuario.getUsername())).thenReturn(Optional.of(usuario));
	}

	private UsuarioInternoEntity interno(String username, Role... roles) {
		UsuarioInternoEntity usuario = new UsuarioInternoEntity();
		usuario.setUsername(username);
		usuario.setRoles(Set.of(roles));
		return usuario;
	}

	private UsuarioClienteEntity cliente(String username, UnidadeSondaEntity... unidades) {
		UsuarioClienteEntity usuario = new UsuarioClienteEntity();
		usuario.setUsername(username);
		usuario.setRoles(Set.of(Role.CLIENTE));
		usuario.setUnidadesSondas(Set.of(unidades));
		return usuario;
	}

	private UnidadeSondaEntity unidade(Long id, String nome) {
		UnidadeSondaEntity unidade = new UnidadeSondaEntity();
		unidade.setId(id);
		unidade.setNome(nome);
		return unidade;
	}
}
