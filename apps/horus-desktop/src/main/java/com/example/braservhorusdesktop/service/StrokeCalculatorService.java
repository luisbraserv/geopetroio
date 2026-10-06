package com.example.braservhorusdesktop.service;

import java.util.LinkedList;
import java.util.Queue;

public class StrokeCalculatorService {

    private static final long JANELA_TEMPO_MS = 60000L;

    private long ultimoStrokeCumulativo = 0;
    private boolean primeiraLeitura = true;
    private final Queue<LeituraStroke> historico = new LinkedList<>();

    public synchronized long calcularStrokeAtual(long strokeCumulativoAtual) {
        return calcularStrokeAtual(strokeCumulativoAtual, System.currentTimeMillis());
    }

    synchronized long calcularStrokeAtual(long strokeCumulativoAtual, long timestamp) {
        if (primeiraLeitura) {
            primeiraLeitura = false;
            ultimoStrokeCumulativo = strokeCumulativoAtual;
            historico.offer(new LeituraStroke(timestamp, strokeCumulativoAtual));
            return 0L;
        }

        long strokeAtual = strokeCumulativoAtual - ultimoStrokeCumulativo;

        if (strokeAtual < 0) {
            historico.clear();
            historico.offer(new LeituraStroke(timestamp, strokeCumulativoAtual));
            ultimoStrokeCumulativo = strokeCumulativoAtual;
            return 0L;
        }

        ultimoStrokeCumulativo = strokeCumulativoAtual;
        historico.offer(new LeituraStroke(timestamp, strokeCumulativoAtual));
        limparHistoricoAntigo(timestamp);

        if (historico.size() < 2) {
            return 0L;
        }

        LeituraStroke primeira = historico.peek();
        LeituraStroke ultima = ((LinkedList<LeituraStroke>) historico).getLast();
        long deltaMillis = ultima.timestamp - primeira.timestamp;

        if (deltaMillis <= 0L) {
            return 0L;
        }

        long totalStrokes = ultima.strokeCumulativo - primeira.strokeCumulativo;
        double deltaSegundos = deltaMillis / 1000.0;
        return Math.round((totalStrokes / deltaSegundos) * 60.0);
    }

    public synchronized void reset() {
        primeiraLeitura = true;
        ultimoStrokeCumulativo = 0;
        historico.clear();
    }

    private void limparHistoricoAntigo(long timestamp) {
        while (!historico.isEmpty() && timestamp - historico.peek().timestamp > JANELA_TEMPO_MS) {
            historico.poll();
        }
    }

    private static class LeituraStroke {
        final long timestamp;
        final long strokeCumulativo;

        LeituraStroke(long timestamp, long strokeCumulativo) {
            this.timestamp = timestamp;
            this.strokeCumulativo = strokeCumulativo;
        }
    }
}
