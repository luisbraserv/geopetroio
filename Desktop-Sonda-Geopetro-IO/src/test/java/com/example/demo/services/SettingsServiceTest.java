package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.example.demo.models.ChaveHidraulicaConfig;
import com.example.demo.models.TipoMovimento;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SettingsServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void persistsAndLoadsHydraulicConfigurationForBothTongs() throws Exception {
        String originalUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempDir.toString());
            SettingsService service = new SettingsService();
            AppSettings settings = new AppSettings();
            settings.setChaveTubos(config(2.0, 1.0, 2.0, TipoMovimento.AVANCO));
            settings.setChaveFlutuante(config(3.0, 1.25, 2.5, TipoMovimento.RECUO));

            service.saveSettings(settings);

            AppSettings loaded = service.loadSettings();
            assertHydraulicConfig(loaded.getChaveTubos(), 2.0, 1.0, 2.0, TipoMovimento.AVANCO);
            assertHydraulicConfig(loaded.getChaveFlutuante(), 3.0, 1.25, 2.5, TipoMovimento.RECUO);

            String json = Files.readString(tempDir.resolve("config/app-settings.json"));
            assertTrue(json.contains("\"diametroPistaoIn\""));
            assertTrue(json.contains("\"diametroHasteIn\""));
            assertTrue(json.contains("\"tipoMovimento\" : \"RECUO\""));
        } finally {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    @Test
    void persistsAndLoadsMqttCredentials() throws Exception {
        // O JSON e lido/escrito por regex, nao por uma biblioteca — um campo novo pode
        // silenciosamente nao voltar. Este teste cobre o round-trip completo.
        String originalUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempDir.toString());
            SettingsService service = new SettingsService();
            AppSettings settings = new AppSettings();
            settings.setTelemetriaUrl("tcp://10.0.0.20:1883");
            settings.setTelemetriaUsuario("telemetria");
            // Senha com caracteres que exigem escape no JSON: o gerador de senhas
            // (openssl rand -base64) produz '/' e '+', e aspas quebrariam o parser.
            settings.setTelemetriaSenha("s3nh@/com+esc\"ape\\barra");

            service.saveSettings(settings);

            AppSettings loaded = service.loadSettings();
            assertEquals("tcp://10.0.0.20:1883", loaded.getTelemetriaUrl());
            assertEquals("telemetria", loaded.getTelemetriaUsuario());
            assertEquals("s3nh@/com+esc\"ape\\barra", loaded.getTelemetriaSenha());
            assertTrue(loaded.temCredenciaisTelemetria());
        } finally {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    @Test
    void treatsBlankUserAsNoCredentials() throws Exception {
        // Broker sem autenticacao continua funcionando: a ausencia de usuario e o sinal
        // para conectar anonimamente, nao um erro de configuracao.
        String originalUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempDir.toString());
            SettingsService service = new SettingsService();
            AppSettings settings = new AppSettings();
            service.saveSettings(settings);

            AppSettings loaded = service.loadSettings();
            assertEquals("", loaded.getTelemetriaUsuario());
            assertTrue(!loaded.temCredenciaisTelemetria());
        } finally {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    private ChaveHidraulicaConfig config(double piston, double rod, double arm, TipoMovimento movement) {
        ChaveHidraulicaConfig config = new ChaveHidraulicaConfig();
        config.setDiametroPistaoIn(piston);
        config.setDiametroHasteIn(rod);
        config.setBracoAlavancaFt(arm);
        config.setTipoMovimento(movement);
        return config;
    }

    private void assertHydraulicConfig(ChaveHidraulicaConfig config, double piston, double rod,
                                       double arm, TipoMovimento movement) {
        assertEquals(piston, config.getDiametroPistaoIn());
        assertEquals(rod, config.getDiametroHasteIn());
        assertEquals(arm, config.getBracoAlavancaFt());
        assertEquals(movement, config.getTipoMovimento());
        assertTrue(config.isConfigurado());
    }
}
