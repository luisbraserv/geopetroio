package com.geopetro.desktop.calculos;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.function.LongSupplier;

import org.springframework.stereotype.Service;

/**
 * Vazao em bbl/min, a partir do contador de stroke e da constante da bomba — RN-085, RN-090.
 *
 * <pre>
 * vazao = Σ (strokes × constante) / Δt × 60
 * </pre>
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
 *
 * <h2>A leitura mais antiga so marca o inicio</h2>
 * Os strokes de cada leitura foram bombeados <b>antes</b> do instante dela. Δt vai da leitura
 * mais antiga a mais nova, entao os strokes da mais antiga caem fora desse intervalo e nao entram
 * na soma. Soma-los dava N deltas sobre N-1 intervalos: com a janela cheia, ~1,7% a mais.
 *
 * <p>Pelo mesmo motivo, com uma leitura so na janela (a primeira do card, ou a primeira depois de
 * mais de 60 s sem leitura) nao ha intervalo, e a vazao e zero. Antes devolvia a constante da
 * bomba, em bbl/stroke, como se fosse bbl/min.
 */
@Service
public class FlowRateCalculatorService {

    private static final long JANELA_MS = 60_000;

    private final Map<String, Deque<Leitura>> porCard = new HashMap<>();
    private final LongSupplier relogio;

    private record Leitura(long instante, double volumeBbl) {
    }

    public FlowRateCalculatorService() {
        this(System::currentTimeMillis);
    }

    /** Para testes: o relogio em milissegundos. */
    FlowRateCalculatorService(LongSupplier relogio) {
        this.relogio = relogio;
    }

    public synchronized double calculateBblPerMinute(String dispositivoId, long strokesDoCiclo, double constanteBomba) {
        Deque<Leitura> janela = porCard.computeIfAbsent(chave(dispositivoId), id -> new ArrayDeque<>());

        long agora = relogio.getAsLong();
        janela.addLast(new Leitura(agora, strokesDoCiclo * constanteBomba));
        descartarAntigas(janela, agora);

        if (janela.size() < 2) {
            return 0.0;
        }
        long intervaloMs = janela.getLast().instante() - janela.getFirst().instante();
        if (intervaloMs <= 0) {
            return 0.0;
        }

        double volumeNoIntervalo = 0.0;
        Iterator<Leitura> leituras = janela.iterator();
        leituras.next(); // a mais antiga so marca o inicio do intervalo
        while (leituras.hasNext()) {
            volumeNoIntervalo += leituras.next().volumeBbl();
        }
        if (volumeNoIntervalo <= 0) {
            return 0.0;
        }

        return volumeNoIntervalo / (intervaloMs / 60_000.0);
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
