package com.geopetro.alarmes;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

import java.security.Principal;
import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;

import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;
import com.geopetro.configuracaosonda.ConfiguracaoSondaAccess;
import com.geopetro.comum.exception.BusinessException;

/**
 * A rota que expoe a projecao — quem ve o alarme e quem ja enxerga a sonda (RN-069).
 *
 * <p>A autorizacao e reaproveitada da configuracao de limites de proposito: ver o alarme e ajustar
 * o limite dele sao a mesma autoridade, e duas verificacoes separadas divergiriam na primeira
 * mudanca.
 */
class AlarmesControllerTest {

	private MotorDeAlarmes motor;
	private HistoricoDeAlarmes historico;
	private ConfiguracaoSondaAccess access;
	private AlarmesController controller;

	private static final Principal ANA = () -> "ana";
	private static final Instant INICIO = Instant.parse("2026-09-09T00:00:00Z");
	private static final Instant FIM = Instant.parse("2026-09-09T23:59:59Z");

	@BeforeEach
	void setup() {
		motor = mock(MotorDeAlarmes.class);
		historico = mock(HistoricoDeAlarmes.class);
		access = mock(ConfiguracaoSondaAccess.class);
		controller = new AlarmesController(motor, historico, access);
	}

	@Test
	void devolveAProjecaoDaUnidadeDepoisDeExigirAcesso() {
		var alarme = new AlarmeAtivo(7, "PRESSAO_01", null, "ep-1", Severidade.CRITICO,
				Instant.parse("2026-09-09T12:00:00Z"), 180.0, LimiteViolado.MAX);
		when(motor.ativos(7)).thenReturn(List.of(alarme));

		assertThat(controller.ativos(7, ANA)).containsExactly(alarme);
		verify(access).exigir("ana", 7);
	}

	/** ⚠️ Autorizar depois de consultar vazaria o estado da sonda de outro cliente. */
	@Test
	void semAcessoNaoChegaAConsultarAProjecao() {
		doThrow(new BusinessException("Sem acesso a esta Unidade.", HttpStatus.FORBIDDEN))
				.when(access).exigir(anyString(), anyLong());

		assertThatThrownBy(() -> controller.ativos(7, ANA)).isInstanceOf(BusinessException.class);
		verifyNoInteractions(motor);
	}

	/** Sonda dentro dos limites, ou sem limite nenhum: lista vazia e a resposta normal. */
	@Test
	void sondaSemAlarmeDevolveListaVazia() {
		when(motor.ativos(7)).thenReturn(List.of());
		assertThat(controller.ativos(7, ANA)).isEmpty();
	}

	@Test
	void oHistoricoRepassaAJanelaDepoisDeExigirAcesso() {
		var pagina = new HistoricoDeAlarmes.Pagina(List.of(), false);
		when(historico.consultar(7, INICIO, FIM)).thenReturn(pagina);

		assertThat(controller.historico(7, INICIO, FIM, ANA)).isSameAs(pagina);
		verify(access).exigir("ana", 7);
	}

	/** A mesma autorizacao das duas pontas: o historico da sonda e tao restrito quanto o estado dela. */
	@Test
	void semAcessoNaoChegaAConsultarOHistorico() {
		doThrow(new BusinessException("Sem acesso a esta Unidade.", HttpStatus.FORBIDDEN))
				.when(access).exigir(anyString(), anyLong());

		assertThatThrownBy(() -> controller.historico(7, INICIO, FIM, ANA))
				.isInstanceOf(BusinessException.class);
		verifyNoInteractions(historico);
	}
}
