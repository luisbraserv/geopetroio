package com.geopetro.realtime;

import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.stereotype.Component;

import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;

/**
 * Guarda o topico de tempo real na saida — RN-062.
 *
 * <h2>Por que o SUBSCRIBE nao basta</h2>
 * {@link WebSocketAuthInterceptor} autoriza a assinatura <b>uma vez</b>, no momento em que ela e
 * pedida. Uma tela aberta assina no login e fica horas conectada: desativar a conta, ou revogar o
 * acesso do {@code CLIENTE} aquela Unidade/Sonda, nao faria a entrega parar — o corte de acesso
 * valeria para o HTTP e nao para o canal que mostra a sonda ao vivo.
 *
 * <p>Por isso a verificacao se repete a <b>cada mensagem</b>, do mesmo jeito que
 * {@code ConfiguracaoCardsOutbound} ja fazia para o documento de cards. O custo e uma consulta por
 * entrega, amortecida pelo cache curto de {@code ContaAtivaVerificador}: a janela do corte e a
 * mesma do HTTP, e nao a hora inteira do token.
 *
 * <p>⚠️ <b>Na duvida, nao entrega.</b> Sessao sem dono no registro ou falha ao verificar derrubam a
 * mensagem e viram log: um alarme entregue a quem nao deveria ve-lo e pior que um segundo de tela
 * parada, e a proxima leitura chega em 1s.
 */
@Component
public class RealtimeOutbound implements ChannelInterceptor {

	private static final Logger log = LoggerFactory.getLogger(RealtimeOutbound.class);

	private static final Pattern DESTINO =
			Pattern.compile("^/topic/realtime/unidades-sondas/([1-9][0-9]{0,18})$");

	private final ObjectProvider<SimpUserRegistry> registry;
	private final ConfiguracaoSondaAccess acesso;

	public RealtimeOutbound(ObjectProvider<SimpUserRegistry> registry, ConfiguracaoSondaAccess acesso) {
		this.registry = registry;
		this.acesso = acesso;
	}

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		String destino = SimpMessageHeaderAccessor.getDestination(message.getHeaders());
		if (destino == null) {
			return message;
		}
		var match = DESTINO.matcher(destino);
		if (!match.matches()) {
			return message;
		}
		long unidade = Long.parseLong(match.group(1));
		try {
			String sessao = SimpMessageHeaderAccessor.getSessionId(message.getHeaders());
			var dono = registry.getObject().getUsers().stream()
					.filter(u -> u.getSession(sessao) != null).findFirst();
			if (dono.isEmpty()) {
				log.warn("Tempo real da unidade {} nao entregue: sessao {} sem usuario no registro.",
						unidade, sessao);
				return null;
			}
			if (!acesso.permite(dono.get().getName(), unidade)) {
				log.warn("Tempo real da unidade {} nao entregue a {}: conta inativa ou sem acesso.",
						unidade, dono.get().getName());
				return null;
			}
			return message;
		} catch (RuntimeException e) {
			log.warn("Tempo real da unidade {} nao entregue: falha ao verificar acesso ({}).",
					unidade, e.toString());
			return null;
		}
	}
}
