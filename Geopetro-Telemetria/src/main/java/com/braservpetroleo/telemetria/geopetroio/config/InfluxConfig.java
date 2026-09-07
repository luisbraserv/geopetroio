package com.braservpetroleo.telemetria.geopetroio.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import com.influxdb.client.InfluxDBClient;
import com.influxdb.client.InfluxDBClientFactory;
import com.influxdb.client.DeleteApi;
import com.influxdb.client.QueryApi;
import com.influxdb.client.WriteApi;
import com.influxdb.client.WriteApiBlocking;
import com.influxdb.client.WriteOptions;

/**
 * Cliente InfluxDB e suas duas APIs de uso.
 *
 * <p><b>Escrita em lote, deliberadamente.</b> A ingestao recebe 1 mensagem por segundo por sonda,
 * cada uma com ate 5 pontos, de forma continua. Escrever ponto a ponto de forma bloqueante geraria
 * uma requisicao HTTP por mensagem — com 20 sondas, 20 req/s so de telemetria. A {@link WriteApi}
 * assincrona acumula e descarrega em lote, reduzindo isso a um flush por intervalo.
 *
 * <p><b>Contrapartida aceita:</b> pontos ainda em buffer se perdem se o processo cair. E aceitavel
 * porque o Geopetro-Desktop mantem copia local em H2 de toda leitura (ver F-16), entao a fonte de
 * verdade da sonda nao depende deste buffer.
 */
@Configuration
public class InfluxConfig {

	private static final Logger log = LoggerFactory.getLogger(InfluxConfig.class);

	@Bean(destroyMethod = "close")
	public InfluxDBClient influxDBClient(InfluxProperties properties) {
		if (properties.getToken() == null || properties.getToken().isBlank()) {
			// Falhar aqui e melhor do que subir e descartar telemetria silenciosamente.
			throw new IllegalStateException(
					"influx.token nao configurado. Defina a variavel de ambiente INFLUX_TOKEN.");
		}
		log.info("InfluxDB: url={} org={} bucket={}",
				properties.getUrl(), properties.getOrg(), properties.getBucket());

		return InfluxDBClientFactory.create(
				properties.getUrl(),
				properties.getToken().toCharArray(),
				properties.getOrg(),
				properties.getBucket());
	}

	@Bean(destroyMethod = "close")
	public WriteApi writeApi(InfluxDBClient client) {
		WriteOptions options = WriteOptions.builder()
				.batchSize(500)
				.flushInterval(1000)
				.jitterInterval(200)
				.build();

		WriteApi writeApi = client.makeWriteApi(options);
		// Sem este listener, falhas de escrita ficariam invisiveis: a API e assincrona e nao
		// propaga excecao para quem chamou writePoint.
		writeApi.listenEvents(com.influxdb.client.write.events.WriteErrorEvent.class,
				evento -> log.error("Falha ao gravar telemetria no InfluxDB: {}",
						evento.getThrowable().getMessage(), evento.getThrowable()));
		writeApi.listenEvents(com.influxdb.client.write.events.WriteRetriableErrorEvent.class,
				evento -> log.warn("Erro transitorio na escrita ao InfluxDB, sera reenviado: {}",
						evento.getThrowable().getMessage()));

		return writeApi;
	}

	@Bean
	public QueryApi queryApi(InfluxDBClient client) {
		return client.getQueryApi();
	}

	@Bean
	public WriteApiBlocking writeApiBlocking(InfluxDBClient client) {
		return client.getWriteApiBlocking();
	}

	@Bean
	public DeleteApi deleteApi(InfluxDBClient client) {
		return client.getDeleteApi();
	}

	@Bean
	public InfluxHealthLogger influxHealthLogger(InfluxDBClient client) {
		return new InfluxHealthLogger(client);
	}

	/** Registra no startup se o InfluxDB esta acessivel, sem impedir a aplicacao de subir. */
	public static class InfluxHealthLogger {

		public InfluxHealthLogger(InfluxDBClient client) {
			try {
				boolean ok = client.ping();
				if (ok) {
					log.info("InfluxDB respondeu ao ping.");
				}
				else {
					log.warn("InfluxDB nao respondeu ao ping. A ingestao vai falhar ate normalizar.");
				}
			}
			catch (Exception e) {
				log.warn("Nao foi possivel contatar o InfluxDB no startup: {}", e.getMessage());
			}
		}
	}
}
