package com.example.demo.controllers;

import static org.junit.jupiter.api.Assertions.*;
import org.junit.jupiter.api.Test;

class TsapPlcTest {
    @Test void formatoDoLogoNaoViraNumeroDecimal() {
        assertEquals(768, TsapPlc.ler("03.00"));
        assertEquals(768, TsapPlc.ler("0300"));
        assertEquals(512, TsapPlc.ler("0x0200"));
        assertEquals("03.00", TsapPlc.formatar(768, 0));
        assertEquals(65535, TsapPlc.ler("ff.ff"));
        for (String invalido : new String[]{"", "300", "-001", "03..00", "10000", "03.G0"}) {
            assertThrows(IllegalArgumentException.class, () -> TsapPlc.ler(invalido));
        }
    }
}
