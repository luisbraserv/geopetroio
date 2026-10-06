package com.geopetro.security;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Import;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import com.geopetro.config.ApiExceptionHandler;
import java.util.List;
import java.util.Optional;

import com.geopetro.monitoramento.UnidadeMonitoramentoController;
import com.geopetro.monitoramento.UnidadeMonitoramentoService;
import com.geopetro.monitoramento.dto.MonitoramentoSerieDTO;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.security.config.JwtAuthenticationFilter;
import com.geopetro.security.config.SecurityConfig;

/**
 * As rotas de {@code /api/sondas} nao tem todas a mesma regra, e a ordem delas no
 * {@code SecurityConfig} e o que faz a diferenca valer.
 *
 * <h2>O caso que este teste existe para impedir</h2>
 * A lista de sondas ({@code /minhas}) serve as <b>quatro</b> telas da area. Se ela exigir
 * {@code MONITORAMENTO}, quem recebeu apenas {@code MONITORAMENTO_REAL} entra no Tempo Real — o
 * guard do Front deixa — e toma 403 ao listar as sondas. O acesso estaria concedido e nao
 * funcionaria, com o sintoma ("nao aparece sonda nenhuma") longe da causa.
 *
 * <p>O caminho oposto tambem importa: as series <b>nao</b> podem cair na regra frouxa da area, senao
 * conceder so o tempo real passaria a dar a tela de series de brinde.
 */
class AreaMonitoramentoHttpSecurityTest {

	@Configuration
	@EnableWebMvc
	@EnableWebSecurity
	@Import({ SecurityConfig.class, UnidadeMonitoramentoController.class, ApiExceptionHandler.class })
	static class Config {
		@Bean
		UnidadeMonitoramentoService monitoramento() {
			return mock(UnidadeMonitoramentoService.class);
		}

		@Bean
		com.geopetro.security.braservcore.TokensDoCore tokensDoCore() {
			return mock(com.geopetro.security.braservcore.TokensDoCore.class);
		}

		@Bean
		JwtAuthenticationFilter jwtAuthenticationFilter() {
			return new JwtAuthenticationFilter(mock(TokenPort.class), mock(ContaAtivaVerificador.class));
		}
	}

	private static final String MINHAS = "/api/monitoramento/unidades/minhas";
	private static final String SERIE = "/api/monitoramento/unidades/3/series"
			+ "?dispositivoId=PRESSAO_01&inicio=2026-09-17T00:00:00Z&fim=2026-09-17T01:00:00Z";

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

	@Test
	@DisplayName("a lista de unidades aceita qualquer uma das duas permissoes de monitoramento")
	void listaDeUnidadesAceitaAsDuasPermissoes() throws Exception {
		mvc.perform(get(MINHAS)).andExpect(status().isUnauthorized());

		String[][] comAcesso = {
			{"ADMIN"},
			{"CLIENTE", "MONITORAMENTO"},
			{"CLIENTE", "MONITORAMENTO_REAL"},
			{"INTERNO", "MONITORAMENTO"},
			{"INTERNO", "MONITORAMENTO_REAL"},
		};
		for (String[] roles : comAcesso) {
			mvc.perform(get(MINHAS).with(user("ana").roles(roles))).andExpect(status().isOk());
		}
	}

	@Test
	@DisplayName("quem nao esta na area de monitoramento nao lista unidade alguma")
	void foraDaAreaNaoLista() throws Exception {
		String[][] semAcesso = {
			{"CLIENTE"}, {"INTERNO"}, {"SUPORTE"},
			{"MONITORAMENTO"},                                 // permissao sem tipo de conta
			{"CLIENTE", "SIMULADOR", "CIMENTACAO"},            // area errada
		};
		for (String[] roles : semAcesso) {
			mvc.perform(get(MINHAS).with(user("ana").roles(roles))).andExpect(status().isForbidden());
		}
		verifyNoInteractions(context.getBean(UnidadeMonitoramentoService.class));
	}

	@Test
	@DisplayName("as series exigem MONITORAMENTO; o tempo real nao as abre")
	void seriesExigemMonitoramento() throws Exception {
		var service = context.getBean(UnidadeMonitoramentoService.class);
		// Sem este duble, TODA resposta seria 403 — a do filtro e a do controller — e o teste
		// passaria sem distinguir quem barrou.
		when(service.usuarioPossuiAcessoAUnidade(any(), any())).thenReturn(true);
		when(service.consultarSerie(any(), org.mockito.ArgumentMatchers.anyLong(), any(), any(), any(), any()))
				.thenReturn(Optional.of(new MonitoramentoSerieDTO("UC-01", "PRESSAO_01", null, List.of())));

		mvc.perform(get(SERIE).with(user("ana").roles("CLIENTE", "MONITORAMENTO"))).andExpect(status().isOk());
		mvc.perform(get(SERIE).with(user("ana").roles("ADMIN"))).andExpect(status().isOk());
		verify(service, org.mockito.Mockito.times(2)).consultarSerie(any(), org.mockito.ArgumentMatchers.anyLong(), any(), any(), any(), any());

		mvc.perform(get(SERIE).with(user("ana").roles("CLIENTE", "MONITORAMENTO_REAL")))
				.andExpect(status().isForbidden());
		// E o barrado nao chegou ao servico: quem recusou foi a cadeia de filtros, nao o controller.
		verify(service, org.mockito.Mockito.times(2)).consultarSerie(any(), org.mockito.ArgumentMatchers.anyLong(), any(), any(), any(), any());
	}
}
