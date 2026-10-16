package com.geopetro.desktop.conversao;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/** Nucleo da conversao do sinal analogico Ax entregue pelo LOGO!. */
class ConversaoSinalAnalogicoTest {

    @Test
    @DisplayName("Ax -50 e 750 representam os extremos de 4 e 20 mA")
    void extremos() {
        assertEquals(0.0, ConversaoSinalAnalogico.axParaFracao(-50), 1e-9);
        assertEquals(1.0, ConversaoSinalAnalogico.axParaFracao(750), 1e-9);
    }

    @Test
    @DisplayName("Ax 350 representa 12 mA e metade da faixa")
    void meioDaFaixa() {
        assertEquals(0.5, ConversaoSinalAnalogico.axParaFracao(350), 1e-9);
    }

    @Test
    @DisplayName("o core aplica o Ax a qualquer escala linear de engenharia")
    void valorLinear() {
        assertEquals(65.0, ConversaoSinalAnalogico.axParaValorLinear(350, -20, 150), 1e-9);
        assertEquals(200.0, ConversaoSinalAnalogico.axParaValorLinear(350, 0, 400), 1e-9);
    }

    @Test
    @DisplayName("Word negativa do CLP e reinterpretada com sinal")
    void wordComSinal() {
        assertEquals(-50, ConversaoSinalAnalogico.axComoSigned(65486));
        assertEquals(-1, ConversaoSinalAnalogico.axComoSigned(65535));
        assertEquals(0, ConversaoSinalAnalogico.axComoSigned(0));
        assertEquals(750, ConversaoSinalAnalogico.axComoSigned(750));
    }

    @Test
    @DisplayName("o core identifica Ax fora da faixa eletrica")
    void foraDaFaixa() {
        assertFalse(ConversaoSinalAnalogico.foraDaFaixa(-50));
        assertFalse(ConversaoSinalAnalogico.foraDaFaixa(350));
        assertFalse(ConversaoSinalAnalogico.foraDaFaixa(750));
        assertTrue(ConversaoSinalAnalogico.foraDaFaixa(-51));
        assertTrue(ConversaoSinalAnalogico.foraDaFaixa(751));
    }

    @Test
    @DisplayName("o core preserva a fracao fora da faixa para diagnostico")
    void fracaoNaoLimitada() {
        assertTrue(ConversaoSinalAnalogico.axParaFracao(-500) < 0);
        assertTrue(ConversaoSinalAnalogico.axParaFracao(1000) > 1);
    }
}
