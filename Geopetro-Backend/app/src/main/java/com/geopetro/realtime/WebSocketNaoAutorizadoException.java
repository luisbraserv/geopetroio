package com.geopetro.realtime;

import org.springframework.messaging.MessagingException;

/**
 * Recusa de conexao, assinatura ou envio no canal WebSocket.
 *
 * <p>Estende {@link MessagingException} para que o Spring encerre a operacao STOMP e devolva um
 * frame ERROR ao cliente, em vez de tratar como falha interna.
 */
public class WebSocketNaoAutorizadoException extends MessagingException {

	public WebSocketNaoAutorizadoException(String mensagem) {
		super(mensagem);
	}
}
