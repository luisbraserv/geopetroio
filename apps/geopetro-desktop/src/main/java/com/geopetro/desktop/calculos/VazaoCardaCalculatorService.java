package com.geopetro.desktop.calculos;

import java.util.ArrayDeque;
import java.util.Deque;
import java.util.HashMap;
import java.util.Map;
import java.util.OptionalDouble;
import java.util.function.LongSupplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

/**
 * Pulsos por minuto do cardã a partir do contador acumulado do LOGO! — RN-120, RN-121.
 *
 * <pre>
 * pulsos/min      = N × 60 / t
 * RPM do cardã    = pulsos/min / P        = (N × 60) / (t × P)
 * vazão (bbl/min) = pulsos/min × K        = (N × K × 60) / t
 * </pre>
 *
 * {@code N} são os pulsos desde a leitura de referência e {@code t} o tempo <b>real</b> até ela: a
 * mais recente com pelo menos 60 s de idade. Uma leitura atrasada que cobre 61,3 s dividida por 60
 * inflaria os dois resultados.
 *
 * <p>⚠️ <b>A vazão não passa por P.</b> {@code K} já é bbl por <b>pulso</b>: dividir por P de novo
 * daria a vazão de uma volta a cada P pulsos.
 *
 * <h2>Sem janela completa, sem número</h2>
 * Ao contrário do stroke, que mostra vazão desde o segundo ciclo, aqui o resultado só sai com 60 s
 * de janela. Antes disso o card mostra "Coletando dados" — um RPM de 5 s de amostra seria ruído com
 * cara de medição.
 *
 * <h2>Virada e reinício</h2>
 * O contador vai de 0 a 999.999 e o LOGO! o zera sozinho ao passar disso. Queda com diferença
 * módulo 1.000.000 de até {@link #MARGEM_VIRADA} é virada e conta; maior que isso é reinício e a
 * janela recomeça. Nenhum dos dois casos pode virar pico.
 *
 * <p>⚠️ <b>Falha de leitura não é bomba parada.</b> O contador é acumulado: a próxima leitura válida
 * conta os pulsos do intervalo, e a média continua certa. Só a reconexão ({@link #reset()})
 * recomeça a janela.
 */
@Service
public class VazaoCardaCalculatorService {

    private static final Logger logger = LoggerFactory.getLogger(VazaoCardaCalculatorService.class);

    static final long JANELA_MS = 60_000;

    /** O contador do LOGO! vai de 0 a 999.999 e volta a 0 sozinho. */
    static final long MODULO_CONTADOR = 1_000_000;

    /** Pulsos de uma virada: mais de 10 min a 1.000 pulsos/min sem leitura. Acima disso, foi reinício. */
    static final long MARGEM_VIRADA = 10_000;

    private final Map<String, Janela> porCard = new HashMap<>();
    private final LongSupplier relogio;

    /** {@code pulsos} é acumulado desde o início da janela, já sem as viradas do contador. */
    private record Amostra(long instante, long pulsos) {
    }

    private static final class Janela {
        private final Deque<Amostra> amostras = new ArrayDeque<>();
        private long ultimoContador;

        private void recomecar(long agora, long contador) {
            amostras.clear();
            amostras.addLast(new Amostra(agora, 0));
            ultimoContador = contador;
        }
    }

    public VazaoCardaCalculatorService() {
        // Monotonico: um ajuste do relogio do Windows nao pode encolher nem esticar a janela.
        this(() -> System.nanoTime() / 1_000_000);
    }

    /** Para testes, inclusive os da leitura de cards: o relogio em milissegundos. */
    public VazaoCardaCalculatorService(LongSupplier relogio) {
        this.relogio = relogio;
    }

    /**
     * @return {@code N × 60 / t}, ou vazio enquanto a janela não tem 60 s — no início, na reconexão
     *         e depois de um reinício do contador
     */
    public synchronized OptionalDouble pulsosPorMinuto(String dispositivoId, long contador) {
        long agora = relogio.getAsLong();
        Janela janela = porCard.computeIfAbsent(chave(dispositivoId), id -> new Janela());

        if (contador < 0 || contador >= MODULO_CONTADOR) {
            logger.warn("[CARDA] Contador fora de 0..999999 no card {}: {}. Janela recomeca.",
                    dispositivoId, contador);
            porCard.remove(chave(dispositivoId));
            return OptionalDouble.empty();
        }
        if (janela.amostras.isEmpty()) {
            janela.recomecar(agora, contador);
            return OptionalDouble.empty();
        }

        long delta = contador - janela.ultimoContador;
        if (delta < 0) {
            delta += MODULO_CONTADOR;
            if (delta > MARGEM_VIRADA) {
                logger.info("[CARDA] Contador reiniciado no card {} ({} -> {}). Janela recomeca.",
                        dispositivoId, janela.ultimoContador, contador);
                janela.recomecar(agora, contador);
                return OptionalDouble.empty();
            }
        }

        Amostra anterior = janela.amostras.getLast();
        janela.amostras.addLast(new Amostra(agora, anterior.pulsos() + delta));
        janela.ultimoContador = contador;
        descartarAlemDaReferencia(janela.amostras, agora);

        Amostra referencia = janela.amostras.getFirst();
        long intervaloMs = agora - referencia.instante();
        if (intervaloMs < JANELA_MS) {
            return OptionalDouble.empty();
        }
        long pulsos = janela.amostras.getLast().pulsos() - referencia.pulsos();
        return OptionalDouble.of(pulsos * 60.0 / (intervaloMs / 1000.0));
    }

    /** RPM do cardã: {@code (N × 60) / (t × P)}. {@code null} sem pulsos por volta válidos. */
    public static Double rpmDoCarda(double pulsosPorMinuto, Integer pulsosPorVolta) {
        if (pulsosPorVolta == null || pulsosPorVolta <= 0) {
            return null;
        }
        return pulsosPorMinuto / pulsosPorVolta;
    }

    /**
     * Vazão em bbl/min: {@code (N × K × 60) / t}. <b>Não</b> divide por P — K já é por pulso.
     *
     * @return {@code null} sem constante válida
     */
    public static Double vazaoBblPorMinuto(double pulsosPorMinuto, Double constanteBblPorPulso) {
        if (constanteBblPorPulso == null || !Double.isFinite(constanteBblPorPulso) || constanteBblPorPulso <= 0) {
            return null;
        }
        return pulsosPorMinuto * constanteBblPorPulso;
    }

    /** Esquece tudo. Chamado ao (re)conectar ao CLP. */
    public synchronized void reset() {
        porCard.clear();
    }

    /** Esquece a janela de um card só. */
    public synchronized void reset(String dispositivoId) {
        porCard.remove(chave(dispositivoId));
    }

    /** Mantém como primeira a amostra mais recente com pelo menos 60 s de idade. */
    private static void descartarAlemDaReferencia(Deque<Amostra> amostras, long agora) {
        while (amostras.size() > 1) {
            Amostra primeira = amostras.removeFirst();
            if (agora - amostras.getFirst().instante() < JANELA_MS) {
                amostras.addFirst(primeira);
                return;
            }
        }
    }

    private static String chave(String dispositivoId) {
        return dispositivoId == null ? "" : dispositivoId;
    }
}
