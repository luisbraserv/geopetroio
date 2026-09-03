package com.example.braservhorusdesktop.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

class ConfiguracaoServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void deveAplicarEManterAsNovasConfiguracoesSemReiniciar() {
        Path arquivoConfig = tempDir.resolve("config").resolve("bomba_config.json");
        ConfiguracaoService service = new ConfiguracaoService(arquivoConfig);

        service.atualizarConfiguracao("192.168.0.50", 0.031, 500.0, 1.2);

        assertEquals("192.168.0.50", service.getIpPlc());
        assertEquals(0.031, service.getConstante());
        assertEquals(500.0, service.getRangePressaoBar());
        assertEquals(1.2, service.getSensibilidadePressao());

        ConfiguracaoService serviceRecarregado = new ConfiguracaoService(arquivoConfig);
        assertEquals("192.168.0.50", serviceRecarregado.getIpPlc());
        assertEquals(0.031, serviceRecarregado.getConstante());
        assertEquals(500.0, serviceRecarregado.getRangePressaoBar());
        assertEquals(1.2, serviceRecarregado.getSensibilidadePressao());
    }
}
