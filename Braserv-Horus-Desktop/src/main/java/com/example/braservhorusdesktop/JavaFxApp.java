package com.example.braservhorusdesktop;

import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.awt.image.BufferedImage;
import java.io.IOException;

import javax.imageio.ImageIO;

import com.example.braservhorusdesktop.controller.CartaOperacao;

import javafx.application.Application;
import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.stage.Stage;

public class JavaFxApp extends Application {

    private static final String APP_TITLE = "GeoPetro IO - Cimentação";

    private Stage primaryStage;
    private CartaOperacao cartaOperacaoController;
    private TrayIcon trayIcon;
    private boolean exitRequested;
    private boolean resourcesReleased;
    private boolean trayNotificationDisplayed;

    @Override
    public void start(Stage stage) throws Exception {
        FXMLLoader loader = new FXMLLoader(
                getClass().getResource("/carta.operacao.fxml")
        );

        Parent root = loader.load();
        cartaOperacaoController = loader.getController();
        primaryStage = stage;

        Scene scene = new Scene(root);

        stage.setTitle(APP_TITLE);

        stage.getIcons().add(
                new Image(
                        getClass().getResourceAsStream("/icons/logo.png")
                )
        );

        stage.setScene(scene);

        if (configurarBandejaDoSistema()) {
            Platform.setImplicitExit(false);
            configurarComportamentoDaJanela(stage);
        }

        stage.show();

        // A partir daqui, outra tentativa de abrir o app traz esta janela para a frente
        // em vez de subir um segundo processo.
        InstanciaUnica.aoPedirAbertura(this::exibirJanelaPrincipal);
    }

    private boolean configurarBandejaDoSistema() {
        if (!SystemTray.isSupported()) {
            System.err.println("[TRAY] A bandeja do sistema não está disponível.");
            return false;
        }

        try {
            BufferedImage trayImage = ImageIO.read(
                    getClass().getResource("/icons/logo.png")
            );

            if (trayImage == null) {
                throw new IOException("Ícone /icons/logo.png não pôde ser carregado.");
            }

            PopupMenu popupMenu = new PopupMenu();

            MenuItem abrirItem = new MenuItem("Abrir");
            abrirItem.addActionListener(event -> exibirJanelaPrincipal());
            popupMenu.add(abrirItem);

            popupMenu.addSeparator();

            MenuItem sairItem = new MenuItem("Sair");
            sairItem.addActionListener(event -> Platform.runLater(this::encerrarAplicacao));
            popupMenu.add(sairItem);

            trayIcon = new TrayIcon(trayImage, APP_TITLE, popupMenu);
            trayIcon.setImageAutoSize(true);
            trayIcon.addActionListener(event -> exibirJanelaPrincipal());

            SystemTray.getSystemTray().add(trayIcon);
            return true;
        } catch (Exception e) {
            System.err.println("[TRAY] Não foi possível criar o ícone da bandeja: " + e.getMessage());
            trayIcon = null;
            return false;
        }
    }

    private void configurarComportamentoDaJanela(Stage stage) {
        stage.setOnCloseRequest(event -> {
            if (!exitRequested) {
                event.consume();
                ocultarNaBandeja();
            }
        });

        stage.iconifiedProperty().addListener((observable, oldValue, iconified) -> {
            if (iconified && !exitRequested) {
                Platform.runLater(() -> {
                    stage.setIconified(false);
                    ocultarNaBandeja();
                });
            }
        });
    }

    private void ocultarNaBandeja() {
        if (primaryStage == null) {
            return;
        }

        primaryStage.hide();

        if (trayIcon != null && !trayNotificationDisplayed) {
            trayIcon.displayMessage(
                    APP_TITLE,
                    "O aplicativo continua funcionando em segundo plano.",
                    TrayIcon.MessageType.INFO
            );
            trayNotificationDisplayed = true;
        }
    }

    private void exibirJanelaPrincipal() {
        Platform.runLater(() -> {
            if (primaryStage == null) {
                return;
            }

            primaryStage.show();
            primaryStage.setIconified(false);
            primaryStage.toFront();
            primaryStage.requestFocus();
        });
    }

    private void encerrarAplicacao() {
        if (exitRequested) {
            return;
        }

        exitRequested = true;
        liberarRecursos();
        Platform.setImplicitExit(true);
        Platform.exit();
    }

    private synchronized void liberarRecursos() {
        if (resourcesReleased) {
            return;
        }

        resourcesReleased = true;

        if (cartaOperacaoController != null) {
            cartaOperacaoController.shutdown();
        }

        if (trayIcon != null && SystemTray.isSupported()) {
            SystemTray.getSystemTray().remove(trayIcon);
            trayIcon = null;
        }
    }

    @Override
    public void stop() {
        liberarRecursos();
    }
}
