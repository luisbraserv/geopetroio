package com.geopetro.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.oas.models.Components;
import io.swagger.v3.oas.models.info.Info;
import io.swagger.v3.oas.models.security.SecurityRequirement;
import io.swagger.v3.oas.models.security.SecurityScheme;

@Configuration
public class OpenApiConfig {

	@Bean
	OpenAPI geopetroOpenAPI() {
		return new OpenAPI()
				.components(new Components()
						.addSecuritySchemes("bearerAuth",
								new SecurityScheme()
										.type(SecurityScheme.Type.HTTP)
										.scheme("bearer")
										.bearerFormat("JWT")))
				.addSecurityItem(new SecurityRequirement().addList("bearerAuth"))
				.info(new Info()
						.title("Backend Sonda Geopetro IO")
						.description("API REST do Backend Sonda Geopetro IO. Use o endpoint de autenticação para obter o token JWT e informe-o no botão Authorize.")
						.version("0.0.1-SNAPSHOT"));
	}
}
