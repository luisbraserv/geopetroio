package com.braservpetroleo.telemetria.geopetroio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Parametros do seed sintetico, disponivel exclusivamente no profile de desenvolvimento. */
@ConfigurationProperties(prefix = "telemetria.seed")
public class TelemetriaSeedProperties {

	private boolean habilitado;

	private String idSondaUnidade = "SPT-145";

	private int pontosPorVariavel = 28_800;

	public boolean isHabilitado() {
		return habilitado;
	}

	public void setHabilitado(boolean habilitado) {
		this.habilitado = habilitado;
	}

	public String getIdSondaUnidade() {
		return idSondaUnidade;
	}

	public void setIdSondaUnidade(String idSondaUnidade) {
		this.idSondaUnidade = idSondaUnidade;
	}

	public int getPontosPorVariavel() {
		return pontosPorVariavel;
	}

	public void setPontosPorVariavel(int pontosPorVariavel) {
		this.pontosPorVariavel = pontosPorVariavel;
	}
}
