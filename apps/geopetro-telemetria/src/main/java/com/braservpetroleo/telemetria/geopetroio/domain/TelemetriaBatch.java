package com.braservpetroleo.telemetria.geopetroio.domain;

import java.time.Instant;
import java.util.List;

/**
 * Um ciclo de leitura da sonda: todas as grandezas habilitadas medidas no mesmo instante.
 *
 * <p>O produtor (Geopetro-Desktop) publica uma mensagem por ciclo (1 segundo). Ver
 * {@code specs/SDD/software/mqtt/mqtt-telemetria.md}.
 *
	 * @param idUnidade      nome da unidade no Braserv-Core, chave de correlacao da serie (RN-018)
 * @param dataHora       instante da leitura, ja normalizado para UTC
 * @param leituras       ao menos uma leitura
 */
public record TelemetriaBatch(String idUnidade, Instant dataHora, List<LeituraTelemetria> leituras) {

	public TelemetriaBatch {
		if (idUnidade == null || idUnidade.isBlank()) {
			throw new IllegalArgumentException("idUnidade e obrigatorio");
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
