package com.example.demo.services;

import com.example.demo.models.AppSettings;
import com.example.demo.models.ChaveHidraulicaConfig;
import com.example.demo.models.TipoMovimento;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
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

    /**
     * ⚠️ <b>Arquivo antigo, sem as chaves novas, sobe com a telemetria LIGADA.</b>
     *
     * <p>É a regra de migração de {@code configuracao-da-estacao.md §6}. Toda estação em campo tem
     * um {@code app-settings.json} gravado antes dos interruptores existirem. Se a ausência da chave
     * valesse "desligado", a frota inteira emudeceria na primeira atualização — sem histórico, sem
     * tela remota e sem alarme de servidor, por uma escolha que ninguém fez.
     *
     * <p>O JSON aqui é escrito à mão de propósito: gravar com o próprio serviço já incluiria as
     * chaves, e o teste não provaria nada sobre o arquivo que existe lá fora.
     */
    @Test
    void arquivoAnteriorAosInterruptoresSobeLigado() throws Exception {
        String originalUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempDir.toString());
            Path config = tempDir.resolve("config");
            Files.createDirectories(config);
            Files.writeString(config.resolve("app-settings.json"), """
                    {
                      "idUnidade" : "SONDA-01",
                      "telemetriaUrl" : "tcp://10.0.0.20:1883",
                      "backendUrl" : "http://10.0.0.10:8080",
                      "unidadeId" : 144
                    }
                    """);

            AppSettings carregado = new SettingsService().loadSettings();

            assertTrue(carregado.isTelemetriaMqttAtiva(), "a frota emudeceria ao atualizar");
            assertTrue(carregado.isTempoRealAtivo(), "a frota sumiria da tela remota ao atualizar");
        } finally {
            System.setProperty("user.dir", originalUserDir);
        }
    }

    /** Só um {@code false} explícito desliga — e ele precisa sobreviver ao round-trip por regex. */
    @Test
    void desligarSobreviveAoArquivo() throws Exception {
        String originalUserDir = System.getProperty("user.dir");
        try {
            System.setProperty("user.dir", tempDir.toString());
            SettingsService service = new SettingsService();

            service.updateTelemetria(false, true);

            AppSettings carregado = service.loadSettings();
            assertFalse(carregado.isTelemetriaMqttAtiva());
            assertTrue(carregado.isTempoRealAtivo(), "desligar o MQTT nao pode derrubar o tempo real");

            service.updateTelemetria(false, false);
            assertFalse(service.loadSettings().isTempoRealAtivo());

            String json = Files.readString(tempDir.resolve("config/app-settings.json"));
            assertTrue(json.contains("\"telemetriaMqttAtiva\" : false"), json);
            assertTrue(json.contains("\"tempoRealAtivo\" : false"), json);
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
