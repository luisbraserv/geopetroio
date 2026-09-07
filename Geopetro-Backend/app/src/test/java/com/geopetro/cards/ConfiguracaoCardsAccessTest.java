package com.geopetro.cards;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;
import com.geopetro.core.exception.BusinessException;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioEntity;
import com.geopetro.usuario.adapter.out.persistence.entity.UsuarioInternoEntity;
import com.geopetro.usuario.adapter.out.persistence.repository.UsuarioJpaRepository;
import com.geopetro.usuario.domain.model.Role;

/**
 * RN-086 — ler e gravar cards têm autoridades diferentes.
 *
 * <p>É a assimetria que justifica a classe existir, e é onde um descuido transformaria SUPORTE num
 * segundo ADMIN, ou deixaria a supervisão sem ver o que a sonda mede.
 */
class ConfiguracaoCardsAccessTest {

	private final ConfiguracaoSondaAccess monitoramento = mock(ConfiguracaoSondaAccess.class);
	private final ContaAtivaVerificador contas = mock(ContaAtivaVerificador.class);
	private final UsuarioJpaRepository usuarios = mock(UsuarioJpaRepository.class);

	private final ConfiguracaoCardsAccess access =
			new ConfiguracaoCardsAccess(monitoramento, contas, usuarios);

	private void usuarioCom(String nome, Role... roles) {
		UsuarioEntity usuario = new UsuarioInternoEntity();
		usuario.setRoles(Set.of(roles));
		when(usuarios.findById(nome)).thenReturn(Optional.of(usuario));
		when(contas.ativa(nome)).thenReturn(true);
	}

	@Test
	@DisplayName("quem enxerga a sonda le os cards, mesmo sem configurar")
	void monitoramentoLe() {
		when(monitoramento.permite("supervisao", 7L)).thenReturn(true);
		usuarioCom("supervisao", Role.SONDA);

		assertThat(access.podeLer("supervisao", 7L)).isTrue();
		assertThat(access.podeGravar("supervisao", 7L)).isFalse();
		assertThatThrownBy(() -> access.exigirEscrita("supervisao", 7L))
				.isInstanceOf(BusinessException.class)
				.hasMessageContaining("ADMIN ou SUPORTE");
	}

	@Test
	@DisplayName("SUPORTE le e grava, mesmo nao enxergando a sonda no monitoramento")
	void suporteConfigura() {
		// SUPORTE nao esta em ACESSO_TOTAL do monitoramento, de proposito: ele configura o
		// sistema, nao acompanha operacao. Sem somar o perfil, nao conseguiria nem ler o que edita.
		when(monitoramento.permite(anyString(), anyLong())).thenReturn(false);
		usuarioCom("sup", Role.SUPORTE);

		assertThat(access.podeLer("sup", 7L)).isTrue();
		assertThat(access.podeGravar("sup", 7L)).isTrue();
	}

	@Test
	@DisplayName("ADMIN configura")
	void adminConfigura() {
		when(monitoramento.permite(anyString(), anyLong())).thenReturn(false);
		usuarioCom("admin", Role.ADMIN);

		assertThat(access.podeGravar("admin", 7L)).isTrue();
	}

	@Test
	@DisplayName("CLIENTE que enxerga a sonda le, mas nao configura")
	void clienteNaoConfigura() {
		when(monitoramento.permite("cliente", 7L)).thenReturn(true);
		usuarioCom("cliente", Role.CLIENTE);

		assertThat(access.podeLer("cliente", 7L)).isTrue();
		assertThat(access.podeGravar("cliente", 7L)).isFalse();
	}

	@Test
	@DisplayName("conta desativada nao configura, mesmo sendo SUPORTE — RN-062")
	void contaDesativadaNaoConfigura() {
		UsuarioEntity usuario = new UsuarioInternoEntity();
		usuario.setRoles(Set.of(Role.SUPORTE));
		when(usuarios.findById("demitido")).thenReturn(Optional.of(usuario));
		when(contas.ativa("demitido")).thenReturn(false);
		when(monitoramento.permite(anyString(), anyLong())).thenReturn(false);

		assertThat(access.podeGravar("demitido", 7L)).isFalse();
		assertThat(access.podeLer("demitido", 7L)).isFalse();
	}

	@Test
	@DisplayName("usuario inexistente nao configura")
	void usuarioInexistente() {
		when(monitoramento.permite(anyString(), anyLong())).thenReturn(false);
		when(contas.ativa("fantasma")).thenReturn(true);
		when(usuarios.findById("fantasma")).thenReturn(Optional.empty());

		assertThat(access.podeGravar("fantasma", 7L)).isFalse();
	}

	@Test
	@DisplayName("username nulo e id invalido sao recusados")
	void entradasInvalidas() {
		when(monitoramento.permite(anyString(), anyLong())).thenReturn(false);

		assertThat(access.podeGravar(null, 7L)).isFalse();
		assertThat(access.podeGravar("sup", 0L)).isFalse();
		assertThatThrownBy(() -> access.exigirLeitura(null, 7L)).isInstanceOf(BusinessException.class);
	}
}
