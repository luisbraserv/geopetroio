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

import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.security.authorization.PermissoesDoUsuario;
import com.geopetro.security.authorization.RegraDeAcesso;
import com.geopetro.security.authorization.RegrasDeAcesso;

/**
 * Autenticacao e autorizacao do canal WebSocket.
 *
 * <p>O {@code SecurityConfig} protege apenas HTTP. Sem este interceptor, o WebSocket seria uma porta
 * paralela sem controle nenhum — qualquer um poderia assinar a telemetria de qualquer sonda.
 *
 * <h2>Tres momentos de verificacao</h2>
 * <ol>
 *   <li><b>CONNECT</b> — valida o JWT enviado no header {@code Authorization}, confere que a conta
 *       continua ativa e fixa o usuario na sessao. Reutiliza o mesmo {@link TokenPort} do login
 *       REST.</li>
 *   <li><b>SUBSCRIBE</b> — confere <b>duas</b> coisas: se o perfil alcanca aquele modulo
 *       ({@link RegrasDeAcesso}) e se aquele usuario pode ver aquela Unidade
 *       ({@link ConfiguracaoSondaAccess}). Uma nao substitui a outra: a primeira responde "pode ver
 *       tempo real?", a segunda "pode ver <i>esta</i> sonda?".</li>
 *   <li><b>SEND</b> — confere que quem publica ainda tem conta ativa; a autorizacao por unidade
 *       acontece no controller, onde o corpo ja foi desserializado.</li>
 * </ol>
 *
 * <p><b>Por que verificar no SUBSCRIBE e nao so no CONNECT:</b> o destino carrega o id da unidade.
 * Um usuario autenticado poderia trocar o id na mao e tentar assinar a sonda de outro cliente. A
 * autorizacao precisa acontecer onde o alvo e conhecido.
 *
 * <h2>⚠️ Conta ativa tambem aqui — RN-062</h2>
 * O HTTP corta o acesso de conta desativada por {@code ContaAtivaVerificador}; este canal precisa da
 * <b>mesma</b> regra, senao desativar um usuario nao interromperia a leitura nem a publicacao de
 * tempo real ate o token expirar. Por isso {@link ConfiguracaoSondaAccess#permite}, que ja soma
 * conta ativa a regra de escopo, no lugar da consulta de acesso pura.
 *
 * <p>⚠️ <b>Estes tres momentos nao bastam.</b> Uma assinatura ja aberta nao volta a passar por aqui:
 * quem e desativado depois do SUBSCRIBE continuaria recebendo. Quem revalida cada entrega e
 * {@link RealtimeOutbound}.
 */
@Component
public class WebSocketAuthInterceptor implements ChannelInterceptor {

	private static final Logger log = LoggerFactory.getLogger(WebSocketAuthInterceptor.class);

	/** Destinos de assinatura de tempo real, dos quais extraimos o id da unidade. */
	/**
	 * Destinos que este canal reconhece. Tudo o que não casar é <b>recusado</b> — ver
	 * {@link #autorizarAssinatura}.
	 *
	 * <p>São dois, e cada um tem forma própria:
	 * <ul>
	 *   <li>{@code /topic/realtime/unidades/{id}} — as leituras ao vivo, <b>sem</b> sufixo.</li>
	 *   <li>{@code /topic/config/unidades/{id}/cards} e {@code /app/config/...} — o documento
	 *       de cards, com o sufixo <b>obrigatório</b>.</li>
	 * </ul>
	 *
	 * <p>⚠️ <b>O sufixo {@code /cards} deixou de ser opcional em 2026-09-09.</b> Ele era opcional
	 * porque o mesmo prefixo servia ao documento de <b>limites</b>, que o Desktop assinava. Com o
	 * alarme da estação passando a ser configurado na estação
	 * ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.3}), aquele tópico ficou sem assinante e
	 * saiu — e mantê-lo aceito aqui deixaria um destino autorizado que ninguém publica nem consome.
	 *
	 * <p>⚠️ Errar esta expressão custa nos dois sentidos: frouxa demais abre um destino sem dono;
	 * estrita demais recusa a assinatura de cards, e o sintoma aparece longe da causa — "a unidade
	 * não lê nada" (RN-088), sem nada acusando a recusa.
	 *
	 * <p>⚠️ <b>A permissão de módulo difere entre os dois destinos</b> — desde 2026-09-17. As leituras
	 * ao vivo exigem {@code MONITORAMENTO_REAL}; o documento de cards aceita qualquer uma das duas
	 * permissões ({@code AREA_MONITORAMENTO}), porque todas as telas da área se montam a partir dele — quem
	 * só tem séries precisa saber o que a unidade mede, e quem só tem tempo real também. O escopo
	 * por unidade é o mesmo para os dois.
	 * A diferença de autoridade na <b>gravação</b> continua no REST, por
	 * {@code ConfiguracaoCardsAccess} (RN-086, RN-089).
	 */
	private static final Pattern TOPICO_REALTIME = Pattern.compile(
			"^(?:/topic/realtime/unidades/([1-9][0-9]{0,18})"
					+ "|/(?:topic|app)/config/unidades/([1-9][0-9]{0,18})/cards)$");

	/** Destino que o Geopetro-Desktop usa para publicar o estado. */
	private static final String DESTINO_PUBLICACAO = "/app/realtime/estado";

	private final TokenPort tokenPort;
	private final ConfiguracaoSondaAccess acesso;
	private final ContaAtivaVerificador contas;
	private final PermissoesDoUsuario permissoes;

	public WebSocketAuthInterceptor(TokenPort tokenPort, ConfiguracaoSondaAccess acesso,
			ContaAtivaVerificador contas, PermissoesDoUsuario permissoes) {
		this.tokenPort = tokenPort;
		this.acesso = acesso;
		this.contas = contas;
		this.permissoes = permissoes;
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

		// Token valido nao e o mesmo que conta valida: o JWT vale uma hora e nao sabe que o usuario
		// foi desativado no minuto seguinte ao login (RN-062).
		if (!contas.ativa(username)) {
			log.warn("CONNECT recusado: conta inativa ou inexistente (usuario={}).", username);
			throw new WebSocketNaoAutorizadoException("Conta inativa.");
		}

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

		// Dois grupos porque sao duas formas de destino: a de tempo real e a de cards. Exatamente um
		// casa por vez, e o outro vem nulo — e e isso que diz qual permissao de modulo exigir.
		boolean tempoReal = matcher.group(1) != null;
		String id = tempoReal ? matcher.group(1) : matcher.group(2);
		Long unidadeId;
        try { unidadeId = Long.valueOf(id); }
        catch (NumberFormatException e) { throw new WebSocketNaoAutorizadoException("Unidade invalida."); }

		// Permissao de MODULO. Sem esta verificacao, esconder o Tempo Real no menu seria o unico
		// controle: quem tivesse apenas MONITORAMENTO assinaria as leituras ao vivo por este canal,
		// que e onde elas realmente trafegam.
		RegraDeAcesso regra = tempoReal ? RegrasDeAcesso.MONITORAMENTO_REAL : RegrasDeAcesso.AREA_MONITORAMENTO;
		if (!permissoes.satisfaz(username, regra)) {
			log.warn("Assinatura NEGADA por perfil: usuario={} destino={} exige {}", username, destino, regra);
			throw new WebSocketNaoAutorizadoException("Perfil sem acesso a este recurso.");
		}

		// Escopo por UNIDADE. `permite` soma conta ativa ao escopo por perfil: as duas condicoes
		// negam a assinatura, e a mensagem nao distingue qual delas — quem nao tem acesso nao
		// precisa saber o motivo.
		if (!acesso.permite(username, unidadeId)) {
			log.warn("Assinatura NEGADA: usuario={} tentou acessar unidade={}", username, unidadeId);
			throw new WebSocketNaoAutorizadoException("Sem acesso a esta Unidade.");
		}

		log.debug("Assinatura autorizada: usuario={} unidade={}", username, unidadeId);
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

		// A estacao publica com a sessao aberta por horas: sem esta verificacao, desativar a conta
		// de uma unidade nao a impediria de continuar alimentando a tela e o motor de alarmes.
		if (!contas.ativa(username)) {
			log.warn("Publicacao NEGADA: conta inativa (usuario={}).", username);
			throw new WebSocketNaoAutorizadoException("Conta inativa.");
		}

		// A autorizacao por unidade acontece no controller, onde o corpo ja foi desserializado
		// e o unidadeId e conhecido.
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
