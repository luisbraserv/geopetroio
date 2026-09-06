package com.geopetro.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.usuario.application.port.out.UsuarioRepositoryPort;
import com.geopetro.usuario.domain.model.StatusUsuario;

/**
 * RN-062 — desativar usuario corta o acesso na hora.
 *
 * <p>Antes disto, o token valia uma hora e nada consultava o estado da conta: desativar um usuario
 * so tinha efeito quando o token dele expirava.
 */
class ContaAtivaVerificadorTest {

	private final UsuarioRepositoryPort repositorio = mock(UsuarioRepositoryPort.class);

	private ContaAtivaVerificador comCache(long segundos) {
		return new ContaAtivaVerificador(repositorio, segundos);
	}

	@Test
	@DisplayName("usuario ativo passa")
	void usuarioAtivoPassa() {
		when(repositorio.buscarStatusPorUsername("joao")).thenReturn(Optional.of(StatusUsuario.ATIVO));

		assertThat(comCache(10).ativa("joao")).isTrue();
	}

	@Test
	@DisplayName("usuario inativo e barrado")
	void usuarioInativoEBarrado() {
		when(repositorio.buscarStatusPorUsername("joao")).thenReturn(Optional.of(StatusUsuario.INATIVO));

		assertThat(comCache(10).ativa("joao")).isFalse();
	}

	@Test
	@DisplayName("username ausente no banco e barrado — usuario removido")
	void usuarioInexistenteEBarrado() {
		when(repositorio.buscarStatusPorUsername("fantasma")).thenReturn(Optional.empty());

		assertThat(comCache(10).ativa("fantasma")).isFalse();
	}

	@Test
	@DisplayName("username nulo ou vazio e barrado sem tocar o banco")
	void usernameVazioEBarrado() {
		ContaAtivaVerificador verificador = comCache(10);

		assertThat(verificador.ativa(null)).isFalse();
		assertThat(verificador.ativa("  ")).isFalse();
		verify(repositorio, times(0)).buscarStatusPorUsername(org.mockito.ArgumentMatchers.anyString());
	}

	@Test
	@DisplayName("o cache evita uma consulta por requisicao")
	void cacheEvitaConsultaPorRequisicao() {
		when(repositorio.buscarStatusPorUsername("joao")).thenReturn(Optional.of(StatusUsuario.ATIVO));
		ContaAtivaVerificador verificador = comCache(60);

		for (int i = 0; i < 5; i++) {
			assertThat(verificador.ativa("joao")).isTrue();
		}

		verify(repositorio, times(1)).buscarStatusPorUsername("joao");
	}

	@Test
	@DisplayName("com cache desligado, cada chamada reconsulta e a desativacao aparece na proxima")
	void semCacheADesativacaoApareceNaProximaChamada() {
		when(repositorio.buscarStatusPorUsername("joao"))
				.thenReturn(Optional.of(StatusUsuario.ATIVO))
				.thenReturn(Optional.of(StatusUsuario.INATIVO));

		ContaAtivaVerificador verificador = comCache(0);

		assertThat(verificador.ativa("joao")).isTrue();
		assertThat(verificador.ativa("joao")).isFalse();
		verify(repositorio, times(2)).buscarStatusPorUsername("joao");
	}

	@Test
	@DisplayName("contas diferentes nao compartilham entrada de cache")
	void contasDiferentesNaoSeMisturam() {
		when(repositorio.buscarStatusPorUsername("ativo")).thenReturn(Optional.of(StatusUsuario.ATIVO));
		when(repositorio.buscarStatusPorUsername("inativo")).thenReturn(Optional.of(StatusUsuario.INATIVO));

		ContaAtivaVerificador verificador = comCache(60);

		assertThat(verificador.ativa("ativo")).isTrue();
		assertThat(verificador.ativa("inativo")).isFalse();
		assertThat(verificador.ativa("ativo")).isTrue();
	}
}
