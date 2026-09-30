package com.geopetro.realtime;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.messaging.simp.SimpMessagingTemplate;

import com.geopetro.alarmes.AlarmeAtivo;
import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;
import com.geopetro.alarmes.MotorDeAlarmes;
import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;
import com.geopetro.realtime.dto.EstadoRealtimeDTO;
import com.geopetro.realtime.dto.EstadoRealtimeDTO.LeituraRealtimeDTO;

/**
 * O canal de tempo real levando as leituras <b>e</b> o que elas provocaram.
 *
 * <p>⚠️ O destaque descreve ESTES numeros. Se a projecao viajasse por fora, a tela mostraria um
 * valor com o destaque do ciclo anterior — um alarme aceso sobre um numero que ja voltou a faixa.
 */
class RealtimeControllerTest {

	private static final String TOPICO = "/topic/realtime/unidades-sondas/7";
	private static final Principal ANA = () -> "ana";

	private SimpMessagingTemplate mensagens;
	private ConfiguracaoSondaAccess acesso;
	private MotorDeAlarmes alarmes;
	private RealtimeController controller;

	@BeforeEach
	void setup() {
		mensagens = mock(SimpMessagingTemplate.class);
		acesso = mock(ConfiguracaoSondaAccess.class);
		alarmes = mock(MotorDeAlarmes.class);
		controller = new RealtimeController(mensagens, acesso, alarmes);
		when(acesso.permite("ana", 7L)).thenReturn(true);
		when(alarmes.avaliar(anyLong(), anyList())).thenReturn(List.of());
	}

	private static EstadoRealtimeDTO estado(Instant timestamp) {
		var leitura = new LeituraRealtimeDTO("PRESSAO_01", null, "PRESSAO", "psi", "DBW10", 130.0, null);
		return new EstadoRealtimeDTO(7L, timestamp, List.of(leitura), null);
	}

	private EstadoRealtimeDTO retransmitido() {
		var capturado = ArgumentCaptor.forClass(EstadoRealtimeDTO.class);
		verify(mensagens).convertAndSend(eq(TOPICO), capturado.capture());
		return capturado.getValue();
	}

	@Test
	void aProjecaoDesteCicloViajaJuntoDasLeiturasQueAProvocaram() {
		var alarme = new AlarmeAtivo(7, "PRESSAO_01", null, "ep-1", Severidade.CRITICO,
				Instant.parse("2026-09-09T12:00:00Z"), 130.0, LimiteViolado.MAX);
		when(alarmes.avaliar(eq(7L), anyList())).thenReturn(List.of(alarme));

		controller.receberEstado(estado(Instant.parse("2026-09-09T12:00:01Z")), ANA);

		assertThat(retransmitido().alarmes()).containsExactly(alarme);
	}

	/**
	 * ⚠️ Retransmitir e o que faz a tela existir; avaliar produz historico. Uma falha do motor —
	 * banco fora, limite corrompido — nao pode apagar a tela de quem esta olhando a sonda.
	 */
	@Test
	void falhaDoMotorNaoImpedeARetransmissao() {
		when(alarmes.avaliar(anyLong(), anyList())).thenThrow(new IllegalStateException("banco fora"));
		var ultimaConhecida = new AlarmeAtivo(7, "PRESSAO_01", null, "ep-1", Severidade.ATENCAO,
				Instant.parse("2026-09-09T12:00:00Z"), 105.0, LimiteViolado.MAX);
		when(alarmes.ativos(7L)).thenReturn(List.of(ultimaConhecida));

		controller.receberEstado(estado(Instant.parse("2026-09-09T12:00:01Z")), ANA);

		assertThat(retransmitido().alarmes())
				.as("o alarme que ja estava aceso continua aceso: apaga-lo por falha de escrita seria pior")
				.containsExactly(ultimaConhecida);
	}

	@Test
	void semTimestampDoProdutorOServidorCarimbaORecebimento() {
		controller.receberEstado(estado(null), ANA);
		assertThat(retransmitido().timestamp()).isNotNull();
	}

	@Test
	void publicacaoParaUnidadeSemAcessoNaoAvaliaNemRetransmite() {
		when(acesso.permite("ana", 7L)).thenReturn(false);

		assertThatThrownBy(() -> controller.receberEstado(estado(Instant.now()), ANA))
				.isInstanceOf(WebSocketNaoAutorizadoException.class);

		verify(alarmes, never()).avaliar(anyLong(), anyList());
		verify(mensagens, never()).convertAndSend(eq(TOPICO), any(EstadoRealtimeDTO.class));
	}

	@Test
	void estadoSemUnidadeEDescartadoSemAvaliarNada() {
		controller.receberEstado(new EstadoRealtimeDTO(null, Instant.now(), List.of(), null), ANA);

		verify(alarmes, never()).avaliar(anyLong(), anyList());
		verify(mensagens, never()).convertAndSend(eq(TOPICO), any(EstadoRealtimeDTO.class));
	}

	/**
	 * ⚠️ Um ciclo e um INSTANTE: duas leituras da mesma grandeza nele nao sao serie temporal.
	 *
	 * <p>Aceitar o payload faria dois episodios nascerem para uma excursao so — e ficar com "a
	 * ultima" esconderia um produtor quebrado atras de um resultado plausivel.
	 */
	@Test
	@DisplayName("ciclo com grandeza repetida e descartado inteiro")
	void cicloComIdentidadeRepetidaEDescartado() {
		var uma = new LeituraRealtimeDTO("PRESSAO_01", null, "PRESSAO", "psi", "DBW10", 130.0, null);
		var outra = new LeituraRealtimeDTO("PRESSAO_01", null, "PRESSAO", "psi", "DBW10", 131.0, null);

		controller.receberEstado(new EstadoRealtimeDTO(7L, Instant.now(), List.of(uma, outra), null), ANA);

		verify(alarmes, never()).avaliar(anyLong(), anyList());
		verify(mensagens, never()).convertAndSend(eq(TOPICO), any(EstadoRealtimeDTO.class));
	}

	/** RN-098: as tres series de um contador compartilham o dispositivoId e nao sao repeticao. */
	@Test
	void seriesDiferentesDoMesmoDispositivoNaoSaoRepeticao() {
		var vazao = new LeituraRealtimeDTO("CONTADOR_01", "vazao", "VAZAO", "bpm", "DBW20", 9.0, null);
		var volume = new LeituraRealtimeDTO("CONTADOR_01", "volumeAcumulado", "VOLUME", "bbl", "DBW20",
				300.0, null);

		controller.receberEstado(
				new EstadoRealtimeDTO(7L, Instant.now(), List.of(vazao, volume), null), ANA);

		verify(mensagens).convertAndSend(eq(TOPICO), any(EstadoRealtimeDTO.class));
	}

	/** Serie vazia e serie ausente sao a mesma grandeza — o mesmo criterio do motor. */
	@Test
	void serieVaziaEAusenteContamComoAMesmaGrandeza() {
		var semSerie = new LeituraRealtimeDTO("PRESSAO_01", null, "PRESSAO", "psi", "DBW10", 130.0, null);
		var serieVazia = new LeituraRealtimeDTO("PRESSAO_01", "  ", "PRESSAO", "psi", "DBW10", 131.0, null);

		controller.receberEstado(
				new EstadoRealtimeDTO(7L, Instant.now(), List.of(semSerie, serieVazia), null), ANA);

		verify(alarmes, never()).avaliar(anyLong(), anyList());
	}
}
