package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentLinkedQueue;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.models.CardsDaUnidade.Conexao;
import com.example.demo.models.CardsDaUnidade.Parametros;
import com.example.demo.models.CardsDaUnidade.Tipo;
import com.sun.net.httpserver.HttpServer;

/**
 * O cliente de {@code /api/sondas/{id}/cards} — passo 6 de {@code cards-configuraveis.md §13}.
 *
 * <p>Backend de verdade num servidor local, como em {@link SessaoConfiguracaoTest}: o que se quer
 * provar é o comportamento diante das respostas reais, inclusive as de erro, que são metade do valor
 * desta classe — cada status vira uma mensagem diferente na tela.
 */
class ConfiguracaoCardsClientTest {

	private HttpServer servidor;
	private String base;

	/** O que cada requisição trouxe, para conferir método, cabeçalho e corpo. */
	private record Chamada(String metodo, String caminho, String autorizacao, String corpo) {
	}

	private final ConcurrentLinkedQueue<Chamada> chamadas = new ConcurrentLinkedQueue<>();

	private volatile int status = 200;
	private volatile String corpo = "{}";

	@BeforeEach
	void subir() throws Exception {
		servidor = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		servidor.createContext("/api/sondas", troca -> {
			chamadas.add(new Chamada(
					troca.getRequestMethod(),
					troca.getRequestURI().getPath(),
					troca.getRequestHeaders().getFirst("Authorization"),
					new String(troca.getRequestBody().readAllBytes(), StandardCharsets.UTF_8)));
			byte[] bytes = corpo.getBytes(StandardCharsets.UTF_8);
			troca.getResponseHeaders().set("Content-Type", "application/json");
			troca.sendResponseHeaders(status, bytes.length);
			try (var saida = troca.getResponseBody()) {
				saida.write(bytes);
			}
		});
		servidor.start();
		base = "http://127.0.0.1:" + servidor.getAddress().getPort();
	}

	@AfterEach
	void derrubar() {
		servidor.stop(0);
	}

	private ConfiguracaoCardsClient cliente() {
		return cliente(base, "token-da-sessao");
	}

	private ConfiguracaoCardsClient cliente(String backendUrl, String token) {
		AppSettings settings = new AppSettings();
		settings.setBackendUrl(backendUrl);
		SettingsService service = mock(SettingsService.class);
		when(service.loadSettings()).thenReturn(settings);

		SessaoConfiguracao sessao = mock(SessaoConfiguracao.class);
		when(sessao.token()).thenReturn(Optional.ofNullable(token));

		return new ConfiguracaoCardsClient(service, sessao, HttpClient.newHttpClient());
	}

	@Test
	@DisplayName("le o documento e devolve os cards")
	void leDocumento() {
		corpo = """
				{"schemaVersion":1,"unidadeSondaId":144,"revisao":7,
				 "conexao":{"ip":"192.168.0.10","rack":0,"slot":1,"dbNumero":1,"intervaloLeituraMs":1000},
				 "cards":[{"dispositivoId":"PRESSAO_01","nome":"Bomba de Lama","tipo":"PRESSAO",
				           "byteInicial":10,"ativo":true,"visivel":true,"ordem":0,
				           "parametros":{"rangeSensorBar":250.0}}],
				 "atualizadoPor":"ana","atualizadoEm":"2026-09-07T12:00:00Z"}""";

		var documento = cliente().ler(144);

		assertEquals(7, documento.revisao());
		assertEquals("192.168.0.10", documento.conexao().ip());
		assertEquals(1, documento.cards().size());
		Card card = documento.cards().get(0);
		assertEquals("PRESSAO_01", card.dispositivoId());
		assertEquals(Tipo.PRESSAO, card.tipo());
		assertEquals(250.0, card.parametros().rangeSensorBar());
		assertTrue(documento.configurada());
	}

	@Test
	@DisplayName("o token da sessao vai no Authorization — nao a credencial de servico")
	void mandaOTokenDaSessao() {
		corpo = "{\"unidadeSondaId\":144,\"revisao\":1,\"cards\":[]}";

		cliente().ler(144);

		// SEC-011: a credencial de servico e uma so para toda a frota e tem perfil de
		// monitoramento. Se ela gravasse cards, qualquer maquina reconfiguraria qualquer unidade.
		assertEquals("Bearer token-da-sessao", chamadas.peek().autorizacao());
		assertEquals("GET", chamadas.peek().metodo());
		assertEquals("/api/sondas/144/cards", chamadas.peek().caminho());
	}

	@Test
	@DisplayName("unidade sem configuracao devolve documento vazio, nao erro")
	void unidadeNaoConfigurada() {
		corpo = "{\"schemaVersion\":1,\"unidadeSondaId\":145,\"revisao\":0,\"cards\":[]}";

		var documento = cliente().ler(145);

		// RN-092: a frota nasce vazia. Unidade sem card e estado normal, nao falha.
		assertEquals(0, documento.revisao());
		assertTrue(documento.cards().isEmpty());
		assertFalse(documento.configurada());
	}

	@Test
	@DisplayName("404 tambem e documento vazio")
	void quatrocentosEQuatro() {
		status = 404;
		corpo = "{}";

		assertFalse(cliente().ler(145).configurada());
	}

	@Test
	@DisplayName("salva mandando PUT com a revisao lida")
	void salva() {
		corpo = "{\"unidadeSondaId\":144,\"revisao\":8,\"cards\":[]}";
		var alteracao = new CardsDaUnidade.Alteracao(7,
				new Conexao("192.168.0.10", 0, 1, 1, 1000),
				List.of(new Card(null, "Bomba de Lama", Tipo.PRESSAO, 10, true, true, 0,
						new Parametros(250.0, null, null, null, null, null, null, null, null, null, null, null))));

		var salvo = cliente().salvar(144, alteracao);

		assertEquals(8, salvo.revisao());
		Chamada enviada = chamadas.peek();
		assertEquals("PUT", enviada.metodo());
		assertTrue(enviada.corpo().contains("\"revisao\":7"));
		assertTrue(enviada.corpo().contains("\"rangeSensorBar\":250.0"));
	}

	@Test
	@DisplayName("card novo vai sem dispositivoId, e os parametros nao usados nao vao")
	void cardNovoVaiEnxuto() {
		corpo = "{\"unidadeSondaId\":144,\"revisao\":1,\"cards\":[]}";
		var alteracao = new CardsDaUnidade.Alteracao(0, Conexao.padrao(),
				List.of(new Card(null, "Peso", Tipo.PESO, 4, true, true, 0, Parametros.vazio())));

		cliente().salvar(144, alteracao);

		String enviado = chamadas.peek().corpo();
		// O id e gerado pelo servidor (RN-081): mandar null e mandar campo nenhum sao equivalentes,
		// e omitir deixa o corpo legivel.
		assertFalse(enviado.contains("dispositivoId"), "id nao vai do cliente");
		assertFalse(enviado.contains("raio"), "um card de peso nao carrega os parametros de tanque");
		assertTrue(enviado.contains("\"tipo\":\"PESO\""));
	}

	@Test
	@DisplayName("409 vira erro proprio: recarregar, nao tentar de novo")
	void conflito() {
		status = 409;
		corpo = "{\"message\":\"Os cards foram alterados. Recarregue antes de salvar.\"}";

		var erro = assertThrows(ConfiguracaoCardsClient.CardsDesatualizadosException.class,
				() -> cliente().salvar(144, new CardsDaUnidade.Alteracao(3, Conexao.padrao(), List.of())));

		assertTrue(erro.getMessage().contains("Recarregue"));
	}

	@Test
	@DisplayName("a mensagem do backend chega inteira na recusa de validacao")
	void mensagemDeValidacao() {
		status = 400;
		corpo = "{\"message\":\"Informe o raio do tanque no card Tanque de Lama.\"}";

		var erro = assertThrows(ConfiguracaoCardsClient.CardsIndisponiveisException.class,
				() -> cliente().salvar(144, new CardsDaUnidade.Alteracao(0, Conexao.padrao(), List.of())));

		// A mensagem do backend nomeia o card e o campo. Um "HTTP 400" no lugar dela obrigaria
		// a adivinhar qual dos dez cards estava incompleto.
		assertEquals("Informe o raio do tanque no card Tanque de Lama.", erro.getMessage());
	}

	@Test
	@DisplayName("401 fala em sessao expirada, nao em senha errada")
	void tokenExpirado() {
		status = 401;

		var erro = assertThrows(ConfiguracaoCardsClient.CardsIndisponiveisException.class,
				() -> cliente().ler(144));

		// A sessao ja autenticou uma vez: mandar conferir a senha mandaria conferir o que estava
		// certo.
		assertTrue(erro.getMessage().contains("expirou"), erro.getMessage());
	}

	@Test
	@DisplayName("403 diz que o problema e o perfil")
	void semPerfil() {
		status = 403;

		var erro = assertThrows(ConfiguracaoCardsClient.CardsIndisponiveisException.class,
				() -> cliente().ler(144));

		assertTrue(erro.getMessage().contains("ADMIN") || erro.getMessage().contains("SUPORTE"));
	}

	@Test
	@DisplayName("sem sessao aberta, nem chega a chamar o backend")
	void semSessao() {
		var erro = assertThrows(ConfiguracaoCardsClient.CardsIndisponiveisException.class,
				() -> cliente(base, null).ler(144));

		assertTrue(erro.getMessage().contains("sessao"));
		assertTrue(chamadas.isEmpty());
	}

	@Test
	@DisplayName("sem URL de backend, nem chega a chamar")
	void semBackendConfigurado() {
		assertThrows(ConfiguracaoCardsClient.CardsIndisponiveisException.class,
				() -> cliente("   ", "t").ler(144));

		assertTrue(chamadas.isEmpty());
	}

	@Test
	@DisplayName("backend fora do ar vira mensagem, nao stacktrace")
	void backendFora() {
		var erro = assertThrows(ConfiguracaoCardsClient.CardsIndisponiveisException.class,
				() -> cliente("http://127.0.0.1:1", "t").ler(144));

		assertTrue(erro.getMessage().contains("Backend"));
	}

	@Test
	@DisplayName("resposta ilegivel nao passa por documento vazio")
	void respostaIlegivel() {
		corpo = "isto nao e json";

		// Tratar corpo quebrado como "unidade sem cards" faria a tela oferecer configurar do zero
		// uma unidade que ja esta configurada.
		assertThrows(ConfiguracaoCardsClient.CardsIndisponiveisException.class, () -> cliente().ler(144));
	}

	@Test
	@DisplayName("campo novo no backend nao derruba a leitura")
	void campoDesconhecido() {
		corpo = """
				{"schemaVersion":1,"unidadeSondaId":144,"revisao":2,"cards":[],
				 "campoQueAindaNaoExisteAqui":{"algo":1}}""";

		assertEquals(2, cliente().ler(144).revisao());
	}

	@Test
	@DisplayName("a barra final na URL do backend nao duplica no caminho")
	void barraFinal() {
		corpo = "{\"unidadeSondaId\":144,\"revisao\":1,\"cards\":[]}";

		cliente(base + "/", "t").ler(144);

		assertEquals("/api/sondas/144/cards", chamadas.peek().caminho());
	}

	// ==================================================================================
	// Gravacao por metade — configuracao-da-estacao.md §4
	//
	// A engrenagem edita a conexao, a tela de Cards edita os cards, e as duas gravam o MESMO
	// documento com um PUT que leva tudo. Sem releitura, cada uma apaga o trabalho da outra com
	// revisao valida e 200 de resposta. O sintoma e um card que some sem ninguem ter apagado.
	// ==================================================================================

	/** O documento que o servidor tem "agora", devolvido tanto no GET quanto no PUT. */
	private void servidorTem(String conexaoJson, String cardsJson, int revisao) {
		corpo = "{\"schemaVersion\":1,\"unidadeSondaId\":144,\"revisao\":" + revisao
				+ ",\"conexao\":" + conexaoJson + ",\"cards\":" + cardsJson + "}";
	}

	/** A gravacao e a segunda chamada: a primeira e a releitura. */
	private Chamada put() {
		return chamadas.stream()
				.filter(c -> "PUT".equals(c.metodo()))
				.findFirst()
				.orElseThrow(() -> new AssertionError("nenhum PUT foi enviado"));
	}

	private static final String CARD_DA_ANA = """
			[{"dispositivoId":"PRESSAO_09","nome":"Card da Ana","tipo":"PRESSAO",\
			"byteInicial":20,"ativo":true,"visivel":true,"ordem":0,"parametros":{"rangeSensorBar":100.0}}]""";

	private static final String CONEXAO_ATUAL =
			"{\"ip\":\"192.168.0.10\",\"rack\":0,\"slot\":1,\"dbNumero\":1,\"intervaloLeituraMs\":1000}";

	@Test
	@DisplayName("salvarConexao manda os cards do servidor, nao os que a engrenagem carregou")
	void conexaoNaoApagaCardNovo() {
		// A engrenagem abriu ha dez minutos, quando a unidade nao tinha card nenhum.
		var base = new CardsDaUnidade(1, 144, 7, new Conexao("192.168.0.10", 0, 1, 1, 1000),
				List.of(), null, null);
		// Nesse intervalo, a Ana criou um card pela tela de Cards.
		servidorTem(CONEXAO_ATUAL, CARD_DA_ANA, 8);

		cliente().salvarConexao(144, base, new Conexao("192.168.0.77", 0, 1, 1, 1000));

		Chamada enviada = put();
		// ⚠️ Sem a releitura, o PUT levaria "cards":[] e o card da Ana sumiria — com 200 de
		// resposta e ninguem para acusar.
		assertTrue(enviada.corpo().contains("PRESSAO_09"), enviada.corpo());
		assertTrue(enviada.corpo().contains("192.168.0.77"), enviada.corpo());
		// A revisao vai a do servidor, nao a de dez minutos atras.
		assertTrue(enviada.corpo().contains("\"revisao\":8"), enviada.corpo());
	}

	@Test
	@DisplayName("salvarConexao recusa quando a propria conexao mudou debaixo da tela")
	void conexaoAlteradaPorOutraPessoa() {
		var base = new CardsDaUnidade(1, 144, 7, new Conexao("192.168.0.10", 0, 1, 1, 1000),
				List.of(), null, null);
		// Outra pessoa ja apontou a unidade para outro CLP.
		servidorTem("{\"ip\":\"10.0.0.5\",\"rack\":0,\"slot\":1,\"dbNumero\":1,\"intervaloLeituraMs\":1000}",
				"[]", 8);

		// ⚠️ Adotar a revisao relida e mandar em frente passaria por cima em silencio. A protecao
		// que a revisao da ao campo que se edita nao pode ser jogada fora junto com o merge.
		assertThrows(ConfiguracaoCardsClient.CardsDesatualizadosException.class,
				() -> cliente().salvarConexao(144, base, new Conexao("192.168.0.77", 0, 1, 1, 1000)));
	}

	@Test
	@DisplayName("salvarCards manda a conexao do servidor, nao a que a tela leu ao abrir")
	void cardsNaoDesfazemOIpCorrigido() {
		var base = new CardsDaUnidade(1, 144, 7, new Conexao("192.168.0.10", 0, 1, 1, 1000),
				List.of(), null, null);
		// Alguem corrigiu o IP na engrenagem enquanto esta tela estava aberta.
		servidorTem("{\"ip\":\"192.168.0.99\",\"rack\":0,\"slot\":1,\"dbNumero\":1,\"intervaloLeituraMs\":1000}",
				"[]", 8);

		cliente().salvarCards(144, base, List.of(
				new Card(null, "Peso", Tipo.PESO, 4, true, true, 0, Parametros.vazio())));

		Chamada enviada = put();
		// Reenviar o IP lido ao abrir apontaria a estacao de volta para o CLP anterior.
		assertTrue(enviada.corpo().contains("192.168.0.99"), enviada.corpo());
		assertFalse(enviada.corpo().contains("192.168.0.10"), enviada.corpo());
	}

	@Test
	@DisplayName("salvarCards recusa quando os cards mudaram debaixo da tela")
	void cardsAlteradosPorOutraPessoa() {
		var base = new CardsDaUnidade(1, 144, 7, new Conexao("192.168.0.10", 0, 1, 1, 1000),
				List.of(), null, null);
		servidorTem(CONEXAO_ATUAL, CARD_DA_ANA, 8);

		assertThrows(ConfiguracaoCardsClient.CardsDesatualizadosException.class,
				() -> cliente().salvarCards(144, base, List.of()));
	}

	@Test
	@DisplayName("salvarTudo — a copia entre unidades — recusa se qualquer metade mudou")
	void copiaRecusaSobreAlteracaoAlheia() {
		var base = new CardsDaUnidade(1, 144, 7, new Conexao("192.168.0.10", 0, 1, 1, 1000),
				List.of(), null, null);
		servidorTem(CONEXAO_ATUAL, CARD_DA_ANA, 8);

		// Quem copia reescreve a unidade inteira: e o pior momento para nao avisar.
		assertThrows(ConfiguracaoCardsClient.CardsDesatualizadosException.class,
				() -> cliente().salvarTudo(144, base, Conexao.padrao(), List.of()));
	}
}
