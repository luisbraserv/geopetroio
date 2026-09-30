package com.geopetro.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.security.core.context.SecurityContextHolder;

import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.security.config.JwtAuthenticationFilter;

import jakarta.servlet.FilterChain;

/**
 * RN-062 no ponto onde a requisicao entra: um token ainda dentro da validade nao basta se a conta
 * foi desativada no meio do caminho.
 */
class JwtAuthenticationFilterTest {

	private final TokenPort tokenPort = mock(TokenPort.class);
	private final ContaAtivaVerificador contaAtiva = mock(ContaAtivaVerificador.class);
	private final FilterChain cadeia = mock(FilterChain.class);

	private final JwtAuthenticationFilter filtro = new JwtAuthenticationFilter(tokenPort, contaAtiva);

	@AfterEach
	void limparContexto() {
		SecurityContextHolder.clearContext();
	}

	private MockHttpServletRequest requisicaoCom(String token) {
		MockHttpServletRequest requisicao = new MockHttpServletRequest();
		requisicao.addHeader("Authorization", "Bearer " + token);
		return requisicao;
	}

	@Test
	@DisplayName("token valido de conta ativa autentica")
	void tokenValidoDeContaAtivaAutentica() throws Exception {
		when(tokenPort.tokenValido("bom")).thenReturn(true);
		when(tokenPort.extrairUsername("bom")).thenReturn("joao");
		when(tokenPort.extrairRoles("bom")).thenReturn(Set.of("INTERNO"));
		when(contaAtiva.ativa("joao")).thenReturn(true);

		filtro.doFilter(requisicaoCom("bom"), new MockHttpServletResponse(), cadeia);

		var autenticacao = SecurityContextHolder.getContext().getAuthentication();
		assertThat(autenticacao).isNotNull();
		assertThat(autenticacao.getName()).isEqualTo("joao");
		assertThat(autenticacao.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_INTERNO");
		verify(cadeia).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
	}

	@Test
	@DisplayName("token valido de conta desativada nao autentica")
	void tokenValidoDeContaDesativadaNaoAutentica() throws Exception {
		when(tokenPort.tokenValido("bom")).thenReturn(true);
		when(tokenPort.extrairUsername("bom")).thenReturn("demitido");
		when(contaAtiva.ativa("demitido")).thenReturn(false);

		filtro.doFilter(requisicaoCom("bom"), new MockHttpServletResponse(), cadeia);

		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
		// A cadeia segue: quem responde 401/403 e a camada de autorizacao, nao o filtro.
		verify(cadeia).doFilter(org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any());
	}

	@Test
	@DisplayName("requisicao sem Authorization nao consulta o estado da conta")
	void semCabecalhoNaoConsultaEstado() throws Exception {
		filtro.doFilter(new MockHttpServletRequest(), new MockHttpServletResponse(), cadeia);

		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
		verify(contaAtiva, org.mockito.Mockito.never()).ativa(org.mockito.ArgumentMatchers.anyString());
	}

	@Test
	@DisplayName("token invalido nao consulta o estado da conta")
	void tokenInvalidoNaoConsultaEstado() throws Exception {
		when(tokenPort.extrairUsername("ruim")).thenReturn("joao");
		when(tokenPort.tokenValido("ruim")).thenReturn(false);

		filtro.doFilter(requisicaoCom("ruim"), new MockHttpServletResponse(), cadeia);

		assertThat(SecurityContextHolder.getContext().getAuthentication()).isNull();
		verify(contaAtiva, org.mockito.Mockito.never()).ativa(org.mockito.ArgumentMatchers.anyString());
	}
}
