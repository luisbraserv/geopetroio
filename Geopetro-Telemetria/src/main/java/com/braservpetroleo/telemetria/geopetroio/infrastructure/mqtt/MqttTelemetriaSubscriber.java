package com.braservpetroleo.telemetria.geopetroio.infrastructure.mqtt;

import java.nio.charset.StandardCharsets;

import org.eclipse.paho.client.mqttv3.IMqttDeliveryToken;
import org.eclipse.paho.client.mqttv3.MqttCallbackExtended;
import org.eclipse.paho.client.mqttv3.MqttMessage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.braservpetroleo.telemetria.geopetroio.application.service.IngestaoTelemetriaService;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;

/**
 * Callback do cliente Paho: recebe as mensagens do broker e as encaminha para ingestao.
 *
 * <p><b>Este callback nunca lanca excecao.</b> No Paho, uma excecao propagada da
 * {@code messageArrived} derruba a conexao — uma unica mensagem malformada tiraria o servico do ar e
 * interromperia a telemetria da frota inteira. Toda falha e registrada e a mensagem descartada.
 */
public class MqttTelemetriaSubscriber implements MqttCallbackExtended {

	private static final Logger log = LoggerFactory.getLogger(MqttTelemetriaSubscriber.class);

	private final TelemetriaPayloadParser parser;
	private final IngestaoTelemetriaService ingestao;
	private final Runnable aoReconectar;

	public MqttTelemetriaSubscriber(TelemetriaPayloadParser parser, IngestaoTelemetriaService ingestao,
			Runnable aoReconectar) {
		this.parser = parser;
		this.ingestao = ingestao;
		this.aoReconectar = aoReconectar;
	}

	@Override
	public void connectComplete(boolean reconnect, String serverURI) {
		if (reconnect) {
			log.info("Reconectado ao broker {}. Reassinando o topico.", serverURI);
			// cleanSession=true descarta as assinaturas ao cair; sem reassinar, o cliente
			// reconectaria mas nao receberia mais nada — falha silenciosa.
			aoReconectar.run();
		}
		else {
			log.info("Conectado ao broker {}.", serverURI);
		}
	}

	@Override
	public void messageArrived(String topico, MqttMessage mensagem) {
		try {
			String payload = new String(mensagem.getPayload(), StandardCharsets.UTF_8);
			String unidade = extrairUnidade(topico);
			TelemetriaBatch batch = parser.parse(unidade, payload);
			ingestao.ingerir(batch);
		}
		catch (TelemetriaPayloadParser.PayloadInvalidoException e) {
			log.warn("Payload invalido no topico '{}': {}", topico, e.getMessage());
		}
		catch (Exception e) {
			log.error("Falha ao processar mensagem do topico '{}': {}", topico, e.getMessage(), e);
		}
	}

	@Override
	public void connectionLost(Throwable causa) {
		log.warn("Conexao com o broker perdida: {}. O cliente tentara reconectar automaticamente.",
				causa == null ? "motivo desconhecido" : causa.getMessage());
	}

	@Override
	public void deliveryComplete(IMqttDeliveryToken token) {
		// Este servico apenas consome; nunca publica.
	}

	/**
	 * Extrai a unidade de {@code telemetria/{unidade}/batch}.
	 *
	 * @return a unidade, ou null se o topico nao tiver o formato esperado
	 */
	static String extrairUnidade(String topico) {
		if (topico == null) {
			return null;
		}
		String[] partes = topico.split("/");
		return partes.length >= 2 ? partes[1] : null;
	}
}
