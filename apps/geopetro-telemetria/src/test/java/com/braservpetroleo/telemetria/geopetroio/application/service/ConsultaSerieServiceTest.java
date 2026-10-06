package com.braservpetroleo.telemetria.geopetroio.application.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
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
		when(repository.consultarSerie(eq("SPT-144"), eq("PRESSAO_01"), any(), eq(t), eq(t.plusSeconds(60)),
				anyInt(), anyBoolean()))
				.thenReturn(List.of(new PontoSerie(t, 1.5), new PontoSerie(t.plusSeconds(1), 2.5)));

		MonitoramentoSerieDTO serie = service.consultar("SPT-144", "PRESSAO_01", null, t, t.plusSeconds(60));

		assertThat(serie.idUnidade()).isEqualTo("SPT-144");
		assertThat(serie.dispositivoId()).isEqualTo("PRESSAO_01");
		assertThat(serie.pontos()).hasSize(2);
		assertThat(serie.pontos().get(0).dataHora()).isEqualTo(t);
		assertThat(serie.pontos().get(0).valor()).isEqualTo(1.5);
	}

	@Test
	@DisplayName("serie vazia e resposta legitima, nao erro")
	void serieVazia() {
		Instant t = Instant.parse("2026-08-27T17:00:00Z");
		when(repository.consultarSerie(eq("SPT-144"), eq("PRESSAO_01"), any(), eq(t), eq(t.plusSeconds(60)),
				anyInt(), anyBoolean()))
				.thenReturn(List.of());

		MonitoramentoSerieDTO serie = service.consultar("SPT-144", "PRESSAO_01", null, t, t.plusSeconds(60));

		assertThat(serie.pontos()).isEmpty();
		assertThat(serie.idUnidade()).isEqualTo("SPT-144");
	}

	@Test
	@DisplayName("repassa o teto de pontos configurado ao repositorio")
	void repassaTetoConfigurado() {
		properties.setMaxPontosPorSerie(500);
		Instant t = Instant.parse("2026-08-27T17:00:00Z");
		when(repository.consultarSerie(eq("SPT-144"), eq("PRESSAO_01"), any(), eq(t), eq(t.plusSeconds(60)),
				anyInt(), anyBoolean()))
				.thenReturn(List.of());

		service.consultar("SPT-144", "PRESSAO_01", null, t, t.plusSeconds(60));

		verify(repository).consultarSerie("SPT-144", "PRESSAO_01", null, t, t.plusSeconds(60), 500, true);
	}

	@Test
	@DisplayName("repassa a serie pedida ao repositorio — RN-098")
	void repassaSerie() {
		// Um card de stroke grava tres series sob o mesmo dispositivoId. Sem repassar o filtro, a
		// consulta de vazao devolveria stroke e volume acumulado junto, na mesma linha do tempo.
		Instant t = Instant.parse("2026-09-08T17:00:00Z");
		when(repository.consultarSerie(eq("SPT-144"), eq("CONTADOR_STROKE_01"), eq("vazao"), eq(t),
				eq(t.plusSeconds(60)), anyInt(), anyBoolean()))
				.thenReturn(List.of(new PontoSerie(t, 1.52)));

		MonitoramentoSerieDTO serie = service.consultar("SPT-144", "CONTADOR_STROKE_01", "vazao", t,
				t.plusSeconds(60));

		verify(repository).consultarSerie(eq("SPT-144"), eq("CONTADOR_STROKE_01"), eq("vazao"), eq(t),
				eq(t.plusSeconds(60)), anyInt(), anyBoolean());
		// A serie volta no eco: sem ela o chamador nao distingue duas respostas do mesmo card.
		assertThat(serie.serie()).isEqualTo("vazao");
		assertThat(serie.pontos()).hasSize(1);
	}
}
