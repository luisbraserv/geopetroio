package com.braservpetroleo.telemetria.geopetroio.adapter.in.web;

import org.eclipse.paho.client.mqttv3.MqttClient;
import org.springframework.boot.actuate.health.Health;
import org.springframework.boot.actuate.health.HealthIndicator;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.braservpetroleo.telemetria.geopetroio.application.service.IngestaoTelemetriaService;
import com.influxdb.client.InfluxDBClient;

/**
 * Health indicators das duas dependencias externas.
 *
 * <p><b>Decisao importante sobre readiness.</b> Nenhum destes indicadores derruba o readiness da
 * aplicacao — ambos reportam {@code UP} com detalhe do estado, mesmo quando a dependencia esta fora.
 *
 * <p>O motivo: readiness em Kubernetes controla se o pod recebe trafego. Se o broker cair, a API de
 * consulta continua perfeitamente utilizavel (os dados ja gravados seguem no InfluxDB) — tirar o pod
 * do balanceador nesse caso transformaria uma falha parcial em indisponibilidade total. O mesmo vale
 * para o InfluxDB: derrubar o readiness so faria o Kubernetes reiniciar um pod saudavel em laco,
 * sem corrigir a dependencia.
 *
 * <p>O que estes indicadores fazem e dar <b>visibilidade</b>: quem consultar {@code /actuator/health}
 * ve exatamente qual dependencia esta degradada.
 */
@Configuration
public class TelemetriaHealthIndicators {

	@Bean
	public HealthIndicator mqttHealthIndicator(ObjectProvider<MqttClient> clientProvider,
			IngestaoTelemetriaService ingestao) {

		return () -> {
			MqttClient client = clientProvider.getIfAvailable();
			if (client == null) {
				return Health.up()
						.withDetail("estado", "desabilitado")
						.withDetail("observacao", "cliente MQTT nao configurado neste perfil")
						.build();
			}
			boolean conectado = client.isConnected();
			return Health.up()
					.withDetail("estado", conectado ? "conectado" : "desconectado")
					.withDetail("broker", client.getServerURI())
					.withDetail("ciclosRecebidos", ingestao.getCiclosRecebidos())
					.withDetail("leiturasGravadas", ingestao.getLeiturasGravadas())
					.build();
		};
	}

	@Bean
	public HealthIndicator influxHealthIndicator(InfluxDBClient client) {
		return () -> {
			try {
				boolean ok = client.ping();
				return Health.up().withDetail("estado", ok ? "acessivel" : "sem resposta").build();
			}
			catch (Exception e) {
				return Health.up()
						.withDetail("estado", "inacessivel")
						.withDetail("erro", e.getMessage())
						.build();
			}
		};
	}
}
