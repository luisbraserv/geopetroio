package com.geopetro.desktop.conversao;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;


import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Conversao do Ax do LOGO! em pressao.
 *
 * <p>O Ax e o laco 4-20 mA reescalonado pelo Analog Amplifier para -250..750 — nao e pressao. Quanto
 * cada posicao vale em bar depende da faixa do transmissor. Tratar o Ax como pressao, ou reconverter
 * para mA antes, aplica o escalonamento duas vezes e produz numeros plausiveis e errados.
 */
class ConversaoPressaoTest {

    /** Transmissor de 400 bar — o padrao de fabrica de {@link SensorPressaoConfig}. */
    private static final SensorPressaoConfig SENSOR_400_BAR = new SensorPressaoConfig(400.0, 1.0);

    @Test
    @DisplayName("Ax -250 é 4 mA: início da faixa, pressão zero")
    void inicioDaFaixa() {
        assertEquals(0.0, ConversaoPressao.axParaBar(-250, 400.0), 1e-9);
        assertEquals(0.0, ConversaoPressao.axParaPsi(-250, SENSOR_400_BAR), 0.001);
    }

    @Test
    @DisplayName("Ax 250 é 12 mA: metade da faixa")
    void meioDaFaixa() {
        assertEquals(200.0, ConversaoPressao.axParaBar(250, 400.0), 1e-9);
        // 200 bar × 14,5037738
        assertEquals(2900.75, ConversaoPressao.axParaPsi(250, SENSOR_400_BAR), 0.1);
    }

    @Test
    @DisplayName("Ax 750 é 20 mA: fundo de escala do transmissor")
    void fundoDeEscala() {
        assertEquals(400.0, ConversaoPressao.axParaBar(750, 400.0), 1e-9);
        assertEquals(5801.51, ConversaoPressao.axParaPsi(750, SENSOR_400_BAR), 0.1);
    }

    @Test
    @DisplayName("a faixa do transmissor define quanto cada Ax vale")
    void faixaDoSensorMudaOResultado() {
        // Mesmo Ax, transmissores diferentes: é por isso que o Ax não pode ser lido como pressão.
        double meiaEscala = 250;

        assertEquals(200.0, ConversaoPressao.axParaBar(meiaEscala, 400.0), 1e-9);
        assertEquals(375.0, ConversaoPressao.axParaBar(meiaEscala, 750.0), 1e-9);
        assertEquals(50.0, ConversaoPressao.axParaBar(meiaEscala, 100.0), 1e-9);
    }

    @Test
    @DisplayName("bar para PSI usa o fator único")
    void barParaPsi() {
        assertEquals(0.0, ConversaoPressao.barToPsi(0), 1e-9);
        assertEquals(1450.38, ConversaoPressao.barToPsi(100), 0.01);
        assertEquals(5076.32, ConversaoPressao.barToPsi(350), 0.01);
        assertEquals(10877.83, ConversaoPressao.barToPsi(750), 0.01);
    }

    @Test
    @DisplayName("pressão abaixo de zero é limitada, sem esconder o Ax fora da faixa")
    void limiteInferiorFisico() {
        assertTrue(ConversaoSinalAnalogico.axParaFracao(-500) < 0,
                "a fração preserva a leitura para diagnóstico");
        assertEquals(0.0, ConversaoPressao.axParaBar(-500, 400.0), 1e-9);
        assertEquals(0.0, ConversaoPressao.axParaPsi(-500, SENSOR_400_BAR), 1e-9);

        double acima = ConversaoPressao.axParaBar(1000, 400.0);
        assertTrue(acima > 400.0, "acima da faixa deve ultrapassar o fundo de escala");
    }

    @Test
    @DisplayName("sensibilidade escala o resultado")
    void sensibilidadeAplicada() {
        SensorPressaoConfig comGanho = new SensorPressaoConfig(400.0, 1.1);

        assertEquals(ConversaoPressao.axParaPsi(250, SENSOR_400_BAR) * 1.1,
                ConversaoPressao.axParaPsi(250, comGanho), 0.1);
    }

    @Test
    @DisplayName("config nula cai no padrão de fábrica")
    void configNula() {
        assertEquals(ConversaoPressao.axParaPsi(250, SENSOR_400_BAR),
                ConversaoPressao.axParaPsi(250, null), 0.001);
    }
}
