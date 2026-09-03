package com.braservpetroleo.telemetria.geopetroio.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.MonitoramentoSerieDTO;
import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaProperties;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.influx.InfluxTelemetriaRepository;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.influx.InfluxTelemetriaRepository.PontoSerie;

class ConsultaSerieServiceTest {

	private final InfluxTelemetriaRepository repository = mock(InfluxTelemetriaRepository.class);
	private final TelemetriaProperties properties = new TelemetriaProperties();
	private final ConsultaSerieService service = new ConsultaSerieService(repository, properties);

	@Test
	@DisplayName("mapeia os pontos preservando instante e valor")
	void mapeiaPontos() {
		Instant t = Instant.parse("2026-08-27T17:00:00Z");
		when(repository.consultarSerie(eq("SPT-144"), eq("VAZAO_01"), eq(t), eq(t.plusSeconds(60)),
				anyInt(), anyBoolean()))
				.thenReturn(List.of(new PontoSerie(t, 1.5), new PontoSerie(t.plusSeconds(1), 2.5)));

		MonitoramentoSerieDTO serie = service.consultar("SPT-144", "VAZAO_01", t, t.plusSeconds(60));

		assertThat(serie.idSondaUnidade()).isEqualTo("SPT-144");
		assertThat(serie.dispositivoId()).isEqualTo("VAZAO_01");
		assertThat(serie.pontos()).hasSize(2);
		assertThat(serie.pontos().get(0).dataHora()).isEqualTo(t);
		assertThat(serie.pontos().get(0).valor()).isEqualTo(1.5);
	}

	@Test
	@DisplayName("serie vazia e resposta legitima, nao erro")
	void serieVazia() {
		Instant t = Instant.parse("2026-08-27T17:00:00Z");
		when(repository.consultarSerie(eq("SPT-144"), eq("VAZAO_01"), eq(t), eq(t.plusSeconds(60)),
				anyInt(), anyBoolean()))
				.thenReturn(List.of());

		MonitoramentoSerieDTO serie = service.consultar("SPT-144", "VAZAO_01", t, t.plusSeconds(60));

		assertThat(serie.pontos()).isEmpty();
		assertThat(serie.idSondaUnidade()).isEqualTo("SPT-144");
	}

	@Test
	@DisplayName("repassa o teto de pontos configurado ao repositorio")
	void repassaTetoConfigurado() {
		properties.setMaxPontosPorSerie(500);
		Instant t = Instant.parse("2026-08-27T17:00:00Z");
		when(repository.consultarSerie(eq("SPT-144"), eq("VAZAO_01"), eq(t), eq(t.plusSeconds(60)),
				anyInt(), anyBoolean()))
				.thenReturn(List.of());

		service.consultar("SPT-144", "VAZAO_01", t, t.plusSeconds(60));

		verify(repository).consultarSerie("SPT-144", "VAZAO_01", t, t.plusSeconds(60), 500, true);
	}
}
