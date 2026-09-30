package com.geopetro.alarmes;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.security.Principal;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import com.geopetro.config.ApiExceptionHandler;
import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;

/**
 * Entrada inválida é <b>400</b>, e não 500 — o achado A07.
 *
 * <h2>Por que a diferença importa para quem chama</h2>
 * {@code 500} diz "o servidor quebrou": quem recebe não tem o que fazer além de reportar. {@code 400}
 * diz "a chamada está errada": quem recebe corrige e repete. Devolver 500 para um parâmetro ausente
 * transforma um erro do cliente num incidente do servidor — e enterra o problema real no meio dos
 * alertas de indisponibilidade.
 *
 * <p>A conversão de {@code inicio}/{@code fim} falha <b>antes</b> de o controller rodar, então
 * nenhuma validação de negócio a alcança: quem precisa tratar isso é o {@link ApiExceptionHandler}.
 *
 * <p>⚠️ O teste sobe só o controller e o advice, sem contexto Spring nem porta 8080: o que está sob
 * exame é o mapeamento de exceção para status, e não a disponibilidade do serviço.
 */
class AlarmesHttpErrosTest {

	private static final Principal ANA = () -> "ana";

	private MockMvc mvc;
	private HistoricoDeAlarmes historico;

	@BeforeEach
	void setup() {
		MotorDeAlarmes motor = mock(MotorDeAlarmes.class);
		historico = mock(HistoricoDeAlarmes.class);
		ConfiguracaoSondaAccess access = mock(ConfiguracaoSondaAccess.class);
		mvc = MockMvcBuilders.standaloneSetup(new AlarmesController(motor, historico, access))
				.setControllerAdvice(new ApiExceptionHandler())
				.build();
	}

	@Test
	@DisplayName("historico sem periodo responde 400, nomeando o parametro que falta")
	void periodoAusenteEBadRequest() throws Exception {
		mvc.perform(get("/api/sondas/1/alarmes/historico").principal(ANA))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.details[0]").value("inicio: obrigatório"));
	}

	@Test
	@DisplayName("historico com data ilegivel responde 400")
	void dataInvalidaEBadRequest() throws Exception {
		mvc.perform(get("/api/sondas/1/alarmes/historico")
				.param("inicio", "invalid")
				.param("fim", "2026-09-09T23:59:59Z")
				.principal(ANA))
				.andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.status").value(400))
				.andExpect(jsonPath("$.details[0]").value("inicio: valor inválido"));
	}

	/**
	 * ⚠️ A mensagem não devolve o texto da exceção de conversão: ele carrega o nome da classe alvo e
	 * o valor recebido — detalhe interno que não ajuda quem chamou e revela mais do que precisa.
	 */
	@Test
	void aRespostaNaoVazaODetalheInternoDaConversao() throws Exception {
		mvc.perform(get("/api/sondas/1/alarmes/historico")
				.param("inicio", "invalid")
				.param("fim", "2026-09-09T23:59:59Z")
				.principal(ANA))
				.andExpect(jsonPath("$.message").value("Parâmetro inválido."));
	}

	/** Com o periodo bem-formado a rota segue o caminho normal — 400 é só para entrada inválida. */
	@Test
	void periodoValidoNaoViraBadRequest() throws Exception {
		when(historico.consultar(org.mockito.ArgumentMatchers.anyLong(),
				org.mockito.ArgumentMatchers.any(), org.mockito.ArgumentMatchers.any()))
				.thenReturn(new HistoricoDeAlarmes.Pagina(List.of(), false));

		mvc.perform(get("/api/sondas/1/alarmes/historico")
				.param("inicio", "2026-09-09T00:00:00Z")
				.param("fim", "2026-09-09T23:59:59Z")
				.principal(ANA))
				.andExpect(status().isOk());
	}
}
