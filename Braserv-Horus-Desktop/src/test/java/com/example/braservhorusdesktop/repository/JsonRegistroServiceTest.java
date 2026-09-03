package com.example.braservhorusdesktop.repository;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDateTime;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.braservhorusdesktop.model.RegistroOperacao;

class JsonRegistroServiceTest {

    @TempDir
    Path tempDir;

    @Test
    void deveSalvarCadaAmostraIncrementalmenteComTodosOsValores() throws Exception {
        JsonRegistroService service = new JsonRegistroService(tempDir);

        for (int i = 0; i < 100; i++) {
            service.salvar(new RegistroOperacao(
                    LocalDateTime.of(2026, 7, 29, 12, 0).plusSeconds(i),
                    1500.5 + i,
                    30L + i,
                    1000L + i,
                    2.5 + i,
                    25.0 + i
            ));
        }

        Path arquivoIncremental = tempDir.resolve("registros_operacao.jsonl");
        assertTrue(Files.isRegularFile(arquivoIncremental));
        assertFalse(Files.exists(tempDir.resolve("registros_operacao.json")));
        try (Stream<String> linhas = Files.lines(arquivoIncremental)) {
            assertEquals(100L, linhas.count());
        }

        var registros = service.obterRegistros();
        assertEquals(100, registros.size());
        assertEquals(1599.5, registros.get(99).pressao);
        assertEquals(129L, registros.get(99).strokeAtual);
        assertEquals(1099L, registros.get(99).strokeCumulativo);
        assertEquals(101.5, registros.get(99).vazaoAtual);
        assertEquals(124.0, registros.get(99).volumeBombeado);
    }
}
