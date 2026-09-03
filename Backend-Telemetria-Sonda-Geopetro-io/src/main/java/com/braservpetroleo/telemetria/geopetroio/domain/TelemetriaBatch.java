package com.braservpetroleo.telemetria.geopetroio.domain;

import java.time.Instant;
import java.util.List;

/**
 * Um ciclo de leitura da sonda: todas as grandezas habilitadas medidas no mesmo instante.
 *
 * <p>O produtor (Desktop-Sonda) publica uma mensagem por ciclo (1 segundo). Ver
 * {@code specs/contracts/mqtt-telemetria.md}.
 *
 * @param idSondaUnidade nome da Unidade/Sonda no cadastro (ex.: SPT-144) — chave de correlacao
 * @param dataHora       instante da leitura, ja normalizado para UTC
 * @param leituras       ao menos uma leitura
 */
public record TelemetriaBatch(String idSondaUnidade, Instant dataHora, List<LeituraTelemetria> leituras) {

	public TelemetriaBatch {
		if (idSondaUnidade == null || idSondaUnidade.isBlank()) {
			throw new IllegalArgumentException("idSondaUnidade e obrigatorio");
		}
		if (dataHora == null) {
			throw new IllegalArgumentException("dataHora e obrigatoria");
		}
		if (leituras == null || leituras.isEmpty()) {
			throw new IllegalArgumentException("batch precisa conter ao menos uma leitura");
		}
		leituras = List.copyOf(leituras);
	}
}
