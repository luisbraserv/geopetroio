package com.braservpetroleo.telemetria.geopetroio.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.Optional;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.ExistenciaSerieDTO;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.influx.InfluxTelemetriaRepository;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.influx.InfluxTelemetriaRepository.IntervaloSerie;

/**
 * RN-072 — historico de telemetria conta como vinculo na exclusao do cadastro.
 *
 * <p>O que este servico responde decide se o Geopetro-Backend apaga ou nao uma Unidade/Sonda, entao a
 * distincao entre "nao tem serie" e "nao consegui perguntar" precisa ficar do lado de la: aqui, uma
 * resposta sempre significa que a consulta aconteceu.
 */
class ConsultaExistenciaServiceTest {

	private final InfluxTelemetriaRepository repository = mock(InfluxTelemetriaRepository.class);
	private final ConsultaExistenciaService service = new ConsultaExistenciaService(repository);

	@Test
	@DisplayName("sonda com serie devolve os extremos, para a recusa dizer de quando ate quando")
	void sondaComSerie() {
		Instant primeiro = Instant.parse("2026-03-01T00:00:00Z");
		Instant ultimo = Instant.parse("2026-09-05T12:00:00Z");
		when(repository.consultarIntervalo("SPT-144"))
				.thenReturn(Optional.of(new IntervaloSerie(primeiro, ultimo)));

		ExistenciaSerieDTO resposta = service.consultar("SPT-144");

		assertThat(resposta.idSondaUnidade()).isEqualTo("SPT-144");
		assertThat(resposta.possuiSerie()).isTrue();
		assertThat(resposta.primeiroPonto()).isEqualTo(primeiro);
		assertThat(resposta.ultimoPonto()).isEqualTo(ultimo);
	}

	@Test
	@DisplayName("sonda sem serie responde possuiSerie=false com datas nulas, e nao e erro")
	void sondaSemSerie() {
		when(repository.consultarIntervalo("SPT-999")).thenReturn(Optional.empty());

		ExistenciaSerieDTO resposta = service.consultar("SPT-999");

		assertThat(resposta.idSondaUnidade()).isEqualTo("SPT-999");
		assertThat(resposta.possuiSerie()).isFalse();
		assertThat(resposta.primeiroPonto()).isNull();
		assertThat(resposta.ultimoPonto()).isNull();
	}

	@Test
	@DisplayName("sonda com um unico ponto tem primeiro e ultimo iguais")
	void sondaComPontoUnico() {
		Instant t = Instant.parse("2026-09-06T08:00:00Z");
		when(repository.consultarIntervalo("SPT-001"))
				.thenReturn(Optional.of(new IntervaloSerie(t, t)));

		ExistenciaSerieDTO resposta = service.consultar("SPT-001");

		assertThat(resposta.possuiSerie()).isTrue();
		assertThat(resposta.primeiroPonto()).isEqualTo(resposta.ultimoPonto());
	}
}
