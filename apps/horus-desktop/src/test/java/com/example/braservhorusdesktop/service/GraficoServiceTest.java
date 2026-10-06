package com.example.braservhorusdesktop.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.time.LocalDateTime;

import org.junit.jupiter.api.Test;

class GraficoServiceTest {

    @Test
    void devePosicionarPontosConformeOHorarioReal() {
        LocalDateTime inicio = LocalDateTime.of(2026, 7, 29, 10, 0);
        LocalDateTime fim = inicio.plusMinutes(60);

        assertEquals(60, GraficoService.calcularPosicaoX(inicio, inicio, fim, 60, 300));
        assertEquals(135, GraficoService.calcularPosicaoX(inicio.plusMinutes(15), inicio, fim, 60, 300));
        assertEquals(210, GraficoService.calcularPosicaoX(inicio.plusMinutes(30), inicio, fim, 60, 300));
        assertEquals(360, GraficoService.calcularPosicaoX(fim, inicio, fim, 60, 300));
    }

    @Test
    void deveDimensionarAJanelaDeSuavizacaoSemRemoverASerieOriginal() {
        assertEquals(1, GraficoService.calcularTamanhoJanelaSuavizacao(2));
        assertEquals(5, GraficoService.calcularTamanhoJanelaSuavizacao(100));
        assertEquals(15, GraficoService.calcularTamanhoJanelaSuavizacao(300));
        assertEquals(101, GraficoService.calcularTamanhoJanelaSuavizacao(5000));
    }
}
