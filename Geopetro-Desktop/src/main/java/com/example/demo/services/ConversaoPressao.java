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
 *   Minimum: -50      Maximum: 750
 *   Gain:    1,00     Offset:  -250
 *
 *    4 mA -> Ax = -50     (inicio da faixa do transmissor)
 *   12 mA -> Ax = 350     (meio da faixa)
 *   20 mA -> Ax = 750     (fundo de escala do transmissor)
 * </pre>
 *
 * <h2>Como vira pressao</h2>
 * O Ax diz <b>onde na faixa</b> o transmissor esta; quanto isso vale em bar depende do proprio
 * transmissor, informado em <em>Range do sensor (bar)</em> nas configuracoes:
 *
 * <pre>
 *   fracao   = (Ax + 50) / 800
 *   pressao  = fracao × range_do_sensor_em_bar
 *   psi      = pressao × 14,5037738
 * </pre>
 *
 * <p>Com um transmissor de 400 bar: Ax -50 = 0 bar, Ax 350 = 200 bar, Ax 750 = 400 bar.
 *
 * <h2>Por que uma classe so</h2>
 * O fator bar->PSI e a escala do CLP estavam repetidos nos pontos de leitura. Quando a escala mudou,
 * foi preciso caçar as copias — e uma ficou para tras, convertendo com a regra antiga. Aqui ha um
 * lugar unico.
 */
public final class ConversaoPressao {

    /** 1 bar = 14,5037738 PSI. */
    public static final double BAR_PARA_PSI = 14.5037738;

    /** Ax correspondente a 4 mA — inicio da faixa (Measurement Range mínimo). */
    public static final int AX_MIN = -50;

    /** Ax correspondente a 20 mA — fundo de escala (Measurement Range máximo). */
    public static final int AX_MAX = 750;

    /** Amplitude da escala do amplificador: 800 passos entre 4 e 20 mA. */
    private static final double AX_AMPLITUDE = AX_MAX - AX_MIN;

    private ConversaoPressao() {
    }

    /** Converte pressao em bar para PSI. */
    public static double barToPsi(double bar) {
        return bar * BAR_PARA_PSI;
    }

    /**
     * Reinterpreta uma Word lida do CLP como inteiro de 16 bits com sinal.
     *
     * <p>Necessario porque a faixa comeca em -50: lido como unsigned, {@code -50} chegaria como
     * {@code 65486} e produziria uma pressao absurda.
     */
    public static short axComoSigned(int rawWord) {
        return (short) (rawWord & 0xFFFF);
    }

    /**
     * Posicao do Ax dentro da faixa do transmissor, de 0,0 (4 mA) a 1,0 (20 mA).
     *
     * <p>Pode sair desse intervalo: valores fora da faixa nao sao recortados, para que uma leitura
     * suspeita continue visivel em vez de virar um zero convincente.
     */
    public static double axParaFracao(double ax) {
        return (ax - AX_MIN) / AX_AMPLITUDE;
    }

    /** Converte o Ax do LOGO! em pressao, conforme a faixa do transmissor. */
    public static double axParaBar(double ax, double rangeSensorBar) {
        return axParaFracao(ax) * rangeSensorBar;
    }

    /**
     * Converte o Ax em PSI, aplicando a faixa e o ajuste de calibracao do sensor.
     *
     * <p>Sem recorte: um valor fora da faixa continua sendo exibido como veio. O aviso de leitura
     * suspeita vem do log e do valor cru no card, nao de um numero corrigido em silencio.
     */
    public static double axParaPsi(double ax, SensorPressaoConfig config) {
        SensorPressaoConfig sensor = config == null ? new SensorPressaoConfig() : config;
        return barToPsi(axParaBar(ax, sensor.getRangeBar())) * sensor.getSensibilidade();
    }

    /**
     * Indica leitura fora do Measurement Range configurado no LOGO!.
     *
     * <p>Serve para sinalizar, nao para corrigir: abaixo de -50 significa corrente menor que 4 mA —
     * laco aberto, sensor sem alimentacao ou canal nao mapeado.
     */
    public static boolean foraDaFaixa(double ax) {
        return ax < AX_MIN || ax > AX_MAX;
    }
}
