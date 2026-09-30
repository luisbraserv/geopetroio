package com.braservpetroleo.telemetria.geopetroio.application.service;

import java.time.Instant;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.MonitoramentoPontoDTO;
import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.MonitoramentoSerieDTO;
import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaProperties;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.influx.InfluxTelemetriaRepository;

/**
 * Consulta de series para o Geopetro-Backend.
 *
 * <p><b>Este servico nao autoriza.</b> Quem valida o vinculo usuario-sonda e o Geopetro-Backend, que
 * possui o cadastro (regional -> setor -> unidade). Aqui so existe leitura de serie temporal.
 * Ver specs/contracts/rest-monitoramento.md.
 */
@Service
public class ConsultaSerieService {

	private static final Logger log = LoggerFactory.getLogger(ConsultaSerieService.class);

	private final InfluxTelemetriaRepository repository;
	private final TelemetriaProperties properties;

	public ConsultaSerieService(InfluxTelemetriaRepository repository, TelemetriaProperties properties) {
		this.repository = repository;
		this.properties = properties;
	}

	/**
	 * @param serie qual das series do dispositivo; {@code null} significa a serie unica. Um card de
	 *              stroke grava tres sob o mesmo {@code dispositivoId} (RN-098)
	 */
	public MonitoramentoSerieDTO consultar(String idSondaUnidade, String dispositivoId, String serie,
			Instant inicio, Instant fim) {

		List<InfluxTelemetriaRepository.PontoSerie> pontos = repository.consultarSerie(
				idSondaUnidade,
				dispositivoId,
				serie,
				inicio,
				fim,
				properties.getMaxPontosPorSerie(),
				properties.isAgregarQuandoExcederTeto());

		log.debug("Serie consultada: unidade={} dispositivo={} serie={} intervalo=[{} .. {}] pontos={}",
				idSondaUnidade, dispositivoId, serie, inicio, fim, pontos.size());

		List<MonitoramentoPontoDTO> pontosDto = pontos.stream()
				.map(p -> new MonitoramentoPontoDTO(p.dataHora(), p.valor()))
				.toList();

		// Serie vazia e resposta legitima (sonda sem leitura no periodo), nao erro.
		// A serie vai no eco: sem ela o chamador nao distingue duas respostas do mesmo dispositivo.
		return new MonitoramentoSerieDTO(idSondaUnidade, dispositivoId, serie, pontosDto);
	}
}
