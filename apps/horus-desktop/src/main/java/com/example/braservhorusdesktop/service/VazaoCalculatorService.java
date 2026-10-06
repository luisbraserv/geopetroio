package com.example.braservhorusdesktop.service;

/**
 * Serviço responsável por calcular a vazão (BBL/min) baseado no stroke e tempo.
 * 
 * Fórmula utilizada:
 * BBL/min = (strokeAtual * constante * numeroCamisa * 60) / deltaSegundos
 * 
 * Onde:
 * - strokeAtual: número de strokes capturados no intervalo
 * - constante: constante de conversão da bomba (BBL por stroke)
 * - numeroCamisa: quantidade de camisas ativas
 * - deltaSegundos: tempo decorrido desde a última leitura (em segundos)
 * - 60: fator de conversão para normalizar para minuto
 */
public class VazaoCalculatorService {

    private long ultimoTimestampMillis = 0;
    private boolean primeiraLeitura = true;

    /**
     * Calcula a vazão em strokes por segundo.
     * @deprecated Use calcularVazaoEmBBLPorMinuto ao invés
     */
    @Deprecated
    public synchronized double calcularVazao(long strokeAtual) {
        long agora = System.currentTimeMillis();

        if (primeiraLeitura) {
            primeiraLeitura = false;
            ultimoTimestampMillis = agora;
            return 0.0;
        }

        long deltaMillis = agora - ultimoTimestampMillis;
        ultimoTimestampMillis = agora;

        if (deltaMillis <= 0) {
            return 0.0;
        }

        double deltaSegundos = deltaMillis / 1000.0;

        if (deltaSegundos <= 0) {
            return 0.0;
        }

        return strokeAtual / deltaSegundos;
    }

    /**
     * Calcula a vazão em BBL por minuto.
     * 
     * Fórmula: BBL/min = (strokeAtual * constante * numeroCamisa * 60) / deltaSegundos
     * 
     * @param strokeAtual quantidade de strokes capturados neste intervalo
     * @param constante constante da bomba (BBL por stroke por camisa)
     * @param numeroCamisa número de camisas ativas
     * @return vazão em BBL/min
     */
    public synchronized double calcularVazaoEmBBLPorMinuto(long strokeAtual, double constante, int numeroCamisa) {
        long agora = System.currentTimeMillis();

        if (primeiraLeitura) {
            primeiraLeitura = false;
            ultimoTimestampMillis = agora;
            return 0.0;
        }

        long deltaMillis = agora - ultimoTimestampMillis;
        ultimoTimestampMillis = agora;

        if (deltaMillis <= 0) {
            return 0.0;
        }

        double deltaSegundos = deltaMillis / 1000.0;

        if (deltaSegundos <= 0) {
            return 0.0;
        }

        // Fórmula: BBL/min = (strokeAtual * constante * numeroCamisa * 60) / deltaSegundos
        double volumeBBL = strokeAtual * constante * numeroCamisa;
        double vazaoPorSegundo = volumeBBL / deltaSegundos;
        double vazaoPorMinuto = vazaoPorSegundo * 60.0;

        return vazaoPorMinuto;
    }

    public synchronized void reset() {
        primeiraLeitura = true;
        ultimoTimestampMillis = 0;
    }
}