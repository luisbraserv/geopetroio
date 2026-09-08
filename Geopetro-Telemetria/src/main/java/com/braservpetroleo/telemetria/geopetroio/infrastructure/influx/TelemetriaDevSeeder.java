package com.braservpetroleo.telemetria.geopetroio.infrastructure.influx;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaSeedProperties;
import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaProperties;
import com.braservpetroleo.telemetria.geopetroio.domain.LeituraTelemetria;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;

/**
 * Popula o InfluxDB com curvas deterministicas para validar o monitoramento local sem um CLP.
 *
 * <p>A dupla guarda ({@code dev} + propriedade explicitamente habilitada) e deliberada: dados
 * sinteticos nunca podem surgir por padrao numa instalacao de campo ou em producao.
 */
@Component
@Profile("dev")
@ConditionalOnProperty(prefix = "telemetria.seed", name = "habilitado", havingValue = "true")
public class TelemetriaDevSeeder implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(TelemetriaDevSeeder.class);
	private static final int CICLOS_POR_LOTE = 1_000;

	private static final List<String> DISPOSITIVOS = List.of(
			"PESO_COLUNA_01",
			"TORQUE_01",
			"TORQUE_02",
			"PRESSAO_01",
			"VAZAO_01");

	private final InfluxTelemetriaRepository repository;
	private final TelemetriaSeedProperties properties;
	private final TelemetriaProperties telemetriaProperties;

	public TelemetriaDevSeeder(InfluxTelemetriaRepository repository,
			TelemetriaSeedProperties properties,
			TelemetriaProperties telemetriaProperties) {
		this.repository = repository;
		this.properties = properties;
		this.telemetriaProperties = telemetriaProperties;
	}

	@Override
	public void run(ApplicationArguments args) {
		int ciclos = semear(Instant.now());
		log.info("Seed sintetico concluido: sonda={} pontosPorVariavel={} pontosTotais={}",
				properties.getIdSondaUnidade(), ciclos, ciclos * DISPOSITIVOS.size());
	}

	int semear(Instant agora) {
		validarConfiguracao();

		ZoneId zonaSonda = ZoneId.of(telemetriaProperties.getZonaSonda());
		LocalDate hoje = agora.atZone(zonaSonda).toLocalDate();
		Instant inicio = hoje.atStartOfDay(zonaSonda).toInstant();
		Instant fimExclusivo = hoje.plusDays(1).atStartOfDay(zonaSonda).toInstant();

		int pontosPorVariavel = properties.getPontosPorVariavel();
		long duracaoMillis = Duration.between(inicio, fimExclusivo).toMillis();
		if (duracaoMillis % pontosPorVariavel != 0) {
			throw new IllegalStateException(
					"A duracao do dia nao pode ser distribuida igualmente em " + pontosPorVariavel + " pontos");
		}
		long intervaloMillis = duracaoMillis / pontosPorVariavel;

		repository.removerSerie(properties.getIdSondaUnidade(), inicio, fimExclusivo);
		List<TelemetriaBatch> lote = new ArrayList<>(CICLOS_POR_LOTE);
		for (int ciclo = 0; ciclo < pontosPorVariavel; ciclo++) {
			Instant instante = inicio.plusMillis((long) ciclo * intervaloMillis);
			lote.add(new TelemetriaBatch(
					properties.getIdSondaUnidade(), instante, gerarLeituras(instante)));
			if (lote.size() == CICLOS_POR_LOTE) {
				repository.gravarSincrono(lote);
				lote.clear();
			}
		}
		if (!lote.isEmpty()) {
			repository.gravarSincrono(lote);
		}
		return pontosPorVariavel;
	}

	private List<LeituraTelemetria> gerarLeituras(Instant instante) {
		double segundos = instante.getEpochSecond();
		return List.of(
				leitura("PESO_01", null, "PESO", "lbf", "DBW4",
						102_000 + 9_000 * Math.sin(segundos / 420.0) + 2_200 * Math.sin(segundos / 73.0)),
				leitura("TORQUE_01", null, "TORQUE", "lbf.ft", "DBW6",
						8_200 + 1_900 * Math.sin(segundos / 180.0 + 0.4)),
				leitura("TORQUE_02", null, "TORQUE", "lbf.ft", "DBW8",
						6_700 + 1_450 * Math.cos(segundos / 210.0 + 0.8)),
				leitura("PRESSAO_01", null, "PRESSAO", "psi", "DBW10",
						2_650 + 360 * Math.sin(segundos / 300.0) + 85 * Math.sin(segundos / 47.0)),
				// As tres series de um card de stroke (RN-098): o seeder passa a produzi-las para
				// que a tela de desenvolvimento mostre o que a frota real vai mandar.
				leitura("CONTADOR_STROKE_01", "vazao", "CONTADOR_STROKE", "bbl/min", "DBD0",
						5.8 + 1.1 * Math.sin(segundos / 240.0) + 0.22 * Math.cos(segundos / 31.0)),
				leitura("CONTADOR_STROKE_01", "stroke", "CONTADOR_STROKE", "stroke", "DBD0",
						12 + 4 * Math.sin(segundos / 240.0)),
				leitura("CONTADOR_STROKE_01", "volumeAcumulado", "CONTADOR_STROKE", "bbl", "DBD0",
						segundos * 0.09));
	}

	/**
	 * ⚠️ O seeder passou a declarar tipo e unidade — nao ha mais catalogo de onde busca-los.
	 *
	 * <p>E o mesmo que um Desktop real faz: a mensagem se descreve (RN-097). Se um dia divergir do
	 * que a frota manda, o dado de desenvolvimento fica diferente do de producao — que e o custo de
	 * um seeder, e o motivo de ele viver so no perfil de dev.
	 */
	private LeituraTelemetria leitura(String dispositivoId, String serie, String tipo,
			String unidade, String enderecoDb, double valor) {
		return new LeituraTelemetria(dispositivoId, serie, tipo, unidade, enderecoDb,
				arredondar(valor), null);
	}

	private void validarConfiguracao() {
		if (properties.getIdSondaUnidade() == null || properties.getIdSondaUnidade().isBlank()) {
			throw new IllegalStateException("telemetria.seed.id-sonda-unidade e obrigatorio");
		}
		if (properties.getPontosPorVariavel() <= 0) {
			throw new IllegalStateException("telemetria.seed.pontos-por-variavel deve ser maior que zero");
		}
	}

	private static double arredondar(double valor) {
		return Math.round(valor * 100.0) / 100.0;
	}
}
