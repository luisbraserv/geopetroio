package com.geopetro.desktop.app;

import com.geopetro.desktop.comum.AppPaths;
import com.geopetro.desktop.aquisicao.PlcConnectionService;
import javafx.application.Application;
import javafx.application.Platform;
import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.scene.control.Alert;
import javafx.stage.Stage;
import javafx.stage.StageStyle;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;

import java.io.IOException;
import java.nio.channels.OverlappingFileLockException;
import java.nio.channels.FileChannel;
import java.nio.channels.FileLock;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.util.concurrent.CountDownLatch;

public class JavaFXConfiguration extends Application {

    private ConfigurableApplicationContext springContext;
    private FileChannel lockChannel;
    private FileLock appLock;
    private boolean anotherInstanceRunning;
    private boolean databaseInUse;

    // Splash gerenciado aqui para fechar antes de mostrar a tela principal
    private Stage splashStage;
    private final CountDownLatch splashReady = new CountDownLatch(1);

    public static void main(String[] args) {
        System.setProperty("java.awt.headless", "false");
        Application.launch(args);
    }

    @Override
    public void init() throws Exception {
        // Abre o splash na UI thread enquanto o Spring sobe nesta thread
        Platform.runLater(this::showSplash);
        // Aguarda o splash estar visível antes de continuar (evita race)
        splashReady.await();

        if (!acquireApplicationLock()) {
            anotherInstanceRunning = true;
            return;
        }

        if (!isDatabaseFileAvailable()) {
            databaseInUse = true;
            return;
        }

        springContext = new SpringApplicationBuilder()
                .sources(com.geopetro.desktop.GeopetroDesktopApplication.class)
                .headless(false)
                .run();
    }

    private void showSplash() {
        try {
            FXMLLoader loader = new FXMLLoader(getClass().getResource("/views/app/splash.fxml"));
            Parent root = loader.load();

            splashStage = new Stage(StageStyle.UNDECORATED);
            splashStage.setScene(new Scene(root));
            splashStage.setAlwaysOnTop(true);
            splashStage.show();
        } catch (Exception e) {
            // Splash é opcional — não interrompe a inicialização
            e.printStackTrace();
        } finally {
            splashReady.countDown();
        }
    }

    @Override
    public void start(Stage primaryStage) throws Exception {
        // Fecha o splash antes de qualquer coisa
        if (splashStage != null) {
            splashStage.close();
            splashStage = null;
        }

        if (anotherInstanceRunning) {
            showStartupWarning("Geopetro Desktop ja esta em execucao.");
            Platform.exit();
            return;
        }

        if (databaseInUse) {
            showStartupWarning("O banco de dados esta em uso por outra instancia. Feche o aplicativo antigo pelo Gerenciador de Tarefas e tente novamente.");
            Platform.exit();
            return;
        }

        MainViewController mainController = springContext.getBean(MainViewController.class);
        mainController.setStage(primaryStage);
        mainController.show();
    }

    @Override
    public void stop() throws Exception {
        if (springContext != null) {
            try {
                springContext.getBean(PlcConnectionService.class).disconnect();
            } catch (Exception ignored) {
            }
            springContext.close();
        }
        releaseApplicationLock();
    }

    private boolean acquireApplicationLock() throws IOException {
        Path dataDirectory = AppPaths.dataDir();
        Files.createDirectories(dataDirectory);

        Path lockPath = dataDirectory.resolve("sonda-geopetro.lock");
        lockChannel = FileChannel.open(lockPath, StandardOpenOption.CREATE, StandardOpenOption.WRITE);
        try {
            appLock = lockChannel.tryLock();
            return appLock != null;
        } catch (OverlappingFileLockException e) {
            return false;
        }
    }

    private void releaseApplicationLock() throws IOException {
        if (appLock != null && appLock.isValid()) appLock.release();
        if (lockChannel != null && lockChannel.isOpen()) lockChannel.close();
    }

    private boolean isDatabaseFileAvailable() {
        Path databasePath = AppPaths.dataDir().resolve("sonda_geopetro.mv.db");
        if (Files.notExists(databasePath)) return true;

        try (FileChannel databaseChannel = FileChannel.open(databasePath, StandardOpenOption.WRITE);
             FileLock databaseLock = databaseChannel.tryLock()) {
            return databaseLock != null;
        } catch (IOException | OverlappingFileLockException e) {
            return false;
        }
    }

    private void showStartupWarning(String message) {
        Alert alert = new Alert(Alert.AlertType.WARNING);
        alert.setTitle("Geopetro Desktop");
        alert.setHeaderText("Aplicacao ja esta aberta");
        alert.setContentText(message);
        alert.showAndWait();
    }
}
