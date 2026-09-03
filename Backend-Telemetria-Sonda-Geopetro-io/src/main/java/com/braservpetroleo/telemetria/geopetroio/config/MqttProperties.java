package com.braservpetroleo.telemetria.geopetroio.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Conexao com o broker MQTT do qual este servico e o unico consumidor. */
@ConfigurationProperties(prefix = "mqtt")
public class MqttProperties {

	private String brokerUrl = "tcp://localhost:1883";

	private String clientId = "backend-telemetria-geopetro-io";

	/** Um nivel por unidade, terminando em 'batch' — mais restrito que telemetria/+/+. */
	private String topico = "telemetria/+/batch";

	private int qos = 1;

	private String username = "";

	private String password = "";

	private boolean cleanSession = true;

	private int connectionTimeoutSegundos = 10;

	private int keepAliveSegundos = 60;

	/** Se true, falha ao subir quando o broker estiver inacessivel. Ver MqttConfig. */
	private boolean falharSeBrokerIndisponivel = false;

	public String getBrokerUrl() {
		return brokerUrl;
	}

	public void setBrokerUrl(String brokerUrl) {
		this.brokerUrl = brokerUrl;
	}

	public String getClientId() {
		return clientId;
	}

	public void setClientId(String clientId) {
		this.clientId = clientId;
	}

	public String getTopico() {
		return topico;
	}

	public void setTopico(String topico) {
		this.topico = topico;
	}

	public int getQos() {
		return qos;
	}

	public void setQos(int qos) {
		this.qos = qos;
	}

	public String getUsername() {
		return username;
	}

	public void setUsername(String username) {
		this.username = username;
	}

	public String getPassword() {
		return password;
	}

	public void setPassword(String password) {
		this.password = password;
	}

	public boolean isCleanSession() {
		return cleanSession;
	}

	public void setCleanSession(boolean cleanSession) {
		this.cleanSession = cleanSession;
	}

	public int getConnectionTimeoutSegundos() {
		return connectionTimeoutSegundos;
	}

	public void setConnectionTimeoutSegundos(int connectionTimeoutSegundos) {
		this.connectionTimeoutSegundos = connectionTimeoutSegundos;
	}

	public int getKeepAliveSegundos() {
		return keepAliveSegundos;
	}

	public void setKeepAliveSegundos(int keepAliveSegundos) {
		this.keepAliveSegundos = keepAliveSegundos;
	}

	public boolean isFalharSeBrokerIndisponivel() {
		return falharSeBrokerIndisponivel;
	}

	public void setFalharSeBrokerIndisponivel(boolean falharSeBrokerIndisponivel) {
		this.falharSeBrokerIndisponivel = falharSeBrokerIndisponivel;
	}

	public boolean temCredenciais() {
		return username != null && !username.isBlank();
	}
}
