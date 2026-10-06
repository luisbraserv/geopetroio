package com.example.demo.config;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.demo.models.AppSettings;
import com.example.demo.services.SettingsService;

/**
 * As URLs de produção vêm do build, não do que a estação digitou.
 *
 * <p>Usa {@code -Dgeopetro.ambiente=producao} em vez de {@code jpackage.app-version}: a segunda
 * também moveria a pasta de configurações para o home do usuário ({@link AppPaths}).
 */
class AmbienteTest {

    @TempDir Path pasta;
    private String userDir;

    @BeforeEach
    void isolar() {
        userDir = System.getProperty("user.dir");
        System.setProperty("user.dir", pasta.toString());
    }

    @AfterEach
    void restaurar() {
        System.setProperty("user.dir", userDir);
        System.clearProperty("geopetro.ambiente");
    }

    private static AppSettings digitadoNaEstacao() {
        var settings = new AppSettings();
        settings.setBackendUrl("http://localhost:8080");
        settings.setTelemetriaUrl("tcp://localhost:1883");
        settings.setBackendUsuario("operador");
        settings.setUnidadeId(5L);
        return settings;
    }

    @Test
    @DisplayName("em desenvolvimento valem os enderecos gravados, editaveis como sempre")
    void desenvolvimentoUsaOArquivo() {
        var service = new SettingsService();
        service.saveSettings(digitadoNaEstacao());

        assertFalse(Ambiente.producao());
        assertTrue(Ambiente.backendUrl().isEmpty());
        var lido = service.loadSettings();
        assertEquals("http://localhost:8080", lido.getBackendUrl());
        assertEquals("tcp://localhost:1883", lido.getTelemetriaUrl());
    }

    @Test
    @DisplayName("instalado, backend e broker sao os de producao, qualquer que seja o valor gravado")
    void producaoUsaOBuild() {
        var service = new SettingsService();
        service.saveSettings(digitadoNaEstacao());
        System.setProperty("geopetro.ambiente", "producao");

        var lido = service.loadSettings();
        assertEquals("http://2.25.227.207", lido.getBackendUrl());
        assertEquals("tcp://2.25.227.207:1883", lido.getTelemetriaUrl());
        assertEquals("operador", lido.getBackendUsuario(), "o resto da configuracao continua o da estacao");
        assertEquals(5L, lido.getUnidadeId());
    }

    @Test
    @DisplayName("estacao recem-instalada, sem arquivo, ja nasce apontando para producao")
    void instalacaoNovaNasceEmProducao() {
        System.setProperty("geopetro.ambiente", "producao");
        var lido = new SettingsService().loadSettings();
        assertEquals("http://2.25.227.207", lido.getBackendUrl());
        assertEquals("tcp://2.25.227.207:1883", lido.getTelemetriaUrl());
    }

    @Test
    @DisplayName("digitar outro servidor no app instalado nao muda o que vale")
    void gravarOutroServidorNaoValeEmProducao() {
        System.setProperty("geopetro.ambiente", "producao");
        var service = new SettingsService();
        service.updateBackendUrl("http://servidor-digitado:8080");
        service.updateTelemetriaUrl("tcp://servidor-digitado:1883");

        var lido = service.loadSettings();
        assertEquals("http://2.25.227.207", lido.getBackendUrl());
        assertEquals("tcp://2.25.227.207:1883", lido.getTelemetriaUrl());
    }
}
