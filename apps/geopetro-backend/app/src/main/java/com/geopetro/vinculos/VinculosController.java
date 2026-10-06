package com.geopetro.vinculos;

import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import io.swagger.v3.oas.annotations.Hidden;

/**
 * Responde ao Braserv-Core se uma unidade ja foi usada aqui — RN-116, contrato braserv-core §5.
 *
 * <p>O core so apaga uma unidade que nunca foi usada. Limites, cards, alarmes e telemetria vivem
 * deste lado, e este endpoint confere os quatro. So o core chama (token de servico com o escopo
 * {@code unidades:vinculos}, ver {@code SecurityConfig}).
 *
 * <p><b>Uma fonte sem resposta faz o endpoint responder 503</b>, nunca {@code emUso: false}: o
 * core trata 503 como "em uso" e recusa a exclusao. Apagar por engano deixaria limites, alarmes e
 * telemetria orfaos; recusar por engano custa tentar de novo.
 */
@Hidden
@RestController
public class VinculosController {

	private static final Logger log = LoggerFactory.getLogger(VinculosController.class);

	private final List<VinculoDaUnidade> fontes;

	public VinculosController(List<VinculoDaUnidade> fontes) {
		this.fontes = List.copyOf(fontes);
	}

	@GetMapping("/internal/v1/unidades/{id}/vinculos")
	public ResponseEntity<?> vinculos(@PathVariable long id) {
		List<String> vinculos = new ArrayList<>();
		for (VinculoDaUnidade fonte : fontes) {
			try {
				fonte.descrever(id).ifPresent(vinculos::add);
			} catch (VinculoDaUnidade.FonteIndisponivelException indisponivel) {
				log.warn("Vinculos da unidade {} nao confirmados: {}", id, indisponivel.getMessage());
				return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new Erro(indisponivel.getMessage()));
			}
		}
		return ResponseEntity.ok(new Resposta(!vinculos.isEmpty(), vinculos));
	}

	public record Resposta(boolean emUso, List<String> vinculos) {
	}

	public record Erro(String mensagem) {
	}
}
