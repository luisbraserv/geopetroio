package com.geopetro.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.geopetro.comum.port.AcessoDoUsuarioPort;
import com.geopetro.comum.port.AcessoDoUsuarioPort.AcessoDoUsuario;
import com.geopetro.comum.port.AcessoDoUsuarioPort.BraservCoreIndisponivelException;
import com.geopetro.security.application.ContaAtivaVerificador;

/**
 * RN-062: desativar no Braserv-Core corta o acesso aqui. O cache de 10 s e a tolerancia de 5 min
 * com o core fora do ar sao testados em {@code AcessoDoUsuarioAdapterTest}, onde moram.
 */
class ContaAtivaVerificadorTest {

	private final AcessoDoUsuarioPort acessos = mock(AcessoDoUsuarioPort.class);
	private final ContaAtivaVerificador verificador = new ContaAtivaVerificador(acessos);

	private static Optional<AcessoDoUsuario> acesso(String username, boolean ativo) {
		return Optional.of(new AcessoDoUsuario(username, "INTERNO", ativo, Set.of("INTERNO"), Set.of()));
	}

	@Test
	@DisplayName("usuario ativo passa")
	void usuarioAtivoPassa() {
		when(acessos.buscar("ana")).thenReturn(acesso("ana", true));
		assertThat(verificador.ativa("ana")).isTrue();
	}

	@Test
	@DisplayName("usuario inativo e barrado")
	void usuarioInativoEBarrado() {
		when(acessos.buscar("ana")).thenReturn(acesso("ana", false));
		assertThat(verificador.ativa("ana")).isFalse();
	}

	@Test
	@DisplayName("username ausente no core e barrado — usuario removido")
	void usuarioInexistenteEBarrado() {
		when(acessos.buscar("fantasma")).thenReturn(Optional.empty());
		assertThat(verificador.ativa("fantasma")).isFalse();
	}

	@Test
	@DisplayName("username nulo ou vazio e barrado sem perguntar ao core")
	void usernameVazioEBarrado() {
		assertThat(verificador.ativa(null)).isFalse();
		assertThat(verificador.ativa(" ")).isFalse();
		verify(acessos, never()).buscar(any());
	}

	@Test
	@DisplayName("core indisponivel sem resposta recente: barra, em vez de deixar passar")
	void coreIndisponivelBarra() {
		when(acessos.buscar("ana")).thenThrow(new BraservCoreIndisponivelException("fora", null));
		assertThat(verificador.ativa("ana")).isFalse();
	}
}
