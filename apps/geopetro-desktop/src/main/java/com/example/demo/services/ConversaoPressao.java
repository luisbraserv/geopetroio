package com.example.demo.services;

import com.example.demo.models.SensorPressaoConfig;

/**
 * Ponto unico de conversao de pressao.
 *
 * <h2>O que o LOGO! entrega</h2>
 * O bloco <em>Analog Amplifier</em> nao devolve pressao: devolve o laco 4-20 mA reescalonado para a
 * faixa configurada em <em>Measurement Range</em>. Com a configuracao em uso:
 *
 * <pre>
 *   Sensor:  4...20 mA
 *   Minimum: -250     Maximum: 750
 *   Gain:    1,00     Offset:  -250
 *
 *    4 mA -> Ax = -250    (inicio da faixa do transmissor)
 *   12 mA -> Ax = 250     (meio da faixa)
 *   20 mA -> Ax = 750     (fundo de escala do transmissor)
 * </pre>
 *
 * <h2>Como vira pressao</h2>
 * O Ax diz <b>onde na faixa</b> o transmissor esta; quanto isso vale em bar depende do proprio
 * transmissor, informado em <em>Range do sensor (bar)</em> nas configuracoes:
 *
 * <pre>
 *   fracao   = (Ax + 250) / 1000
 *   pressao  = fracao × range_do_sensor_em_bar
 *   psi      = pressao × 14,5037738
 * </pre>
 *
 * <p>Com um transmissor de 400 bar: Ax -250 = 0 bar, Ax 250 = 200 bar, Ax 750 = 400 bar.
 *
 * <p>A conversao eletrica do Ax fica em {@link ConversaoSinalAnalogico}; esta classe contem somente
 * as regras especificas de pressao.
 */
public final class ConversaoPressao {

    /** 1 bar = 14,5037738 PSI. */
    public static final double BAR_PARA_PSI = 14.5037738;

    private ConversaoPressao() {
    }

    /** Converte pressao em bar para PSI. */
    public static double barToPsi(double bar) {
        return bar * BAR_PARA_PSI;
    }

    /**
     * Converte o Ax do LOGO! em pressao, conforme a faixa do transmissor.
     *
     * <p>Pressao fisica nao pode ser negativa. Leituras abaixo de 4 mA continuam disponiveis no Ax
     * bruto e sao sinalizadas pelo chamador, mas a grandeza convertida fica em zero.
     */
    public static double axParaBar(double ax, double rangeSensorBar) {
        return Math.max(0.0, ConversaoSinalAnalogico.axParaValorLinear(ax, 0.0, rangeSensorBar));
    }

    /**
     * Converte o Ax em PSI, aplicando a faixa e o ajuste de calibracao do sensor.
     *
     * <p>O limite fisico inferior e zero. O Ax bruto nao e recortado: continua visivel no card e
     * permite diagnosticar uma leitura abaixo de 4 mA.
     */
    public static double axParaPsi(double ax, SensorPressaoConfig config) {
        SensorPressaoConfig sensor = config == null ? new SensorPressaoConfig() : config;
        return Math.max(0.0, barToPsi(axParaBar(ax, sensor.getRangeBar())) * sensor.getSensibilidade());
    }

}
