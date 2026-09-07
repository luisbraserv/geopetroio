package com.braservpetroleo.telemetria.geopetroio.infrastructure.influx;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Repository;

import com.braservpetroleo.telemetria.geopetroio.config.InfluxProperties;
import com.braservpetroleo.telemetria.geopetroio.domain.LeituraTelemetria;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;
import com.influxdb.client.DeleteApi;
import com.influxdb.client.QueryApi;
import com.influxdb.client.WriteApi;
import com.influxdb.client.WriteApiBlocking;
import com.influxdb.client.domain.WritePrecision;
import com.influxdb.client.write.Point;
import com.influxdb.query.FluxRecord;
import com.influxdb.query.FluxTable;

/**
 * Persistencia e consulta da serie temporal no InfluxDB.
 *
 * <h2>Esquema</h2>
 * <pre>
 * measurement: telemetria
 * tags:   idSondaUnidade, dispositivoId, tipo, codigoOrigem, unidade
 * fields: valor (double), valorBruto (double, opcional), nome (string)
 * time:   instante da leitura, em UTC
 * </pre>
 *
 * <p><b>Por que essas tags:</b> todas sao de baixa cardinalidade — dezenas de sondas, 5 dispositivos,
 * 4 tipos. Cardinalidade alta em tags degrada o InfluxDB seriamente. {@code nome} fica como field
 * justamente por ser 1:1 com {@code dispositivoId} e nao servir a filtro.
 *
 * <p><b>Idempotencia:</b> o InfluxDB sobrescreve pontos com mesma measurement, mesmo conjunto de tags
 * e mesmo timestamp. Como QoS 1 permite entrega duplicada, uma mensagem reentregue simplesmente
 * regrava o mesmo ponto — sem duplicar a serie. A idempotencia e uma propriedade do esquema, nao
 * precisa de deduplicacao explicita.
 */
@Repository
public class InfluxTelemetriaRepository {

	private static final Logger log = LoggerFactory.getLogger(InfluxTelemetriaRepository.class);

	/**
	 * Identificadores aceitos em consulta. Flux nao tem consultas parametrizadas como SQL — os
	 * valores sao interpolados no script. Restringir o alfabeto e a defesa contra injecao de Flux.
	 */
	private static final Pattern ID_VALIDO = Pattern.compile("^[A-Za-z0-9._-]{1,64}$");

	private final WriteApi writeApi;
	private final WriteApiBlocking writeApiBlocking;
	private final QueryApi queryApi;
	private final DeleteApi deleteApi;
	private final InfluxProperties properties;

	public InfluxTelemetriaRepository(WriteApi writeApi, WriteApiBlocking writeApiBlocking,
			QueryApi queryApi, DeleteApi deleteApi,
			InfluxProperties properties) {
		this.writeApi = writeApi;
		this.writeApiBlocking = writeApiBlocking;
		this.queryApi = queryApi;
		this.deleteApi = deleteApi;
		this.properties = properties;
	}

	/** Enfileira o ciclo para escrita em lote. Nao bloqueia. */
	public void gravar(TelemetriaBatch batch) {
		writeApi.writePoints(mapearPontos(batch));
	}

	/**
	 * Grava um lote finito e aguarda a resposta do InfluxDB. Usado pelo seed para nao saturar a
	 * fila da API assincrona quando milhares de ciclos sao produzidos de uma vez.
	 */
	public void gravarSincrono(List<TelemetriaBatch> batches) {
		List<Point> pontos = new ArrayList<>(batches.stream()
				.mapToInt(batch -> batch.leituras().size())
				.sum());
		for (TelemetriaBatch batch : batches) {
			pontos.addAll(mapearPontos(batch));
		}
		writeApiBlocking.writePoints(pontos);
	}

	private List<Point> mapearPontos(TelemetriaBatch batch) {
		List<Point> pontos = new ArrayList<>(batch.leituras().size());
		for (LeituraTelemetria leitura : batch.leituras()) {
			Point ponto = Point.measurement(properties.getMeasurement())
					.addTag("idSondaUnidade", batch.idSondaUnidade())
					.addTag("dispositivoId", leitura.dispositivoId())
					.addTag("tipo", leitura.tipo())
					.addTag("codigoOrigem", leitura.codigoOrigem())
					.addTag("unidade", leitura.unidade())
					.addField("valor", leitura.valor())
					.addField("nome", leitura.nome())
					.time(batch.dataHora(), WritePrecision.MS);

			if (leitura.possuiValorBruto()) {
				ponto.addField("valorBruto", leitura.valorBruto());
			}
			pontos.add(ponto);
		}
		return pontos;
	}

	/** Forca o envio do lote pendente; usado pelo seed de desenvolvimento antes de liberar a tela. */
	public void flush() {
		writeApi.flush();
	}

	/** Remove uma serie no intervalo informado. O fim segue a semantica exclusiva do InfluxDB. */
	public void removerSerie(String idSondaUnidade, Instant inicio, Instant fim) {
		validarIdentificador("idSondaUnidade", idSondaUnidade);
		if (inicio == null || fim == null || !inicio.isBefore(fim)) {
			throw new IllegalArgumentException("intervalo invalido: inicio deve ser anterior a fim");
		}

		String predicate = "_measurement=\"" + escapar(properties.getMeasurement())
				+ "\" AND idSondaUnidade=\"" + idSondaUnidade + "\"";
		deleteApi.delete(
				inicio.atOffset(ZoneOffset.UTC),
				fim.atOffset(ZoneOffset.UTC),
				predicate,
				properties.getBucket(),
				properties.getOrg());
	}

	/**
	 * Consulta a serie de um dispositivo num intervalo.
	 *
	 * @param maxPontos teto de pontos; acima disso agrega por janela em vez de devolver bruto
	 * @param agregar   se false, nao agrega — o Influx apenas devolve o bruto do periodo
	 */
	public List<PontoSerie> consultarSerie(String idSondaUnidade, String dispositivoId,
			Instant inicio, Instant fim, int maxPontos, boolean agregar) {

		validarIdentificador("idSondaUnidade", idSondaUnidade);
		validarIdentificador("dispositivoId", dispositivoId);
		if (inicio == null || fim == null || !inicio.isBefore(fim)) {
			throw new IllegalArgumentException("intervalo invalido: inicio deve ser anterior a fim");
		}

		String flux = montarFlux(idSondaUnidade, dispositivoId, inicio, fim, maxPontos, agregar);
		log.debug("Flux: {}", flux);

		List<FluxTable> tabelas = queryApi.query(flux);
		List<PontoSerie> pontos = new ArrayList<>();
		for (FluxTable tabela : tabelas) {
			for (FluxRecord registro : tabela.getRecords()) {
				Instant tempo = registro.getTime();
				Object valor = registro.getValue();
				if (tempo != null && valor instanceof Number numero) {
					pontos.add(new PontoSerie(tempo, numero.doubleValue()));
				}
			}
		}
		return pontos;
	}

	/**
	 * Primeiro e ultimo ponto gravados para uma sonda, em toda a retencao — RN-072.
	 *
	 * <p>Existe para responder "esta sonda tem historico?" antes de o Geopetro-Backend excluir o
	 * cadastro. <b>Nao e varredura de serie:</b> {@code first()} e {@code last()} sao empurrados
	 * para o mecanismo de armazenamento, que resolve pelo indice.
	 *
	 * <p>O filtro por {@code _field == "valor"} evita contar o field {@code nome} como um ponto
	 * separado — cada leitura grava os dois.
	 *
	 * @return vazio quando nao ha nenhum ponto para a sonda
	 */
	public Optional<IntervaloSerie> consultarIntervalo(String idSondaUnidade) {
		validarIdentificador("idSondaUnidade", idSondaUnidade);

		Instant primeiro = extremo(idSondaUnidade, "first");
		if (primeiro == null) {
			return Optional.empty();
		}
		Instant ultimo = extremo(idSondaUnidade, "last");
		return Optional.of(new IntervaloSerie(primeiro, ultimo == null ? primeiro : ultimo));
	}

	private Instant extremo(String idSondaUnidade, String funcao) {
		String flux = "from(bucket: \"" + escapar(properties.getBucket()) + "\")\n"
				+ "  |> range(start: 0)\n"
				+ "  |> filter(fn: (r) => r._measurement == \"" + escapar(properties.getMeasurement()) + "\")\n"
				+ "  |> filter(fn: (r) => r.idSondaUnidade == \"" + idSondaUnidade + "\")\n"
				+ "  |> filter(fn: (r) => r._field == \"valor\")\n"
				+ "  |> " + funcao + "()\n"
				+ "  |> keep(columns: [\"_time\"])";

		log.debug("Flux ({}): {}", funcao, flux);

		Instant escolhido = null;
		for (FluxTable tabela : queryApi.query(flux)) {
			for (FluxRecord registro : tabela.getRecords()) {
				Instant tempo = registro.getTime();
				if (tempo == null) {
					continue;
				}
				// Ha uma tabela por combinacao de tags; o extremo da sonda e o extremo entre elas.
				if (escolhido == null
						|| ("first".equals(funcao) ? tempo.isBefore(escolhido) : tempo.isAfter(escolhido))) {
					escolhido = tempo;
				}
			}
		}
		return escolhido;
	}

	private String montarFlux(String idSondaUnidade, String dispositivoId,
			Instant inicio, Instant fim, int maxPontos, boolean agregar) {

		StringBuilder flux = new StringBuilder()
				.append("from(bucket: \"").append(escapar(properties.getBucket())).append("\")\n")
				.append("  |> range(start: ").append(inicio).append(", stop: ").append(fim).append(")\n")
				.append("  |> filter(fn: (r) => r._measurement == \"")
				.append(escapar(properties.getMeasurement())).append("\")\n")
				.append("  |> filter(fn: (r) => r.idSondaUnidade == \"").append(idSondaUnidade).append("\")\n")
				.append("  |> filter(fn: (r) => r.dispositivoId == \"").append(dispositivoId).append("\")\n")
				.append("  |> filter(fn: (r) => r._field == \"valor\")\n");

		Duration janela = janelaDeAgregacao(inicio, fim, maxPontos);
		if (agregar && janela != null) {
			// A tela ja suaviza para exibicao; aqui a media serve para reduzir volume sem
			// distorcer a forma da curva (min/max perderiam o comportamento medio).
			flux.append("  |> aggregateWindow(every: ").append(janela.toSeconds())
					.append("s, fn: mean, createEmpty: false)\n");
		}

		flux.append("  |> sort(columns: [\"_time\"])\n")
				.append("  |> limit(n: ").append(maxPontos).append(")");

		return flux.toString();
	}

	/**
	 * @return janela de agregacao necessaria para caber no teto, ou null se o bruto ja couber
	 */
	private Duration janelaDeAgregacao(Instant inicio, Instant fim, int maxPontos) {
		if (maxPontos <= 0) {
			return null;
		}
		// O produtor publica a 1 leitura/s; o total bruto estimado e a duracao em segundos.
		long segundos = Duration.between(inicio, fim).getSeconds();
		if (segundos <= maxPontos) {
			return null;
		}
		long janelaSegundos = Math.max(1L, (long) Math.ceil((double) segundos / maxPontos));
		return Duration.ofSeconds(janelaSegundos);
	}

	private static void validarIdentificador(String campo, String valor) {
		if (valor == null || !ID_VALIDO.matcher(valor).matches()) {
			throw new IllegalArgumentException(
					campo + " invalido: aceita apenas letras, digitos, ponto, hifen e underscore");
		}
	}

	/** Escapa valores de configuracao interpolados no script Flux. */
	private static String escapar(String valor) {
		return valor.replace("\\", "\\\\").replace("\"", "\\\"");
	}

	/** Um ponto da serie temporal. */
	public record PontoSerie(Instant dataHora, double valor) {
	}

	/** Extremos da serie de uma sonda, em toda a retencao — RN-072. */
	public record IntervaloSerie(Instant primeiroPonto, Instant ultimoPonto) {
	}
}
