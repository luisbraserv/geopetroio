package com.braservpetroleo.telemetria.geopetroio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Parametros do seed sintetico, disponivel exclusivamente no profile de desenvolvimento. */
@ConfigurationProperties(prefix = "telemetria.seed")
public class TelemetriaSeedProperties {

	private boolean habilitado;

	/** Id da unidade no Braserv-Core que recebe a serie sintetica. */
	private String idUnidade = "SPT-145";

	private int pontosPorVariavel = 28_800;

	public boolean isHabilitado() {
		return habilitado;
	}

	public void setHabilitado(boolean habilitado) {
		this.habilitado = habilitado;
	}

	public String getIdUnidade() {
		return idUnidade;
	}

	public void setIdUnidade(String idUnidade) {
		this.idUnidade = idUnidade;
	}

	public int getPontosPorVariavel() {
		return pontosPorVariavel;
	}

	public void setPontosPorVariavel(int pontosPorVariavel) {
		this.pontosPorVariavel = pontosPorVariavel;
	}
}
