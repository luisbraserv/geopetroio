package com.geopetro.desktop.controllers;

import static org.junit.jupiter.api.Assertions.assertTrue;

import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import javafx.fxml.FXML;

/**
 * Todo campo {@code @FXML} do controller tem um {@code fx:id} correspondente no FXML.
 *
 * <h2>Por que isto merece teste</h2>
 * A ligação entre os dois arquivos só é conferida <b>ao abrir a janela</b>. Um campo renomeado num
 * lado e não no outro compila, passa em toda a suíte, e estoura com {@code NullPointerException} na
 * cara de quem abriu a tela — numa sonda, possivelmente sem ninguém por perto que saiba o que fazer.
 *
 * <p>Aqui isso vira falha de build, sem precisar de toolkit JavaFX: é leitura de texto e reflexão.
 *
 * <p>⚠️ <b>A recíproca não vale.</b> Um {@code fx:id} sem campo no controller é legítimo — serve de
 * âncora de layout ou de CSS, e o FXMLLoader simplesmente não injeta nada. Só a falta do lado do
 * FXML quebra.
 */
class FxmlLigadoAoControllerTest {

	private static final Pattern FX_ID = Pattern.compile("fx:id=\"([a-zA-Z0-9_]+)\"");

	@ParameterizedTest(name = "{1} <- {0}")
	@DisplayName("campo @FXML sem fx:id vira NullPointerException ao abrir a janela")
	@CsvSource({
			"/views/cards-config.fxml, com.geopetro.desktop.controllers.CardsConfigController",
			"/views/monitoring.fxml, com.geopetro.desktop.controllers.MonitoringController",
	})
	void todoCampoAnotadoTemIdNoFxml(String fxml, String controller) throws Exception {
		Set<String> ids = idsDe(fxml);
		assertTrue(ids.size() > 1, "FXML nao lido ou sem fx:id nenhum: " + fxml);

		for (Field campo : Class.forName(controller).getDeclaredFields()) {
			if (campo.isAnnotationPresent(FXML.class)) {
				assertTrue(ids.contains(campo.getName()),
						() -> "O campo @FXML '" + campo.getName() + "' de " + controller
								+ " nao tem fx:id em " + fxml + ". A janela abriria com ele nulo.");
			}
		}
	}

	private static Set<String> idsDe(String recurso) throws IOException {
		try (InputStream entrada = FxmlLigadoAoControllerTest.class.getResourceAsStream(recurso)) {
			assertTrue(entrada != null, "Recurso nao encontrado: " + recurso);
			String conteudo = new String(entrada.readAllBytes(), StandardCharsets.UTF_8);
			Matcher matcher = FX_ID.matcher(conteudo);
			Set<String> ids = new LinkedHashSet<>();
			while (matcher.find()) {
				ids.add(matcher.group(1));
			}
			return ids;
		}
	}
}
