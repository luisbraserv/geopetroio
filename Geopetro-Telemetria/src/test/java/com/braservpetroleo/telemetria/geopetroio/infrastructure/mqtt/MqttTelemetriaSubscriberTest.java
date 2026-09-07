package com.braservpetroleo.telemetria.geopetroio.infrastructure.mqtt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.nio.charset.StandardCharsets;

import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.braservpetroleo.telemetria.geopetroio.application.service.IngestaoTelemetriaService;
import com.braservpetroleo.telemetria.geopetroio.domain.LeituraTelemetria;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;

import java.time.Instant;
import java.util.List;

class MqttTelemetriaSubscriberTest {

	private final TelemetriaPayloadParser parser = mock(TelemetriaPayloadParser.class);
	private final IngestaoTelemetriaService ingestao = mock(IngestaoTelemetriaService.class);
	private final MqttTelemetriaSubscriber subscriber =
			new MqttTelemetriaSubscriber(parser, ingestao, () -> {
			});

	@Test
	@DisplayName("extrai a unidade do topico telemetria/{unidade}/batch")
	void extraiUnidade() {
		assertThat(MqttTelemetriaSubscriber.extrairUnidade("telemetria/SPT-144/batch")).isEqualTo("SPT-144");
		assertThat(MqttTelemetriaSubscriber.extrairUnidade("telemetria")).isNull();
		assertThat(MqttTelemetriaSubscriber.extrairUnidade(null)).isNull();
	}

	@Test
	@DisplayName("encaminha o batch para ingestao")
	void encaminhaParaIngestao() {
		TelemetriaBatch batch = new TelemetriaBatch("SPT-144", Instant.now(),
				List.of(new LeituraTelemetria("VAZAO_01", "Vazao", "B001", "VAZAO", "bbl/min", 1.0, null, null)));
		when(parser.parse(any(), any())).thenReturn(batch);

		subscriber.messageArrived("telemetria/SPT-144/batch", mensagem("{}"));

		verify(ingestao).ingerir(batch);
	}

	@Test
	@DisplayName("payload invalido nao propaga excecao")
	void payloadInvalidoNaoPropaga() {
		// Uma excecao propagada daqui derruba a conexao no Paho — uma mensagem malformada tiraria
		// a telemetria da frota inteira do ar.
		when(parser.parse(any(), any()))
				.thenThrow(new TelemetriaPayloadParser.PayloadInvalidoException("json ruim"));

		subscriber.messageArrived("telemetria/SPT-144/batch", mensagem("lixo"));

		verify(ingestao, never()).ingerir(any());
	}

	@Test
	@DisplayName("falha na ingestao nao propaga excecao")
	void falhaNaIngestaoNaoPropaga() {
		TelemetriaBatch batch = new TelemetriaBatch("SPT-144", Instant.now(),
				List.of(new LeituraTelemetria("VAZAO_01", "Vazao", "B001", "VAZAO", "bbl/min", 1.0, null, null)));
		when(parser.parse(any(), any())).thenReturn(batch);
		doThrow(new RuntimeException("influx fora")).when(ingestao).ingerir(any());

		subscriber.messageArrived("telemetria/SPT-144/batch", mensagem("{}"));

		verify(ingestao).ingerir(batch);
	}

	private static MqttMessage mensagem(String payload) {
		return new MqttMessage(payload.getBytes(StandardCharsets.UTF_8));
	}
}
