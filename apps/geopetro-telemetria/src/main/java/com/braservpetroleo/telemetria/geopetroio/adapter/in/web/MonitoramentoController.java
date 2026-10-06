package com.braservpetroleo.telemetria.geopetroio.adapter.in.web;

import java.time.Instant;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.ExistenciaSerieDTO;
import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.MonitoramentoSerieDTO;
import com.braservpetroleo.telemetria.geopetroio.application.service.ConsultaExistenciaService;
import com.braservpetroleo.telemetria.geopetroio.application.service.ConsultaSerieService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotBlank;

/**
 * API de consulta de series temporais.
 *
 * <p><b>Consumidor unico: o Geopetro-Backend.</b> O caminho e o formato de resposta sao ditados pelo
 * {@code MonitoramentoClient} que ja existe la — este servico foi escrito para encaixar no cliente,
 * nao o contrario. Ver specs/SDD/software/apis/rest-monitoramento.md.
 *
 * <p>O frontend nunca chama este servico diretamente: quem valida o vinculo do usuario com a sonda e
 * o Geopetro-Backend, que possui o cadastro.
 */
@RestController
@RequestMapping("/api/monitoramentos")
@Tag(name = "Monitoramento", description = "Consulta de series temporais de telemetria das unidades")
public class MonitoramentoController {

	private final ConsultaSerieService service;
	private final ConsultaExistenciaService existenciaService;

	public MonitoramentoController(ConsultaSerieService service, ConsultaExistenciaService existenciaService) {
		this.service = service;
		this.existenciaService = existenciaService;
	}

	@GetMapping("/unidades/{idUnidade}/series")
	@Operation(summary = "Consulta a serie de um dispositivo numa unidade",
			description = "Retorna os pontos do intervalo. Acima do teto configurado "
					+ "(telemetria.max-pontos-por-serie) a serie e agregada por janela, para nao "
					+ "devolver dezenas de milhares de pontos.")
	public ResponseEntity<MonitoramentoSerieDTO> consultarSerie(
			@PathVariable @NotBlank String idUnidade,

			@Parameter(description = "Id do card, gerado como <TIPO>_<NN>. Ex.: PESO_01, TORQUE_02, "
					+ "PRESSAO_01, CONTADOR_STROKE_01. O conjunto e por unidade, nao do sistema.")
			@RequestParam @NotBlank String dispositivoId,

			@Parameter(description = "Qual das series do dispositivo: stroke, vazao ou "
					+ "volumeAcumulado num card CONTADOR_STROKE (RN-098). Omitir significa a serie "
					+ "unica do dispositivo — nao 'todas as series': um card de stroke consultado "
					+ "sem este parametro devolve vazio, em vez das tres misturadas.")
			@RequestParam(required = false) String serie,

			@Parameter(description = "Instante inicial, ISO-8601 em UTC (ex.: 2026-08-27T10:00:00Z)")
			@RequestParam Instant inicio,

			@Parameter(description = "Instante final, ISO-8601 em UTC")
			@RequestParam Instant fim) {

		return ResponseEntity.ok(service.consultar(idUnidade, dispositivoId, serie, inicio, fim));
	}

	@GetMapping("/unidades/{idUnidade}/existe")
	@Operation(summary = "Informa se a unidade possui serie gravada",
			description = "Responde a exclusao de cadastro no Geopetro-Backend (RN-072): historico de "
					+ "telemetria conta como vinculo. Devolve tambem o primeiro e o ultimo ponto, "
					+ "para a recusa dizer de quando ate quando ha telemetria. Consulta os extremos "
					+ "da serie, nao varredura.")
	public ResponseEntity<ExistenciaSerieDTO> consultarExistencia(
			@PathVariable @NotBlank String idUnidade) {

		return ResponseEntity.ok(existenciaService.consultar(idUnidade));
	}
}
