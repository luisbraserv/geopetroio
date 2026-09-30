package com.geopetro.security;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.AnonymousAuthenticationToken;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.authority.SimpleGrantedAuthority;

import com.geopetro.security.authorization.RegraDeAcesso;
import com.geopetro.security.authorization.RegrasDeAcesso;
import com.geopetro.usuario.domain.model.Role;

/**
 * A regra de acesso por COMBINACAO — o que substituiu as listas de roles em 2026-09-17.
 *
 * <p>O caso que justifica a classe e o de uma permissao de modulo <b>sozinha</b>: com
 * {@code hasAnyRole}, ter {@code MONITORAMENTO} bastava, e a permissao deixava de depender do tipo
 * de conta. Aqui ela nao abre nada por si.
 */
class RegraDeAcessoTest {

	@Test
	@DisplayName("uma combinacao exige TODAS as suas roles")
	void combinacaoExigeTodas() {
		RegraDeAcesso regra = RegraDeAcesso.exigindo(Role.CLIENTE, Role.MONITORAMENTO);

		assertThat(regra.satisfeitaPor(Set.of(Role.CLIENTE, Role.MONITORAMENTO))).isTrue();
		assertThat(regra.satisfeitaPor(Set.of(Role.CLIENTE))).isFalse();
		assertThat(regra.satisfeitaPor(Set.of(Role.MONITORAMENTO))).isFalse();
	}

	@Test
	@DisplayName("roles a mais nao atrapalham: a combinacao precisa estar contida")
	void rolesExtrasNaoAtrapalham() {
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(
				Set.of(Role.CLIENTE, Role.MONITORAMENTO, Role.SIMULADOR, Role.CIMENTACAO))).isTrue();
	}

	@Test
	@DisplayName("qualquer uma das combinacoes basta")
	void qualquerCombinacaoBasta() {
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(Set.of(Role.ADMIN))).isTrue();
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(Set.of(Role.INTERNO, Role.MONITORAMENTO))).isTrue();
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(Set.of(Role.CLIENTE, Role.MONITORAMENTO))).isTrue();
	}

	@Test
	@DisplayName("sem role nenhuma, nada passa")
	void semRolesNadaPassa() {
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(Set.of())).isFalse();
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(null)).isFalse();
	}

	/**
	 * ⚠️ O tempo real <b>nao</b> depende do monitoramento, e o monitoramento nao concede tempo real.
	 * Se um dos dois passar a implicar o outro, conceder apenas uma das telas deixa de ser possivel.
	 */
	@Test
	@DisplayName("monitoramento e tempo real sao concessoes independentes")
	void monitoramentoETempoRealNaoSeImplicam() {
		assertThat(RegrasDeAcesso.MONITORAMENTO_REAL.satisfeitaPor(Set.of(Role.CLIENTE, Role.MONITORAMENTO)))
				.isFalse();
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(Set.of(Role.CLIENTE, Role.MONITORAMENTO_REAL)))
				.isFalse();
	}

	@Test
	@DisplayName("o simulador de cimentacao exige a area E o dominio")
	void simuladorExigeAreaEDominio() {
		assertThat(RegrasDeAcesso.SIMULADOR_CIMENTACAO
				.satisfeitaPor(Set.of(Role.INTERNO, Role.SIMULADOR, Role.CIMENTACAO))).isTrue();
		assertThat(RegrasDeAcesso.SIMULADOR_CIMENTACAO
				.satisfeitaPor(Set.of(Role.CLIENTE, Role.SIMULADOR, Role.CIMENTACAO))).isTrue();
		assertThat(RegrasDeAcesso.SIMULADOR_CIMENTACAO.satisfeitaPor(Set.of(Role.INTERNO, Role.SIMULADOR)))
				.as("area sem dominio")
				.isFalse();
		assertThat(RegrasDeAcesso.SIMULADOR_CIMENTACAO.satisfeitaPor(Set.of(Role.CLIENTE, Role.CIMENTACAO)))
				.as("dominio sem area")
				.isFalse();
	}

	/**
	 * ⚠️ A lista de sondas e os cards servem as QUATRO telas da area.
	 *
	 * <p>Se passarem a exigir {@code MONITORAMENTO}, quem recebeu apenas o tempo real fica com a
	 * tela aberta e a lista de sondas em 403 — acesso concedido que nao funciona.
	 */
	@Test
	@DisplayName("a area Sonda/Unidade aceita qualquer uma das duas permissoes")
	void areaSondaAceitaQualquerUmaDasPermissoes() {
		assertThat(RegrasDeAcesso.AREA_SONDA.satisfeitaPor(Set.of(Role.CLIENTE, Role.MONITORAMENTO))).isTrue();
		assertThat(RegrasDeAcesso.AREA_SONDA.satisfeitaPor(Set.of(Role.CLIENTE, Role.MONITORAMENTO_REAL))).isTrue();
		assertThat(RegrasDeAcesso.AREA_SONDA.satisfeitaPor(Set.of(Role.INTERNO, Role.MONITORAMENTO_REAL))).isTrue();
		assertThat(RegrasDeAcesso.AREA_SONDA.satisfeitaPor(Set.of(Role.ADMIN))).isTrue();
		assertThat(RegrasDeAcesso.AREA_SONDA.satisfeitaPor(Set.of(Role.CLIENTE)))
				.as("tipo de conta sozinho segue sem acesso")
				.isFalse();
		assertThat(RegrasDeAcesso.AREA_SONDA.satisfeitaPor(Set.of(Role.CLIENTE, Role.SIMULADOR, Role.CIMENTACAO)))
				.as("quem so tem simulador nao entra na area de sonda")
				.isFalse();
	}

	@Test
	@DisplayName("SUPORTE alcanca os cards, mas nao o monitoramento")
	void suporteAlcancaCardsENaoOMonitoramento() {
		assertThat(RegrasDeAcesso.CARDS_DA_UNIDADE.satisfeitaPor(Set.of(Role.SUPORTE))).isTrue();
		assertThat(RegrasDeAcesso.MONITORAMENTO.satisfeitaPor(Set.of(Role.SUPORTE))).isFalse();
		assertThat(RegrasDeAcesso.MONITORAMENTO_REAL.satisfeitaPor(Set.of(Role.SUPORTE))).isFalse();
		assertThat(RegrasDeAcesso.ADMINISTRACAO.satisfeitaPor(Set.of(Role.SUPORTE))).isFalse();
	}

	// --- canal HTTP -------------------------------------------------------------

	@Test
	@DisplayName("no HTTP, le as authorities com o prefixo do Spring Security")
	void leAuthoritiesComPrefixo() {
		Authentication autenticacao = autenticado("ROLE_CLIENTE", "ROLE_MONITORAMENTO");

		assertThat(RegrasDeAcesso.MONITORAMENTO.authorize(() -> autenticacao, null).isGranted()).isTrue();
		assertThat(RegrasDeAcesso.MONITORAMENTO_REAL.authorize(() -> autenticacao, null).isGranted()).isFalse();
	}

	/**
	 * Authority que nao corresponde a nenhuma role e ignorada, nao rejeitada: um token emitido antes
	 * de SONDA sair do enum vale pelo que ainda existe nele, em vez de derrubar a requisicao.
	 */
	@Test
	@DisplayName("authority desconhecida nao derruba a requisicao nem concede")
	void authorityDesconhecidaEIgnorada() {
		Authentication comRoleExtinta = autenticado("ROLE_INTERNO", "ROLE_SONDA");

		assertThat(RegrasDeAcesso.MONITORAMENTO.authorize(() -> comRoleExtinta, null).isGranted()).isFalse();
	}

	@Test
	@DisplayName("anonimo e nao autenticado sao negados")
	void anonimoENegado() {
		Authentication anonimo = new AnonymousAuthenticationToken("chave", "anonimo",
				List.of(new SimpleGrantedAuthority("ROLE_ANONYMOUS")));

		assertThat(RegrasDeAcesso.MONITORAMENTO.authorize(() -> anonimo, null).isGranted()).isFalse();
		assertThat(RegrasDeAcesso.MONITORAMENTO.authorize(() -> null, null).isGranted()).isFalse();
	}

	@Test
	@DisplayName("combinacao vazia e rejeitada na declaracao")
	void combinacaoVaziaERejeitada() {
		// Combinacao vazia estaria satisfeita por qualquer autenticado, e o efeito (rota aberta)
		// apareceria longe da causa.
		assertThatThrownBy(RegraDeAcesso::exigindo).isInstanceOf(IllegalArgumentException.class);
	}

	private static Authentication autenticado(String... authorities) {
		return new UsernamePasswordAuthenticationToken("ana", "n/a",
				List.of(authorities).stream().map(SimpleGrantedAuthority::new).toList());
	}
}
