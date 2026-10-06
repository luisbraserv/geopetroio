package com.braserv.core.identidade;

import com.braserv.core.config.ApiExceptionHandler;
import com.braserv.core.identidade.recuperacao.*;
import com.braserv.core.identidade.smtp.*;
import com.braserv.core.identidade.token.ChavesDeAssinatura;
import com.braserv.core.identidade.token.JwksController;
import com.braserv.core.regional.adapter.in.web.RegionalController;
import com.braserv.core.regional.application.service.RegionalService;
import com.braserv.core.identidade.adapter.in.web.AutenticacaoController;
import com.braserv.core.identidade.adapter.in.web.request.AutenticacaoRequest;
import com.braserv.core.identidade.application.AutenticacaoUseCase;
import com.braserv.core.identidade.application.ContaAtivaVerificador;
import com.braserv.core.identidade.application.port.out.TokenPort;
import com.braserv.core.identidade.config.JwtAuthenticationFilter;
import com.braserv.core.identidade.config.SecurityConfig;
import com.braserv.core.usuario.adapter.in.web.UsuarioController;
import com.braserv.core.usuario.application.port.in.BuscarUsuarioInputPort;
import com.braserv.core.usuario.application.port.in.CriarUsuarioInputPort;
import com.braserv.core.usuario.application.usecase.*;
import org.junit.jupiter.api.*;
import org.springframework.context.annotation.*;
import org.springframework.mock.web.MockServletContext;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;
import java.util.Set;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Controllers e cadeia de filtros reais, sem banco ou servidor externo. */
class IdentidadeHttpSecurityTest {
    private static final String AUTH = "/api/auth";
    private static final String USERS = "/api/usuarios";
    private static final String CONTACT = """
        {"nome":"Ana","telefone":"71999999999","email":"ana@example.test"}
        """;
    @Configuration @EnableWebMvc @EnableWebSecurity
    @Import({SecurityConfig.class, AutenticacaoController.class, UsuarioController.class,
        RegionalController.class, RecoveryController.class, SmtpSettingsController.class, JwksController.class, ApiExceptionHandler.class})
    static class Config {
        @Bean ChavesDeAssinatura chaves() throws Exception {
            var gerador = java.security.KeyPairGenerator.getInstance("RSA");
            gerador.initialize(2048);
            return ChavesDeAssinatura.de((java.security.interfaces.RSAPrivateCrtKey) gerador.generateKeyPair().getPrivate(), java.util.List.of());
        }
        @Bean SmtpSettingsService smtpSettings() { return mock(SmtpSettingsService.class); }
        @Bean SmtpTransport smtpTransport() { return mock(SmtpTransport.class); }
        @Bean RecoveryService recovery() { return mock(RecoveryService.class); }
        @Bean AutenticacaoUseCase login() { return mock(AutenticacaoUseCase.class); }
        @Bean CriarUsuarioInputPort create() { return mock(CriarUsuarioInputPort.class); }
        @Bean BuscarUsuarioInputPort find() { return mock(BuscarUsuarioInputPort.class); }
        @Bean AtivarUsuarioUseCase activate() { return mock(AtivarUsuarioUseCase.class); }
        @Bean AtualizarUsuarioUseCase update() { return mock(AtualizarUsuarioUseCase.class); }
        @Bean AlterarSenhaUsuarioUseCase password() { return mock(AlterarSenhaUsuarioUseCase.class); }
        @Bean DesativarUsuarioUseCase deactivate() { return mock(DesativarUsuarioUseCase.class); }
        @Bean RegionalService regional() { return mock(RegionalService.class); }
        @Bean TokenPort token() { return mock(TokenPort.class); }
        @Bean ContaAtivaVerificador activeAccount() { return mock(ContaAtivaVerificador.class); }
        @Bean JwtAuthenticationFilter jwt(TokenPort token, ContaAtivaVerificador active) {
            return new JwtAuthenticationFilter(token, active);
        }
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

    @Test void loginIsPublicAndKeepsTheRequestContract() throws Exception {
        mvc.perform(post(AUTH + "/login").contentType("application/json")
            .content("{\"username\":\"ana\",\"password\":\"test-only\"}"))
            .andExpect(status().isOk());
        verify(context.getBean(AutenticacaoUseCase.class)).autenticar(new AutenticacaoRequest("ana", "test-only"));
    }

    @Test void recoveryPostsArePublicButOtherMethodsStayProtected() throws Exception {
        String path = AUTH + "/recuperacao-senha";
        mvc.perform(post(path).contentType("application/json").content("{\"email\":\"ana@example.test\"}"))
            .andExpect(status().isAccepted());
        mvc.perform(post(path + "/confirmar").contentType("application/json")
            .content("{\"token\":\"" + "x".repeat(43) + "\",\"novaSenha\":\"NovaSenha1!\",\"confirmacaoSenha\":\"NovaSenha1!\"}"))
            .andExpect(status().isNoContent());
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(get(path + "/confirmar")).andExpect(status().isUnauthorized());
        verify(context.getBean(RecoveryService.class)).request("ana@example.test");
        verify(context.getBean(RecoveryService.class)).confirm("x".repeat(43), "NovaSenha1!", "NovaSenha1!");
    }

    /** RN-086: configuracao e de ADMIN e SUPORTE; os demais perfis nao entram. */
    @Test void smtpSettingsAreRestrictedToAdminAndSuporteForEveryOperation() throws Exception {
        String path = "/api/configuracoes/email";
        String payload = """
            {"enabled":false,"host":"","port":587,"transport":"STARTTLS","auth":false,
             "username":"","password":"","clearPassword":false,"from":"","frontendUrl":"","version":null}
            """;
        mvc.perform(get(path)).andExpect(status().isUnauthorized());
        mvc.perform(put(path).contentType("application/json").content(payload)).andExpect(status().isUnauthorized());
        mvc.perform(post(path + "/teste")).andExpect(status().isUnauthorized());
        for (String role : new String[]{"INTERNO", "CLIENTE", "MONITORAMENTO", "MONITORAMENTO_REAL", "SIMULADOR", "CIMENTACAO"}) {
            mvc.perform(get(path).with(user("ana").roles(role))).andExpect(status().isForbidden());
            mvc.perform(put(path).with(user("ana").roles(role)).contentType("application/json").content(payload)).andExpect(status().isForbidden());
            mvc.perform(post(path + "/teste").with(user("ana").roles(role))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(context.getBean(SmtpSettingsService.class), context.getBean(SmtpTransport.class));
        for (String role : new String[]{"ADMIN", "SUPORTE"}) {
            mvc.perform(get(path).with(user("u").roles(role))).andExpect(status().isOk());
            mvc.perform(put(path).with(user("u").roles(role)).contentType("application/json").content(payload)).andExpect(status().isOk());
            mvc.perform(post(path + "/teste").with(user("u").roles(role))).andExpect(status().isOk());
        }
        verify(context.getBean(SmtpSettingsService.class), times(2)).save(any());
        verify(context.getBean(SmtpTransport.class), times(2)).test(any());
    }

    /**
     * A fronteira que define o SUPORTE: ele configura o sistema, mas nao administra cadastro.
     * Sem isto, acrescentar a role oitava viraria um segundo ADMIN por descuido.
     */
    @Test void suporteConfiguresButDoesNotReachRegistries() throws Exception {
        mvc.perform(get("/api/configuracoes/email").with(user("sup").roles("SUPORTE")))
            .andExpect(status().isOk());

        for (String path : new String[]{USERS, "/api/empresas", "/api/regionais"}) {
            mvc.perform(get(path).with(user("sup").roles("SUPORTE"))).andExpect(status().isForbidden());
        }
        mvc.perform(post(USERS + "/internos").with(user("sup").roles("SUPORTE"))
            .contentType("application/json").content(CONTACT)).andExpect(status().isForbidden());

        verifyNoInteractions(context.getBean(CriarUsuarioInputPort.class));
    }

    @Test void invalidSmtpPortIsRejectedBeforeSaving() throws Exception {
        mvc.perform(put("/api/configuracoes/email").with(user("admin").roles("ADMIN")).contentType("application/json")
            .content("""
                {"enabled":false,"host":"","port":70000,"transport":"TLS","auth":false,
                 "username":"","password":"","clearPassword":false,"from":"","frontendUrl":"","version":null}
                """)).andExpect(status().isBadRequest());
        verifyNoInteractions(context.getBean(SmtpSettingsService.class));
    }

    @Test void recoveryDtosDoNotExposeSecretsInDiagnosticText() {
        String token = "x".repeat(43);
        var confirm = new RecoveryController.Confirm(token, "Sensitive1!", "Sensitive1!");
        assertFalse(confirm.toString().contains(token));
        assertFalse(confirm.toString().contains("Sensitive1!"));
        assertFalse(new RecoveryController.Request("ana@example.test").toString().contains("ana@example.test"));
    }

    @Test void malformedRecoveryRequestsNeverReachService() throws Exception {
        String path = AUTH + "/recuperacao-senha";
        mvc.perform(post(path).contentType("application/json").content("{\"email\":\"invalid\"}"))
            .andExpect(status().isBadRequest());
        mvc.perform(post(path + "/confirmar").contentType("application/json")
            .content("{\"token\":\"bad\",\"novaSenha\":\"NovaSenha1!\",\"confirmacaoSenha\":\"NovaSenha1!\"}"))
            .andExpect(status().isBadRequest());
        verifyNoInteractions(context.getBean(RecoveryService.class));
    }

    @Test void anonymousCannotReadOrChangeUsers() throws Exception {
        mvc.perform(get(USERS)).andExpect(status().isUnauthorized());
        mvc.perform(patch(USERS + "/me").contentType("application/json").content(CONTACT))
            .andExpect(status().isUnauthorized());
        mvc.perform(patch(USERS + "/me/senha").contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
        verifyNoInteractions(context.getBean(BuscarUsuarioInputPort.class), context.getBean(AtualizarUsuarioUseCase.class),
            context.getBean(AlterarSenhaUsuarioUseCase.class));
    }

    @Test void everyAuthenticatedRoleCanChangeItsOwnContactAndPassword() throws Exception {
        for (String role : new String[]{"INTERNO", "CLIENTE", "MONITORAMENTO", "MONITORAMENTO_REAL", "SIMULADOR", "CIMENTACAO", "ADMIN"}) {
            mvc.perform(patch(USERS + "/me").with(user("ana").roles(role))
                .contentType("application/json").content(CONTACT)).andExpect(status().isOk());
            mvc.perform(patch(USERS + "/me/senha").with(user("ana").roles(role))
                .contentType("application/json").content("{\"senhaAtual\":\"old\",\"novaSenha\":\"new\",\"confirmacaoSenha\":\"new\"}"))
                .andExpect(status().isOk());
        }
        verify(context.getBean(AtualizarUsuarioUseCase.class), times(7)).atualizar(eq("ana"), any());
        verify(context.getBean(AlterarSenhaUsuarioUseCase.class), times(7)).alterar(eq("ana"), any());
    }

    @Test void nonAdminsCannotListCreateOrChangeOtherUsers() throws Exception {
        for (String role : new String[]{"INTERNO", "CLIENTE", "MONITORAMENTO", "MONITORAMENTO_REAL", "SIMULADOR", "CIMENTACAO"}) {
            mvc.perform(get(USERS).with(user("ana").roles(role))).andExpect(status().isForbidden());
            mvc.perform(get(USERS + "/outro").with(user("ana").roles(role))).andExpect(status().isForbidden());
            for (String suffix : new String[]{"/outro", "/outro/ativar", "/outro/desativar"}) {
                mvc.perform(patch(USERS + suffix).with(user("ana").roles(role))
                    .contentType("application/json").content(CONTACT)).andExpect(status().isForbidden());
            }
            for (String suffix : new String[]{"/clientes", "/internos"}) {
                mvc.perform(post(USERS + suffix).with(user("ana").roles(role))
                    .contentType("application/json").content("{}")).andExpect(status().isForbidden());
            }
        }
        verifyNoInteractions(context.getBean(CriarUsuarioInputPort.class), context.getBean(BuscarUsuarioInputPort.class),
            context.getBean(AtualizarUsuarioUseCase.class), context.getBean(AtivarUsuarioUseCase.class),
            context.getBean(DesativarUsuarioUseCase.class));
    }

    @Test void adminCanListUpdateAndChangeStatus() throws Exception {
        mvc.perform(get(USERS).with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        mvc.perform(patch(USERS + "/outro").with(user("admin").roles("ADMIN"))
            .contentType("application/json").content(CONTACT)).andExpect(status().isOk());
        mvc.perform(patch(USERS + "/outro/ativar").with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        mvc.perform(patch(USERS + "/outro/desativar").with(user("admin").roles("ADMIN"))).andExpect(status().isOk());
        verify(context.getBean(AtualizarUsuarioUseCase.class)).atualizar(eq("outro"), any());
        verify(context.getBean(AtivarUsuarioUseCase.class)).ativar("outro");
        verify(context.getBean(DesativarUsuarioUseCase.class)).desativar("outro");
    }

    @Test void regionalAndOperationalCatalogRestrictionsRemainIntact() throws Exception {
        mvc.perform(get("/api/regionais").with(user("ana").roles("INTERNO"))).andExpect(status().isOk());
        mvc.perform(post("/api/regionais").with(user("cliente").roles("CLIENTE"))
            .contentType("application/json").content("{}")).andExpect(status().isForbidden());
        mvc.perform(delete("/api/regionais/1").with(user("cliente").roles("CLIENTE"))).andExpect(status().isForbidden());
        for (String path : new String[]{"/api/setores", "/api/unidades"}) {
            mvc.perform(get(path).with(user("cliente").roles("CLIENTE"))).andExpect(status().isForbidden());
            // CIMENTACAO virou permissao de dominio e passou a ser combinavel com CLIENTE
            // (Simulador de Cimentacao). Enquanto ela estava nesta lista de roles, esse cliente
            // lia a lista de setores e a frota inteira — cadastro interno, que a role nao concede.
            mvc.perform(get(path).with(user("cliente").roles("CLIENTE", "SIMULADOR", "CIMENTACAO")))
                .andExpect(status().isForbidden());
        }
    }

    @Test void bearerAuthenticationChecksAccountStatusAndRejectsInvalidTokens() throws Exception {
        var token = context.getBean(TokenPort.class);
        var active = context.getBean(ContaAtivaVerificador.class);
        when(token.extrairUsername("test-token")).thenReturn("ana");
        when(token.tokenValido("test-token")).thenReturn(true);
        when(token.extrairRoles("test-token")).thenReturn(Set.of("INTERNO"));
        when(active.ativa("ana")).thenReturn(true);
        mvc.perform(patch(USERS + "/me").header("Authorization", "Bearer test-token")
            .contentType("application/json").content(CONTACT)).andExpect(status().isOk());
        when(active.ativa("ana")).thenReturn(false);
        mvc.perform(patch(USERS + "/me").header("Authorization", "Bearer test-token")
            .contentType("application/json").content(CONTACT)).andExpect(status().isUnauthorized());
        mvc.perform(get(USERS).header("Authorization", "Bearer invalid-token")).andExpect(status().isUnauthorized());
        verify(context.getBean(AtualizarUsuarioUseCase.class), times(1)).atualizar(eq("ana"), any());
    }

    @Test void selfServiceExceptionDoesNotAuthorizeStatusChangesForUsernameMe() throws Exception {
        for (String suffix : new String[]{"/me/ativar", "/me/desativar"}) {
            mvc.perform(patch(USERS + suffix).with(user("ana").roles("INTERNO"))).andExpect(status().isForbidden());
        }
        verifyNoInteractions(context.getBean(AtivarUsuarioUseCase.class), context.getBean(DesativarUsuarioUseCase.class));
    }

    @Test void legacyUrlsNoLongerReachControllers() throws Exception {
        mvc.perform(post("/auth/login").with(user("admin").roles("ADMIN"))
            .contentType("application/json").content("{}")).andExpect(status().isNotFound());
        mvc.perform(get("/usuarios").with(user("admin").roles("ADMIN"))).andExpect(status().isNotFound());
        verifyNoInteractions(context.getBean(AutenticacaoUseCase.class), context.getBean(BuscarUsuarioInputPort.class));
    }

    @Test void preflightAcceptsTheConfiguredWebOrigin() throws Exception {
        mvc.perform(options(USERS + "/me").header("Origin", "http://localhost:4200")
            .header("Access-Control-Request-Method", "PATCH")
            .header("Access-Control-Request-Headers", "authorization,content-type")).andExpect(status().isOk());
    }

    /** RN-117: a chave publica e servida sem login, e so ela — nada que permita assinar. */
    @Test void jwksIsPublicAndExposesOnlyThePublicKey() throws Exception {
        var chaves = context.getBean(ChavesDeAssinatura.class);
        mvc.perform(get("/.well-known/jwks.json"))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.keys[0].kid").value(chaves.kidAtual()))
            .andExpect(jsonPath("$.keys[0].alg").value("RS256"))
            .andExpect(jsonPath("$.keys[0].d").doesNotExist())
            .andExpect(jsonPath("$.keys[0].p").doesNotExist());
    }
}
