package com.braservpetroleo.telemetria.geopetroio;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;

/**
 * Servico de telemetria do GeopetroIO.
 *
 * <p>Consome as leituras publicadas pelo Desktop-Sonda no broker MQTT, persiste no InfluxDB e expoe
 * uma API REST de consulta para o Backend-Sonda.
 *
 * <p>Papeis definidos em specs/contracts/mqtt-telemetria.md: ha exatamente um produtor
 * (Desktop-Sonda) e um consumidor (este servico).
 */
@SpringBootApplication
@ConfigurationPropertiesScan
public class TelemetriaGeopetroioApplication {

	public static void main(String[] args) {
		SpringApplication.run(TelemetriaGeopetroioApplication.class, args);
	}
}
