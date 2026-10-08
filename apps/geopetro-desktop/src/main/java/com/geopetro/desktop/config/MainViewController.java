package com.geopetro.desktop.config;

import com.geopetro.desktop.controllers.MainViewFxmlController;
import com.geopetro.desktop.services.PlcConnectionService;
import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.image.Image;
import javafx.stage.Screen;
import javafx.stage.Stage;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.context.ApplicationContext;
import org.springframework.stereotype.Component;

import java.awt.AWTException;
import java.awt.HeadlessException;
import java.awt.MenuItem;
import java.awt.PopupMenu;
import java.awt.SystemTray;
import java.awt.TrayIcon;
import java.io.IOException;
import java.io.InputStream;
import java.util.concurrent.atomic.AtomicBoolean;
import javax.imageio.ImageIO;

@Component
public class MainViewController {

    private static final Logger logger = LoggerFactory.getLogger(MainViewController.class);
    private static final String APP_ICON_PATH = "/icon/logo.png";

    private Stage stage;
    private TrayIcon trayIcon;
    private final AtomicBoolean exitingApplication = new AtomicBoolean(false);

    @Autowired
    private ApplicationContext applicationContext;

    @Autowired
    private PlcConnectionService plcConnectionService;

    public void setStage(Stage stage) {
        this.stage = stage;
    }

    public void show() {
        try {
            FXMLLoader loader = new FXMLLoader();
            java.net.URL fxmlLocation = MainViewController.class.getResource("/views/main-view.fxml");

            if (fxmlLocation == null) {
                logger.error("FXML nao encontrado em: /views/main-view.fxml");
                fxmlLocation = Thread.currentThread().getContextClassLoader().getResource("views/main-view.fxml");
                if (fxmlLocation == null) {
                    logger.error("FXML ainda nao encontrado!");
                    return;
                }
            }

            loader.setLocation(fxmlLocation);
            loader.setControllerFactory(applicationContext::getBean);
            logger.info("Carregando FXML de: " + fxmlLocation);
            Parent root = loader.load();

            Object controller = loader.getController();
            if (controller instanceof MainViewFxmlController mainViewFxmlController) {
                mainViewFxmlController.setStage(stage);
            }

            // O tamanho sai da area util do monitor, e nao de 1200x800 fixo: numa tela menor que
            // isso o show() centralizaria com y negativo e a barra de menu abriria acima da borda
            // da tela. Ver GeometriaDaJanela.
            GeometriaDaJanela geometria = GeometriaDaJanela.paraTela(Screen.getPrimary().getVisualBounds());

            Scene scene = new Scene(root, geometria.largura(), geometria.altura());

            stage.setTitle("Geopetro Desktop");
            stage.setScene(scene);
            stage.setWidth(geometria.largura());
            stage.setHeight(geometria.altura());
            stage.setMinWidth(geometria.larguraMinima());
            stage.setMinHeight(geometria.alturaMinima());
            // Posicao explicita: o centerOnScreen() implicito do show() e exatamente o que colocava
            // o topo fora da tela.
            stage.setX(geometria.x());
            stage.setY(geometria.y());
            configureBackgroundTray();

            try (InputStream iconStream = getClass().getResourceAsStream(APP_ICON_PATH)) {
                Image icon = new Image(iconStream);
                stage.getIcons().add(icon);
            } catch (Exception e) {
                logger.debug("Icone nao encontrado, usando padrao");
            }

            stage.show();

            // A partir daqui, outra tentativa de abrir o app traz esta janela para a frente
            // em vez de subir um segundo processo.
            InstanciaUnica.aoPedirAbertura(() -> Platform.runLater(this::showMainWindow));

            logger.info("Aplicacao iniciada com sucesso (FXML)");
        } catch (Exception e) {
            logger.error("Erro ao exibir tela principal", e);
            e.printStackTrace();
        }
    }

    private void configureBackgroundTray() {
        Platform.setImplicitExit(false);

        try {
            if (!SystemTray.isSupported()) {
                logger.warn("System tray nao suportado neste ambiente. Fechamento padrao sera mantido.");
                return;
            }

            setupTrayIcon();
        } catch (HeadlessException e) {
            logger.error("System tray indisponivel porque a aplicacao esta em modo headless", e);
            return;
        }
        if (trayIcon == null) {
            return;
        }

        stage.setOnCloseRequest(event -> {
            if (exitingApplication.get()) {
                return;
            }

            event.consume();
            stage.hide();
            trayIcon.displayMessage(
                    "Geopetro Desktop",
                    "Aplicacao em segundo plano lendo o PLC e salvando no H2.",
                    TrayIcon.MessageType.INFO
            );
        });
    }

    private void setupTrayIcon() {
        if (trayIcon != null) {
            return;
        }

        PopupMenu popupMenu = new PopupMenu();

        MenuItem openItem = new MenuItem("Abrir");
        openItem.addActionListener(event -> Platform.runLater(this::showMainWindow));

        MenuItem exitItem = new MenuItem("Fechar aplica\u00e7\u00e3o");
        exitItem.addActionListener(event -> exitApplication());

        popupMenu.add(openItem);
        popupMenu.addSeparator();
        popupMenu.add(exitItem);

        trayIcon = new TrayIcon(loadTrayImage(), "Geopetro Desktop", popupMenu);
        trayIcon.setImageAutoSize(true);
        trayIcon.addActionListener(event -> Platform.runLater(this::showMainWindow));

        try {
            SystemTray.getSystemTray().add(trayIcon);
            logger.info("Icone da aplicacao adicionado na bandeja do Windows");
        } catch (AWTException e) {
            trayIcon = null;
            logger.error("Erro ao adicionar icone na bandeja do Windows", e);
        }
    }

    /**
     * Traz a janela de volta, venha o pedido da bandeja ou de outra tentativa de abrir o app.
     *
     * <p>Os tres passos cobrem estados diferentes: escondida na bandeja precisa de {@code show},
     * minimizada precisa de {@code setIconified(false)} — {@code show} sozinho nao desminimiza —,
     * e atras de outra janela precisa de {@code toFront} com o foco.
     */
    private void showMainWindow() {
        if (stage == null) {
            return;
        }

        stage.show();
        stage.setIconified(false);
        stage.toFront();
        stage.requestFocus();
    }

    private void exitApplication() {
        if (!exitingApplication.compareAndSet(false, true)) {
            return;
        }

        plcConnectionService.disconnect();

        if (trayIcon != null) {
            SystemTray.getSystemTray().remove(trayIcon);
            trayIcon = null;
        }

        Platform.runLater(() -> {
            Platform.setImplicitExit(true);
            if (stage != null) {
                stage.close();
            }
            Platform.exit();
        });
    }

    private java.awt.Image loadTrayImage() {
        try (InputStream iconStream = getClass().getResourceAsStream(APP_ICON_PATH)) {
            if (iconStream == null) {
                logger.warn("Icone da bandeja nao encontrado em {}", APP_ICON_PATH);
                return createFallbackTrayImage();
            }

            java.awt.image.BufferedImage originalImage = ImageIO.read(iconStream);
            if (originalImage == null) {
                return createFallbackTrayImage();
            }

            return scaleTrayImage(originalImage);
        } catch (IOException e) {
            logger.warn("Icone da bandeja nao encontrado em {}", APP_ICON_PATH);
            return createFallbackTrayImage();
        }
    }

    private java.awt.Image scaleTrayImage(java.awt.Image originalImage) {
        int size = 16;
        java.awt.image.BufferedImage scaledImage = new java.awt.image.BufferedImage(size, size, java.awt.image.BufferedImage.TYPE_INT_ARGB);
        java.awt.Graphics2D graphics = scaledImage.createGraphics();
        graphics.setRenderingHint(java.awt.RenderingHints.KEY_INTERPOLATION, java.awt.RenderingHints.VALUE_INTERPOLATION_BILINEAR);
        graphics.setRenderingHint(java.awt.RenderingHints.KEY_RENDERING, java.awt.RenderingHints.VALUE_RENDER_QUALITY);
        graphics.setRenderingHint(java.awt.RenderingHints.KEY_ANTIALIASING, java.awt.RenderingHints.VALUE_ANTIALIAS_ON);
        graphics.drawImage(originalImage, 0, 0, size, size, null);
        graphics.dispose();
        return scaledImage;
    }

    private java.awt.Image createFallbackTrayImage() {
        int size = 16;
        java.awt.image.BufferedImage image = new java.awt.image.BufferedImage(size, size, java.awt.image.BufferedImage.TYPE_INT_ARGB);
        java.awt.Graphics2D graphics = image.createGraphics();
        graphics.setColor(new java.awt.Color(30, 58, 138));
        graphics.fillOval(1, 1, 14, 14);
        graphics.setColor(java.awt.Color.WHITE);
        graphics.drawLine(5, 8, 8, 4);
        graphics.drawLine(8, 4, 11, 8);
        graphics.drawLine(11, 8, 8, 12);
        graphics.drawLine(8, 12, 5, 8);
        graphics.dispose();
        return image;
    }
}



