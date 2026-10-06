package com.braservpetroleo.telemetria.geopetroio.application.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.ExistenciaSerieDTO;
import com.braservpetroleo.telemetria.geopetroio.infrastructure.influx.InfluxTelemetriaRepository;

/**
 * Responde se uma sonda tem historico gravado — RN-072.
 *
 * <p>Serve a uma pergunta de <b>cadastro</b>, nao de monitoramento: o Geopetro-Backend precisa saber se
 * pode excluir a Unidade/Sonda, e o vinculo que ele enxerga e relacional, enquanto a serie vive aqui.
 *
 * <p>Fica separado do {@link ConsultaSerieService} porque a pergunta e outra e a resposta tambem: la
 * o modelo de leitura e uma serie agregada com teto de pontos; aqui sao dois instantes.
 *
 * <p><b>Este servico tambem nao autoriza.</b> Como todo o resto da API, confia no Geopetro-Backend.
 */
@Service
public class ConsultaExistenciaService {

	private static final Logger log = LoggerFactory.getLogger(ConsultaExistenciaService.class);

	private final InfluxTelemetriaRepository repository;

	public ConsultaExistenciaService(InfluxTelemetriaRepository repository) {
		this.repository = repository;
	}

	public ExistenciaSerieDTO consultar(String idUnidade) {
		return repository.consultarIntervalo(idUnidade)
				.map(intervalo -> {
					log.debug("Unidade {} possui serie de {} a {}", idUnidade,
							intervalo.primeiroPonto(), intervalo.ultimoPonto());
					return new ExistenciaSerieDTO(idUnidade, true,
							intervalo.primeiroPonto(), intervalo.ultimoPonto());
				})
				.orElseGet(() -> {
					// Ausencia de serie e resposta legitima, nao erro: sonda cadastrada que nunca
					// publicou, ou cujo historico ja saiu pela retencao.
					log.debug("Unidade {} nao possui serie gravada", idUnidade);
					return ExistenciaSerieDTO.vazia(idUnidade);
				});
	}
}
