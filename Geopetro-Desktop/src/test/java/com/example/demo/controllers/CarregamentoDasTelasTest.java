package com.example.demo.controllers;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.fail;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;

import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;

/**
 * Carrega os FXML das telas novas e confere que cada {@code fx:id} tem campo no controller.
 *
 * <h2>Por que este teste existe</h2>
 * FXML falha em <b>tempo de execução</b>, não de compilação. Um {@code fx:id} sem campo, um campo com
 * o tipo errado, um {@code fx:controller} apontando para classe que não existe — nada disso aparece
 * no {@code mvn compile}, e o app sobe normalmente até alguém clicar no botão que abre a tela.
 *
 * <p>É a mesma armadilha que deixou o Flyway três dias inerte no classpath em 2026-09-07: suíte
 * verde, aplicação quebrada. Ver DT-002.
 *
 * <h2>⚠️ Precisa de sessão gráfica</h2>
 * {@code Platform.startup()} exige um display. Numa máquina sem sessão gráfica — um agente de CI, por
 * exemplo — a classe é <b>pulada</b>, não falha: um teste que quebra por falta de monitor seria
 * desligado no primeiro pipeline vermelho, e junto iria a verificação que ele faz.
 *
 * <p>Para rodar: {@code mvn test -Dfx.disponivel=true}. O {@code javafx:run} do dia a dia continua
 * sendo a prova final.
 */
@EnabledIfSystemProperty(named = "fx.disponivel", matches = "true")
class CarregamentoDasTelasTest {

	@BeforeAll
	static void iniciarToolkit() throws Exception {
		CountDownLatch pronto = new CountDownLatch(1);
		try {
			Platform.startup(pronto::countDown);
		} catch (IllegalStateException jaIniciado) {
			pronto.countDown();
		}
		if (!pronto.await(20, TimeUnit.SECONDS)) {
			fail("O toolkit do JavaFX nao subiu em 20s.");
		}
	}

	/**
	 * Carrega o FXML sem container: o controller vem do construtor sem argumentos e as dependências
	 * {@code @Autowired} ficam nulas. Serve, porque o que se quer provar é a <b>árvore</b> e o
	 * casamento dos {@code fx:id} — não a fiação do Spring.
	 *
	 * @param controller quando informado, substitui o do {@code fx:controller} — por
	 *                   {@code setControllerFactory}, e não {@code setController}, que o
	 *                   {@link FXMLLoader} recusa quando o FXML já declara um. É o jeito de testar
	 *                   uma tela cujo {@code initialize()} usa os beans injetados: passa-se uma
	 *                   subclasse com {@code initialize()} vazio. A injeção dos {@code fx:id}
	 *                   acontece <b>antes</b> do {@code initialize()} e percorre a hierarquia, então
	 *                   nenhum campo deixa de ser conferido por isso.
	 */
	private Parent carregar(String caminho, Object controller) throws Exception {
		AtomicReference<Parent> raiz = new AtomicReference<>();
		AtomicReference<Throwable> erro = new AtomicReference<>();
		CountDownLatch pronto = new CountDownLatch(1);

		Platform.runLater(() -> {
			try {
				FXMLLoader loader = new FXMLLoader(getClass().getResource(caminho));
				if (controller != null) {
					loader.setControllerFactory(classe -> controller);
				}
				raiz.set(loader.load());
			} catch (Throwable t) {
				erro.set(t);
			} finally {
				pronto.countDown();
			}
		});

		if (!pronto.await(20, TimeUnit.SECONDS)) {
			fail("Carregar " + caminho + " passou de 20s.");
		}
		if (erro.get() != null) {
			throw new AssertionError("Falha ao carregar " + caminho, erro.get());
		}
		return raiz.get();
	}

	private Parent carregar(String caminho) throws Exception {
		return carregar(caminho, null);
	}

	@Test
	@DisplayName("cards-config.fxml carrega e casa com o CardsConfigController")
	void telaDeCards() {
		assertDoesNotThrow(() -> assertNotNull(carregar("/views/cards-config.fxml")));
	}

	@Test
	@DisplayName("configuracao-login.fxml carrega e casa com o ConfiguracaoLoginController")
	void telaDeLogin() {
		assertDoesNotThrow(() -> assertNotNull(carregar("/views/configuracao-login.fxml")));
	}

	@Test
	@DisplayName("main-view.fxml continua carregando com o botao de Cards")
	void telaPrincipal() {
		// O initialize() da tela principal fala com o PlcConnectionService, que sem container e
		// nulo. Anular so o initialize() mantem de pe o que este teste existe para conferir: se o
		// btnCards recem-adicionado ao FXML encontra o campo no controller.
		var semInicializacao = new MainViewFxmlController() {
			@Override
			public void initialize() {
				// Proposital: a fiacao do Spring nao e o objeto deste teste.
			}
		};

		assertDoesNotThrow(() -> assertNotNull(carregar("/views/main-view.fxml", semInicializacao)));
	}
}
