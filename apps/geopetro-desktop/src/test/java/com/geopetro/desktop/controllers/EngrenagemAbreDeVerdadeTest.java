package com.geopetro.desktop.controllers;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfSystemProperty;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.ApplicationContext;

import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.fail;

/**
 * Abre a engrenagem <b>como o app abre</b> — pelo contêiner, e não com o controller montado à mão.
 *
 * <h2>Por que este teste existe</h2>
 * {@link SettingsViewTest} constrói o {@code SettingsController} com {@code new} e injeta três
 * campos por reflexão. Isso prova o casamento dos {@code fx:id}, mas <b>não</b> prova que a tela
 * abre: um {@code @Autowired} novo que o contêiner não saiba resolver, ou um {@code initialize()}
 * que estoure com as dependências reais, passa despercebido ali e derruba a janela no clique.
 *
 * <p>⚠️ {@code MainViewFxmlController.openSettingsWindow} só captura {@code IOException}. Um
 * {@code RuntimeException} vindo do {@code initialize()} sobe pelo manipulador de evento do JavaFX e
 * a janela simplesmente <b>não abre</b>, sem alerta e sem mensagem na tela — que é exatamente o
 * sintoma que se quer impedir de voltar.
 */
@SpringBootTest
@EnabledIfSystemProperty(named = "fx.disponivel", matches = "true")
class EngrenagemAbreDeVerdadeTest {

	@Autowired
	private ApplicationContext applicationContext;

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

	@Test
	void aEngrenagemAbrePeloContexto() throws Exception {
		AtomicReference<Parent> raiz = new AtomicReference<>();
		AtomicReference<Throwable> erro = new AtomicReference<>();
		CountDownLatch pronto = new CountDownLatch(1);

		Platform.runLater(() -> {
			try {
				// A MESMA montagem de openSettingsWindow().
				FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/configuracoes/settings.fxml"));
				loader.setControllerFactory(applicationContext::getBean);
				Parent conteudo = loader.load();
				new Scene(conteudo, 900, 700);
				conteudo.applyCss();
				conteudo.layout();
				raiz.set(conteudo);
			} catch (Throwable t) {
				erro.set(t);
			} finally {
				pronto.countDown();
			}
		});

		if (!pronto.await(30, TimeUnit.SECONDS)) {
			fail("Carregar a engrenagem passou de 30s.");
		}
		if (erro.get() != null) {
			throw new AssertionError("A engrenagem nao abre pelo contexto do app", erro.get());
		}
		assertNotNull(raiz.get());
	}
}
