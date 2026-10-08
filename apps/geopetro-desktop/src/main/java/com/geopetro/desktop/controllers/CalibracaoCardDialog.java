package com.geopetro.desktop.controllers;

import java.io.IOException;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationContext;

import com.geopetro.desktop.models.CardsDaUnidade;
import com.geopetro.desktop.models.CardsDaUnidade.Card;
import com.geopetro.desktop.models.CardsDaUnidade.Tipo;

import javafx.fxml.FXMLLoader;
import javafx.scene.Parent;
import javafx.scene.Scene;
import javafx.stage.Modality;
import javafx.stage.Stage;
import javafx.stage.Window;

/** Abre a calibracao do card de peso ou torque identificado no documento. */
public final class CalibracaoCardDialog {

	private static final Logger logger = LoggerFactory.getLogger(CalibracaoCardDialog.class);

	private CalibracaoCardDialog() {
	}

	public static void abrir(Window dono, ApplicationContext contexto, CardsDaUnidade documento,
			Card card, double bruto) {
		if (card == null || (card.tipo() != Tipo.PESO && card.tipo() != Tipo.TORQUE)) {
			throw new IllegalArgumentException("A calibracao requer um card de peso ou torque.");
		}
		String caminho = card.tipo() == Tipo.PESO
				? "/views/peso-coluna-settings.fxml" : "/views/chave-settings.fxml";
		try {
			FXMLLoader loader = new FXMLLoader(CalibracaoCardDialog.class.getResource(caminho));
			loader.setControllerFactory(contexto::getBean);
			Parent conteudo = loader.load();
			if (card.tipo() == Tipo.PESO) {
				loader.<PesoColunaSettingsController>getController().configurar(documento, card, bruto);
			} else {
				loader.<ChaveSettingsController>getController().configurar(documento, card);
			}
			Stage janela = new Stage();
			janela.setTitle("Calibracao - " + card.nome());
			janela.setScene(new Scene(conteudo));
			janela.setMinWidth(500);
			janela.setMinHeight(card.tipo() == Tipo.PESO ? 640 : 650);
			janela.initModality(Modality.APPLICATION_MODAL);
			if (dono != null) {
				janela.initOwner(dono);
			}
			janela.showAndWait();
		} catch (IOException e) {
			logger.error("Erro ao abrir a calibracao do card {}", card.dispositivoId(), e);
		}
	}
}
