package com.geopetro.realtime;

import java.security.Principal;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.stereotype.Component;

import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.security.application.port.out.TokenPort;

/**
 * Autenticacao e autorizacao do canal WebSocket.
 *
 * <p>O {@code SecurityConfig} protege apenas HTTP. Sem este interceptor, o WebSocket seria uma porta
 * paralela sem controle nenhum — qualquer um poderia assinar a telemetria de qualquer sonda.
 *
 * <h2>Dois momentos de verificacao</h2>
 * <ol>
 *   <li><b>CONNECT</b> — valida o JWT enviado no header {@code Authorization} e fixa o usuario na
 *       sessao. Reutiliza o mesmo {@link TokenPort} do login REST.</li>
 *   <li><b>SUBSCRIBE</b> — confere se aquele usuario pode ver aquela Unidade/Sonda, aplicando a
 *       mesma regra do historico ({@link SondaMonitoramentoService}).</li>
 * </ol>
 *
 * <p><b>Por que verificar no SUBSCRIBE e nao so no CONNECT:</b> o destino carrega o id da unidade.
 * Um usuario autenticado poderia trocar o id na mao e tentar assinar a sonda de outro cliente. A
 * autorizacao precisa acontecer onde o alvo e conhecido.
 */
@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

	private static final Logger log = LoggerFactory.getLogger(WebSocketAuthInterceptor.class);

	/** Destinos de assinatura de tempo real, dos quais extraimos o id da unidade. */
	private static final Pattern TOPICO_REALTIME =
			Pattern.compile("^/topic/realtime/unidades-sondas/(\\d+)$");

	/** Destino que o Desktop-Sonda usa para publicar o estado. */
	private static final String DESTINO_PUBLICACAO = "/app/realtime/estado";

	private final TokenPort tokenPort;
	private final SondaMonitoramentoService monitoramentoService;

	public WebSocketAuthInterceptor(TokenPort tokenPort, SondaMonitoramentoService monitoramentoService) {
		this.tokenPort = tokenPort;
		this.monitoramentoService = monitoramentoService;
	}

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		StompHeaderAccessor accessor =
				MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);

		if (accessor == null || accessor.getCommand() == null) {
			return message;
		}

		return switch (accessor.getCommand()) {
			case CONNECT -> autenticar(message, accessor);
			case SUBSCRIBE -> autorizarAssinatura(message, accessor);
			case SEND -> autorizarPublicacao(message, accessor);
			default -> message;
		};
	}

	private Message<?> autenticar(Message<?> message, StompHeaderAccessor accessor) {
		String token = extrairToken(accessor);

		if (token == null || !tokenPort.tokenValido(token)) {
			log.warn("CONNECT recusado: token ausente ou invalido.");
			throw new WebSocketNaoAutorizadoException("Token ausente ou invalido.");
		}

		String username = tokenPort.extrairUsername(token);
		accessor.setUser(new UsuarioWebSocket(username));
		log.debug("WebSocket conectado: usuario={}", username);
		return message;
	}

	private Message<?> autorizarAssinatura(Message<?> message, StompHeaderAccessor accessor) {
		String destino = accessor.getDestination();
		String username = nomeUsuario(accessor);

		if (destino == null || username == null) {
			throw new WebSocketNaoAutorizadoException("Assinatura sem destino ou sem usuario.");
		}

		Matcher matcher = TOPICO_REALTIME.matcher(destino);
		if (!matcher.matches()) {
			// Nao ha outros topicos publicos neste canal; recusar por padrao evita que um
			// destino novo nasca sem controle de acesso por esquecimento.
			log.warn("Assinatura recusada para destino nao reconhecido: {} (usuario={})", destino, username);
			throw new WebSocketNaoAutorizadoException("Destino nao permitido: " + destino);
		}

		Long unidadeSondaId = Long.valueOf(matcher.group(1));
		if (!monitoramentoService.usuarioPossuiAcessoAUnidade(username, unidadeSondaId)) {
			log.warn("Assinatura NEGADA: usuario={} tentou acessar unidade={}", username, unidadeSondaId);
			throw new WebSocketNaoAutorizadoException("Sem acesso a esta Unidade/Sonda.");
		}

		log.debug("Assinatura autorizada: usuario={} unidade={}", username, unidadeSondaId);
		return message;
	}

	private Message<?> autorizarPublicacao(Message<?> message, StompHeaderAccessor accessor) {
		String destino = accessor.getDestination();
		String username = nomeUsuario(accessor);

		if (!DESTINO_PUBLICACAO.equals(destino)) {
			throw new WebSocketNaoAutorizadoException("Destino de envio nao permitido: " + destino);
		}
		if (username == null) {
			throw new WebSocketNaoAutorizadoException("Envio sem usuario autenticado.");
		}

		// A autorizacao por unidade acontece no controller, onde o corpo ja foi desserializado
		// e o unidadeSondaId e conhecido.
		return message;
	}

	private String extrairToken(StompHeaderAccessor accessor) {
		List<String> valores = accessor.getNativeHeader("Authorization");
		if (valores == null || valores.isEmpty()) {
			return null;
		}
		String cabecalho = valores.get(0);
		return cabecalho.startsWith("Bearer ") ? cabecalho.substring(7) : cabecalho;
	}

	private String nomeUsuario(StompHeaderAccessor accessor) {
		Principal user = accessor.getUser();
		return user == null ? null : user.getName();
	}

	/** Principal minimo: o canal so precisa saber quem e para consultar a autorizacao. */
	private record UsuarioWebSocket(String nome) implements Principal {
		@Override
		public String getName() {
			return nome;
		}
	}
}
