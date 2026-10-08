package com.geopetro.desktop.services;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * Vazao em bbl/min, a partir do contador de stroke e da constante da bomba — RN-085, RN-090.
 *
 * <h2>Estado por card</h2>
 * A janela movel de 60 segundos era <b>uma so</b>. Com varios cards {@code CONTADOR_STROKE} na
 * mesma unidade, as leituras de bombas diferentes cairiam na mesma fila e seriam somadas: a vazao
 * de cada bomba incluiria os strokes da outra. Nao era um valor anterior sobrescrito — era um
 * minuto inteiro de historico misturado.
 *
 * <p>A janela passa a ser por {@code dispositivoId}.
 *
 * <h2>Por que uma janela, e nao o ciclo</h2>
 * A 1 leitura/s, o delta de um ciclo e um numero pequeno e ruidoso. A media sobre 60 segundos da
 * uma vazao estavel o bastante para leitura humana, ao custo de reagir devagar a uma parada.
 */
@Service
public class FlowRateCalculatorService {

    private static final long JANELA_MS = 60_000;

    private final Map<String, Deque<Leitura>> porCard = new HashMap<>();

    private record Leitura(long instante, long strokes, double volumeBbl) {
    }

    public synchronized double calculateBblPerMinute(String dispositivoId, long strokesDoCiclo, double constanteBomba) {
        Deque<Leitura> janela = porCard.computeIfAbsent(chave(dispositivoId), id -> new ArrayDeque<>());

        long agora = System.currentTimeMillis();
        double volumeBbl = strokesDoCiclo * constanteBomba;

        // A primeira leitura so semeia a janela: sem intervalo nao ha vazao.
        boolean primeira = janela.isEmpty();
        janela.addLast(new Leitura(agora, strokesDoCiclo, volumeBbl));
        if (primeira) {
            return 0.0;
        }

        descartarAntigas(janela, agora);
        if (janela.isEmpty()) {
            return 0.0;
        }

        long totalStrokes = 0;
        double totalVolume = 0.0;
        for (Leitura leitura : janela) {
            totalStrokes += leitura.strokes();
            totalVolume += leitura.volumeBbl();
        }
        if (totalStrokes <= 0) {
            return 0.0;
        }

        double bblPorStroke = totalVolume / totalStrokes;
        if (janela.size() == 1) {
            return bblPorStroke;
        }

        long intervaloMs = janela.getLast().instante() - janela.getFirst().instante();
        if (intervaloMs <= 0) {
            return bblPorStroke;
        }

        double strokesPorMinuto = (totalStrokes / (intervaloMs / 1000.0)) * 60.0;
        return bblPorStroke * strokesPorMinuto;
    }

    /** Esquece tudo. Chamado ao (re)conectar ao CLP. */
    public synchronized void reset() {
        porCard.clear();
    }

    /** Esquece a janela de um card so. */
    public synchronized void reset(String dispositivoId) {
        porCard.remove(chave(dispositivoId));
    }

    private static void descartarAntigas(Deque<Leitura> janela, long agora) {
        while (!janela.isEmpty() && agora - janela.getFirst().instante() > JANELA_MS) {
            janela.removeFirst();
        }
    }

    private static String chave(String dispositivoId) {
        return dispositivoId == null ? "" : dispositivoId;
    }
}
