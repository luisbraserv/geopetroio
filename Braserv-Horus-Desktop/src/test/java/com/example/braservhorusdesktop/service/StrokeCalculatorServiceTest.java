package com.example.braservhorusdesktop.service;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class StrokeCalculatorServiceTest {

    @Test
    void calculaMediaMovelDosUltimosSessentaSegundos() {
        StrokeCalculatorService service = new StrokeCalculatorService();

        assertEquals(0L, service.calcularStrokeAtual(100L, 0L));
        assertEquals(120L, service.calcularStrokeAtual(160L, 30000L));
        assertEquals(90L, service.calcularStrokeAtual(190L, 60000L));
        assertEquals(30L, service.calcularStrokeAtual(190L, 90000L));
    }

    @Test
    void reiniciaHistoricoQuandoContadorCumulativoVolta() {
        StrokeCalculatorService service = new StrokeCalculatorService();

        assertEquals(0L, service.calcularStrokeAtual(100L, 0L));
        assertEquals(60L, service.calcularStrokeAtual(110L, 10000L));
        assertEquals(0L, service.calcularStrokeAtual(5L, 20000L));
        assertEquals(60L, service.calcularStrokeAtual(15L, 30000L));
    }
}
