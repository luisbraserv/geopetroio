package com.example.demo.config;

import java.io.InputStream;
import java.util.Optional;
import java.util.Properties;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.demo.models.AppSettings;

/**
 * Em que ambiente o Desktop está rodando, e os endereços que valem nele.
 *
 * <h2>Produção é o app instalado</h2>
 * Mesma regra de {@link AppPaths}: o jpackage define {@code jpackage.app-version}, e ela só existe
 * no app instalado. Em produção, Core, Backend e broker vêm de {@code ambiente-producao.properties},
 * empacotado no build, e valem sobre o {@code app-settings.json}. Antes de 2026-10-02 cada estação
 * digitava o servidor nas Configurações, e uma instalação nova nascia apontando para
 * {@code localhost} — sem servidor não havia login, e sem login não se definia o servidor.
 *
 * <p>Em desenvolvimento ({@code mvnw javafx:run}) nada muda: os endereços continuam os do arquivo
 * de configurações, editáveis. {@code -Dgeopetro.ambiente=producao} força o comportamento de
 * produção sem instalar, para testar.
 */
public final class Ambiente {

	private static final Logger logger = LoggerFactory.getLogger(Ambiente.class);
	private static final String ARQUIVO = "/ambiente-producao.properties";

	private static volatile Properties producao;

	private Ambiente() {
	}

	public static boolean producao() {
		return System.getProperty("jpackage.app-version") != null
				|| "producao".equalsIgnoreCase(System.getProperty("geopetro.ambiente"));
	}

	/** URL do backend definida pelo build; vazio fora de produção. */
	public static Optional<String> backendUrl() {
		return valor("backend.url");
	}

	/** URL do Braserv-Core definida pelo build; vazio fora de producao. */
	public static Optional<String> coreUrl() {
		return valor("core.url");
	}

	/** URL do broker MQTT definida pelo build; vazio fora de produção. */
	public static Optional<String> telemetriaUrl() {
		return valor("telemetria.url");
	}

	/** Usuario do broker MQTT definido pelo build; vazio fora de producao. */
	public static Optional<String> telemetriaUsuario() {
		return valor("telemetria.usuario");
	}

	/** Senha do broker MQTT definida pelo build; vazia fora de producao. */
	public static Optional<String> telemetriaSenha() {
		return valor("telemetria.senha");
	}

	/** Em produção, troca os endereços pelos do build. Fora dela, devolve como veio. */
	public static AppSettings aplicar(AppSettings settings) {
		if (settings == null) {
			return null;
		}
		backendUrl().ifPresent(settings::setBackendUrl);
		coreUrl().ifPresent(settings::setCoreUrl);
		telemetriaUrl().ifPresent(settings::setTelemetriaUrl);
		telemetriaUsuario().ifPresent(settings::setTelemetriaUsuario);
		telemetriaSenha().ifPresent(settings::setTelemetriaSenha);
		return settings;
	}

	private static Optional<String> valor(String chave) {
		if (!producao()) {
			return Optional.empty();
		}
		String valor = carregar().getProperty(chave);
		return valor == null || valor.isBlank() ? Optional.empty() : Optional.of(valor.trim());
	}

	private static Properties carregar() {
		Properties atual = producao;
		if (atual != null) {
			return atual;
		}
		Properties lidas = new Properties();
		try (InputStream in = Ambiente.class.getResourceAsStream(ARQUIVO)) {
			if (in == null) {
				logger.error("{} ausente no build de producao: os enderecos ficam os de app-settings.json.", ARQUIVO);
			} else {
				lidas.load(in);
			}
		} catch (Exception e) {
			logger.error("Nao foi possivel ler {}: {}", ARQUIVO, e.getMessage());
		}
		producao = lidas;
		return lidas;
	}
}
