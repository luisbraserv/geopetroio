package com.geopetro.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;
import java.security.Principal;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.simp.SimpMessageHeaderAccessor;
import org.springframework.messaging.simp.SimpMessageType;
import org.springframework.messaging.simp.user.SimpSession;
import org.springframework.messaging.simp.user.SimpSubscription;
import org.springframework.messaging.simp.user.SimpUser;
import org.springframework.messaging.simp.user.SimpUserRegistry;
import org.springframework.messaging.support.MessageBuilder;

import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;

/**
 * A entrega do tempo real revalidada a cada mensagem — RN-062, achado A01.
 *
 * <h2>Por que o SUBSCRIBE não basta</h2>
 * {@link WebSocketAuthInterceptor} autoriza a assinatura <b>uma vez</b>. Uma tela aberta assina no
 * login e fica horas conectada: sem esta guarda, desativar a conta — ou revogar o acesso do
 * {@code CLIENTE} àquela sonda — cortava o HTTP e deixava a sonda continuar chegando ao vivo.
 */
class RealtimeOutboundTest {

	private static final String SESSAO = "sessao-1";

	private ConfiguracaoSondaAccess acesso;
	private SimpUserRegistry registro;
	private RealtimeOutbound guarda;
	private final MessageChannel canal = mock(MessageChannel.class);

	@BeforeEach
	@SuppressWarnings("unchecked")
	void setup() {
		acesso = mock(ConfiguracaoSondaAccess.class);
		registro = mock(SimpUserRegistry.class);
		ObjectProvider<SimpUserRegistry> provider = mock(ObjectProvider.class);
		when(provider.getObject()).thenReturn(registro);
		guarda = new RealtimeOutbound(provider, acesso);
	}

	@Test
	@DisplayName("entrega segue quando a conta continua ativa e com acesso")
	void entregaAutorizada() {
		registraDono("ana");
		when(acesso.permite("ana", 7L)).thenReturn(true);

		assertThat(guarda.preSend(mensagem("/topic/realtime/unidades/7"), canal)).isNotNull();
	}

	/** ⚠️ O caso do achado: a assinatura ja estava aberta quando a conta foi desativada. */
	@Test
	@DisplayName("assinatura ja aberta para de receber quando a conta e desativada")
	void entregaCortadaParaContaDesativada() {
		registraDono("demitido");
		when(acesso.permite("demitido", 7L)).thenReturn(false);

		assertThat(guarda.preSend(mensagem("/topic/realtime/unidades/7"), canal)).isNull();
	}

	/** Sessao sem dono no registro: na duvida nao entrega, e a proxima leitura chega em 1s. */
	@Test
	void sessaoSemDonoNaoRecebe() {
		when(registro.getUsers()).thenReturn(Set.of());

		assertThat(guarda.preSend(mensagem("/topic/realtime/unidades/7"), canal)).isNull();
	}

	/** Falha ao verificar tambem nao entrega: alarme para quem nao deveria ve-lo e pior. */
	@Test
	void falhaAoVerificarNaoEntrega() {
		registraDono("ana");
		when(acesso.permite("ana", 7L)).thenThrow(new IllegalStateException("banco fora"));

		assertThat(guarda.preSend(mensagem("/topic/realtime/unidades/7"), canal)).isNull();
	}

	/**
	 * ⚠️ A guarda só responde pelo seu destino.
	 *
	 * <p>Filtrar o que não é dela derrubaria o tópico de cards e o de configuração, que têm guardas
	 * próprias com regras de acesso diferentes.
	 */
	@Test
	void destinoDeOutroTopicoPassaSemMexer() {
		Message<byte[]> mensagem = mensagem("/topic/config/unidades/7/cards");

		assertThat(guarda.preSend(mensagem, canal)).isSameAs(mensagem);
	}

	@Test
	void mensagemSemDestinoPassaSemMexer() {
		var accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
		accessor.setSessionId(SESSAO);
		Message<byte[]> mensagem = MessageBuilder.createMessage(
				"".getBytes(StandardCharsets.UTF_8), accessor.getMessageHeaders());

		assertThat(guarda.preSend(mensagem, canal)).isSameAs(mensagem);
	}

	private void registraDono(String username) {
		when(registro.getUsers()).thenReturn(Set.of(new UsuarioDaSessao(username)));
	}

	private Message<byte[]> mensagem(String destino) {
		var accessor = SimpMessageHeaderAccessor.create(SimpMessageType.MESSAGE);
		accessor.setDestination(destino);
		accessor.setSessionId(SESSAO);
		return MessageBuilder.createMessage(
				"".getBytes(StandardCharsets.UTF_8), accessor.getMessageHeaders());
	}

	/** O registro só é consultado por {@code getSession} e {@code getName}. */
	private record UsuarioDaSessao(String nome) implements SimpUser {

		@Override
		public String getName() {
			return nome;
		}

		@Override
		public Principal getPrincipal() {
			return this::getName;
		}

		@Override
		public boolean hasSessions() {
			return true;
		}

		@Override
		public SimpSession getSession(String id) {
			return SESSAO.equals(id) ? new SessaoVazia(this) : null;
		}

		@Override
		public Set<SimpSession> getSessions() {
			return Set.of(new SessaoVazia(this));
		}
	}

	private record SessaoVazia(SimpUser dono) implements SimpSession {

		@Override
		public String getId() {
			return SESSAO;
		}

		@Override
		public SimpUser getUser() {
			return dono;
		}

		@Override
		public Set<SimpSubscription> getSubscriptions() {
			return Set.of();
		}
	}
}
