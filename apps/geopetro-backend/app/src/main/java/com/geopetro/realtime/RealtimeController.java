package com.geopetro.realtime;

import java.security.Principal;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

import com.geopetro.alarmes.AlarmeAtivo;
import com.geopetro.alarmes.MotorDeAlarmes;
import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;
import com.geopetro.realtime.dto.EstadoRealtimeDTO;
import com.geopetro.realtime.dto.EstadoRealtimeDTO.LeituraRealtimeDTO;

/**
 * Recebe o estado publicado pelo Geopetro-Desktop e retransmite aos assinantes autorizados.
 *
 * <p><b>Nao persiste nada.</b> A responsabilidade deste canal e o "agora"; o historico segue por
 * MQTT -> Backend-Telemetria -> InfluxDB. Ver specs/SDD/software/apis/websocket-realtime.md.
 */
@Controller
public class RealtimeController {

	private static final Logger log = LoggerFactory.getLogger(RealtimeController.class);
	private static final String TOPICO_BASE = "/topic/realtime/unidades/";

	private final SimpMessagingTemplate messagingTemplate;
	private final ConfiguracaoSondaAccess acesso;
	private final MotorDeAlarmes alarmes;

	public RealtimeController(SimpMessagingTemplate messagingTemplate,
			ConfiguracaoSondaAccess acesso, MotorDeAlarmes alarmes) {
		this.messagingTemplate = messagingTemplate;
		this.acesso = acesso;
		this.alarmes = alarmes;
	}

	@MessageMapping("/realtime/estado")
	public void receberEstado(@Payload EstadoRealtimeDTO estado, Principal remetente) {
		if (estado == null || estado.unidadeId() == null) {
			log.warn("Estado descartado: unidadeId ausente.");
			return;
		}

		if (temIdentidadeRepetida(estado.leituras())) {
			log.warn("Estado descartado: a unidade={} repetiu uma grandeza no mesmo ciclo.",
					estado.unidadeId());
			return;
		}

		String username = remetente == null ? null : remetente.getName();

		// O Desktop tambem e um usuario do sistema: so pode publicar para a unidade a que tem
		// acesso. Sem isto, uma instalacao mal configurada (ou forjada) sobrescreveria a tela
		// de outra sonda. `permite` soma a conta ativa ao escopo (RN-062): desativar a conta da
		// estacao precisa interromper a publicacao, e nao so as chamadas HTTP dela.
		if (!acesso.permite(username, estado.unidadeId())) {
			log.warn("Publicacao NEGADA: usuario={} tentou publicar na unidade={}",
					username, estado.unidadeId());
			throw new WebSocketNaoAutorizadoException("Sem permissao para publicar nesta Unidade.");
		}

		// Carimba o instante de recepcao se o produtor nao informou — a tela precisa saber
		// quao recente e o dado para sinalizar defasagem.
		Instant timestamp = estado.timestamp() != null ? estado.timestamp() : Instant.now();

		EstadoRealtimeDTO paraEnviar = new EstadoRealtimeDTO(estado.unidadeId(), timestamp,
				estado.leituras(), avaliarAlarmes(estado));

		messagingTemplate.convertAndSend(TOPICO_BASE + estado.unidadeId(), paraEnviar);

		if (log.isTraceEnabled()) {
			log.trace("Estado retransmitido: unidade={} timestamp={} alarmes={}",
					paraEnviar.unidadeId(), paraEnviar.timestamp(), paraEnviar.alarmes().size());
		}
	}

	/**
	 * Um ciclo carrega <b>uma leitura por grandeza</b> — e a repetição é mensagem malformada.
	 *
	 * <h2>Por que descartar o ciclo inteiro, e não só a repetição</h2>
	 * Um ciclo é <b>um instante</b> da unidade: as leituras compartilham o mesmo relógio do servidor.
	 * Duas leituras da mesma grandeza no mesmo instante não são uma série temporal, e tratá-las como
	 * tal deixaria um tempo mínimo vencer sem tempo nenhum ter passado. Ficar com "a última" também
	 * não serve: esconderia um produtor quebrado atrás de um resultado plausível.
	 *
	 * <p>O log é o que torna a política visível — a unidade fica muda por um ciclo, e a causa está
	 * escrita. A próxima mensagem chega em 1s, e o canal já é declaradamente com perda.
	 *
	 * <p>⚠️ Isto é a <b>segunda</b> defesa, não a única. {@link com.geopetro.alarmes.MotorDeAlarmes}
	 * encadeia o estado dentro do ciclo mesmo que uma identidade se repita: nenhuma das duas sozinha
	 * cobre um chamador futuro que não passe por aqui.
	 */
	private static boolean temIdentidadeRepetida(List<LeituraRealtimeDTO> leituras) {
		if (leituras == null || leituras.size() < 2) {
			return false;
		}
		var vistas = new HashSet<String>();
		for (LeituraRealtimeDTO leitura : leituras) {
			if (leitura != null && !vistas.add(identidade(leitura))) {
				return true;
			}
		}
		return false;
	}

	/** Série vazia e série ausente são a mesma grandeza — o mesmo critério do motor (RN-098). */
	private static String identidade(LeituraRealtimeDTO leitura) {
		String serie = leitura.serie() == null || leitura.serie().isBlank() ? null : leitura.serie();
		return serie == null ? leitura.dispositivoId() : leitura.dispositivoId() + "|" + serie;
	}

	/**
	 * Avalia antes de retransmitir, e nunca deixa o alarme derrubar a tela.
	 *
	 * <h2>Por que antes, e não depois</h2>
	 * O destaque descreve <b>estas</b> leituras. Avaliar depois obrigaria a mandar o alarme por
	 * fora, e a tela mostraria um valor com o destaque do ciclo anterior — um alarme aceso sobre um
	 * número que já voltou à faixa. O custo é a consulta de limites entrar no caminho do ciclo, e
	 * ela é uma busca por chave primária.
	 *
	 * <h2>⚠️ Falha do motor não apaga a tela</h2>
	 * Retransmitir é o que faz a tela de tempo real existir; avaliar produz histórico. Uma exceção
	 * aqui — banco fora, limite corrompido — vira linha de log, e a mensagem segue com a última
	 * projeção conhecida em vez de nenhuma: o alarme que já estava aceso continua aceso, que é mais
	 * próximo da verdade do que apagá-lo por causa de uma falha de escrita.
	 */
	private List<AlarmeAtivo> avaliarAlarmes(EstadoRealtimeDTO estado) {
		try {
			return alarmes.avaliar(estado.unidadeId(), estado.leituras());
		} catch (RuntimeException e) {
			log.error("Alarmes nao avaliados para a unidade={}; a retransmissao seguiu normal.",
					estado.unidadeId(), e);
			return alarmes.ativos(estado.unidadeId());
		}
	}
}
