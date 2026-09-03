package com.example.demo.controllers;

import java.util.List;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Controller;

import com.example.demo.models.AppSettings;
import com.example.demo.models.CardVisibilityConfig;
import com.example.demo.models.UnidadeSondaOpcao;
import com.example.demo.services.SettingsService;
import com.example.demo.services.UnidadeSondaCatalogoService;
import com.example.demo.services.UnidadeSondaCatalogoService.CatalogoIndisponivelException;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.scene.Scene;
import javafx.scene.control.Button;
import javafx.scene.control.CheckBox;
import javafx.scene.control.ComboBox;
import javafx.scene.control.Label;
import javafx.scene.control.PasswordField;
import javafx.scene.control.ScrollPane;
import javafx.scene.control.TextField;
import javafx.scene.layout.BorderPane;
import javafx.scene.layout.ColumnConstraints;
import javafx.scene.layout.GridPane;
import javafx.scene.layout.VBox;
import javafx.stage.Stage;

@Controller
public class SettingsController {

    /**
     * Abaixo desta largura, duas colunas espremem os campos a ponto de cortar os textos de ajuda.
     * Acima, sobra espaco horizontal suficiente para as duas.
     */
    private static final double LARGURA_MINIMA_DUAS_COLUNAS = 780.0;

    @Autowired
    private SettingsService settingsService;

    @Autowired
    private UnidadeSondaCatalogoService catalogoService;

    @FXML private BorderPane raiz;
    @FXML private ScrollPane rolagem;
    @FXML private GridPane grade;
    @FXML private ColumnConstraints coluna1;
    @FXML private ColumnConstraints coluna2;

    @FXML private VBox cartaoEquipamento;
    @FXML private VBox cartaoMqtt;
    @FXML private VBox cartaoTempoReal;
    @FXML private VBox cartaoCards;

    @FXML private TextField txtPlcIp;
    @FXML private ComboBox<UnidadeSondaOpcao> cmbUnidadeSonda;
    @FXML private Button btnRecarregar;
    @FXML private Label lblUnidadeStatus;

    @FXML private TextField txtTelemetriaUrl;
    @FXML private TextField txtTelemetriaUsuario;
    @FXML private PasswordField txtTelemetriaSenha;

    @FXML private TextField txtBackendUrl;
    @FXML private TextField txtBackendUsuario;
    @FXML private PasswordField txtBackendSenha;

    @FXML private Button btnSave;
    @FXML private Button btnCancel;

    @FXML private CheckBox chkPesoColuna;
    @FXML private CheckBox chkChHidTubos;
    @FXML private CheckBox chkChFlutuante;
    @FXML private CheckBox chkBombaLama;
    @FXML private CheckBox chkEscp;
    @FXML private CheckBox chkVazao;

    /** Duas colunas hoje? Guardado para so remontar a grade quando o estado realmente muda. */
    private boolean duasColunas = true;

    @FXML
    public void initialize() {
        AppSettings settings = settingsService.loadSettings();

        txtPlcIp.setText(settings.getPlcIp());
        txtTelemetriaUrl.setText(settings.getTelemetriaUrl());
        txtTelemetriaUsuario.setText(settings.getTelemetriaUsuario());
        txtTelemetriaSenha.setText(settings.getTelemetriaSenha());
        txtBackendUrl.setText(settings.getBackendUrl());
        txtBackendUsuario.setText(settings.getBackendUsuario());
        txtBackendSenha.setText(settings.getBackendSenha());

        mostrarSelecaoSalva(settings);

        CardVisibilityConfig vis = settings.getCardVisibility();
        chkPesoColuna.setSelected(vis.isPesoColuna());
        chkChHidTubos.setSelected(vis.isChHidTubos());
        chkChFlutuante.setSelected(vis.isChFlutuante());
        chkBombaLama.setSelected(vis.isBombaLama());
        chkEscp.setSelected(vis.isEscp());
        chkVazao.setSelected(vis.isVazao());

        btnSave.setOnAction(event -> saveSettings());
        btnCancel.setOnAction(event -> closeWindow());
        btnRecarregar.setOnAction(event -> carregarUnidades());

        observarLargura();
    }

    // ------------------------------------------------------------------
    // Unidade/Sonda
    // ------------------------------------------------------------------

    /**
     * Mostra o que ja estava salvo antes de qualquer ida ao backend.
     *
     * <p>A tela precisa ser util com o backend fora do ar: sem isso, abrir Configuracoes numa sonda
     * offline daria a impressao de que a unidade se perdeu.
     */
    private void mostrarSelecaoSalva(AppSettings settings) {
        Long id = settings.getUnidadeSondaId();
        String codigo = settings.getSondaId();

        if (id == null && (codigo == null || codigo.isBlank())) {
            lblUnidadeStatus.setText("Nenhuma Unidade/Sonda configurada. Use \"Buscar\" para listar.");
            return;
        }

        UnidadeSondaOpcao salva = new UnidadeSondaOpcao(id, codigo, codigo, null);
        cmbUnidadeSonda.setItems(FXCollections.observableArrayList(salva));
        cmbUnidadeSonda.getSelectionModel().select(salva);
        lblUnidadeStatus.setText(descreverSelecao(id, codigo) + " (salvo). Use \"Buscar\" para trocar.");
    }

    private void carregarUnidades() {
        String url = texto(txtBackendUrl);
        String usuario = texto(txtBackendUsuario);
        String senha = txtBackendSenha.getText();

        btnRecarregar.setDisable(true);
        lblUnidadeStatus.setText("Consultando o Backend...");

        // Chamada de rede fora da thread de UI: 10s de timeout congelariam a janela.
        Task<List<UnidadeSondaOpcao>> tarefa = new Task<>() {
            @Override
            protected List<UnidadeSondaOpcao> call() {
                return catalogoService.listar(url, usuario, senha);
            }
        };

        tarefa.setOnSucceeded(e -> {
            btnRecarregar.setDisable(false);
            aplicarUnidades(tarefa.getValue());
        });

        tarefa.setOnFailed(e -> {
            btnRecarregar.setDisable(false);
            Throwable causa = tarefa.getException();
            String mensagem = causa instanceof CatalogoIndisponivelException
                    ? causa.getMessage()
                    : "Falha ao consultar o Backend.";
            // A selecao anterior fica de pe: falha de rede nao deve apagar o que ja funcionava.
            lblUnidadeStatus.setText(mensagem);
        });

        Thread thread = new Thread(tarefa, "catalogo-unidades");
        thread.setDaemon(true);
        thread.start();
    }

    private void aplicarUnidades(List<UnidadeSondaOpcao> unidades) {
        if (unidades == null || unidades.isEmpty()) {
            lblUnidadeStatus.setText("O Backend não retornou nenhuma Unidade/Sonda para este usuário.");
            return;
        }

        Long idAtual = settingsService.loadSettings().getUnidadeSondaId();
        cmbUnidadeSonda.setItems(FXCollections.observableArrayList(unidades));

        UnidadeSondaOpcao aSelecionar = unidades.stream()
                .filter(u -> u.id().equals(idAtual))
                .findFirst()
                .orElse(null);

        if (aSelecionar != null) {
            cmbUnidadeSonda.getSelectionModel().select(aSelecionar);
            lblUnidadeStatus.setText(unidades.size() + " unidade(s) encontrada(s).");
        } else {
            cmbUnidadeSonda.getSelectionModel().clearSelection();
            lblUnidadeStatus.setText(unidades.size() + " unidade(s) encontrada(s). Selecione uma.");
        }
    }

    private String descreverSelecao(Long id, String codigo) {
        String texto = codigo == null || codigo.isBlank() ? "(sem código)" : codigo;
        return id == null ? texto : texto + " · id " + id;
    }

    // ------------------------------------------------------------------
    // Layout responsivo
    // ------------------------------------------------------------------

    /**
     * Colapsa para uma coluna em janelas estreitas.
     *
     * <p>FXML nao tem media query, entao a troca acontece aqui, observando a largura da cena. A
     * grade so e remontada quando o estado muda — reagir a cada pixel do arrasto reposicionaria os
     * quatro cartoes continuamente.
     */
    private void observarLargura() {
        Platform.runLater(() -> {
            Scene scene = raiz.getScene();
            if (scene == null) {
                return;
            }
            aplicarLayout(scene.getWidth() >= LARGURA_MINIMA_DUAS_COLUNAS);
            scene.widthProperty().addListener((obs, antigo, novo) ->
                    aplicarLayout(novo.doubleValue() >= LARGURA_MINIMA_DUAS_COLUNAS));
        });
    }

    private void aplicarLayout(boolean duas) {
        if (duas == duasColunas && grade.getColumnConstraints().size() > 0) {
            return;
        }
        duasColunas = duas;

        if (duas) {
            posicionar(cartaoEquipamento, 0, 0);
            posicionar(cartaoMqtt, 1, 0);
            posicionar(cartaoTempoReal, 0, 1);
            posicionar(cartaoCards, 1, 1);

            grade.getColumnConstraints().setAll(coluna1, coluna2);
            coluna1.setPercentWidth(50.0);
            coluna2.setPercentWidth(50.0);
        } else {
            posicionar(cartaoEquipamento, 0, 0);
            posicionar(cartaoMqtt, 0, 1);
            posicionar(cartaoTempoReal, 0, 2);
            posicionar(cartaoCards, 0, 3);

            grade.getColumnConstraints().setAll(coluna1);
            coluna1.setPercentWidth(100.0);
        }
    }

    private void posicionar(VBox cartao, int coluna, int linha) {
        GridPane.setColumnIndex(cartao, coluna);
        GridPane.setRowIndex(cartao, linha);
    }

    // ------------------------------------------------------------------
    // Salvar
    // ------------------------------------------------------------------

    private void saveSettings() {
        UnidadeSondaOpcao unidade = cmbUnidadeSonda.getSelectionModel().getSelectedItem();

        settingsService.updatePlcIp(texto(txtPlcIp));
        settingsService.updateTelemetriaUrl(texto(txtTelemetriaUrl));
        settingsService.updateTelemetriaCredenciais(
                txtTelemetriaUsuario.getText(), txtTelemetriaSenha.getText());

        // Uma escolha alimenta os dois enderecos: o codigo textual do historico (topico MQTT) e o
        // id numerico do tempo real (topico WebSocket).
        settingsService.updateSondaId(unidade == null || unidade.idSondaUnidade() == null
                ? ""
                : unidade.idSondaUnidade().trim());

        settingsService.updateTempoReal(
                unidade == null ? null : unidade.id(),
                txtBackendUrl.getText(),
                txtBackendUsuario.getText(),
                txtBackendSenha.getText());

        CardVisibilityConfig vis = new CardVisibilityConfig();
        vis.setPesoColuna(chkPesoColuna.isSelected());
        vis.setChHidTubos(chkChHidTubos.isSelected());
        vis.setChFlutuante(chkChFlutuante.isSelected());
        vis.setBombaLama(chkBombaLama.isSelected());
        vis.setEscp(chkEscp.isSelected());
        vis.setVazao(chkVazao.isSelected());
        settingsService.updateCardVisibility(vis);

        closeWindow();
    }

    private String texto(TextField campo) {
        String valor = campo.getText();
        return valor == null ? "" : valor.trim();
    }

    private void closeWindow() {
        Stage stage = (Stage) txtPlcIp.getScene().getWindow();
        stage.close();
    }
}
