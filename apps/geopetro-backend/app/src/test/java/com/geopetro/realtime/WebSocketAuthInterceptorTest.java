package com.geopetro.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.MessageBuilder;

import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.security.authorization.PermissoesDoUsuario;
import com.geopetro.security.authorization.RegrasDeAcesso;

/**
 * Controle de acesso do canal WebSocket.
 *
 * <p>O {@code SecurityConfig} nao alcanca este caminho. Sem estas verificacoes, o WebSocket seria
 * uma porta paralela sem autorizacao — e um cliente poderia assinar a telemetria de qualquer sonda
 * trocando o id no destino.
 */
class WebSocketAuthInterceptorTest {

	private final TokenPort tokenPort = mock(TokenPort.class);
	private final ConfiguracaoSondaAccess acesso = mock(ConfiguracaoSondaAccess.class);
	private final ContaAtivaVerificador contas = mock(ContaAtivaVerificador.class);
	private final PermissoesDoUsuario permissoes = mock(PermissoesDoUsuario.class);
	private final MessageChannel canal = mock(MessageChannel.class);

	private final WebSocketAuthInterceptor interceptor =
			new WebSocketAuthInterceptor(tokenPort, acesso, contas, permissoes);

	// --- CONNECT ----------------------------------------------------------------

	@Test
	@DisplayName("CONNECT com token valido fixa o usuario na sessao")
	void connectComTokenValido() {
		when(tokenPort.tokenValido("bom")).thenReturn(true);
		when(tokenPort.extrairUsername("bom")).thenReturn("joao");
		when(contas.ativa("joao")).thenReturn(true);

		StompHeaderAccessor accessor = accessor(StompCommand.CONNECT);
		accessor.addNativeHeader("Authorization", "Bearer bom");

		interceptor.preSend(mensagem(accessor), canal);

		assertThat(accessor.getUser()).isNotNull();
		assertThat(accessor.getUser().getName()).isEqualTo("joao");
	}

	/**
	 * ⚠️ Token valido nao e conta valida — RN-062.
	 *
	 * <p>O JWT vale uma hora e nao sabe que o usuario foi desativado no minuto seguinte ao login.
	 * Sem esta verificacao, desativar uma conta cortava o HTTP e deixava o tempo real de pe.
	 */
	@Test
	@DisplayName("CONNECT de conta desativada e recusado, ainda que o token seja valido")
	void connectComContaDesativada() {
		when(tokenPort.tokenValido("bom")).thenReturn(true);
		when(tokenPort.extrairUsername("bom")).thenReturn("demitido");
		when(contas.ativa("demitido")).thenReturn(false);

		StompHeaderAccessor accessor = accessor(StompCommand.CONNECT);
		accessor.addNativeHeader("Authorization", "Bearer bom");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class)
				.hasMessageContaining("Conta inativa");
		assertThat(accessor.getUser()).as("e a sessao nao fica com usuario nenhum").isNull();
	}

	@Test
	@DisplayName("CONNECT sem token e recusado")
	void connectSemToken() {
		StompHeaderAccessor accessor = accessor(StompCommand.CONNECT);

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class);
	}

	@Test
	@DisplayName("CONNECT com token invalido e recusado")
	void connectComTokenInvalido() {
		when(tokenPort.tokenValido(anyString())).thenReturn(false);

		StompHeaderAccessor accessor = accessor(StompCommand.CONNECT);
		accessor.addNativeHeader("Authorization", "Bearer ruim");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class);
	}

	// --- SUBSCRIBE --------------------------------------------------------------

	@Test
	@DisplayName("assinatura autorizada quando o usuario tem acesso a unidade")
	void assinaturaAutorizada() {
		comPermissaoDeTempoReal("joao");
		when(acesso.permite("joao", 7L)).thenReturn(true);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "joao");
		accessor.setDestination("/topic/realtime/unidades/7");

		assertThat(interceptor.preSend(mensagem(accessor), canal)).isNotNull();
	}

	@Test
	@DisplayName("assinatura NEGADA para unidade sem acesso — mesmo trocando o id na mao")
	void assinaturaNegadaParaOutraUnidade() {
		// Cenario central: um CLIENTE autenticado tenta espiar a sonda de outra empresa.
		comPermissaoDeTempoReal("cliente");
		when(acesso.permite("cliente", 99L)).thenReturn(false);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "cliente");
		accessor.setDestination("/topic/realtime/unidades/99");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class)
				.hasMessageContaining("Sem acesso");
	}

	@Test
	@DisplayName("destino fora do padrao e recusado por padrao")
	void destinoDesconhecidoRecusado() {
		// Recusar por padrao evita que um topico novo nasca sem controle de acesso.
		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "joao");
		accessor.setDestination("/topic/qualquer-outra-coisa");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class)
				.hasMessageContaining("nao permitido");
	}

	@Test
	@DisplayName("assinatura sem usuario autenticado e recusada")
	void assinaturaSemUsuario() {
		StompHeaderAccessor accessor = accessor(StompCommand.SUBSCRIBE);
		accessor.setDestination("/topic/realtime/unidades/1");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class);
	}

	/**
	 * ⚠️ Esconder o Tempo Real no menu nao e controle de acesso.
	 *
	 * <p>As leituras ao vivo trafegam por <b>este</b> canal. Sem esta verificacao, quem recebeu
	 * apenas MONITORAMENTO assinaria o topico direto e leria tudo — a tela estaria escondida e o
	 * dado, aberto.
	 */
	@Test
	@DisplayName("assinatura de tempo real NEGADA a quem so tem monitoramento")
	void tempoRealExigeMonitoramentoReal() {
		when(permissoes.satisfaz("observador", RegrasDeAcesso.MONITORAMENTO_REAL)).thenReturn(false);
		when(acesso.permite("observador", 7L)).thenReturn(true);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "observador");
		accessor.setDestination("/topic/realtime/unidades/7");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class)
				.hasMessageContaining("Perfil sem acesso");
	}

	/**
	 * Os cards aceitam qualquer uma das duas permissoes da area, e <b>nao</b> exigem o tempo real:
	 * todas as telas se montam a partir deles, e quem so tem a tela de series tambem precisa saber
	 * o que a unidade mede (RN-088).
	 */
	@Test
	@DisplayName("assinatura dos cards aceita a area, sem exigir tempo real")
	void cardsExigemApenasMonitoramento() {
		when(permissoes.satisfaz("observador", RegrasDeAcesso.AREA_MONITORAMENTO)).thenReturn(true);
		when(permissoes.satisfaz("observador", RegrasDeAcesso.MONITORAMENTO_REAL)).thenReturn(false);
		when(acesso.permite("observador", 7L)).thenReturn(true);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "observador");
		accessor.setDestination("/topic/config/unidades/7/cards");

		assertThat(interceptor.preSend(mensagem(accessor), canal)).isNotNull();
	}

	// --- SEND -------------------------------------------------------------------

	@Test
	@DisplayName("envio para o destino de publicacao e aceito")
	void envioAceito() {
		when(contas.ativa("sonda-01")).thenReturn(true);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SEND, "sonda-01");
		accessor.setDestination("/app/realtime/estado");

		assertThat(interceptor.preSend(mensagem(accessor), canal)).isNotNull();
	}

	/**
	 * A estacao publica com a sessao aberta por horas.
	 *
	 * <p>⚠️ Sem isto, desativar a conta de uma unidade nao a impediria de continuar alimentando a
	 * tela e o motor de alarmes ate o token dela expirar.
	 */
	@Test
	@DisplayName("publicacao de conta desativada e recusada")
	void envioComContaDesativada() {
		when(contas.ativa("sonda-desligada")).thenReturn(false);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SEND, "sonda-desligada");
		accessor.setDestination("/app/realtime/estado");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class)
				.hasMessageContaining("Conta inativa");
	}

	/**
	 * ⚠️ A assinatura passa por {@code permite}, que soma conta ativa ao escopo por perfil.
	 *
	 * <p>Antes, {@code usuarioPossuiAcessoAUnidade} respondia so pelo escopo: uma conta desativada
	 * com acesso a unidade continuava assinando.
	 */
	@Test
	@DisplayName("assinatura NEGADA quando a conta foi desativada")
	void assinaturaNegadaParaContaDesativada() {
		comPermissaoDeTempoReal("demitido");
		when(acesso.permite("demitido", 7L)).thenReturn(false);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "demitido");
		accessor.setDestination("/topic/realtime/unidades/7");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class)
				.hasMessageContaining("Sem acesso");
	}

	@Test
	@DisplayName("envio para outro destino e recusado")
	void envioParaDestinoInvalido() {
		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SEND, "sonda-01");
		accessor.setDestination("/app/outra-coisa");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class);
	}

	// --- Helpers ----------------------------------------------------------------

	/** O perfil alcanca o tempo real; o que cada caso testa e o passo seguinte. */
	private void comPermissaoDeTempoReal(String username) {
		when(permissoes.satisfaz(username, RegrasDeAcesso.MONITORAMENTO_REAL)).thenReturn(true);
	}

	private StompHeaderAccessor accessor(StompCommand comando) {
		StompHeaderAccessor accessor = StompHeaderAccessor.create(comando);
		accessor.setLeaveMutable(true);
		return accessor;
	}

	private StompHeaderAccessor accessorComUsuario(StompCommand comando, String username) {
		StompHeaderAccessor accessor = accessor(comando);
		accessor.setUser(() -> username);
		return accessor;
	}

	private Message<byte[]> mensagem(StompHeaderAccessor accessor) {
		return MessageBuilder.createMessage(
				"".getBytes(StandardCharsets.UTF_8), accessor.getMessageHeaders());
	}
}
