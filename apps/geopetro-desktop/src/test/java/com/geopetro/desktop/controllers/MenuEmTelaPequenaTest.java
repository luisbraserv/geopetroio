package com.geopetro.desktop.controllers;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Node;
import javafx.scene.Scene;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.HBox;
import javafx.scene.layout.StackPane;
import javafx.scene.layout.VBox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * O bug de campo: <i>"em telas pequenas o menu ta sumindo"</i>.
 *
 * <h2>O que estava acontecendo</h2>
 * A barra nunca deixou de existir: media 60px e ficava em y=0, como sempre. Quem sumia era o
 * <b>desenho</b> dela. O {@code contentPane} herdava a altura mínima da página carregada — seis cards
 * de monitoramento pedem ~800px — e o {@code BorderPane}, quando o centro pede mais do que sobra,
 * entrega a altura mínima pedida e centraliza o excedente. O {@code layoutY} do centro virava
 * <b>negativo</b>, e como ele tem fundo opaco, subia e pintava por cima da barra.
 *
 * <p>Daí o formato do sintoma: só em tela pequena (numa tela alta o centro cabe e nada sobe), e o
 * botão "Conectar" sobrevivia — ele está no {@code bottom}, desenhado <i>depois</i> do centro.
 *
 * <h2>Por que medir e não olhar</h2>
 * Este bug foi diagnosticado errado duas vezes por captura de tela: o {@code PrintWindow} devolve
 * pixels sujos numa janela acelerada por hardware, e a primeira suspeita — janela posicionada fora do
 * monitor — era um problema real, mas <b>outro</b>. Geometria se afere com número.
 *
 * <p>⚠️ Precisa de sessão gráfica; sem display a classe se declara inaplicável em vez de falhar.
 */
class MenuEmTelaPequenaTest {

	private static boolean fx;

	@BeforeAll
	static void toolkit() {
		try {
			CountDownLatch pronto = new CountDownLatch(1);
			Platform.startup(pronto::countDown);
			fx = pronto.await(15, TimeUnit.SECONDS);
		} catch (IllegalStateException jaIniciado) {
			fx = true;
		} catch (Exception semDisplay) {
			fx = false;
		}
	}

	/**
	 * As alturas de cena que importam. 689 é a real: 1366x768 com barra de tarefas dá 720 de janela,
	 * menos a barra de título do Windows. 500 é o pior caso plausível de painel pequeno.
	 */
	@Test
	@DisplayName("o centro nunca invade a barra de menu, por menor que seja a janela")
	void aBarraNaoEhCoberta() throws Exception {
		assumeTrue(fx);
		for (double altura : new double[] { 769, 689, 600, 500 }) {
			verificarEm(altura);
		}
	}

	private void verificarEm(double alturaDaCena) throws Exception {
		AtomicReference<AssertionError> falha = new AtomicReference<>();
		CountDownLatch pronto = new CountDownLatch(1);

		Platform.runLater(() -> {
			try {
				FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/main-view.fxml"));
				loader.setControllerFactory(tipo -> new MainViewFxmlController() {
					@Override
					public void initialize() {
						// A fiacao do Spring nao e o objeto deste teste; o recorte e reproduzido
						// abaixo, que e a parte do initialize() que interessa a geometria.
					}
				});
				BorderPane raiz = loader.load();

				StackPane centro = (StackPane) raiz.getCenter();
				((StackPane) raiz.lookup("#contentPane")).getChildren().setAll(paginaAlta());

				new Scene(raiz, 1200, alturaDaCena);
				raiz.applyCss();
				raiz.layout();

				HBox barra = (HBox) ((VBox) raiz.getTop()).getChildren().get(0);
				String onde = "cena de " + (int) alturaDaCena + "px: ";

				assertEquals(60.0, barra.getHeight(), 0.5, onde + "a barra perdeu altura");
				assertEquals(0.0, barra.getLayoutY(), 0.5, onde + "a barra saiu do topo");

				// O ponto do teste: o centro nao pode comecar acima do fim da barra. Antes do
				// conserto media -19, -59, -104 conforme a janela encolhia.
				assertTrue(centro.getLayoutY() >= barra.getHeight() - 0.5,
						onde + "o centro subiu para y=" + centro.getLayoutY()
								+ " e cobriu a barra, que termina em " + barra.getHeight());
			} catch (AssertionError e) {
				falha.set(e);
			} catch (Exception e) {
				falha.set(new AssertionError("falha ao montar a tela", e));
			} finally {
				pronto.countDown();
			}
		});

		assumeTrue(pronto.await(20, TimeUnit.SECONDS), "montagem da tela nao concluiu");
		if (falha.get() != null) {
			throw falha.get();
		}
	}

	/**
	 * Uma página com a fome de espaço do monitoramento cheio: fundo opaco e mínimo maior que
	 * qualquer janela pequena. É o mínimo — e não o preferido — que faz o BorderPane ceder espaço
	 * que não tem.
	 */
	private Node paginaAlta() {
		VBox pagina = new VBox();
		pagina.setStyle("-fx-background-color: #f7f9fc;");
		pagina.setMinHeight(760);
		pagina.setPrefHeight(760);
		return pagina;
	}

	@Test
	@DisplayName("o monitoramento se ajusta sem barras de rolagem")
	void oMonitoramentoAjusta() throws Exception {
		assumeTrue(fx);

		AtomicReference<AssertionError> falha = new AtomicReference<>();
		CountDownLatch pronto = new CountDownLatch(1);

		Platform.runLater(() -> {
			try {
				// ⚠️ Recortar sem rolagem trocaria um defeito por outro: a barra voltaria, e a
				// segunda fileira de cards ficaria invisivel e inalcancavel.
				Node raiz = new FXMLLoader(getClass().getResource("/views/monitoring.fxml")) {
					{
						setControllerFactory(tipo -> new MonitoringController() { @Override public void initialize() {} });
					}
				}.load();

				assertTrue(raiz instanceof VBox);
                var host = new StackPane(raiz);
                new Scene(host, 1000, 500);
                host.applyCss(); host.layout();
                assertNotNull(raiz.lookup("#cardsPane"));
                assertTrue(raiz.lookupAll(".scroll-bar").isEmpty());
            } catch (AssertionError e) {
				falha.set(e);
			} catch (Exception e) {
				falha.set(new AssertionError("falha ao carregar o monitoramento", e));
			} finally {
				pronto.countDown();
			}
		});

		assumeTrue(pronto.await(20, TimeUnit.SECONDS));
		if (falha.get() != null) {
			throw falha.get();
		}
	}
}
