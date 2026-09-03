package com.example.braservhorusdesktop.controller;

import java.io.File;
import java.net.URL;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.format.DateTimeFormatter;
import java.util.ResourceBundle;

import com.example.braservhorusdesktop.model.UnidadePressao;
import com.example.braservhorusdesktop.service.ConfiguracaoService;
import com.example.braservhorusdesktop.service.PdfService;

import javafx.application.Platform;
import javafx.collections.FXCollections;
import javafx.concurrent.Task;
import javafx.event.ActionEvent;
import javafx.fxml.FXML;
import javafx.fxml.Initializable;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.Button;
import javafx.scene.control.ComboBox;
import javafx.scene.control.DatePicker;
import javafx.scene.control.Label;
import javafx.scene.control.ProgressBar;
import javafx.scene.control.TextField;
import javafx.scene.layout.VBox;
import javafx.stage.FileChooser;
import javafx.stage.Stage;

public class GerarPdfController implements Initializable {

    @FXML private TextField nomePocoDespField;
    @FXML private DatePicker dataInicioField;
    @FXML private DatePicker dataFimField;
    @FXML private TextField horaInicioField;
    @FXML private TextField horaFimField;
    @FXML private ComboBox<UnidadePressao> unidadePressaoCombo;

    @FXML private VBox progressoBox;
    @FXML private Label progressoLabel;
    @FXML private ProgressBar progressoBar;

    @FXML private Button btnGerar;
    @FXML private Button btnCancelar;

    private PdfService pdfService;
    private ConfiguracaoService configuracaoService;

    @Override
    public void initialize(URL location, ResourceBundle resources) {
        this.pdfService = new PdfService();
        this.configuracaoService = new ConfiguracaoService();

        LocalDate hoje = LocalDate.now();
        dataInicioField.setValue(hoje);
        dataFimField.setValue(hoje);
        horaInicioField.setText("00:00:00");
        horaFimField.setText("23:59:59");

        unidadePressaoCombo.setItems(FXCollections.observableArrayList(UnidadePressao.values()));
        // Comeca na unidade configurada, mas o relatorio pode sair em outra sem mexer na config —
        // e comum precisar de uma copia em kgf/cm2 so para um cliente especifico.
        unidadePressaoCombo.setValue(configuracaoService.getUnidadePressao());
    }

    @FXML
    public void onGerarPdf(ActionEvent event) {
        String nomePoco = nomePocoDespField.getText();
        if (nomePoco == null || nomePoco.isBlank()) {
            exibirAlerta(AlertType.WARNING, "Campo obrigatório", "Informe o nome do poço");
            return;
        }

        if (dataInicioField.getValue() == null) {
            exibirAlerta(AlertType.WARNING, "Campo obrigatório", "Informe a data de início");
            return;
        }

        if (dataFimField.getValue() == null) {
            exibirAlerta(AlertType.WARNING, "Campo obrigatório", "Informe a data de fim");
            return;
        }

        String horaInicio = horaInicioField.getText();
        String horaFim = horaFimField.getText();

        if (horaInicio == null || horaInicio.isBlank() || horaFim == null || horaFim.isBlank()) {
            exibirAlerta(AlertType.WARNING, "Campo obrigatório", "Informe as horas de início e fim");
            return;
        }

        if (!validarFormatoHora(horaInicio) || !validarFormatoHora(horaFim)) {
            exibirAlerta(AlertType.WARNING, "Formato inválido", "Use o formato HH:mm:ss para as horas");
            return;
        }

        LocalDateTime dataHoraInicio = LocalDateTime.of(
                dataInicioField.getValue(),
                LocalTime.parse(horaInicio, DateTimeFormatter.ofPattern("HH:mm:ss")));

        LocalDateTime dataHoraFim = LocalDateTime.of(
                dataFimField.getValue(),
                LocalTime.parse(horaFim, DateTimeFormatter.ofPattern("HH:mm:ss")));

        if (dataHoraInicio.isAfter(dataHoraFim)) {
            exibirAlerta(AlertType.WARNING, "Intervalo inválido",
                    "A data de início não pode ser posterior à data de fim");
            return;
        }

        FileChooser fileChooser = new FileChooser();
        fileChooser.setTitle("Salvar Relatório PDF");
        fileChooser.getExtensionFilters().add(
                new FileChooser.ExtensionFilter("Arquivo PDF (*.pdf)", "*.pdf"));
        fileChooser.setInitialFileName(nomePoco + "_" + System.currentTimeMillis() + ".pdf");

        Stage stage = (Stage) nomePocoDespField.getScene().getWindow();
        File file = fileChooser.showSaveDialog(stage);

        if (file == null) {
            return;
        }

        UnidadePressao unidade = unidadePressaoCombo.getValue() == null
                ? UnidadePressao.PSI
                : unidadePressaoCombo.getValue();

        gerarEmSegundoPlano(nomePoco, dataHoraInicio, dataHoraFim, horaInicio, horaFim, file, unidade, stage);
    }

    /**
     * Gera o PDF fora da thread de UI, com a barra acompanhando as etapas.
     *
     * <p>Antes a geracao rodava direto no handler do botao: a janela congelava enquanto os quatro
     * graficos eram desenhados e o arquivo gravado, e o unico retorno era o alerta de sucesso
     * aparecendo do nada no fim. Sem nenhum sinal na tela, o clique parecia nao ter funcionado.
     */
    private void gerarEmSegundoPlano(
            String nomePoco,
            LocalDateTime dataHoraInicio,
            LocalDateTime dataHoraFim,
            String horaInicio,
            String horaFim,
            File destino,
            UnidadePressao unidade,
            Stage stage) {

        Task<Void> tarefa = new Task<>() {
            @Override
            protected Void call() {
                pdfService.gerarPdfComGraficos(
                        nomePoco,
                        dataHoraInicio,
                        dataHoraFim,
                        horaInicio,
                        horaFim,
                        destino.getAbsolutePath(),
                        unidade,
                        // Chega da thread de geracao; Platform.runLater leva para a UI.
                        (etapa, concluidas, total) -> Platform.runLater(() -> {
                            progressoLabel.setText(etapa);
                            progressoBar.setProgress(total == 0 ? 0 : (double) concluidas / total);
                        }));
                return null;
            }
        };

        tarefa.setOnSucceeded(e -> {
            mostrarProgresso(false);
            // So aqui o arquivo existe de fato — a mensagem de sucesso nao antecipa nada.
            exibirAlerta(AlertType.INFORMATION, "Sucesso",
                    "PDF gerado com sucesso!\nLocalização: " + destino.getAbsolutePath());
            stage.close();
        });

        tarefa.setOnFailed(e -> {
            mostrarProgresso(false);
            Throwable causa = tarefa.getException();
            String detalhe = causa == null ? "erro desconhecido" : causa.getMessage();
            System.err.println("[PDF] Erro ao gerar PDF: " + detalhe);
            exibirAlerta(AlertType.ERROR, "Erro", "Erro ao gerar PDF: " + detalhe);
        });

        mostrarProgresso(true);
        progressoLabel.setText("Iniciando...");
        progressoBar.setProgress(0);

        Thread thread = new Thread(tarefa, "geracao-pdf");
        thread.setDaemon(true);
        thread.start();
    }

    /** Mostra a barra e bloqueia os botoes, para nao disparar duas geracoes ao mesmo tempo. */
    private void mostrarProgresso(boolean gerando) {
        progressoBox.setVisible(gerando);
        progressoBox.setManaged(gerando);
        btnGerar.setDisable(gerando);
        btnCancelar.setDisable(gerando);
    }

    @FXML
    public void onCancelar(ActionEvent event) {
        Stage stage = (Stage) nomePocoDespField.getScene().getWindow();
        stage.close();
    }

    private boolean validarFormatoHora(String hora) {
        try {
            LocalTime.parse(hora, DateTimeFormatter.ofPattern("HH:mm:ss"));
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private void exibirAlerta(AlertType tipo, String titulo, String mensagem) {
        Alert alert = new Alert(tipo);
        alert.setTitle(titulo);
        alert.setHeaderText(null);
        alert.setContentText(mensagem);
        alert.showAndWait();
    }
}
