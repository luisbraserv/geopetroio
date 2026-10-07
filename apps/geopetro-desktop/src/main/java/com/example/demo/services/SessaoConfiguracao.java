package com.example.demo.services;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.Optional;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.example.demo.models.AppSettings;

/**
 * Sessão que libera as janelas de configuração — RN-086, RN-087.
 *
 * <h2>Como funciona</h2>
 * O app <b>não</b> pede login ao iniciar. Ele lê o CLP, publica, mostra os cards e gera a carta de
 * operação normalmente. O login é pedido <b>ao abrir uma janela de configuração</b>, e vale até o
 * app fechar.
 *
 * <h2>Vive só em memória</h2>
 * Nada é gravado em disco. Persistir credencial na borda é o oposto do que
 * {@code SEC-011} já registra como risco aceito: existe <b>uma</b> credencial de serviço para toda a
 * frota, e um segundo segredo na máquina da unidade ampliaria a superfície sem necessidade —
 * configurar é ato raro e deliberado.
 *
 * <h2>Sem rede não se configura</h2>
 * Por desenho. Não há validação local de credencial, o que exigiria guardar hash de senha na borda.
 * O custo aceito é que a instalação inicial de uma unidade precisa de rede ao menos uma vez.
 */
@Service
public class SessaoConfiguracao {

	private static final Logger logger = LoggerFactory.getLogger(SessaoConfiguracao.class);

	/** Perfis que configuram — espelha {@code ConfiguracaoCardsAccess} no backend. */
	private static final Set<String> CONFIGURADORES = Set.of("ADMIN", "SUPORTE");

	private final SettingsService settings;
	private final BackendLogin login;

	/** Não é {@code volatile} por acaso: toda leitura e escrita passa por métodos sincronizados. */
	private Sessao atual;

	/** Com dois construtores, o Spring não escolhe sozinho: este é o de produção. */
	@org.springframework.beans.factory.annotation.Autowired
	public SessaoConfiguracao(SettingsService settings) {
		this(settings, new BackendLogin(HttpClient.newBuilder()
				.connectTimeout(Duration.ofSeconds(5)).build()));
	}

	/** Para os testes apontarem a um servidor local. */
	SessaoConfiguracao(SettingsService settings, BackendLogin login) {
		this.settings = settings;
		this.login = login;
	}

	private record Sessao(String usuario, String token) {
	}

	/** O que a tela precisa mostrar quando o login não passa. */
	public sealed interface Resultado {
		record Liberada(String usuario) implements Resultado {
		}

		/** Credencial errada, ou conta desativada — o Core não distingue os dois aqui. */
		record CredencialInvalida() implements Resultado {
		}

		/**
		 * Autenticou, mas o perfil não configura.
		 *
		 * <p>Separado de {@link CredencialInvalida} de propósito: quem digitou a senha certa
		 * ficaria tentando de novo se a mensagem dissesse "credencial inválida". E não vaza nada —
		 * a pessoa já conhece o próprio perfil.
		 */
		record PerfilSemPermissao(String usuario) implements Resultado {
		}

		/** Braserv-Core inalcançável. Sem rede não se configura, e não há validação local. */
		record CoreIndisponivel(String motivo) implements Resultado {
		}

		/** Falta a URL do Braserv-Core nas configurações do Desktop. */
		record CoreNaoConfigurado() implements Resultado {
		}
	}

	public synchronized Resultado abrir(String usuario, String senha) {
		return abrir(usuario, senha, null);
	}

	/**
	 * Abre a sessão, opcionalmente contra um servidor informado na hora.
	 *
	 * <h2>⚠️ Por que o endereço entra aqui</h2>
	 * Desde 2026-09-10 a engrenagem inteira exige sessão
	 * ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §5}) — inclusive o campo com a URL do
	 * Braserv-Core. Isso fecharia a porta sobre si mesma: sem URL não há login, e sem login não se define
	 * a URL. Uma estação recém-instalada não teria por onde começar.
	 *
	 * <p>A saída é pedir o endereço <b>no próprio login</b>, que é exatamente quando ele é
	 * necessário e por quem tem credencial para usá-lo. Informado e aceito, ele é gravado: da
	 * segunda vez em diante o campo já vem preenchido.
	 *
	 * @param servidor endereço a usar; {@code null} ou vazio mantém o que já está gravado
	 */
	public synchronized Resultado abrir(String usuario, String senha, String servidor) {
		AppSettings configuracoes = settings.loadSettings();
		// No app instalado o servidor e o de producao, definido no build: o digitado nao vale.
		String informado = com.example.demo.config.Ambiente.coreUrl().isPresent() ? null : normalizarBase(servidor);
		String base = informado != null ? informado
				: normalizarBase(configuracoes == null ? null : configuracoes.getCoreUrl());
		if (base == null) {
			return new Resultado.CoreNaoConfigurado();
		}
		if (usuario == null || usuario.isBlank() || senha == null || senha.isEmpty()) {
			return new Resultado.CredencialInvalida();
		}

		BackendLogin.Identidade identidade;
		try {
			identidade = login.autenticar(base, usuario.trim(), senha);
		} catch (IllegalStateException recusado) {
			// O Core respondeu, e disse nao.
			logger.info("Login de configuracao recusado para {}.", usuario);
			return new Resultado.CredencialInvalida();
		} catch (Exception indisponivel) {
			logger.warn("Braserv-Core inalcancavel no login de configuracao: {}", indisponivel.getMessage());
			return new Resultado.CoreIndisponivel(indisponivel.getMessage());
		}

		if (identidade.roles().stream().noneMatch(CONFIGURADORES::contains)) {
			logger.info("Usuario {} autenticou, mas nao tem perfil de configuracao.", usuario);
			return new Resultado.PerfilSemPermissao(usuario.trim());
		}

		atual = new Sessao(usuario.trim(), identidade.token());

		// O endereco so e gravado depois de o servidor ACEITAR a credencial: um endereco digitado
		// errado nao substitui o que estava funcionando.
		if (informado != null && !informado.equals(normalizarBase(
				configuracoes == null ? null : configuracoes.getCoreUrl()))) {
			settings.updateCoreUrl(informado);
			logger.info("Endereco do Braserv-Core definido no login de configuracao.");
		}

		logger.info("Sessao de configuracao aberta por {}.", atual.usuario());
		return new Resultado.Liberada(atual.usuario());
	}

	public synchronized boolean liberada() {
		return atual != null;
	}

	public synchronized Optional<String> usuario() {
		return Optional.ofNullable(atual).map(Sessao::usuario);
	}

	/** Token para chamar o backend em nome de quem abriu a sessão. */
	public synchronized Optional<String> token() {
		return Optional.ofNullable(atual).map(Sessao::token);
	}

	/** Encerra antes de fechar o app. Fechar sem chamar isto tem o mesmo efeito: nada persiste. */
	public synchronized void encerrar() {
		if (atual != null) {
			logger.info("Sessao de configuracao de {} encerrada.", atual.usuario());
		}
		atual = null;
	}

	private static String normalizarBase(String url) {
		if (url == null || url.isBlank()) {
			return null;
		}
		String base = url.trim();
		while (base.endsWith("/")) {
			base = base.substring(0, base.length() - 1);
		}
		return base.isEmpty() ? null : base;
	}
}
