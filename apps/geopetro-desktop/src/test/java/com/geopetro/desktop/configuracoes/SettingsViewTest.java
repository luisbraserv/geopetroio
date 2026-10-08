package com.geopetro.desktop.configuracoes;

import java.lang.reflect.Field;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

import com.geopetro.desktop.sessao.UnidadeSondaCatalogoService;

import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.ComboBox;
import javafx.scene.layout.GridPane;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
        assertNotNull(raiz.lookup("#cmbUnidadeSonda"), "seletor de Unidade ausente");
        assertNotNull(raiz.lookup("#btnSave"), "botao Salvar ausente");
        assertNotNull(raiz.lookup("#txtPlcIp"), "campo de IP do PLC ausente");
        assertNull(raiz.lookup("#txtTelemetriaUrl"), "URL do broker ficou exposta na tela");
        assertNull(raiz.lookup("#txtCoreUrl"), "URL do Core ficou exposta na tela");
        assertNull(raiz.lookup("#txtBackendUrl"), "URL do Backend ficou exposta na tela");
    }

    /**
     * A conexao do CLP <b>inteira</b> mora aqui — {@code configuracao-da-estacao.md §4}.
     *
     * <p>Antes o IP aparecia nesta tela e nao conectava nada ({@code AppSettings.plcIp} era lido,
     * exibido, salvo e ignorado), enquanto rack, slot, DB e intervalo viviam na tela de Cards. Agora
     * os cinco estao num lugar so, e e por ele que o PLC conecta.
     */
    @Test
    void aConexaoDoClpEstaCompletaNaEngrenagem() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        Parent raiz = carregarNaThreadDaUi();

        for (String campo : new String[] { "#txtPlcIp", "#txtPlcRack", "#txtPlcSlot",
                "#txtPlcDb", "#txtPlcIntervalo" }) {
            assertNotNull(raiz.lookup(campo), campo + " ausente: a conexao do CLP ficou pela metade");
        }
        assertNotNull(raiz.lookup("#lblConexaoStatus"),
                "sem linha de status, uma leitura que falhou deixaria campos vazios sem explicacao");
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
        assertEquals(null, raiz.lookup("#txtUnidadeId"), "campo antigo txtUnidadeId ainda na tela");
    }

    /**
     * ⚠️ O portao de configuracao — {@code configuracao-da-estacao.md §5}.
     *
     * <p><b>[DECIDIDO 2026-09-10]</b> Sem excecao: os cartoes ficam trancados sem sessao,
     * enderecos e credenciais inclusive.
     *
     * <p>Os enderecos internos vem da configuracao de producao e nao aparecem na interface.
     */
    @Test
    void semSessaoAEngrenagemInteiraFicaTrancada() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        Parent raiz = carregarNaThreadDaUi();

        assertTrue(raiz.lookup("#cartaoEquipamento").isDisabled(),
                "IP do CLP e Unidade exigem ADMIN ou SUPORTE");
        // ⚠️ cartaoCards saiu da tela em 2026-09-10 — ver oCartaoDeCardsVisiveisSumiu().
        assertTrue(raiz.lookup("#cartaoTempoReal").isDisabled(),
                "credenciais do Backend entraram no portao");
        assertTrue(raiz.lookup("#cartaoMqtt").isDisabled(),
                "credenciais do broker entraram junto");
    }

    /**
     * "Cards visíveis no monitoramento" saiu da engrenagem — {@code configuracao-da-estacao.md §4}.
     *
     * <p>Eram seis checkboxes das grandezas fixas de antes dos cards configuráveis, e
     * {@code CardVisibilityConfig} era lido e escrito <b>somente</b> pela própria tela: nada no
     * caminho de leitura, de publicação ou de desenho o consultava.
     *
     * <p>⚠️ <b>O rótulo mentia</b> — prometia que "cards desmarcados ficam ocultos e não salvam
     * dados", e nenhuma das duas coisas acontecia. Uma tela que promete controle que não exerce é
     * pior que a ausência dela: quem desmarcasse iria procurar o efeito, não achar, e desconfiar do
     * resto da configuração.
     */
    @Test
    void oCartaoDeCardsVisiveisSumiu() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        Parent raiz = carregarNaThreadDaUi();

        assertNull(raiz.lookup("#cartaoCards"), "o cartao de cards visiveis voltou a tela");
        for (String morto : new String[] { "#chkPesoColuna", "#chkChHidTubos", "#chkChFlutuante",
                "#chkBombaLama", "#chkEscp", "#chkVazao" }) {
            assertNull(raiz.lookup(morto), morto + " voltou: ele nao controla nada");
        }
    }

    /**
     * Os dois interruptores de telemetria — {@code configuracao-da-estacao.md §6}.
     *
     * <p>Antes não havia liga/desliga: "desligar" era apagar um campo. Funcionava por acidente, era
     * indescobrível, e não distinguia <b>desligado de propósito</b> de <b>mal configurado</b>.
     *
     * <p>Nascem marcados, e é o que a migração exige: uma estação em campo abre esta tela com a
     * telemetria ligada, como sempre esteve.
     */
    @Test
    void osDoisInterruptoresDeTelemetriaEstaoNaTela() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        Parent raiz = carregarNaThreadDaUi();

        javafx.scene.control.CheckBox mqtt =
                (javafx.scene.control.CheckBox) raiz.lookup("#chkTelemetriaMqtt");
        javafx.scene.control.CheckBox tempoReal =
                (javafx.scene.control.CheckBox) raiz.lookup("#chkTempoReal");

        assertNotNull(mqtt, "sem o interruptor, desligar volta a ser apagar um campo");
        assertNotNull(tempoReal);
        assertTrue(mqtt.isSelected(), "a tela abriria desligando a telemetria de quem nunca escolheu");
        assertTrue(tempoReal.isSelected());
    }

    /** O aviso precisa estar na tela, ou o campo desabilitado vira mistério sem explicação. */
    @Test
    void aTelaDizPorQueEstaTrancada() throws Exception {
        assumeTrue(toolkitDisponivel, "JavaFX indisponivel neste ambiente");

        Parent raiz = carregarNaThreadDaUi();

        assertNotNull(raiz.lookup("#btnDesbloquear"), "sem caminho para entrar, o portao vira beco");
        javafx.scene.control.Label aviso = (javafx.scene.control.Label) raiz.lookup("#lblPortao");
        assertNotNull(aviso);
        assertTrue(aviso.getText().contains("ADMIN"), aviso.getText());
    }

    /** Em janela estreita, os cartoes precisam empilhar numa coluna so. */
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
        FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/configuracoes/settings.fxml"));
        loader.setControllerFactory(tipo -> {
            SettingsController controller = new SettingsController();
            injetar(controller, "settingsService", new SettingsService());
            injetar(controller, "catalogoService", new UnidadeSondaCatalogoService());
            // Sessao fechada: e o estado com que a tela abre, e o que o portao precisa ver.
            injetar(controller, "sessao", new com.geopetro.desktop.sessao.SessaoConfiguracao(new SettingsService()));
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
