package com.braserv.core.interno;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.KeyPairGenerator;
import java.security.interfaces.RSAPrivateCrtKey;
import java.util.List;
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

import com.braserv.core.config.ApiExceptionHandler;
import com.braserv.core.identidade.adapter.out.JwtTokenAdapter;
import com.braserv.core.identidade.application.ContaAtivaVerificador;
import com.braserv.core.identidade.config.JwtAuthenticationFilter;
import com.braserv.core.identidade.config.SecurityConfig;
import com.braserv.core.identidade.servico.Escopo;
import com.braserv.core.identidade.servico.ServicoClienteController;
import com.braserv.core.identidade.servico.ServicoClienteEntity;
import com.braserv.core.identidade.servico.ServicoClienteService;
import com.braserv.core.identidade.token.ChavesDeAssinatura;
import com.braserv.core.identidade.token.TokenDeServico;
import com.braserv.core.regional.adapter.out.persistence.entity.RegionalEntity;
import com.braserv.core.setor.adapter.out.persistence.entity.SetorEntity;
import com.braserv.core.unidade.adapter.in.web.UnidadeController;
import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;
import com.braserv.core.unidade.application.service.UnidadeService;
import com.braserv.core.unidade.domain.TipoUnidade;
import com.braserv.core.usuario.application.port.out.UsuarioRepositoryPort;
import com.braserv.core.usuario.domain.model.Email;
import com.braserv.core.usuario.domain.model.Role;
import com.braserv.core.usuario.domain.model.Telefone;
import com.braserv.core.usuario.domain.model.UsuarioCliente;
import com.braserv.core.usuario.domain.model.UsuarioInterno;

/**
 * As duas cadeias de seguranca de verdade: rotas publicas com token de pessoa (RN-118 para unidades)
 * e rotas internas com token de servico e escopo (RN-117).
 */
class InternoHttpSecurityTest {

	@Configuration
	@EnableWebMvc
	@EnableWebSecurity
	@Import({ SecurityConfig.class, InternoSecurityConfig.class, InternoController.class, UnidadeController.class,
			ServicoClienteController.class, ApiExceptionHandler.class })
	static class Config {
		@Bean
		ChavesDeAssinatura chaves() throws Exception {
			KeyPairGenerator gerador = KeyPairGenerator.getInstance("RSA");
			gerador.initialize(2048);
			return ChavesDeAssinatura.de((RSAPrivateCrtKey) gerador.generateKeyPair().getPrivate(), List.of());
		}

		@Bean
		TokenDeServico tokenDeServico(ChavesDeAssinatura chaves) {
			return new TokenDeServico(chaves, 900);
		}

		@Bean
		JwtTokenAdapter jwtTokenAdapter(ChavesDeAssinatura chaves) {
			return new JwtTokenAdapter(chaves, 3600);
		}

		@Bean
		ContaAtivaVerificador contaAtiva() {
			ContaAtivaVerificador verificador = mock(ContaAtivaVerificador.class);
			when(verificador.ativa(anyString())).thenReturn(true);
			return verificador;
		}

		@Bean
		JwtAuthenticationFilter jwt(JwtTokenAdapter token, ContaAtivaVerificador ativa) {
			return new JwtAuthenticationFilter(token, ativa);
		}

		@Bean
		ServicoClienteService servicos() {
			return mock(ServicoClienteService.class);
		}

		@Bean
		UsuarioRepositoryPort usuarios() {
			return mock(UsuarioRepositoryPort.class);
		}

		@Bean
		UnidadeService unidades() {
			return mock(UnidadeService.class);
		}
	}

	private AnnotationConfigWebApplicationContext context;
	private MockMvc mvc;
	private TokenDeServico tokens;

	@BeforeEach
	void setup() {
		context = new AnnotationConfigWebApplicationContext();
		context.setServletContext(new MockServletContext());
		context.register(Config.class);
		context.refresh();
		mvc = MockMvcBuilders.webAppContextSetup(context).apply(springSecurity()).build();
		tokens = context.getBean(TokenDeServico.class);
		UnidadeService unidades = context.getBean(UnidadeService.class);
		when(unidades.listar(any(), any(), any(), any())).thenReturn(List.of(unidade()));
		when(unidades.buscar(any())).thenReturn(unidade());
		when(unidades.criar(any())).thenReturn(unidade());
		when(unidades.atualizar(any(), any())).thenReturn(unidade());
	}

	@AfterEach
	void close() {
		context.close();
	}

	private String bearer(String... escopos) {
		return "Bearer " + tokens.emitir("geopetro-backend", Set.of(escopos)).token();
	}

	private String bearerDePessoa() {
		var admin = new UsuarioInterno(1, "ana", "Senha@123", "Ana", Telefone.comTratamento("71999999999"),
				Email.comTratamento("ana@example.test"), null, Set.of(Role.INTERNO, Role.ADMIN));
		return "Bearer " + context.getBean(JwtTokenAdapter.class).gerar(admin);
	}

	private static UnidadeEntity unidade() {
		RegionalEntity regional = new RegionalEntity();
		regional.setId(1L);
		regional.setNome("Bahia");
		SetorEntity setor = new SetorEntity();
		setor.setId(2L);
		setor.setNome("Reconcavo");
		setor.setRegional(regional);
		UnidadeEntity u = new UnidadeEntity();
		u.setId(3L);
		u.setNome("SPT-144");
		u.setTipo(TipoUnidade.SONDA);
		u.setSetor(setor);
		return u;
	}

	// ---------- rotas internas ----------

	@Test
	@DisplayName("rota interna sem token responde 401")
	void internaSemToken() throws Exception {
		mvc.perform(get("/internal/v1/unidades")).andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("token de pessoa, mesmo de ADMIN, nao abre rota interna")
	void tokenDePessoaNaoAbreInterna() throws Exception {
		mvc.perform(get("/internal/v1/unidades").header("Authorization", bearerDePessoa()))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("token de servico nao abre rota publica")
	void tokenDeServicoNaoAbrePublica() throws Exception {
		mvc.perform(get("/api/unidades").header("Authorization", bearer(Escopo.UNIDADES_LER)))
				.andExpect(status().isUnauthorized());
	}

	@Test
	@DisplayName("cada rota interna exige o proprio escopo")
	void escopoPorRota() throws Exception {
		mvc.perform(get("/internal/v1/unidades").header("Authorization", bearer(Escopo.ACESSO_LER)))
				.andExpect(status().isForbidden());
		mvc.perform(get("/internal/v1/unidades").header("Authorization", bearer(Escopo.UNIDADES_LER)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$[0].nome").value("SPT-144"))
				.andExpect(jsonPath("$[0].status").value("ATIVA"))
				.andExpect(jsonPath("$[0].setorId").value(2));
		mvc.perform(get("/internal/v1/unidades/3").header("Authorization", bearer(Escopo.UNIDADES_LER)))
				.andExpect(status().isOk());
		mvc.perform(get("/internal/v1/usuarios/cli/acesso").header("Authorization", bearer(Escopo.UNIDADES_LER)))
				.andExpect(status().isForbidden());
	}

	@Test
	@DisplayName("rota interna sem regra nasce negada")
	void rotaInternaSemRegraNegada() throws Exception {
		mvc.perform(get("/internal/v1/outra").header("Authorization", bearer(Escopo.ACESSO_LER, Escopo.UNIDADES_LER)))
				.andExpect(status().isForbidden());
	}

	@Test
	@DisplayName("acesso do cliente traz tipo, estado, roles atuais e concessoes")
	void acessoDoCliente() throws Exception {
		var cliente = new UsuarioCliente(1, 3L, "Petro", "cli", "Senha@123", "Cliente",
				Telefone.comTratamento("71999999999"), Email.comTratamento("cli@example.test"), null,
				Set.of(Role.CLIENTE, Role.MONITORAMENTO), List.of(new UsuarioCliente.UnidadeRef(7L, "SPT-144", null)));
		when(context.getBean(UsuarioRepositoryPort.class).buscarPorUsername("cli")).thenReturn(Optional.of(cliente));

		mvc.perform(get("/internal/v1/usuarios/cli/acesso").header("Authorization", bearer(Escopo.ACESSO_LER)))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.tipo").value("CLIENTE"))
				.andExpect(jsonPath("$.ativo").value(true))
				.andExpect(jsonPath("$.roles[0]").value("CLIENTE"))
				.andExpect(jsonPath("$.roles[1]").value("MONITORAMENTO"))
				.andExpect(jsonPath("$.unidadeIds[0]").value(7));
		mvc.perform(get("/internal/v1/usuarios/ninguem/acesso").header("Authorization", bearer(Escopo.ACESSO_LER)))
				.andExpect(status().isNotFound());
	}

	@Test
	@DisplayName("troca de credencial por token e publica; credencial ruim responde 401")
	void trocaDeCredencialPorToken() throws Exception {
		var cliente = new ServicoClienteEntity();
		cliente.setId("geopetro-backend");
		cliente.setEscopos(Set.of(Escopo.ACESSO_LER, Escopo.UNIDADES_LER));
		ServicoClienteService servicos = context.getBean(ServicoClienteService.class);
		when(servicos.autenticar(eq("geopetro-backend"), eq("certo"))).thenReturn(Optional.of(cliente));
		when(servicos.autenticar(eq("geopetro-backend"), eq("errado"))).thenReturn(Optional.empty());

		mvc.perform(post("/internal/v1/auth/token").contentType("application/json")
				.content("{\"clienteId\":\"geopetro-backend\",\"segredo\":\"certo\"}"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.token").isNotEmpty())
				.andExpect(jsonPath("$.escopos.length()").value(2));
		mvc.perform(post("/internal/v1/auth/token").contentType("application/json")
				.content("{\"clienteId\":\"geopetro-backend\",\"segredo\":\"errado\"}"))
				.andExpect(status().isUnauthorized());
	}

	// ---------- gestao de unidades (RN-118) ----------

	@Test
	@DisplayName("qualquer interno consulta unidades; cliente nao")
	void consultaDeUnidades() throws Exception {
		mvc.perform(get("/api/unidades").with(user("ana").roles("INTERNO"))).andExpect(status().isOk());
		mvc.perform(get("/api/unidades/3").with(user("ana").roles("INTERNO"))).andExpect(status().isOk());
		mvc.perform(get("/api/unidades").with(user("cli").roles("CLIENTE", "UNIDADE"))).andExpect(status().isForbidden());
	}

	@Test
	@DisplayName("criar, editar, inativar, reativar e excluir exigem ADMIN ou INTERNO + UNIDADE")
	void escritaDeUnidades() throws Exception {
		String corpo = "{\"nome\":\"SPT-144\",\"tipo\":\"SONDA\",\"setorId\":2}";
		String[][] semPermissao = { { "INTERNO" }, { "UNIDADE" }, { "CLIENTE", "UNIDADE" }, { "SUPORTE" } };
		for (String[] roles : semPermissao) {
			mvc.perform(post("/api/unidades").with(user("x").roles(roles)).contentType("application/json").content(corpo))
					.andExpect(status().isForbidden());
			mvc.perform(put("/api/unidades/3").with(user("x").roles(roles)).contentType("application/json").content(corpo))
					.andExpect(status().isForbidden());
			mvc.perform(patch("/api/unidades/3/inativar").with(user("x").roles(roles))).andExpect(status().isForbidden());
			mvc.perform(patch("/api/unidades/3/ativar").with(user("x").roles(roles))).andExpect(status().isForbidden());
			mvc.perform(delete("/api/unidades/3").with(user("x").roles(roles))).andExpect(status().isForbidden());
		}
		String[][] comPermissao = { { "ADMIN" }, { "INTERNO", "UNIDADE" } };
		for (String[] roles : comPermissao) {
			mvc.perform(post("/api/unidades").with(user("x").roles(roles)).contentType("application/json").content(corpo))
					.andExpect(status().isOk());
			mvc.perform(put("/api/unidades/3").with(user("x").roles(roles)).contentType("application/json").content(corpo))
					.andExpect(status().isOk());
			mvc.perform(patch("/api/unidades/3/inativar").with(user("x").roles(roles))).andExpect(status().isNoContent());
			mvc.perform(patch("/api/unidades/3/ativar").with(user("x").roles(roles))).andExpect(status().isNoContent());
			mvc.perform(delete("/api/unidades/3").with(user("x").roles(roles))).andExpect(status().isNoContent());
		}
	}

	@Test
	@DisplayName("a tela de sistemas autorizados e so de ADMIN")
	void telaDeSistemasSoAdmin() throws Exception {
		mvc.perform(get("/api/servicos-clientes").with(user("a").roles("ADMIN"))).andExpect(status().isOk());
		for (String role : new String[] { "SUPORTE", "INTERNO", "UNIDADE" }) {
			mvc.perform(get("/api/servicos-clientes").with(user("a").roles(role))).andExpect(status().isForbidden());
		}
		mvc.perform(get("/api/servicos-clientes")).andExpect(status().isUnauthorized());
	}
}
