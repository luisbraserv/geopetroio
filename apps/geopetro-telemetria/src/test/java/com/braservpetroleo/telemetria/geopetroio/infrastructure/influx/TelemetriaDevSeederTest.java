package com.braservpetroleo.telemetria.geopetroio.infrastructure.influx;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;

import java.time.Instant;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaSeedProperties;
import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaProperties;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;

class TelemetriaDevSeederTest {

	private final InfluxTelemetriaRepository repository = mock(InfluxTelemetriaRepository.class);
	private final TelemetriaSeedProperties properties = propriedadesDeTeste();
	private final TelemetriaProperties telemetriaProperties = new TelemetriaProperties();
	private final TelemetriaDevSeeder seeder = new TelemetriaDevSeeder(
			repository, properties, telemetriaProperties);

	@Test
	@DisplayName("gera todas as series da SPT-145 com timestamps alinhados em lote bloqueante")
	@SuppressWarnings({ "rawtypes", "unchecked" })
	void geraSeriesCompletasEFlush() {
		int ciclos = seeder.semear(Instant.parse("2026-08-27T12:07:23Z"));

		ArgumentCaptor<List<TelemetriaBatch>> captor = ArgumentCaptor.forClass((Class) List.class);
		verify(repository).removerSerie(
				"SPT-145", Instant.parse("2026-08-27T03:00:00Z"), Instant.parse("2026-08-28T03:00:00Z"));
		verify(repository).gravarSincrono(captor.capture());

		List<TelemetriaBatch> batches = captor.getValue();
		assertThat(ciclos).isEqualTo(8);
		assertThat(batches.getFirst().dataHora()).isEqualTo(Instant.parse("2026-08-27T03:00:00Z"));
		assertThat(batches.get(1).dataHora()).isEqualTo(Instant.parse("2026-08-27T06:00:00Z"));
		assertThat(batches.getLast().dataHora()).isEqualTo(Instant.parse("2026-08-28T00:00:00Z"));
		assertThat(batches).allSatisfy(batch -> {
			assertThat(batch.idUnidade()).isEqualTo("SPT-145");
			// Os ids passaram a ser os que os cards geram, e o contador de stroke produz TRES
			// series sob o mesmo dispositivoId (RN-098).
			assertThat(batch.leituras())
					.extracting(leitura -> leitura.dispositivoId())
					.containsExactly("PESO_01", "TORQUE_01", "TORQUE_02", "PRESSAO_01",
							"CONTADOR_STROKE_01", "CONTADOR_STROKE_01", "CONTADOR_STROKE_01");
			assertThat(batch.leituras())
					.extracting(leitura -> leitura.serie())
					.containsExactly(null, null, null, null, "vazao", "stroke", "volumeAcumulado");
			// A mensagem se descreve (RN-097): tipo e unidade vem preenchidos, sem catalogo.
			assertThat(batch.leituras()).allSatisfy(leitura -> {
				assertThat(leitura.tipo()).isNotBlank();
				assertThat(leitura.unidade()).isNotBlank();
			});
			assertThat(batch.leituras()).allSatisfy(leitura -> assertThat(leitura.valor()).isPositive());
		});
	}

	@Test
	@DisplayName("divide cargas grandes em lotes bloqueantes de no maximo mil ciclos")
	void divideCargaEmLotesLimitados() {
		properties.setPontosPorVariavel(1_200);

		int ciclos = seeder.semear(Instant.parse("2026-08-27T12:07:23Z"));

		verify(repository, times(2)).gravarSincrono(org.mockito.ArgumentMatchers.anyList());
		assertThat(ciclos).isEqualTo(1_200);
	}

	@Test
	@DisplayName("configuracao padrao define 28.800 pontos por variavel")
	void defineQuantidadePadrao() {
		assertThat(new TelemetriaSeedProperties().getPontosPorVariavel()).isEqualTo(28_800);
	}

	private static TelemetriaSeedProperties propriedadesDeTeste() {
		TelemetriaSeedProperties properties = new TelemetriaSeedProperties();
		properties.setIdUnidade("SPT-145");
		properties.setPontosPorVariavel(8);
		return properties;
	}
}
