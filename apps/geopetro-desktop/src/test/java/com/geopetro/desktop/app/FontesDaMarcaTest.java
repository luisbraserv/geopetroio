package com.geopetro.desktop.app;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import javafx.application.Platform;
import javafx.scene.Scene;
import javafx.scene.control.Label;
import javafx.scene.layout.VBox;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * As fontes do Braserv DS 1.1 chegam ao pacote e o CSS as usa.
 *
 * <p>Duas falhas silenciosas motivaram este teste: o {@code pom.xml} copia só os tipos de recurso
 * listados, e {@code .ttf} ficava de fora sem erro algum; e o {@code @font-face} do JavaFX não
 * carrega fonte de URL com espaço. Nos dois casos a tela abria normal, só que em Segoe UI.
 *
 * <p>⚠️ A parte visual precisa de sessão gráfica; sem display ela se declara inaplicável.
 */
class FontesDaMarcaTest {

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

	@Test
	@DisplayName("as fontes e as licenças OFL vão para o pacote")
	void recursosEmpacotados() {
		for (String arquivo : FontesDaMarca.ARQUIVOS) {
			assertNotNull(getClass().getResource("/views/fonts/" + arquivo), arquivo + " fora do pacote — confira o <includes> do pom");
		}
		assertNotNull(getClass().getResource("/views/fonts/OFL-Montserrat.txt"));
		assertNotNull(getClass().getResource("/views/fonts/OFL-Exo2.txt"));
	}

	@Test
	@DisplayName("depois de carregadas, corpo sai em Montserrat e título em Exo 2")
	void cssUsaAsFontesDaMarca() throws Exception {
		assumeTrue(fx, "sem sessão gráfica");
		AtomicReference<String[]> familias = new AtomicReference<>();
		AtomicReference<Integer> carregadas = new AtomicReference<>();
		CountDownLatch fim = new CountDownLatch(1);
		Platform.runLater(() -> {
			try {
				carregadas.set(FontesDaMarca.carregar());
				Label corpo = new Label("corpo");
				Label titulo = new Label("titulo");
				titulo.getStyleClass().add("titulo-tela");
				VBox raiz = new VBox(corpo, titulo);
				new Scene(raiz).getStylesheets().add(getClass().getResource("/views/geopetro-design-system.css").toExternalForm());
				raiz.applyCss();
				familias.set(new String[] { corpo.getFont().getFamily(), titulo.getFont().getFamily() });
			} finally {
				fim.countDown();
			}
		});
		fim.await(15, TimeUnit.SECONDS);

		assertEquals(FontesDaMarca.ARQUIVOS.length, carregadas.get());
		assertEquals("Montserrat", familias.get()[0]);
		assertEquals("Exo 2", familias.get()[1]);
	}
}
