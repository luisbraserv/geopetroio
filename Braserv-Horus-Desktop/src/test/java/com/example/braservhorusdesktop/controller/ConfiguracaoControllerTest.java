package com.example.braservhorusdesktop.controller;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class ConfiguracaoControllerTest {

    @Test
    void deveAceitarPontoOuVirgulaComoSeparadorDecimal() {
        assertEquals(0.0235, ConfiguracaoController.converterNumero("0.0235", "Constante"));
        assertEquals(0.0235, ConfiguracaoController.converterNumero("0,0235", "Constante"));
        assertEquals(1234.56, ConfiguracaoController.converterNumero("1.234,56", "Constante"));
        assertEquals(1234.56, ConfiguracaoController.converterNumero("1,234.56", "Constante"));
    }

    @Test
    void deveRejeitarCampoVazioOuTextoInvalido() {
        assertThrows(
                NumberFormatException.class,
                () -> ConfiguracaoController.converterNumero("", "Constante")
        );
        assertThrows(
                NumberFormatException.class,
                () -> ConfiguracaoController.converterNumero("abc", "Constante")
        );
    }
}
