package com.braservpetroleo.telemetria.geopetroio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Conexao com o InfluxDB, onde a serie temporal e persistida. */
@ConfigurationProperties(prefix = "influx")
public class InfluxProperties {

	private String url = "http://localhost:8086";

	private String token = "";

	private String org = "braserv";

	private String bucket = "telemetria";

	/** Nome da measurement. Alterar quebra a leitura do historico ja gravado. */
	private String measurement = "telemetria";

	public String getUrl() {
		return url;
	}

	public void setUrl(String url) {
		this.url = url;
	}

	public String getToken() {
		return token;
	}

	public void setToken(String token) {
		this.token = token;
	}

	public String getOrg() {
		return org;
	}

	public void setOrg(String org) {
		this.org = org;
	}

	public String getBucket() {
		return bucket;
	}

	public void setBucket(String bucket) {
		this.bucket = bucket;
	}

	public String getMeasurement() {
		return measurement;
	}

	public void setMeasurement(String measurement) {
		this.measurement = measurement;
	}
}
