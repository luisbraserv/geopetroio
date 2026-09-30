package com.example.demo.controllers;

import javafx.animation.FadeTransition;
import javafx.fxml.FXML;
import javafx.scene.image.ImageView;
import javafx.util.Duration;

public class SplashController {

    @FXML
    private ImageView logoImage;

    @FXML
    public void initialize() {
        logoImage.setOpacity(1.0);
        FadeTransition fade = new FadeTransition(Duration.seconds(1.2), logoImage);
        fade.setFromValue(1.0);
        fade.setToValue(0.3);
        fade.setAutoReverse(true);
        fade.setCycleCount(FadeTransition.INDEFINITE);
        fade.play();
    }
}
