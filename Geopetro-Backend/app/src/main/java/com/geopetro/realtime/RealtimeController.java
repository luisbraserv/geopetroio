package com.geopetro.realtime;

import java.security.Principal;
import java.time.Instant;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.geopetro.monitoramento.SondaMonitoramentoService;
import com.geopetro.realtime.dto.EstadoRealtimeDTO;

/**
 * Recebe o estado publicado pelo Geopetro-Desktop e retransmite aos assinantes autorizados.
 *
 * <p><b>Nao persiste nada.</b> A responsabilidade deste canal e o "agora"; o historico segue por
 * MQTT -> Backend-Telemetria -> InfluxDB. Ver specs/contracts/websocket-realtime.md.
 */
@Controller
public class RealtimeController {

	private static final Logger log = LoggerFactory.getLogger(RealtimeController.class);
	private static final String TOPICO_BASE = "/topic/realtime/unidades-sondas/";

	private final SimpMessagingTemplate messagingTemplate;
	private final SondaMonitoramentoService monitoramentoService;

	public RealtimeController(SimpMessagingTemplate messagingTemplate,
			SondaMonitoramentoService monitoramentoService) {
		this.messagingTemplate = messagingTemplate;
		this.monitoramentoService = monitoramentoService;
	}

	@MessageMapping("/realtime/estado")
	public void receberEstado(@Payload EstadoRealtimeDTO estado, Principal remetente) {
		if (estado == null || estado.unidadeSondaId() == null) {
			log.warn("Estado descartado: unidadeSondaId ausente.");
			return;
		}

		String username = remetente == null ? null : remetente.getName();

		// O Desktop tambem e um usuario do sistema: so pode publicar para a unidade a que tem
		// acesso. Sem isto, uma instalacao mal configurada (ou forjada) sobrescreveria a tela
		// de outra sonda.
		if (!monitoramentoService.usuarioPossuiAcessoAUnidade(username, estado.unidadeSondaId())) {
			log.warn("Publicacao NEGADA: usuario={} tentou publicar na unidade={}",
					username, estado.unidadeSondaId());
			throw new WebSocketNaoAutorizadoException("Sem permissao para publicar nesta Unidade/Sonda.");
		}

		// Carimba o instante de recepcao se o produtor nao informou — a tela precisa saber
		// quao recente e o dado para sinalizar defasagem.
		EstadoRealtimeDTO paraEnviar = estado.timestamp() != null
				? estado
				: comTimestamp(estado, Instant.now());

		messagingTemplate.convertAndSend(TOPICO_BASE + estado.unidadeSondaId(), paraEnviar);

		if (log.isTraceEnabled()) {
			log.trace("Estado retransmitido: unidade={} timestamp={}",
					paraEnviar.unidadeSondaId(), paraEnviar.timestamp());
		}
	}

	private EstadoRealtimeDTO comTimestamp(EstadoRealtimeDTO estado, Instant timestamp) {
		return new EstadoRealtimeDTO(estado.unidadeSondaId(), timestamp, estado.pesoColuna(),
				estado.torqueTubos(), estado.torqueFlutuante(), estado.pressaoBomba(),
				estado.vazao(), estado.strokeAtual());
	}
}
