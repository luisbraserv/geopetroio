package com.braservpetroleo.telemetria.geopetroio.application.service;

import java.util.concurrent.atomic.AtomicLong;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.influx.InfluxTelemetriaRepository;

/**
 * Orquestra a ingestao: recebe um ciclo ja normalizado e o persiste.
 *
 * <p>Deliberadamente fino. A complexidade real esta em duas bordas — interpretar os dois formatos de
 * payload ({@code TelemetriaPayloadParser}) e escrever em lote ({@code InfluxTelemetriaRepository}).
 * Manter esta camada magra e o que permite testar o fluxo sem broker nem banco.
 */
@Service
public class IngestaoTelemetriaService {

	private static final Logger log = LoggerFactory.getLogger(IngestaoTelemetriaService.class);

	/** Intervalo de amostragem do log de progresso: 1 a cada N ciclos, para nao poluir. */
	private static final long LOG_A_CADA = 1000;

	private final InfluxTelemetriaRepository repository;
	private final AtomicLong ciclosRecebidos = new AtomicLong();
	private final AtomicLong leiturasGravadas = new AtomicLong();

	public IngestaoTelemetriaService(InfluxTelemetriaRepository repository) {
		this.repository = repository;
	}

	public void ingerir(TelemetriaBatch batch) {
		repository.gravar(batch);

		long ciclos = ciclosRecebidos.incrementAndGet();
		long leituras = leiturasGravadas.addAndGet(batch.leituras().size());

		if (ciclos % LOG_A_CADA == 0) {
			log.info("Ingestao: {} ciclos, {} leituras acumuladas. Ultimo: unidade={} dataHora={}",
					ciclos, leituras, batch.idSondaUnidade(), batch.dataHora());
		}
		else if (log.isDebugEnabled()) {
			log.debug("Ciclo ingerido: unidade={} dataHora={} leituras={}",
					batch.idSondaUnidade(), batch.dataHora(), batch.leituras().size());
		}
	}

	public long getCiclosRecebidos() {
		return ciclosRecebidos.get();
	}

	public long getLeiturasGravadas() {
		return leiturasGravadas.get();
	}
}
