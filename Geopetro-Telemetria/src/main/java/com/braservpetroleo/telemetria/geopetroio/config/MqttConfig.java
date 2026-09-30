package com.braservpetroleo.telemetria.geopetroio.config;

import jakarta.annotation.PreDestroy;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.eclipse.paho.client.mqttv3.MqttConnectOptions;
import org.eclipse.paho.client.mqttv3.persist.MemoryPersistence;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;

import com.braservpetroleo.telemetria.geopetroio.application.service.IngestaoTelemetriaService;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.mqtt.MqttTelemetriaSubscriber;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.mqtt.TelemetriaPayloadParser;

/**
 * Conecta ao broker e assina o topico de telemetria.
 *
 * <p>Desativado no profile {@code test} — testes nao devem depender de um broker externo.
 */
@Configuration
@Profile("!test")
public class MqttConfig {

	private static final Logger log = LoggerFactory.getLogger(MqttConfig.class);

	private final MqttProperties properties;
	private MqttClient client;

	public MqttConfig(MqttProperties properties) {
		this.properties = properties;
	}

	@Bean
	public MqttClient mqttClient(TelemetriaPayloadParser parser, IngestaoTelemetriaService ingestao)
			throws Exception {

		// MemoryPersistence: este cliente so consome com cleanSession=true, entao nao ha estado
		// que valha a pena persistir em disco entre execucoes.
		client = new MqttClient(properties.getBrokerUrl(), properties.getClientId(), new MemoryPersistence());

		MqttConnectOptions opcoes = new MqttConnectOptions();
		opcoes.setAutomaticReconnect(true);
		opcoes.setCleanSession(properties.isCleanSession());
		opcoes.setConnectionTimeout(properties.getConnectionTimeoutSegundos());
		opcoes.setKeepAliveInterval(properties.getKeepAliveSegundos());

		if (properties.temCredenciais()) {
			opcoes.setUserName(properties.getUsername());
			opcoes.setPassword(properties.getPassword().toCharArray());
		}
		else {
			log.warn("Broker MQTT sem credenciais. Qualquer host com acesso de rede pode publicar "
					+ "telemetria forjada ou ler a telemetria da frota. Ver SEC-009 nas specs.");
		}

		client.setCallback(new MqttTelemetriaSubscriber(parser, ingestao, this::assinar));

		try {
			client.connect(opcoes);
			assinar();
		}
		catch (Exception e) {
			if (properties.isFalharSeBrokerIndisponivel()) {
				throw e;
			}
			// Nao impedir o startup e deliberado: a API REST de consulta continua util mesmo com o
			// broker fora, e o automaticReconnect do Paho assume quando ele voltar.
			log.error("Nao foi possivel conectar ao broker {} no startup: {}. "
					+ "A API de consulta segue disponivel e a conexao sera retentada.",
					properties.getBrokerUrl(), e.getMessage());
		}

		return client;
	}

	private void assinar() {
		try {
			client.subscribe(properties.getTopico(), properties.getQos());
			log.info("Assinado topico '{}' com QoS {}.", properties.getTopico(), properties.getQos());
		}
		catch (Exception e) {
			log.error("Falha ao assinar o topico '{}': {}", properties.getTopico(), e.getMessage(), e);
		}
	}

	@PreDestroy
	public void desconectar() {
		if (client == null) {
			return;
		}
		try {
			if (client.isConnected()) {
				client.disconnect();
			}
			client.close();
			log.info("Cliente MQTT encerrado.");
		}
		catch (Exception e) {
			log.warn("Falha ao encerrar o cliente MQTT: {}", e.getMessage());
		}
	}
}
