package com.geopetro.desktop.conversao;

/**
 * Nucleo de conversao dos sinais analogicos recebidos do LOGO!.
 *
 * <p>O bloco Analog Amplifier entrega o laco 4-20 mA como Ax na faixa -250..750. Esta classe
 * concentra essa regra eletrica; as conversoes de pressao, temperatura e tanque aplicam depois as
 * respectivas escalas de engenharia.
 */
public final class ConversaoSinalAnalogico {

    /** Ax correspondente a 4 mA. */
    public static final int AX_MIN = -250;

    /** Ax correspondente a 20 mA. */
    public static final int AX_MAX = 750;

    private static final double AX_AMPLITUDE = AX_MAX - AX_MIN;

    private ConversaoSinalAnalogico() {
    }

    /** Reinterpreta uma Word do CLP como inteiro de 16 bits com sinal. */
    public static short axComoSigned(int rawWord) {
        return (short) (rawWord & 0xFFFF);
    }

    /**
     * Posicao do Ax no laco: 0,0 em 4 mA e 1,0 em 20 mA.
     *
     * <p>A fracao nao e limitada. Isso preserva a informacao de uma leitura fora da faixa para
     * diagnostico e permite que cada grandeza aplique seu proprio limite fisico.
     */
    public static double axParaFracao(double ax) {
        return (ax - AX_MIN) / AX_AMPLITUDE;
    }

    /** Aplica a fracao do laco a uma escala linear de engenharia. */
    public static double axParaValorLinear(double ax, double minimo, double maximo) {
        return minimo + axParaFracao(ax) * (maximo - minimo);
    }

    /** Indica se o Ax esta fora da faixa eletrica configurada no amplificador. */
    public static boolean foraDaFaixa(double ax) {
        return ax < AX_MIN || ax > AX_MAX;
    }
}
