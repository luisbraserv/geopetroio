package com.example.braservhorusdesktop.service;

import java.util.LinkedList;
import java.util.Queue;

/**
 * Serviço especializado em calcular Stroke por Minuto e BBL por Minuto.
 * 
 * Utiliza histórico dos últimos 10 segundos de dados para calcular uma média
 * mais estável e realista de BBL/min.
 * 
 * Fórmula principal:
 * BBL/min = Volume acumulado (últimos 10s) / Strokes acumulados (últimos 10s)
 * 
 * Onde:
 * - Volume acumulado: soma de (stroke * constante) dos últimos 10s
 * - Strokes acumulados: soma de todos os strokes dos últimos 10s
 */
public class StrokePorMinutoService {

    private static final long JANELA_TEMPO_MS = 60000; // 60 segundos
    
    private boolean primeiraLeitura = true;
    
    /**
     * Classe interna para armazenar dados de cada leitura
     */
    private static class DadosLeitura {
        long timestamp;
        long strokeAtual;
        double volumeBBL;
        
        DadosLeitura(long timestamp, long strokeAtual, double volumeBBL) {
            this.timestamp = timestamp;
            this.strokeAtual = strokeAtual;
            this.volumeBBL = volumeBBL;
        }
    }
    
    // Histórico dos últimos 10 segundos
    private Queue<DadosLeitura> historico = new LinkedList<>();

    /**
     * Calcula strokes por minuto baseado no tempo decorrido.
     * 
     * @param strokeAtual quantidade de strokes neste intervalo
     * @return strokes por minuto
     */
    public synchronized double calcularStrokePorMinuto(long strokeAtual) {
        long agora = System.currentTimeMillis();

        if (primeiraLeitura) {
            primeiraLeitura = false;
            return 0.0;
        }

        // Remove dados com mais de 10 segundos
        limparHistoricoAntigo(agora);

        // Calcula strokes por minuto a partir do histórico
        if (historico.isEmpty()) {
            return 0.0;
        }

        long totalStrokes = 0;
        for (DadosLeitura dado : historico) {
            totalStrokes += dado.strokeAtual;
        }

        DadosLeitura primeiro = historico.peek();
        DadosLeitura ultimo = ((LinkedList<DadosLeitura>) historico).getLast();
        
        long deltaMillis = ultimo.timestamp - primeiro.timestamp;
        if (deltaMillis <= 0) {
            return 0.0;
        }

        double deltaSegundos = deltaMillis / 1000.0;
        double strokePorMinuto = (totalStrokes / deltaSegundos) * 60.0;

        return strokePorMinuto;
    }

    /**
     * Calcula BBL por minuto com base no histórico dos últimos 10 segundos.
     * 
     * Fórmula:
     * BBL/min = Volume acumulado (10s) / Strokes acumulados (10s)
     * 
     * @param strokeAtual quantidade de strokes capturados neste intervalo
     * @param constante constante da bomba (BBL por stroke)
     * @return vazão em BBL/min
     */
    public synchronized double calcularBBLPorMinuto(long strokeAtual, double constante) {
        long agora = System.currentTimeMillis();

        if (primeiraLeitura) {
            primeiraLeitura = false;
            
            // Adiciona a primeira leitura ao histórico
            double volumeBBL = strokeAtual * constante;
            historico.offer(new DadosLeitura(agora, strokeAtual, volumeBBL));
            
            return 0.0;
        }

        // Calcula o volume da leitura atual
        double volumeBBL = strokeAtual * constante;
        
        // Adiciona ao histórico
        historico.offer(new DadosLeitura(agora, strokeAtual, volumeBBL));

        // Remove dados com mais de 10 segundos
        limparHistoricoAntigo(agora);

        // Se não há dados suficientes, retorna 0
        if (historico.isEmpty()) {
            return 0.0;
        }

        // Calcula totais
        long totalStrokes = 0;
        double totalVolumeBBL = 0.0;
        
        for (DadosLeitura dado : historico) {
            totalStrokes += dado.strokeAtual;
            totalVolumeBBL += dado.volumeBBL;
        }

        // Evita divisão por zero
        if (totalStrokes <= 0) {
            return 0.0;
        }

        // BBL/min = Volume total / Strokes totais
        double bblPorStroke = totalVolumeBBL / totalStrokes;
        
        // Calcula strokes por minuto no período
        if (historico.size() == 1) {
            // Para primeira leitura, usa bblPorStroke diretamente
            // Assume 1 minuto de operação para inicialização
            return bblPorStroke;
        }
        
        DadosLeitura primeiro = historico.peek();
        DadosLeitura ultimo = ((LinkedList<DadosLeitura>) historico).getLast();
        
        long deltaMillis = ultimo.timestamp - primeiro.timestamp;
        if (deltaMillis <= 0) {
            return bblPorStroke; // Retorna valor base se delta é 0
        }

        double deltaSegundos = deltaMillis / 1000.0;
        double strokePorMinuto = (totalStrokes / deltaSegundos) * 60.0;

        // BBL/min = BBL por stroke * strokes por minuto
        double bblPorMinuto = bblPorStroke * strokePorMinuto;

        return bblPorMinuto;
    }

    /**
     * Remove do histórico dados com mais de 10 segundos de antigüidade.
     * 
     * @param agora timestamp atual em milissegundos
     */
    private void limparHistoricoAntigo(long agora) {
        while (!historico.isEmpty()) {
            DadosLeitura primeiro = historico.peek();
            long idade = agora - primeiro.timestamp;
            
            if (idade > JANELA_TEMPO_MS) {
                historico.poll();
            } else {
                break;
            }
        }
    }

    /**
     * Reseta o serviço para uma nova sequência de leituras.
     */
    public synchronized void reset() {
        primeiraLeitura = true;
        historico.clear();
    }

    /**
     * Obtém o tamanho do histórico (para debug).
     * 
     * @return quantidade de registros no histórico
     */
    public synchronized int getTamanhoHistorico() {
        return historico.size();
    }
}
