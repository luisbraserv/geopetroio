package com.braservpetroleo.telemetria.geopetroio.adapter.in.web;

import java.time.Instant;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.braservpetroleo.telemetria.geopetroio.adapter.in.web.dto.MonitoramentoSerieDTO;
import com.braservpetroleo.telemetria.geopetroio.application.service.ConsultaSerieService;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.constraints.NotBlank;

/**
 * API de consulta de series temporais.
 *
 * <p><b>Consumidor unico: o Backend-Sonda.</b> O caminho e o formato de resposta sao ditados pelo
 * {@code MonitoramentoClient} que ja existe la — este servico foi escrito para encaixar no cliente,
 * nao o contrario. Ver specs/contracts/rest-monitoramento.md.
 *
 * <p>O frontend nunca chama este servico diretamente: quem valida o vinculo do usuario com a sonda e
 * o Backend-Sonda, que possui o cadastro.
 */
@RestController
@RequestMapping("/api/monitoramentos")
@Tag(name = "Monitoramento", description = "Consulta de series temporais de telemetria de sondas")
public class MonitoramentoController {

	private final ConsultaSerieService service;

	public MonitoramentoController(ConsultaSerieService service) {
		this.service = service;
	}

	@GetMapping("/sondas/{idSondaUnidade}/series")
	@Operation(summary = "Consulta a serie de um dispositivo numa sonda",
			description = "Retorna os pontos do intervalo. Acima do teto configurado "
					+ "(telemetria.max-pontos-por-serie) a serie e agregada por janela, para nao "
					+ "devolver dezenas de milhares de pontos.")
	public ResponseEntity<MonitoramentoSerieDTO> consultarSerie(
			@PathVariable @NotBlank String idSondaUnidade,

			@Parameter(description = "Ex.: PESO_COLUNA_01, TORQUE_01, TORQUE_02, PRESSAO_01, VAZAO_01")
			@RequestParam @NotBlank String dispositivoId,

			@Parameter(description = "Instante inicial, ISO-8601 em UTC (ex.: 2026-08-27T10:00:00Z)")
			@RequestParam Instant inicio,

			@Parameter(description = "Instante final, ISO-8601 em UTC")
			@RequestParam Instant fim) {

		return ResponseEntity.ok(service.consultar(idSondaUnidade, dispositivoId, inicio, fim));
	}
}
