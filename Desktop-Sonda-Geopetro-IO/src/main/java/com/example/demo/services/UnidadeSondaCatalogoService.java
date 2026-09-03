package com.example.demo.services;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.example.demo.models.UnidadeSondaOpcao;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Busca no Backend-Sonda as Unidades/Sondas que o usuario de servico desta estacao pode ver.
 *
 * <p>Serve a tela de Configuracoes: em vez de digitar o id numerico do cadastro e o codigo do
 * historico separadamente, o usuario escolhe a sonda numa lista e os dois enderecos vem prontos e
 * coerentes.
 *
 * <p><b>Escopo deliberadamente estreito:</b> este servico e sincrono e so e chamado quando a tela de
 * Configuracoes abre ou quando o usuario manda recarregar a lista. O caminho de telemetria nao passa
 * por aqui — MQTT e WebSocket continuam lendo o que ja esta salvo, e seguem funcionando com o
 * backend fora do ar.
 */
@Service
public class UnidadeSondaCatalogoService {

    private static final Logger logger = LoggerFactory.getLogger(UnidadeSondaCatalogoService.class);

    private static final Pattern TOKEN_PATTERN = Pattern.compile("\"token\"\\s*:\\s*\"([^\"]+)\"");
    private static final Duration TIMEOUT = Duration.ofSeconds(10);

    private final HttpClient httpClient = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();

    private final ObjectMapper mapper = new ObjectMapper();

    /**
     * Lista as sondas visiveis para as credenciais informadas.
     *
     * @throws CatalogoIndisponivelException quando o backend nao responde ou recusa o login; a tela
     *         mostra a mensagem e mantem o que ja estava configurado.
     */
    public List<UnidadeSondaOpcao> listar(String backendUrl, String usuario, String senha) {
        if (backendUrl == null || backendUrl.isBlank()) {
            throw new CatalogoIndisponivelException("Informe a URL do Backend.");
        }
        if (usuario == null || usuario.isBlank() || senha == null || senha.isBlank()) {
            throw new CatalogoIndisponivelException("Informe usuário e senha do Backend.");
        }

        String base = normalizarBase(backendUrl);
        try {
            String token = autenticar(base, usuario, senha);
            return buscarSondas(base, token);
        } catch (CatalogoIndisponivelException e) {
            throw e;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new CatalogoIndisponivelException("Consulta interrompida.");
        } catch (Exception e) {
            logger.warn("Falha ao listar Unidades/Sondas no backend: {}", e.getMessage());
            throw new CatalogoIndisponivelException("Não foi possível falar com o Backend: " + e.getMessage());
        }
    }

    private String autenticar(String base, String usuario, String senha) throws Exception {
        String corpo = "{\"username\":\"" + escapar(usuario) + "\",\"password\":\"" + escapar(senha) + "\"}";

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(base + "/auth/login"))
                .header("Content-Type", "application/json")
                .timeout(TIMEOUT)
                .POST(HttpRequest.BodyPublishers.ofString(corpo, StandardCharsets.UTF_8))
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 401 || response.statusCode() == 403) {
            throw new CatalogoIndisponivelException("Usuário ou senha do Backend recusados.");
        }
        if (response.statusCode() != 200) {
            throw new CatalogoIndisponivelException("Login recusado pelo Backend (HTTP " + response.statusCode() + ").");
        }

        Matcher matcher = TOKEN_PATTERN.matcher(response.body());
        if (!matcher.find()) {
            throw new CatalogoIndisponivelException("Resposta de login sem token.");
        }
        return matcher.group(1);
    }

    private List<UnidadeSondaOpcao> buscarSondas(String base, String token) throws Exception {
        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(base + "/api/sondas/minhas"))
                .header("Authorization", "Bearer " + token)
                .timeout(TIMEOUT)
                .GET()
                .build();

        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
        if (response.statusCode() == 403) {
            throw new CatalogoIndisponivelException("Este usuário não tem acesso a nenhuma Unidade/Sonda.");
        }
        if (response.statusCode() != 200) {
            throw new CatalogoIndisponivelException("Backend respondeu HTTP " + response.statusCode() + ".");
        }

        JsonNode raiz = mapper.readTree(response.body());
        if (!raiz.isArray()) {
            throw new CatalogoIndisponivelException("Resposta inesperada do Backend.");
        }

        List<UnidadeSondaOpcao> opcoes = new ArrayList<>();
        for (JsonNode no : raiz) {
            JsonNode id = no.path("id");
            if (!id.isNumber()) {
                // Sem o id numerico nao da para enderecar o tempo real; a entrada nao serve.
                continue;
            }
            opcoes.add(new UnidadeSondaOpcao(
                    id.asLong(),
                    texto(no, "idSondaUnidade"),
                    texto(no, "nome"),
                    texto(no, "apelido")));
        }
        return opcoes;
    }

    private String texto(JsonNode no, String campo) {
        JsonNode valor = no.path(campo);
        return valor.isTextual() ? valor.asText() : null;
    }

    private String normalizarBase(String url) {
        String base = url.trim();
        return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
    }

    private String escapar(String valor) {
        if (valor == null) {
            return "";
        }
        return valor.replace("\\", "\\\\").replace("\"", "\\\"");
    }

    /** Backend inacessivel, credenciais recusadas ou resposta inesperada. */
    public static class CatalogoIndisponivelException extends RuntimeException {
        public CatalogoIndisponivelException(String mensagem) {
            super(mensagem);
        }
    }
}
