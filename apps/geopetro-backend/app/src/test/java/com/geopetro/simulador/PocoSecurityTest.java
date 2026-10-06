package com.geopetro.simulador;

import com.geopetro.security.config.*;
import com.geopetro.security.application.ContaAtivaVerificador;
import com.geopetro.security.application.port.out.TokenPort;
import com.geopetro.simulador.adapter.in.web.PocoController;
import com.geopetro.simulador.application.service.PocoService;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import org.springframework.test.web.servlet.*;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;

class PocoSecurityTest {
    @Configuration @EnableWebMvc @EnableWebSecurity
    @Import({SecurityConfig.class, PocoController.class, com.geopetro.config.ApiExceptionHandler.class})
    static class Config {
        @Bean PocoService pocoService() { return mock(PocoService.class); }
        @Bean JwtAuthenticationFilter jwtAuthenticationFilter() { return new JwtAuthenticationFilter(mock(TokenPort.class), mock(ContaAtivaVerificador.class)); }
        @Bean com.geopetro.security.braservcore.TokensDoCore tokensDoCore() { return mock(com.geopetro.security.braservcore.TokensDoCore.class); }
    }
    private AnnotationConfigWebApplicationContext context;
    private MockMvc mvc;
    @BeforeEach void setup() {
        context = new AnnotationConfigWebApplicationContext();
        context.setServletContext(new MockServletContext());
        context.register(Config.class);
        context.refresh();
        mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
    }
    @AfterEach void close() { context.close(); }
    /**
     * O simulador exige a COMBINACAO: tipo de conta + SIMULADOR (a area) + CIMENTACAO (o dominio).
     *
     * <p>Os dois ultimos casos sao o que uma lista de roles nao pegaria: uma permissao de modulo
     * sozinha, ou o par incompleto, nao abre a porta.
     */
    @Test void requiresAuthenticationAndSimulatorRoleForReadAndWrite() throws Exception {
        mvc.perform(get("/api/simulador/pocos")).andExpect(status().isUnauthorized());
        String[][] semAcesso = {
            {"CLIENTE"}, {"INTERNO"},
            {"SIMULADOR", "CIMENTACAO"},            // permissoes sem tipo de conta
            {"INTERNO", "SIMULADOR"},               // area sem o dominio
            {"CLIENTE", "CIMENTACAO"},              // dominio sem a area
        };
        for (String[] roles : semAcesso) {
            mvc.perform(get("/api/simulador/pocos").with(user("u").roles(roles))).andExpect(status().isForbidden());
            mvc.perform(delete("/api/simulador/pocos/1").with(user("u").roles(roles))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(context.getBean(PocoService.class));
    }
    @Test void allowsExistingSimulatorProfiles() throws Exception {
        String[][] comAcesso = {
            {"ADMIN"},
            {"INTERNO", "SIMULADOR", "CIMENTACAO"},
            {"CLIENTE", "SIMULADOR", "CIMENTACAO"},
        };
        for (String[] roles : comAcesso) {
            mvc.perform(get("/api/simulador/pocos").with(user("u").roles(roles))).andExpect(status().isOk());
            mvc.perform(delete("/api/simulador/pocos/1").with(user("u").roles(roles))).andExpect(status().isNoContent());
        }
    }

    @Test void returnsBadRequestForInvalidJsonAndConflictForStaleVersion() throws Exception {
        mvc.perform(post("/api/simulador/pocos").with(user("ana").roles("INTERNO", "SIMULADOR", "CIMENTACAO"))
                .contentType("application/json").content("{"))
                .andExpect(status().isBadRequest());
        mvc.perform(post("/api/simulador/pocos").with(user("ana").roles("INTERNO", "SIMULADOR", "CIMENTACAO"))
                .contentType("application/json").content("{\"nome\":\"\",\"geometria\":null}"))
                .andExpect(status().isBadRequest());
        verifyNoInteractions(context.getBean(PocoService.class));
        when(context.getBean(PocoService.class).atualizar(eq(1L), any(), eq("ana")))
                .thenThrow(new com.geopetro.comum.exception.BusinessException("Recarregue o poço.", org.springframework.http.HttpStatus.CONFLICT));
        String request = new tools.jackson.databind.json.JsonMapper().writeValueAsString(
                new com.geopetro.simulador.adapter.in.web.request.PocoRequest("Poço", PocoGeometryTest.vertical(1500), 0L));
        mvc.perform(put("/api/simulador/pocos/1").with(user("ana").roles("INTERNO", "SIMULADOR", "CIMENTACAO"))
                .contentType("application/json").content(request)).andExpect(status().isConflict());
    }
}
