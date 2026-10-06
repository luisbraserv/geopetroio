package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.sun.net.httpserver.HttpServer;
import org.junit.jupiter.api.*;
import org.springframework.test.util.ReflectionTestUtils;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ConcurrentLinkedQueue;
import static org.junit.jupiter.api.Assertions.*;

class BackendLoginRouteTest {
    private HttpServer server;
    private String base;
    private final ConcurrentLinkedQueue<String> requests = new ConcurrentLinkedQueue<>();
    @BeforeEach void start() throws Exception {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            requests.add(exchange.getRequestMethod() + " " + path);
            String body;
            int status;
            if (path.equals("/api/auth/login") && exchange.getRequestMethod().equals("POST")) {
                String payload = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                if (!payload.contains("\"username\":\"test-user\"") || !payload.contains("\"password\":\"test-only\"")) {
                    status = 400; body = "{}";
                } else { status = 200; body = "{\"token\":\"test-token\"}"; }
            } else if (path.equals("/api/monitoramento/unidades/minhas") && "Bearer test-token".equals(exchange.getRequestHeaders().getFirst("Authorization"))) {
				status = 200; body = "[{\"id\":1,\"nome\":\"TEST-1\",\"apelido\":\"Teste\",\"tipo\":\"SONDA\"}]";
            } else { status = 404; body = "{}"; }
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "application/json");
            exchange.sendResponseHeaders(status, bytes.length);
            try (var output = exchange.getResponseBody()) { output.write(bytes); }
        });
        server.start();
        base = "http://127.0.0.1:" + server.getAddress().getPort() + "/";
    }
    @AfterEach void stop() { server.stop(0); }

    @Test void catalogAuthenticatesThenUsesTheBearerTokenToListUnits() {
        var units = new UnidadeSondaCatalogoService().listar(base, "test-user", "test-only");
        assertEquals(1, units.size());
        assertEquals(java.util.List.of("POST /api/auth/login", "GET /api/monitoramento/unidades/minhas"), java.util.List.copyOf(requests));
    }

    @Test void realtimeLoginUsesTheSameNewEndpointWithoutStartingTheWorker() {
        var settings = new AppSettings();
        settings.setBackendUrl(base);
        settings.setBackendUsuario("test-user");
        settings.setBackendSenha("test-only");
        // Isola o login HTTP do worker e da conexao STOMP: nenhum CLP e acessado.
        String token = ReflectionTestUtils.invokeMethod(new TelemetriaRealtimeService(), "autenticar", settings);
        assertEquals("test-token", token);
        assertEquals(java.util.List.of("POST /api/auth/login"), java.util.List.copyOf(requests));
    }
}
