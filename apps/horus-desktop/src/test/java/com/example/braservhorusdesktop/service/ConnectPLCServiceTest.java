package com.example.braservhorusdesktop.service;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.braservhorusdesktop.repository.JsonRegistroService;

class ConnectPLCServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void deveManterPersistenciaAtivaAoDesconectarEReconectar() {
        ConfiguracaoService configuracaoService =
                new ConfiguracaoService(tempDir.resolve("bomba_config.json"));
        RegistroOperacaoService registroService =
                new RegistroOperacaoService(new JsonRegistroService(tempDir.resolve("data")));
        ConnectPLCService service =
                new ConnectPLCService(configuracaoService, registroService);

        assertTrue(service.isPersistenciaAtiva());

        service.desconectar();
        assertTrue(service.isPersistenciaAtiva());

        service.desconectar();
        assertTrue(service.isPersistenciaAtiva());

        service.shutdown();
        assertFalse(service.isPersistenciaAtiva());
    }
}
