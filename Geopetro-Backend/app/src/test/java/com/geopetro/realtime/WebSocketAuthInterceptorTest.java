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

import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.security.application.port.out.TokenPort;

/**
 * Controle de acesso do canal WebSocket.
 *
 * <p>O {@code SecurityConfig} nao alcanca este caminho. Sem estas verificacoes, o WebSocket seria
 * uma porta paralela sem autorizacao — e um cliente poderia assinar a telemetria de qualquer sonda
 * trocando o id no destino.
 */
class WebSocketAuthInterceptorTest {

	private final TokenPort tokenPort = mock(TokenPort.class);
	private final SondaMonitoramentoService monitoramento = mock(SondaMonitoramentoService.class);
	private final MessageChannel canal = mock(MessageChannel.class);

	private final WebSocketAuthInterceptor interceptor =
			new WebSocketAuthInterceptor(tokenPort, monitoramento);

	// --- CONNECT ----------------------------------------------------------------

	@Test
	@DisplayName("CONNECT com token valido fixa o usuario na sessao")
	void connectComTokenValido() {
		when(tokenPort.tokenValido("bom")).thenReturn(true);
		when(tokenPort.extrairUsername("bom")).thenReturn("joao");

		StompHeaderAccessor accessor = accessor(StompCommand.CONNECT);
		accessor.addNativeHeader("Authorization", "Bearer bom");

		interceptor.preSend(mensagem(accessor), canal);

		assertThat(accessor.getUser()).isNotNull();
		assertThat(accessor.getUser().getName()).isEqualTo("joao");
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
		when(monitoramento.usuarioPossuiAcessoAUnidade("joao", 7L)).thenReturn(true);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "joao");
		accessor.setDestination("/topic/realtime/unidades-sondas/7");

		assertThat(interceptor.preSend(mensagem(accessor), canal)).isNotNull();
	}

	@Test
	@DisplayName("assinatura NEGADA para unidade sem acesso — mesmo trocando o id na mao")
	void assinaturaNegadaParaOutraUnidade() {
		// Cenario central: um CLIENTE autenticado tenta espiar a sonda de outra empresa.
		when(monitoramento.usuarioPossuiAcessoAUnidade("cliente", 99L)).thenReturn(false);

		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SUBSCRIBE, "cliente");
		accessor.setDestination("/topic/realtime/unidades-sondas/99");

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
		accessor.setDestination("/topic/realtime/unidades-sondas/1");

		assertThatThrownBy(() -> interceptor.preSend(mensagem(accessor), canal))
				.isInstanceOf(WebSocketNaoAutorizadoException.class);
	}

	// --- SEND -------------------------------------------------------------------

	@Test
	@DisplayName("envio para o destino de publicacao e aceito")
	void envioAceito() {
		StompHeaderAccessor accessor = accessorComUsuario(StompCommand.SEND, "sonda-01");
		accessor.setDestination("/app/realtime/estado");

		assertThat(interceptor.preSend(mensagem(accessor), canal)).isNotNull();
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
