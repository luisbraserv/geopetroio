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
import com.geopetro.core.exception.BusinessException;

/**
 * A rota que expoe a projecao — quem ve o alarme e quem ja enxerga a sonda (RN-069).
 *
 * <p>A autorizacao e reaproveitada da configuracao de limites de proposito: ver o alarme e ajustar
 * o limite dele sao a mesma autoridade, e duas verificacoes separadas divergiriam na primeira
 * mudanca.
 */
class AlarmesControllerTest {

	private MotorDeAlarmes motor;
	private ConfiguracaoSondaAccess access;
	private AlarmesController controller;

	private static final Principal ANA = () -> "ana";

	@BeforeEach
	void setup() {
		motor = mock(MotorDeAlarmes.class);
		access = mock(ConfiguracaoSondaAccess.class);
		controller = new AlarmesController(motor, access);
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
		doThrow(new BusinessException("Sem acesso a esta Unidade/Sonda.", HttpStatus.FORBIDDEN))
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
}
