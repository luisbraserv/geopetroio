package com.geopetro.desktop.models;

import java.time.LocalDateTime;
import java.util.List;

/**
 * O que a carta de operação deve conter.
 *
 * <h2>⚠️ Os cinco booleanos saíram — 2026-09-08</h2>
 * Eram {@code includePesoColuna}, {@code includeTorqueTubos}, {@code includeTorqueFlutuante},
 * {@code includePressaoBomba} e {@code includeFlowRate}: o espelho das cinco grandezas que toda
 * sonda tinha.
 *
 * <p>Com cards por unidade eles não conseguem mais representar a escolha — uma unidade com dois
 * tanques e três torques não tem booleano para cada. No lugar entra a lista de <b>séries</b>
 * escolhidas, identificadas por {@code dispositivoId|serie}, que é a mesma chave do H2 local.
 *
 * @param series chaves das séries a incluir; vazio significa <b>todas</b> as encontradas na janela
 */
public record OperationChartRequest(
		String title,
		String wellName,
		LocalDateTime start,
		LocalDateTime end,
		List<String> series) {

	public OperationChartRequest {
		series = series == null ? List.of() : List.copyOf(series);
	}

	/** Vazio quer dizer "tudo o que houver": é o que quem gera espera ao não escolher nada. */
	public boolean inclui(String chave) {
		return series.isEmpty() || series.contains(chave);
	}

	// Acessores no estilo antigo, para não obrigar a reescrever os chamadores de uma vez.
	public String getTitle() {
		return title;
	}

	public String getWellName() {
		return wellName;
	}

	public LocalDateTime getStart() {
		return start;
	}

	public LocalDateTime getEnd() {
		return end;
	}
}
