package com.example.braservhorusdesktop;

import javafx.scene.text.Font;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.IOException;
import java.io.InputStream;

/**
 * Registra no JavaFX as fontes do Braserv Design System 1.1 (Montserrat e Exo 2), embutidas em
 * {@code fonts/}. A estacao nao as tem instaladas.
 *
 * <p>Mesma classe do Geopetro-Desktop, que guarda as fontes em {@code views/fonts}. Nao usa
 * {@code @font-face} no CSS: o JavaFX nao carrega a fonte quando a URL do recurso tem espaco
 * codificado ({@code %20}) — e tem, tanto no OneDrive de desenvolvimento quanto em
 * {@code C:\Program Files\} na instalacao. Ler o recurso como stream nao depende do caminho.
 *
 * <p>Precisa rodar antes da primeira tela. Depois disso o CSS so referencia as familias pelo nome.
 */
public final class FontesDaMarca {

    private static final Logger logger = LoggerFactory.getLogger(FontesDaMarca.class);

    static final String[] ARQUIVOS = {
            "Montserrat-Regular.ttf",
            "Montserrat-Bold.ttf",
            "Exo2-Bold.ttf",
    };

    private FontesDaMarca() {
    }

    /**
     * Carrega as fontes. Falha em uma delas nao interrompe a inicializacao: o CSS cai em Arial,
     * que e a alternativa prevista pelo manual da marca.
     *
     * @return quantas fontes foram registradas
     */
    public static int carregar() {
        int carregadas = 0;
        for (String arquivo : ARQUIVOS) {
            try (InputStream in = FontesDaMarca.class.getResourceAsStream("/fonts/" + arquivo)) {
                if (in == null) {
                    logger.warn("Fonte {} ausente do pacote; a interface usara Arial.", arquivo);
                    continue;
                }
                if (Font.loadFont(in, 13) != null) {
                    carregadas++;
                } else {
                    logger.warn("JavaFX recusou a fonte {}; a interface usara Arial.", arquivo);
                }
            } catch (IOException e) {
                logger.warn("Falha ao ler a fonte {}: {}", arquivo, e.getMessage());
            }
        }
        return carregadas;
    }
}
