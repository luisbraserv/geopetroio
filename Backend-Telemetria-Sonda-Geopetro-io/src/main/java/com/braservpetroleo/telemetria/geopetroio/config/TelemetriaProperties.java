package com.braservpetroleo.telemetria.geopetroio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Parametros gerais de interpretacao e consulta da telemetria. */
@ConfigurationProperties(prefix = "telemetria")
public class TelemetriaProperties {

	/**
	 * Zona usada para interpretar o campo dataHora quando ele vier sem offset — que e o caso do
	 * produtor atual. Ver specs/contracts/mqtt-telemetria.md secao 7.
	 */
	private String zonaSonda = "America/Sao_Paulo";

	/**
	 * Teto de pontos por serie na consulta REST. Acima disso o servico agrega por janela em vez de
	 * retornar dado bruto. Sem isso, 6h a 1 leitura/s devolveriam 21.600 pontos por serie — e a tela
	 * pede ate 5 series em paralelo.
	 */
	private int maxPontosPorSerie = 2000;

	/** Se falso, retorna sempre dado bruto e apenas trunca no teto (util para depuracao). */
	private boolean agregarQuandoExcederTeto = true;

	public String getZonaSonda() {
		return zonaSonda;
	}

	public void setZonaSonda(String zonaSonda) {
		this.zonaSonda = zonaSonda;
	}

	public int getMaxPontosPorSerie() {
		return maxPontosPorSerie;
	}

	public void setMaxPontosPorSerie(int maxPontosPorSerie) {
		this.maxPontosPorSerie = maxPontosPorSerie;
	}

	public boolean isAgregarQuandoExcederTeto() {
		return agregarQuandoExcederTeto;
	}

	public void setAgregarQuandoExcederTeto(boolean agregarQuandoExcederTeto) {
		this.agregarQuandoExcederTeto = agregarQuandoExcederTeto;
	}
}
