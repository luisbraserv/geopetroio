package com.braservpetroleo.telemetria.geopetroio.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.info.Info;

@Configuration
public class OpenApiConfig {

	@Bean
	public OpenAPI telemetriaOpenAPI() {
		return new OpenAPI().info(new Info()
				.title("GeopetroIO - Telemetria")
				.version("v1")
				.description("Ingestao de telemetria de sondas via MQTT e consulta de series no InfluxDB. "
						+ "Consumidor da API: Geopetro-Backend."));
	}
}
