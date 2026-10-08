package com.geopetro.desktop.services;

import java.util.HashMap;
import java.util.Map;

import org.springframework.stereotype.Service;

/**
 * Converte o contador cumulativo do CLP no numero de strokes do ciclo.
 *
 * <h2>Estado por card — RN-090</h2>
 * Guardava <b>um</b> ultimo valor, escrito quando a unidade tinha uma bomba so. Com varios cards
 * {@code CONTADOR_STROKE} na mesma unidade, um estado compartilhado trocaria os deltas entre as
 * bombas: cada leitura subtrairia o cumulativo da outra, e as duas contagens sairiam plausiveis e
 * erradas.
 *
 * <p>O estado passa a ser por {@code dispositivoId}.
 */
@Service
public class StrokeCalculatorService {

    private final Map<String, Estado> porCard = new HashMap<>();

    private static final class Estado {
        private long ultimoCumulativo;
        private boolean primeiraLeitura = true;
    }

    /**
     * A primeira leitura de cada card devolve zero: sem valor anterior nao ha delta, e assumir que
     * o contador comecou em zero atribuiria ao primeiro ciclo tudo o que a bomba ja bombeou.
     *
     * <p>Delta negativo tambem vira zero — significa que o contador do CLP reiniciou, e a
     * diferenca nao representa bombeio nenhum.
     */
    public synchronized long calculateCurrentStroke(String dispositivoId, long cumulativeStroke) {
        Estado estado = porCard.computeIfAbsent(chave(dispositivoId), id -> new Estado());

        if (estado.primeiraLeitura) {
            estado.primeiraLeitura = false;
            estado.ultimoCumulativo = cumulativeStroke;
            return 0;
        }

        long doCiclo = cumulativeStroke - estado.ultimoCumulativo;
        if (doCiclo < 0) {
            doCiclo = 0;
        }

        estado.ultimoCumulativo = cumulativeStroke;
        return doCiclo;
    }

    /** Esquece tudo. Chamado ao (re)conectar ao CLP, quando a continuidade se perde de qualquer jeito. */
    public synchronized void reset() {
        porCard.clear();
    }

    /** Esquece um card so — util quando ele e desativado ou reconfigurado. */
    public synchronized void reset(String dispositivoId) {
        porCard.remove(chave(dispositivoId));
    }

    private static String chave(String dispositivoId) {
        return dispositivoId == null ? "" : dispositivoId;
    }
}
