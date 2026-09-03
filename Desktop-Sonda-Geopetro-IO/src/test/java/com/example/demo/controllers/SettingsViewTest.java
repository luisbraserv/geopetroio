package com.example.demo.controllers;

import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.example.demo.services.SettingsService;
import com.example.demo.services.UnidadeSondaCatalogoService;

import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.ComboBox;
import javafx.scene.layout.GridPane;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assumptions.assumeTrue;

/**
 * Carrega a tela de Configuracoes de verdade.
 *
 * <p>Um FXML quebrado — fx:id sem campo correspondente, import faltando, CSS inexistente — compila
 * sem reclamar e so estoura quando o usuario clica em "Configuracoes". Este teste antecipa isso
 * fazendo o mesmo carregamento que o {@code MainViewFxmlController} faz.
 *
 * <p>Se o toolkit JavaFX nao inicializar (build headless, sem display), o teste se declara
 * inaplicavel em vez de falhar: a ausencia de tela grafica nao diz nada sobre o FXML.
 */
class SettingsViewTest {

    private static boolean toolkitDisponivel;

    @BeforeAll
    static void iniciarToolkit() {
        try {
            CountDownLatch pronto = new CountDownLatch(1);
            Platform.startup(pronto::countDown);
            toolkitDisponivel = pronto.await(15, TimeUnit.SECONDS);
        } catch (IllegalStateException jaIniciado) {
            toolkitDisponivel = true;
        } catch (Exception semDisplay) {
            toolkitDisponivel = false;
        }
    }

    @Test
    void carregaTelaDeConfiguracoes() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        Parent raiz = carregarNaThreadDaUi();

        assertNotNull(raiz, "o FXML deveria ter carregado");
        assertNotNull(raiz.lookup("#cmbUnidadeSonda"), "seletor de Unidade/Sonda ausente");
        assertNotNull(raiz.lookup("#btnSave"), "botao Salvar ausente");
        assertNotNull(raiz.lookup("#txtPlcIp"), "campo de IP do PLC ausente");
    }

    /**
     * A tela deve oferecer <b>um</b> lugar para dizer qual e a sonda.
     *
     * <p>Antes havia dois campos — o codigo do historico e o id numerico do cadastro — e nada
     * garantia que apontassem para a mesma unidade. Preencher so um, ou os dois com valores de
     * sondas diferentes, deixava um dos canais mudo sem qualquer erro visivel.
     */
    @Test
    void possuiApenasUmCampoDeUnidadeSonda() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        Parent raiz = carregarNaThreadDaUi();

        assertNotNull(raiz.lookup("#cmbUnidadeSonda"));
        // Os dois campos de texto da versao anterior nao devem ter sobrevivido.
        assertEquals(null, raiz.lookup("#txtSondaId"), "campo antigo txtSondaId ainda na tela");
        assertEquals(null, raiz.lookup("#txtUnidadeSondaId"), "campo antigo txtUnidadeSondaId ainda na tela");
    }

    /** Em janela estreita, os quatro cartoes precisam empilhar numa coluna so. */
    @Test
    void colapsaParaUmaColunaEmJanelaEstreita() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        AtomicReference<Integer> estreita = new AtomicReference<>();
        AtomicReference<Exception> falha = new AtomicReference<>();
        CountDownLatch pronto = new CountDownLatch(1);

        Platform.runLater(() -> {
            try {
                Parent raiz = novoLoader().load();
                new Scene(raiz, 600, 700);
                raiz.applyCss();
                raiz.layout();

                GridPane grade = (GridPane) raiz.lookup("#grade");

                // O controller registra o listener via Platform.runLater dentro do initialize, entao
                // ele so roda no proximo pulse — depois deste bloco.
                Platform.runLater(() -> {
                    estreita.set(grade.getColumnConstraints().size());
                    pronto.countDown();
                });
            } catch (Exception e) {
                falha.set(e);
                pronto.countDown();
            }
        });

        assumeTrue(pronto.await(15, TimeUnit.SECONDS), "carregamento nao concluiu");
        if (falha.get() != null) {
            throw falha.get();
        }
        assertEquals(1, estreita.get(), "em 600px de largura a grade deveria ter uma coluna so");
    }

    // ------------------------------------------------------------------

    private Parent carregarNaThreadDaUi() throws Exception {
        AtomicReference<Parent> resultado = new AtomicReference<>();
        AtomicReference<Exception> falha = new AtomicReference<>();
        CountDownLatch pronto = new CountDownLatch(1);

        Platform.runLater(() -> {
            try {
                Parent raiz = novoLoader().load();
                // Sem cena e sem layout, o ScrollPane ainda nao construiu seu skin e o conteudo
                // dele fica fora da arvore que lookup() percorre — tudo apareceria como ausente.
                new Scene(raiz, 1000, 700);
                raiz.applyCss();
                raiz.layout();
                resultado.set(raiz);
            } catch (Exception e) {
                falha.set(e);
            } finally {
                pronto.countDown();
            }
        });

        assumeTrue(pronto.await(15, TimeUnit.SECONDS), "carregamento nao concluiu");
        if (falha.get() != null) {
            throw falha.get();
        }
        return resultado.get();
    }

    /**
     * Loader com o controller montado a mao.
     *
     * <p>Sem contexto Spring aqui: subir a aplicacao inteira so para abrir uma tela tornaria o teste
     * lento e o faria falhar por motivos que nada tem a ver com o FXML.
     */
    private FXMLLoader novoLoader() {
        FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/settings.fxml"));
        loader.setControllerFactory(tipo -> {
            SettingsController controller = new SettingsController();
            injetar(controller, "settingsService", new SettingsService());
            injetar(controller, "catalogoService", new UnidadeSondaCatalogoService());
            return controller;
        });
        return loader;
    }

    private void injetar(Object alvo, String campo, Object valor) {
        try {
            Field f = alvo.getClass().getDeclaredField(campo);
            f.setAccessible(true);
            f.set(alvo, valor);
        } catch (ReflectiveOperationException e) {
            throw new IllegalStateException("campo " + campo + " nao existe em " + alvo.getClass(), e);
        }
    }
}
