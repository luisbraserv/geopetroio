package com.geopetro.desktop.services;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Login no Braserv-Core, em um lugar so.
 *
 * <p>Dois caminhos do Desktop precisam autenticar, e sao <b>coisas diferentes</b>:
 *
 * <table>
 *   <tr><th></th><th>Canal de tempo real</th><th>Sessao de configuracao</th></tr>
 *   <tr><td>Quem</td><td>Usuario de servico da frota</td><td>Uma pessoa, ADMIN ou SUPORTE</td></tr>
 *   <tr><td>Credencial</td><td>Gravada nas configuracoes</td><td>Digitada, so em memoria</td></tr>
 *   <tr><td>Duracao</td><td>Enquanto o app roda</td><td>Ate fechar o app</td></tr>
 * </table>
 *
 * <p>⚠️ <b>Nao reaproveitar a credencial de servico para configurar.</b> Ela e uma so para toda a
 * frota (SEC-011) e tem perfil de monitoramento; se ela liberasse configuracao, qualquer maquina
 * instalada em qualquer unidade configuraria qualquer coisa.
 *
 * <p>A extracao existe para nao haver duas implementacoes de login divergindo — a base ja teve o
 * fator bar-PSI declarado duas vezes com precisoes diferentes, e uma ficou para tras.
 */
public class BackendLogin {

	private static final Pattern TOKEN = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"");
	private static final Pattern ROLES = Pattern.compile("\"roles\"\\s*:\\s*\\[([^\\]]*)\\]");
	private static final Pattern ROLE = Pattern.compile("\"([A-Z_]+)\"");

	private final HttpClient httpClient;

	public BackendLogin(HttpClient httpClient) {
		this.httpClient = httpClient;
	}

	/** O que o Core devolve no login. As roles vem sem o prefixo {@code ROLE_}. */
	public record Identidade(String token, Set<String> roles) {
	}

	/**
	 * @param baseUrl já normalizada, sem barra final
	 * @throws IllegalStateException credencial recusada, Core fora ou resposta sem token
	 */
	public Identidade autenticar(String baseUrl, String usuario, String senha) throws Exception {
		String corpo = "{\"username\":\"" + escapar(usuario) + "\",\"password\":\"" + escapar(senha) + "\"}";

		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create(baseUrl + "/api/auth/login"))
				.header("Content-Type", "application/json")
				.timeout(Duration.ofSeconds(10))
				.POST(HttpRequest.BodyPublishers.ofString(corpo, StandardCharsets.UTF_8))
				.build();

		HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
		if (response.statusCode() != 200) {
			throw new IllegalStateException("login recusado pelo Braserv-Core (HTTP " + response.statusCode() + ")");
		}

		Matcher token = TOKEN.matcher(response.body());
		if (!token.find()) {
			throw new IllegalStateException("resposta de login sem token");
		}
		return new Identidade(token.group(1), extrairRoles(response.body()));
	}

	private static Set<String> extrairRoles(String corpo) {
		Set<String> roles = new LinkedHashSet<>();
		Matcher bloco = ROLES.matcher(corpo);
		if (bloco.find()) {
			Matcher role = ROLE.matcher(bloco.group(1));
			while (role.find()) {
				// O Core pode devolver com ou sem o prefixo do Spring Security.
				roles.add(role.group(1).replaceFirst("^ROLE_", ""));
			}
		}
		return roles;
	}

	private static String escapar(String valor) {
		return valor == null ? "" : valor.replace("\\", "\\\\").replace("\"", "\\\"");
	}
}
