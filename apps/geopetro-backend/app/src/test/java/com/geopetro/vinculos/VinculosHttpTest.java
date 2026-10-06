package com.geopetro.vinculos;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Optional;
import java.util.Set;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import com.geopetro.config.ApiExceptionHandler;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.security.braservcore.TokensDoCore;
import com.geopetro.security.braservcore.TokensDoCore.ServicoAutenticado;
import com.geopetro.security.config.JwtAuthenticationFilter;
import com.geopetro.security.config.SecurityConfig;

/** Contrato braserv-core §5: so o core, com o escopo de vinculos, pergunta pelo uso de uma unidade. */
class VinculosHttpTest {

	/** Fontes controladas pelo teste: id 7 sem uso, 8 com limites, 9 com uma fonte fora do ar. */
	static final class Limites implements VinculoDaUnidade {
		@Override
		public Optional<String> descrever(long id) {
			return id == 8 ? Optional.of("limites de alarme configurados") : Optional.empty();
		}
	}

	static final class Telemetria implements VinculoDaUnidade {
		@Override
		public Optional<String> descrever(long id) {
			if (id == 9) {
				throw new FonteIndisponivelException("a Geopetro-Telemetria nao respondeu");
			}
			return id == 8 ? Optional.of("telemetria de 01/09/2026 a 05/09/2026") : Optional.empty();
		}
	}

	@Configuration
	@EnableWebMvc
	@EnableWebSecurity
	@Import({ SecurityConfig.class, VinculosController.class, ApiExceptionHandler.class })
	static class Config {
		@Bean
		TokensDoCore tokensDoCore() {
			TokensDoCore tokens = mock(TokensDoCore.class);
			when(tokens.servico(anyString())).thenReturn(Optional.empty());
			when(tokens.servico("do-core")).thenReturn(Optional.of(new ServicoAutenticado("braserv-core", Set.of("unidades:vinculos"))));
			when(tokens.servico("do-core-sem-escopo")).thenReturn(Optional.of(new ServicoAutenticado("braserv-core", Set.of("acesso:ler"))));
			when(tokens.servico("de-outro-sistema")).thenReturn(Optional.of(new ServicoAutenticado("almoxarifado", Set.of("unidades:vinculos"))));
			return tokens;
		}

		@Bean
		JwtAuthenticationFilter jwtAuthenticationFilter() {
			return new JwtAuthenticationFilter(mock(TokenPort.class), mock(ContaAtivaVerificador.class));
		}

		@Bean
		Limites limites() {
			return new Limites();
		}

		@Bean
		Telemetria telemetria() {
			return new Telemetria();
		}
	}

	private AnnotationConfigWebApplicationContext context;
	private MockMvc mvc;

	@BeforeEach
	void setup() {
		context = new AnnotationConfigWebApplicationContext();
		context.setServletContext(new MockServletContext());
		context.register(Config.class);
		context.refresh();
		mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
	}

	@AfterEach
	void close() {
		context.close();
	}

	private static String rota(long id) {
		return "/internal/v1/unidades/" + id + "/vinculos";
	}

	@Test
	@DisplayName("o core pergunta: unidade sem uso")
	void semUso() throws Exception {
		mvc.perform(get(rota(7)).header("Authorization", "Bearer do-core"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.emUso").value(false))
				.andExpect(jsonPath("$.vinculos.length()").value(0));
	}

	@Test
	@DisplayName("o core pergunta: unidade em uso, com todas as fontes que mostram o uso")
	void emUso() throws Exception {
		mvc.perform(get(rota(8)).header("Authorization", "Bearer do-core"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.emUso").value(true))
				.andExpect(jsonPath("$.vinculos.length()").value(2));
	}

	@Test
	@DisplayName("uma fonte fora do ar: 503, nunca 'sem uso'")
	void fonteIndisponivel() throws Exception {
		mvc.perform(get(rota(9)).header("Authorization", "Bearer do-core"))
				.andExpect(status().isServiceUnavailable())
				.andExpect(jsonPath("$.mensagem").value("a Geopetro-Telemetria nao respondeu"));
	}

	@Test
	@DisplayName("sem token, com token de pessoa ou de outro sistema: barrado")
	void soOCore() throws Exception {
		mvc.perform(get(rota(7))).andExpect(status().isUnauthorized());
		mvc.perform(get(rota(7)).header("Authorization", "Bearer token-de-pessoa")).andExpect(status().isUnauthorized());
		mvc.perform(get(rota(7)).header("Authorization", "Bearer de-outro-sistema")).andExpect(status().isForbidden());
		mvc.perform(get(rota(7)).header("Authorization", "Bearer do-core-sem-escopo")).andExpect(status().isForbidden());
		mvc.perform(get(rota(7)).with(user("admin").roles("ADMIN"))).andExpect(status().isForbidden());
	}

	@Test
	@DisplayName("outra rota interna nasce negada")
	void outraRotaInternaNegada() throws Exception {
		mvc.perform(get("/internal/v1/outra").header("Authorization", "Bearer do-core")).andExpect(status().isForbidden());
	}
}
