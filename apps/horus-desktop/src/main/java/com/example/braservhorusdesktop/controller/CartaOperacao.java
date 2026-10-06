package com.example.braservhorusdesktop.controller;

import java.io.File;
import java.io.IOException;
import java.net.URL;
import java.util.ResourceBundle;

import com.example.braservhorusdesktop.dto.OperacaoSnapshot;
import com.example.braservhorusdesktop.service.ConnectPLCService;
import com.example.braservhorusdesktop.model.UnidadePressao;
import com.example.braservhorusdesktop.service.ConfiguracaoService;

import javafx.application.Platform;
import javafx.concurrent.Task;
import javafx.fxml.FXML;
import javafx.fxml.FXMLLoader;
import javafx.fxml.Initializable;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.scene.control.Alert.AlertType;
import javafx.scene.control.Label;
import javafx.scene.paint.Color;
import javafx.scene.shape.Circle;
import javafx.stage.Modality;
import javafx.stage.Stage;

public class CartaOperacao implements Initializable {

    @FXML
    private Circle plcStatusCircle;

    @FXML
    private Label plcStatusLabel;

    @FXML
    private Label plcDebugLabel;

    @FXML
    private Label pressaoLabel;

    @FXML
    private Label pressaoTituloLabel;

    @FXML
    private Label strokeAtualLabel;

    @FXML
    private Label volumeLabel;

    @FXML
    private Label vazaoLabel;

    private ConnectPLCService connectPLCService;

    private ConfiguracaoService configuracaoService;

    public CartaOperacao() {
    }

    @Override
    public void initialize(URL location, ResourceBundle resources) {
        this.configuracaoService = new ConfiguracaoService();
        this.connectPLCService = new ConnectPLCService(configuracaoService);

        connectPLCService.setStatusListener(this::atualizarStatusPlc);
        connectPLCService.setSnapshotListener(this::atualizarAcompanhamento);
        connectPLCService.setLogListener(this::atualizarLogPlc);
        atualizarStatusPlc(false);
        aplicarUnidadePressao();
        limparCampos();
    }

    @FXML
    public void onConectarPlc() {
        try {
            String ip = configuracaoService.getIpPlc();

            if (ip == null || ip.isBlank()) {
                exibirAlerta(AlertType.WARNING, "Campo obrigatório", "Informe um IP válido.");
                return;
            }

            if (connectPLCService.isConectado()) {
                connectPLCService.desconectar();
            } else {
                // Cria task para conectar em thread separada
                Task<Boolean> conectarTask = new Task<Boolean>() {
                    @Override
                    protected Boolean call() {
                        try {
                            connectPLCService.conectar(ip.trim(), 102);
                            Thread.sleep(1000);
                            return connectPLCService.isConectado();
                        } catch (Exception e) {
                            e.printStackTrace();
                            return false;
                        }
                    }
                };

                // Mostra dialog APÓS iniciar a task
                conectarTask.setOnSucceeded(event -> {
                    Boolean resultado = conectarTask.getValue();
                    Platform.runLater(() -> {
                        if (resultado != null && resultado) {
                            exibirAlerta(AlertType.INFORMATION, "Sucesso", "Conectado");
                        } else {
                            exibirAlerta(AlertType.ERROR, "Erro de Conexão", 
                                    "Houve problema na conexão, verifique a conexão ou suporte!");
                        }
                    });
                });

                conectarTask.setOnFailed(event -> {
                    Platform.runLater(() -> {
                        exibirAlerta(AlertType.ERROR, "Erro de Conexão", 
                                "Houve problema na conexão, verifique a conexão ou suporte!");
                    });
                });

                conectarTask.setOnCancelled(event -> {
                    Platform.runLater(() -> {
                        exibirAlerta(AlertType.WARNING, "Cancelado", 
                                "A conexão foi cancelada pelo usuário.");
                    });
                });

                // Inicia task em thread daemon
                Thread conectarThread = new Thread(conectarTask);
                conectarThread.setDaemon(true);
                conectarThread.start();

                // Timeout em thread separada (não bloqueia UI)
                Thread timeoutThread = new Thread(() -> {
                    try {
                        // Aguarda 5 segundos
                        Thread.sleep(5000);
                        
                        // Se task ainda está rodando, cancela
                        if (!conectarTask.isDone()) {
                            conectarTask.cancel();
                            Platform.runLater(() -> {
                                exibirAlerta(AlertType.WARNING, "Timeout", 
                                        "A conexão demorou muito tempo. Verifique o IP e tente novamente.");
                            });
                        }
                    } catch (InterruptedException e) {
                        // Ignorar
                    }
                });
                timeoutThread.setDaemon(true);
                timeoutThread.start();

                // Mostra alerta informando que está conectando
                exibirAlerta(AlertType.INFORMATION, "Conectando", 
                        "Conectando ao PLC em " + ip + "...\n\nEste processo pode levar alguns segundos.");
            }

        } catch (Exception e) {
            System.out.println("[PLC] Erro ao conectar/desconectar: " + e.getMessage());
            e.printStackTrace();
            exibirAlerta(AlertType.ERROR, "Erro", "Erro ao conectar: " + e.getMessage());
        }
    }

    @FXML
    public void onGerarPdf() {
        try {
            FXMLLoader loader = new FXMLLoader(
                    getClass().getResource("/gerar.pdf.fxml")
            );

            Parent root = loader.load();

            Scene scene = new Scene(root);
            Stage stage = new Stage();
            stage.setTitle("Gerar Relatório PDF");
            stage.setScene(scene);
            stage.setResizable(false);
            stage.initModality(Modality.APPLICATION_MODAL);
            stage.showAndWait();

        } catch (IOException e) {
            System.err.println("[PDF] Erro ao abrir a tela de geração de PDF: " + e.getMessage());
        }
    }

    @FXML
    public void onAbrirConfiguracao() {
        try {
            FXMLLoader loader = new FXMLLoader(
                    getClass().getResource("/configuracao.fxml")
            );

            Parent root = loader.load();
            ConfiguracaoController controller = loader.getController();
            controller.setConfiguracaoService(configuracaoService);

            Scene scene = new Scene(root);
            Stage stage = new Stage();
            stage.setTitle("Configurações");
            stage.setScene(scene);
            stage.setResizable(false);
            stage.initModality(Modality.APPLICATION_MODAL);
            stage.initOwner(plcStatusLabel.getScene().getWindow());
            stage.showAndWait();

            // A configuracao pode ter trocado a unidade; o card precisa acompanhar sem reabrir o app.
            aplicarUnidadePressao();

        } catch (IOException e) {
            System.err.println("[CONFIG] Erro ao abrir a tela de configuração: " + e.getMessage());
        }
    }

    public void carregarCsv(File file) {
        if (file == null) {
            System.out.println("[CSV] Arquivo nulo.");
            return;
        }

        System.out.println("[CSV] Arquivo recebido: " + file.getAbsolutePath());
    }

    public void shutdown() {
        if (connectPLCService != null) {
            connectPLCService.shutdown();
        }
    }

    private void atualizarStatusPlc(boolean conectado) {
        Platform.runLater(() -> {
            if (conectado) {
                plcStatusCircle.setFill(Color.LIMEGREEN);
                plcStatusLabel.setText("Conectado");
            } else {
                plcStatusCircle.setFill(Color.RED);
                plcStatusLabel.setText("Não conectado");
            }
        });
    }

    /**
     * Poe o titulo do card na unidade configurada.
     *
     * <p>Sem isto o card mostraria "Pressao (PSI)" com um numero em kgf/cm2 — um valor 14x menor sob
     * o rotulo errado, que se parece com uma queda subita de pressao.
     */
    private void aplicarUnidadePressao() {
        if (pressaoTituloLabel == null) {
            return;
        }
        UnidadePressao unidade = configuracaoService.getUnidadePressao();
        pressaoTituloLabel.setText("Pressão (" + unidade.getRotulo() + ")");
    }

    private void atualizarAcompanhamento(OperacaoSnapshot snapshot) {
        if (snapshot == null) {
            return;
        }

        Platform.runLater(() -> {
            UnidadePressao unidade = configuracaoService.getUnidadePressao();
            double pressaoExibida = unidade.converterDePsi(snapshot.getPressao());
            pressaoLabel.setText(String.format("%." + unidade.getCasasDecimais() + "f %s",
                    pressaoExibida, unidade.getRotulo()));
            strokeAtualLabel.setText(String.valueOf(snapshot.getStrokeAtual()));
            volumeLabel.setText(formatarDecimal(snapshot.getVolumeBombeado()) + " bbl");
            vazaoLabel.setText(formatarDecimal(snapshot.getVazaoAtual()) + " bbl/min");
        });
    }

    private void atualizarLogPlc(String mensagem) {
        System.out.println(mensagem);

        if (mensagem == null || plcDebugLabel == null) {
            return;
        }

        if (!mensagem.contains("[PLC-DEBUG]") && !mensagem.startsWith("[PLC] Stroke cumulativo")
                && !mensagem.contains("Stroke cumulativo reiniciado")
                && !mensagem.contains("Leitura do stroke cumulativo falhou")) {
            return;
        }

        Platform.runLater(() -> plcDebugLabel.setText(mensagem));
    }

    private void limparCampos() {
        Platform.runLater(() -> {
            pressaoLabel.setText(
                    String.format("%." + configuracaoService.getUnidadePressao().getCasasDecimais() + "f", 0.0));
            strokeAtualLabel.setText("0");
            volumeLabel.setText(formatarDecimal(0));
            vazaoLabel.setText(formatarDecimal(0));
            if (plcDebugLabel != null) {
                plcDebugLabel.setText("");
            }
        });
    }

    private String formatarDecimal(double valor) {
        return String.format("%.2f", valor);
    }

    /**
     * Exibe um alerta
     */
    private void exibirAlerta(AlertType tipo, String titulo, String mensagem) {
        Platform.runLater(() -> {
            Alert alert = new Alert(tipo);
            alert.setTitle(titulo);
            alert.setHeaderText(null);
            alert.setContentText(mensagem);
            alert.showAndWait();
        });
    }
}
