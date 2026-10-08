package com.geopetro.desktop.config;

import java.nio.file.Path;

/**
 * Centraliza os diretorios base usados pela aplicacao.
 *
 * Em desenvolvimento ({@code jpackage.app-version} ausente), usa {@code user.dir}
 * (pasta do projeto). Quando instalado via jpackage (Program Files, read-only),
 * usa {@code user.home}/.geopetro-io para garantir permissao de escrita.
 */
public final class AppPaths {

    private AppPaths() {}

    public static Path baseDir() {
        if (System.getProperty("jpackage.app-version") != null) {
            return Path.of(System.getProperty("user.home"), ".geopetro-io");
        }
        return Path.of(System.getProperty("user.dir"));
    }

    public static Path dataDir() {
        return baseDir().resolve("data");
    }

    public static Path configDir() {
        return baseDir().resolve("config");
    }

    public static Path archiveDir() {
        return dataDir().resolve("generated-operation-charts");
    }
}
