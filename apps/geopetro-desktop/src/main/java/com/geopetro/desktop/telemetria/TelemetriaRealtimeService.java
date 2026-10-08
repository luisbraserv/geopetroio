package com.geopetro.desktop.telemetria;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicReference;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.geopetro.desktop.configuracoes.AppSettings;
import com.geopetro.desktop.sessao.UnidadeSondaOpcao;
import com.geopetro.desktop.sessao.BackendLogin;
import com.geopetro.desktop.services.CardsState;
import com.geopetro.desktop.services.EstadoDeDocumento;
import com.geopetro.desktop.sessao.UnidadeSondaCatalogoService;

import jakarta.annotation.PreDestroy;

/**
 * Canal de TEMPO REAL com o Geopetro-Backend.
 *
 * <h2>Por que AtomicReference e nao fila</h2>
 * <p>Este canal transmite o <b>estado atual</b>, nao um historico. Se a rede engasgar por 10
 * segundos, nao interessa entregar 10 estados atrasados quando ela voltar — interessa entregar o
 * mais recente. Uma fila acumularia dados velhos e faria a tela "correr atras do prejuizo".
 *
 * <p>Por isso o produtor (leitura do CLP) apenas <b>sobrescreve</b> a referencia, e o worker envia
 * o que estiver la no momento do envio. Estados intermediarios sao descartados por desenho.
 *
 * <p>O historico completo, esse sim sem perdas, segue pelo caminho MQTT -> InfluxDB.
 *
 * <h2>Concorrencia</h2>
 * <p>Um unico worker em Virtual Thread. Nao se cria thread por leitura: a Virtual Thread fica
 * bloqueada em espera a maior parte do tempo, que e exatamente o caso de uso para o qual foram
 * feitas.
 *
 * <h2>Isolamento</h2>
 * <p>Nenhuma falha aqui pode parar a leitura do CLP nem o MQTT. Toda excecao e capturada dentro do
 * worker; o pior caso e o canal ficar offline e tentar reconectar.
 */
@Service
public class TelemetriaRealtimeService {

	private static final Logger logger = LoggerFactory.getLogger(TelemetriaRealtimeService.class);

	/** Intervalo de envio: acompanha o ciclo de leitura do CLP (1s). */
	private static final Duration INTERVALO_ENVIO = Duration.ofMillis(1000);

	/** Espera antes de tentar reconectar. Cresce ate o teto para nao martelar um backend fora. */
	private static final Duration BACKOFF_INICIAL = Duration.ofSeconds(2);
	private static final Duration BACKOFF_MAXIMO = Duration.ofSeconds(30);


	/**
	 * Ultimo estado lido do CLP. Sobrescrito a cada ciclo; o worker le e envia.
	 * Um estado nao enviado a tempo e simplesmente substituido — comportamento desejado.
	 */
	private final AtomicReference<EstadoAtual> estadoAtual = new AtomicReference<>();

	/** Configuracao vigente, atualizada pelo produtor a cada ciclo. */
	private final AtomicReference<AppSettings> configuracao = new AtomicReference<>();

	private final AtomicBoolean conectado = new AtomicBoolean(false);
	private final AtomicBoolean ativo = new AtomicBoolean(false);

	private final HttpClient httpClient = HttpClient.newBuilder()
			.connectTimeout(Duration.ofSeconds(5))
			.build();

	private ExecutorService worker;
	private StompRealtimeClient client;

    /**
     * O documento de cards da unidade — o que o ciclo de leitura consulta a cada volta.
     *
     * <p>É o <b>único</b> documento que este canal traz. Guardas próprias de geração, unidade e
     * revisão; sem ele o Desktop não sabe o que ler (RN-088), então o cache em disco por trás dele é
     * o que mantém uma sonda medindo depois de reiniciar sem rede.
     *
     * <p>⚠️ <b>Os limites de alarme não chegam mais por aqui.</b> O alarme da estação é configurado
     * na estação ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.3}) — buscar no servidor uma
     * faixa para tocar um beep nesta máquina era uma volta pela rede para responder o que já estava
     * respondido aqui.
     */
    private final CardsState cards;

    /**
     * Lista de Unidades do usuario desta estacao: antes de aceitar a configuracao de uma
     * unidade, o canal confere se ela ainda existe para ele no servidor.
     */
    private final UnidadeSondaCatalogoService catalogo;

    /**
     * Unidade que o servidor respondeu nao estar disponivel para este usuario — excluida, acesso
     * revogado, ou o id apontando para nada depois de o banco ser recriado. A tela usa para dizer o
     * que fazer, em vez de "aguardando configuracao".
     */
    private final AtomicReference<Long> unidadeIndisponivel = new AtomicReference<>();

    /**
     * Acorda o worker quando a configuracao muda. Sem isto, trocar de unidade durante a espera de
     * reconexao (ate {@link #BACKOFF_MAXIMO}) deixaria a tela com os cards da anterior todo esse tempo.
     */
    private final Semaphore acordar = new Semaphore(0);

    public TelemetriaRealtimeService() {
        this(new CardsState());
    }

    /** Estado de cards explícito — usado pelos testes de cards, que ficam em outro pacote. */
    public TelemetriaRealtimeService(CardsState cards) {
        this(cards, new UnidadeSondaCatalogoService());
    }

    TelemetriaRealtimeService(CardsState cards, UnidadeSondaCatalogoService catalogo) {
        this.cards = cards;
        this.catalogo = catalogo;
    }
    /** Mesmo login da sessao de configuracao — uma implementacao so, para nao divergirem. */
    private final BackendLogin backendLogin = new BackendLogin(httpClient);
    private Alvo alvoConectado;
    private long ultimaSolicitacao;
    private record Alvo(String core, String backend, Long unidade, String usuario, String senha) {
        @Override public String toString() { return "Alvo[redacted]"; }
    }
    /**
     * O documento de cards da unidade configurada nesta estacao, se ja tiver chegado ou estiver em
     * cache.
     *
     * <p>Vazio significa unidade nao configurada — estado normal (RN-092), e nao erro.
     */
    public java.util.Optional<com.geopetro.desktop.models.CardsDaUnidade> cardsAtuais(AppSettings settings) {
        if (settings == null || settings.getUnidadeId() == null) {
            return java.util.Optional.empty();
        }
        return cards.atual(chaveCache(alvo(settings)), settings.getUnidadeId());
    }

    /**
     * {@code true} quando o servidor respondeu que a unidade configurada nesta estacao nao esta na
     * lista do usuario. Diferente de "sem rede": ai o cache continua valendo (RN-088).
     */
    public boolean unidadeIndisponivel(AppSettings settings) {
        return settings != null && settings.getUnidadeId() != null
                && java.util.Objects.equals(unidadeIndisponivel.get(), settings.getUnidadeId());
    }
    // Mantem o formato historico: trocar apenas o servidor de identidade nao invalida os cards
    // ja salvos na estacao, que pertencem ao Backend, usuario e unidade.
    private String chaveCache(Alvo alvo) { return alvo == null ? null : alvo.backend() + "\n" + alvo.usuario(); }
    private Alvo alvo(AppSettings settings) {
        return settings == null || !settings.temConfiguracaoTempoReal() ? null :
            new Alvo(normalizarBase(settings.getCoreUrl()), normalizarBase(settings.getBackendUrl()),
                    settings.getUnidadeId(), settings.getBackendUsuario(), settings.getBackendSenha());
    }

	/**
	 * Publica o estado mais recente. Chamado pela thread de leitura do CLP.
	 *
	 * <p>Nao bloqueia e nao lanca: e apenas uma troca de referencia.
	 */
    public synchronized void atualizarConfiguracao(AppSettings settings) {
        Alvo novo = alvo(settings);
        if (!java.util.Objects.equals(novo, alvo(configuracao.get()))) {
            estadoAtual.set(null);
            // O cache deve estar disponível ANTES de autenticar: a estação precisa
            // mostrar os cards e ler o CLP mesmo quando o backend está offline.
            String chave = chaveCache(novo);
            Long unidade = novo == null ? null : novo.unidade();
            cards.conectar(chave, unidade);
            unidadeIndisponivel.set(null);
            // Troca de unidade (ou de servidor) vale ja: o worker sai da espera e busca a nova.
            acordar.release();
        }
        if (novo == null) { configuracao.set(null); return; }
        // Snapshot das credenciais evita mutacao de AppSettings durante login/reconexao.
        AppSettings snapshot = new AppSettings();
        snapshot.setCoreUrl(novo.core()); snapshot.setBackendUrl(novo.backend()); snapshot.setUnidadeId(novo.unidade());
        snapshot.setBackendUsuario(novo.usuario()); snapshot.setBackendSenha(novo.senha());
        // O interruptor viaja no snapshot porque quem o consulta e o worker, e ele so enxerga
        // daqui — §6.
        snapshot.setTempoRealAtivo(settings.isTempoRealAtivo());
        configuracao.set(snapshot);
        if (ativo.compareAndSet(false, true)) iniciarWorker();
    }

    public void publicarEstado(AppSettings settings, EstadoAtual estado) {
        atualizarConfiguracao(settings);
        if (alvo(settings) != null) estadoAtual.set(estado);
    }

	public boolean isConectado() {
		return conectado.get();
	}

	private void iniciarWorker() {
		worker = Executors.newSingleThreadExecutor(Thread.ofVirtual().name("realtime-ws").factory());
		worker.submit(this::loop);
		logger.info("Worker de tempo real iniciado.");
	}

	/**
	 * Laco unico do worker: conecta, envia enquanto conectado, reconecta se cair.
	 *
	 * <p>Roda em Virtual Thread — o bloqueio em {@code sleep} e em I/O de rede nao prende
	 * thread de plataforma.
	 */
	private void loop() {
		Duration backoff = BACKOFF_INICIAL;
		Alvo ultimoDesejado = null;

		while (ativo.get() && !Thread.currentThread().isInterrupted()) {
			try {
                Alvo desejado = alvo(configuracao.get());
                if (!java.util.Objects.equals(desejado, alvoConectado)) {
                    fecharClienteSilenciosamente(); conectado.set(false);
                    cards.conectar(chaveCache(desejado), desejado == null ? null : desejado.unidade());
                }
                // Unidade nova comeca com espera curta. Comparar com o alvo CONECTADO aqui zeraria a
                // espera a cada falha (ele so e definido quando a conexao da certo) e martelaria o backend.
                if (!java.util.Objects.equals(desejado, ultimoDesejado)) {
                    backoff = BACKOFF_INICIAL;
                    ultimoDesejado = desejado;
                }
                if (desejado == null) { dormir(INTERVALO_ENVIO); continue; }

                // ⚠️ Desligado de proposito — §6. O teste vem DEPOIS do cards.conectar acima, e
                // isso e deliberado: o canal de cards continua apontado para a unidade certa, entao
                // o dashboard segue desenhando com o snapshot em disco e o alarme local segue
                // vigiando. Desligar o tempo real cala a PUBLICACAO, nao a estacao.
                //
                // ⚠️ Nao dobrar este interruptor dentro de temConfiguracaoTempoReal(): alvo()
                // passaria a devolver null, o cards.conectar(null, null) apagaria o snapshot em
                // memoria, e a tela perderia os cards junto com a telemetria.
                AppSettings atual = configuracao.get();
                if (atual != null && !atual.isTempoRealAtivo()) {
                    if (conectado.get()) {
                        fecharClienteSilenciosamente();
                        conectado.set(false);
                        alvoConectado = null;
                        logger.info("Tempo real desligado nas Configuracoes: canal encerrado.");
                    }
                    dormir(INTERVALO_ENVIO);
                    continue;
                }

                if (!conectado.get() || client == null || !client.isConectado()) {
                    fecharClienteSilenciosamente(); conectar(); backoff = BACKOFF_INICIAL;
                }
                if (System.nanoTime() - ultimaSolicitacao >= Duration.ofSeconds(60).toNanos()) {
                    client.solicitarConfiguracao(); ultimaSolicitacao = System.nanoTime();
                }
                enviarEstadoMaisRecente();
				dormir(INTERVALO_ENVIO);
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				return;
			}
			catch (Exception e) {
				conectado.set(false);
				fecharClienteSilenciosamente();
				logger.warn("Canal de tempo real indisponivel ({}). Nova tentativa em {}s.",
						e.getMessage(), backoff.toSeconds());
				try {
					dormir(backoff);
				}
				catch (InterruptedException interrupted) {
					Thread.currentThread().interrupt();
					return;
				}
				backoff = proximoBackoff(backoff);
			}
		}
	}

	private void conectar() throws Exception {
		AppSettings settings = configuracao.get();
		if (settings == null || !settings.temConfiguracaoTempoReal()) {
			throw new IllegalStateException("configuracao de tempo real incompleta");
		}
		// Segunda tranca: o loop ja filtra, mas quem chamar conectar() por outro caminho nao pode
		// abrir o canal que as Configuracoes mandaram fechar.
		if (!settings.isTempoRealAtivo()) {
			throw new IllegalStateException("tempo real desligado nas Configuracoes");
		}

		String token = autenticar(settings);
		Alvo destino = alvo(settings);
        long generationCards = cards.conectar(chaveCache(destino), destino.unidade());
        verificarDisponibilidade(destino, token);
        client = new StompRealtimeClient(urlWebSocket(destino.backend()), token, destino.unidade(),
            documento -> cards.aceitar(generationCards, documento));
		client.conectar();
        alvoConectado = destino; ultimaSolicitacao = System.nanoTime();
        conectado.set(true);
		logger.info("Canal de tempo real conectado ao backend {} (unidade {}).",
				settings.getBackendUrl(), settings.getUnidadeId());
	}

	/**
	 * Confere, antes de aceitar configuracao, se a unidade desta estacao esta entre as que o
	 * servidor lista para o usuario.
	 *
	 * <p>Disponivel: segue, e a primeira resposta do servidor substitui o cache (ver
	 * {@link EstadoDeDocumento}). Indisponivel: o documento dela e descartado, em memoria e em disco,
	 * e a conexao nao abre — o worker tenta de novo no proximo ciclo, entao devolver o acesso no
	 * servidor basta para a estacao voltar.
	 *
	 * <p>Falha de rede ou de login aqui sobe como excecao comum e <b>nao</b> descarta nada: sem
	 * resposta do servidor, o cache em disco continua sendo o que mantem a estacao medindo (RN-088).
	 */
	private void verificarDisponibilidade(Alvo destino, String token) {
		List<UnidadeSondaOpcao> disponiveis = catalogo.listarComToken(destino.backend(), token);
		if (disponiveis.stream().noneMatch(u -> java.util.Objects.equals(u.id(), destino.unidade()))) {
			cards.descartar(chaveCache(destino), destino.unidade());
			unidadeIndisponivel.set(destino.unidade());
			throw new IllegalStateException("a unidade " + destino.unidade()
					+ " nao esta disponivel para este usuario no backend; escolha outra em Configuracoes");
		}
		unidadeIndisponivel.set(null);
	}

	/**
	 * Obtem um JWT no Braserv-Core, reutilizando o mesmo {@code /api/auth/login} da aplicacao web.
	 *
	 * <p>Deliberado: o Desktop e um usuario do sistema como outro qualquer, sujeito as mesmas
	 * regras de autorizacao. Um token estatico separado criaria um segundo mecanismo de
	 * autenticacao para manter.
	 */
	private String autenticar(AppSettings settings) throws Exception {
		return backendLogin.autenticar(normalizarBase(settings.getCoreUrl()),
				settings.getBackendUsuario(), settings.getBackendSenha()).token();
	}

	private void enviarEstadoMaisRecente() throws Exception {
		EstadoAtual estado = estadoAtual.get();
		if (estado == null || client == null || alvoConectado == null || !java.util.Objects.equals(estado.unidadeId(), alvoConectado.unidade())) {
			return;
		}
		client.enviarEstado(estado);
	}

	private String urlWebSocket(String backendUrl) {
		String base = normalizarBase(backendUrl);
		String ws = base.startsWith("https://")
				? "wss://" + base.substring("https://".length())
				: "ws://" + base.replaceFirst("^http://", "");
		return ws + "/ws";
	}

	private String normalizarBase(String url) {
		String base = url == null ? "" : url.trim();
		return base.endsWith("/") ? base.substring(0, base.length() - 1) : base;
	}

	private Duration proximoBackoff(Duration atual) {
		Duration dobrado = atual.multipliedBy(2);
		return dobrado.compareTo(BACKOFF_MAXIMO) > 0 ? BACKOFF_MAXIMO : dobrado;
	}

	/** Espera o intervalo, ou menos se a configuracao mudar no meio ({@link #acordar}). */
	private void dormir(Duration duracao) throws InterruptedException {
		if (acordar.tryAcquire(duracao.toMillis(), TimeUnit.MILLISECONDS)) {
			acordar.drainPermits();
		}
	}

	private void fecharClienteSilenciosamente() {
		if (client != null) {
			try {
				client.fechar();
			}
			catch (Exception ignored) {
				// Ja estamos em caminho de erro; falha no cleanup nao acrescenta informacao.
			}
			client = null;
		}
	}


	@PreDestroy
	public void encerrar() {
		ativo.set(false);
		conectado.set(false);
		fecharClienteSilenciosamente();
		if (worker != null) {
			worker.shutdownNow();
		}
		logger.info("Canal de tempo real encerrado.");
	}
}
