package com.example.demo.services;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.Objects;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardsDaUnidade;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;

/**
 * Lê e grava o documento de cards no Geopetro-Backend — {@code /api/monitoramento/unidades/{id}/cards}.
 *
 * <h2>Autentica pela sessão de configuração, não pela credencial de serviço</h2>
 * O token vem de {@link SessaoConfiguracao}, que é uma pessoa {@code ADMIN} ou {@code SUPORTE}. A
 * credencial de serviço da estação <b>não serve aqui</b>: ela é uma só para toda a frota (SEC-011) e
 * tem perfil de monitoramento. Se ela gravasse cards, qualquer máquina instalada em qualquer unidade
 * reconfiguraria qualquer outra.
 *
 * <h2>Sem cache e sem retentativa</h2>
 * Configurar é ato raro e deliberado, feito por alguém olhando a tela. Falhou, a tela diz o que
 * houve e a pessoa tenta de novo — que é melhor do que uma retentativa em segundo plano gravando
 * duas vezes o que se pensou ter gravado uma.
 *
 * <p>⚠️ O caminho de telemetria <b>não</b> passa por aqui. Este serviço só é chamado pela janela de
 * configuração; a leitura do CLP segue funcionando com o backend fora do ar.
 */
@Service
public class ConfiguracaoCardsClient {

	private static final Logger logger = LoggerFactory.getLogger(ConfiguracaoCardsClient.class);
	private static final Duration TIMEOUT = Duration.ofSeconds(15);

	// A omissao de campo nulo e declarada em CardsDaUnidade, com @JsonInclude, em vez de aqui: a
	// forma do JSON pertence ao modelo, e o mapper que a impusesse valeria so para este cliente.
	private final ObjectMapper mapper = JsonMapper.builder()
			.disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
			.build();

	private final SettingsService settings;
	private final SessaoConfiguracao sessao;
	private final HttpClient httpClient;

	/** Com dois construtores, o Spring não escolhe sozinho: este é o de produção. */
	@org.springframework.beans.factory.annotation.Autowired
	public ConfiguracaoCardsClient(SettingsService settings, SessaoConfiguracao sessao) {
		this(settings, sessao, HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build());
	}

	/** Para os testes apontarem a um servidor local. */
	ConfiguracaoCardsClient(SettingsService settings, SessaoConfiguracao sessao, HttpClient httpClient) {
		this.settings = settings;
		this.sessao = sessao;
		this.httpClient = httpClient;
	}

	/** Backend fora, sessão fechada, ou resposta que não dá para usar. */
	public static class CardsIndisponiveisException extends RuntimeException {
		public CardsIndisponiveisException(String mensagem) {
			super(mensagem);
		}
	}

	/**
	 * O documento de outra revisão chegou primeiro — alguém salvou enquanto esta tela estava aberta.
	 *
	 * <p>Separado de {@link CardsIndisponiveisException} porque a saída é outra: aqui não adianta
	 * tentar de novo, é preciso recarregar e refazer sobre o que já está gravado.
	 */
	public static class CardsDesatualizadosException extends RuntimeException {
		public CardsDesatualizadosException(String mensagem) {
			super(mensagem);
		}
	}

	/**
	 * Unidade sem configuração devolve o documento vazio, <b>não</b> um erro: é o estado normal de
	 * quem ainda não foi configurado (RN-092).
	 */
	public CardsDaUnidade ler(long unidadeId) {
		HttpResponse<String> resposta = chamar("GET", unidadeId, null);
		if (resposta.statusCode() == 404) {
			return CardsDaUnidade.vazio(unidadeId);
		}
		exigirSucesso(resposta, unidadeId);
		return converter(resposta.body(), unidadeId);
	}

	/**
	 * Grava <b>só a conexão</b>, devolvendo os cards como estão no servidor neste instante.
	 *
	 * <h2>Por que reler em vez de mandar o que a tela carregou</h2>
	 * A engrenagem e a tela de Cards editam o mesmo documento, e o {@code PUT} carrega o documento
	 * inteiro. Sem a releitura, salvar o IP numa engrenagem aberta há dez minutos reenviaria o array
	 * {@code cards} daquele momento — e apagaria o card que outra pessoa criou no intervalo, com
	 * revisão válida e {@code 200} de resposta.
	 *
	 * <p>⚠️ <b>O sintoma é um card que some sem ninguém ter apagado</b>, e a causa está na outra
	 * tela, separada por minutos e por pessoas diferentes. Nada disso aparece em teste feliz — ver
	 * {@code configuracao-da-estacao.md §4}.
	 *
	 * <h2>⚠️ E por que o 409 continua de pé</h2>
	 * Adotar a revisão relida e mandar em frente resolveria os cards e <b>destruiria</b> a proteção
	 * que a revisão dá ao campo que se está editando: se outra pessoa mudou a conexão nesse meio
	 * tempo, a gravação passaria por cima dela em silêncio.
	 *
	 * <p>Então a releitura confere: mudou a metade que <b>esta</b> tela edita, é conflito de verdade
	 * e vira {@link CardsDesatualizadosException}. Mudou só a outra metade, ela volta intacta.
	 *
	 * @param base o documento que a tela carregou, para saber o que mudou debaixo dela
	 */
	public CardsDaUnidade salvarConexao(long unidadeId, CardsDaUnidade base,
			CardsDaUnidade.Conexao nova) {
		CardsDaUnidade atual = ler(unidadeId);
		if (!Objects.equals(base.conexao(), atual.conexao())) {
			throw new CardsDesatualizadosException(
					"A conexao do CLP foi alterada por outra pessoa. Recarregue antes de salvar.");
		}
		return salvar(unidadeId,
				new CardsDaUnidade.Alteracao(atual.revisao(), nova, atual.cards()));
	}

	/**
	 * O simétrico de {@link #salvarConexao}: grava <b>só os cards</b> e devolve a conexão como está
	 * no servidor neste instante.
	 *
	 * <p>Existe pelo mesmo motivo, na direção contrária — a tela de Cards não edita mais a conexão,
	 * e reenviar a que ela leu ao abrir apontaria a estação para o CLP anterior se alguém tivesse
	 * corrigido o IP na engrenagem no intervalo.
	 */
	public CardsDaUnidade salvarCards(long unidadeId, CardsDaUnidade base,
			List<CardsDaUnidade.Card> novos) {
		CardsDaUnidade atual = ler(unidadeId);
		if (!base.cards().equals(atual.cards())) {
			throw new CardsDesatualizadosException(
					"Os cards foram alterados por outra pessoa. Recarregue antes de salvar.");
		}
		return salvar(unidadeId,
				new CardsDaUnidade.Alteracao(atual.revisao(), atual.conexao(), novos));
	}

	/**
	 * Grava as <b>duas</b> metades — o caso da cópia entre unidades, que traz rack, slot, DB e
	 * intervalo junto com os cards.
	 *
	 * <p>Aqui não há metade a preservar, então a releitura serve só para o outro papel: recusar a
	 * gravação se qualquer das duas mudou debaixo desta tela. É mais restrito que
	 * {@link #salvarCards} de propósito — quem copia está reescrevendo a unidade inteira, e fazer
	 * isso por cima da alteração de outra pessoa é o pior momento para não avisar.
	 */
	public CardsDaUnidade salvarTudo(long unidadeId, CardsDaUnidade base,
			CardsDaUnidade.Conexao nova, List<CardsDaUnidade.Card> novos) {
		CardsDaUnidade atual = ler(unidadeId);
		if (!Objects.equals(base.conexao(), atual.conexao()) || !base.cards().equals(atual.cards())) {
			throw new CardsDesatualizadosException(
					"A configuracao foi alterada por outra pessoa. Recarregue antes de salvar.");
		}
		return salvar(unidadeId, new CardsDaUnidade.Alteracao(atual.revisao(), nova, novos));
	}

	public CardsDaUnidade salvar(long unidadeId, CardsDaUnidade.Alteracao alteracao) {
		String corpo;
		try {
			corpo = mapper.writeValueAsString(alteracao);
		} catch (Exception e) {
			throw new CardsIndisponiveisException("Nao foi possivel montar a configuracao: " + e.getMessage());
		}

		HttpResponse<String> resposta = chamar("PUT", unidadeId, corpo);
		if (resposta.statusCode() == 409) {
			throw new CardsDesatualizadosException(
					"Os cards foram alterados por outra pessoa. Recarregue antes de salvar.");
		}
		exigirSucesso(resposta, unidadeId);
		CardsDaUnidade salvo = converter(resposta.body(), unidadeId);
		if (alteracao.conexao() != null && alteracao.conexao().usaTsap()
				&& (salvo.conexao() == null
						|| !Objects.equals(alteracao.conexao().tsapLocal(), salvo.conexao().tsapLocal())
						|| !Objects.equals(alteracao.conexao().tsapRemoto(), salvo.conexao().tsapRemoto()))) {
			throw new CardsIndisponiveisException(
					"O Backend não preservou os TSAPs. Atualize o Backend para usar a conexão LOGO! e salve novamente.");
		}
		return salvo;
	}

	private HttpResponse<String> chamar(String metodo, long unidadeId, String corpo) {
		String token = sessao.token().orElseThrow(() -> new CardsIndisponiveisException(
				"A sessao de configuracao nao esta aberta."));
		String base = base();

		HttpRequest.BodyPublisher publisher = corpo == null
				? HttpRequest.BodyPublishers.noBody()
				: HttpRequest.BodyPublishers.ofString(corpo, StandardCharsets.UTF_8);

		HttpRequest request = HttpRequest.newBuilder()
				.uri(URI.create(base + "/api/monitoramento/unidades/" + unidadeId + "/cards"))
				.header("Authorization", "Bearer " + token)
				.header("Content-Type", "application/json")
				.timeout(TIMEOUT)
				.method(metodo, publisher)
				.build();

		try {
			return httpClient.send(request, HttpResponse.BodyHandlers.ofString());
		} catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new CardsIndisponiveisException("Consulta interrompida.");
		} catch (Exception e) {
			logger.warn("Falha ao falar com o backend sobre os cards da unidade {}: {}",
					unidadeId, e.getMessage());
			throw new CardsIndisponiveisException("Nao foi possivel falar com o Backend: " + e.getMessage());
		}
	}

	/**
	 * ⚠️ O 401 aqui significa <b>token expirado</b>, não senha errada: a sessão já autenticou uma
	 * vez. Dizer "credencial invalida" mandaria a pessoa conferir a senha que estava certa.
	 */
	private void exigirSucesso(HttpResponse<String> resposta, long unidadeId) {
		int status = resposta.statusCode();
		if (status == 200) {
			return;
		}
		if (status == 401) {
			throw new CardsIndisponiveisException(
					"A sessao de configuracao expirou. Feche e abra o app para entrar de novo.");
		}
		if (status == 403) {
			throw new CardsIndisponiveisException("Apenas ADMIN ou SUPORTE configuram os cards.");
		}
		if (status == 400 || status == 422) {
			throw new CardsIndisponiveisException(mensagemDoBackend(resposta.body()));
		}
		logger.warn("Backend respondeu HTTP {} nos cards da unidade {}.", status, unidadeId);
		throw new CardsIndisponiveisException("Backend respondeu HTTP " + status + ".");
	}

	/**
	 * A mensagem do backend é a útil — ela nomeia o card e o campo ("Informe o raio do tanque no
	 * card Tanque de Lama"). Um "HTTP 400" no lugar dela obrigaria a adivinhar.
	 */
	private String mensagemDoBackend(String corpo) {
		try {
			var no = mapper.readTree(corpo);
			for (String campo : new String[] { "message", "mensagem", "error", "detail" }) {
				var valor = no.path(campo);
				if (valor.isTextual() && !valor.asText().isBlank()) {
					return valor.asText();
				}
			}
		} catch (Exception ignorado) {
			// Corpo que nao e JSON: cai na mensagem generica abaixo.
		}
		return "O Backend recusou a configuracao.";
	}

	private CardsDaUnidade converter(String corpo, long unidadeId) {
		try {
			CardsDaUnidade documento = mapper.readValue(corpo, CardsDaUnidade.class);
			return documento == null ? CardsDaUnidade.vazio(unidadeId) : documento;
		} catch (Exception e) {
			logger.warn("Resposta de cards ilegivel para a unidade {}: {}", unidadeId, e.getMessage());
			throw new CardsIndisponiveisException("Resposta inesperada do Backend.");
		}
	}

	private String base() {
		AppSettings configuracoes = settings.loadSettings();
		String url = configuracoes == null ? null : configuracoes.getBackendUrl();
		if (url == null || url.isBlank()) {
			throw new CardsIndisponiveisException("Informe a URL do Backend nas Configuracoes.");
		}
		String base = url.trim();
		while (base.endsWith("/")) {
			base = base.substring(0, base.length() - 1);
		}
		if (base.isEmpty()) {
			throw new CardsIndisponiveisException("Informe a URL do Backend nas Configuracoes.");
		}
		return base;
	}
}
