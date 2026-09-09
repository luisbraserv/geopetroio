package com.example.demo.models;

import java.time.Instant;
import java.util.*;


/**
 * Documento de limites de alarme vindo do Backend.
 *
 * <h2>⚠️ Esta classe não conhece mais o vocabulário de dispositivos</h2>
 * Ela carregava a mesma lista fixa de cinco ids que o Backend carregava, e o construtor
 * <b>rejeitava o snapshot inteiro</b> ao encontrar um id fora dela. Com cards por unidade, um
 * limite de {@code TEMPERATURA_01} é normal — e a estação descartaria a configuração toda,
 * mantendo em silêncio a anterior, como manda o contrato para payload inválido.
 *
 * <p>Validar o vocabulário aqui seria pior do que não validar: os dois documentos chegam por
 * canais independentes, com revisões próprias, e o de limites pode chegar <b>antes</b> do de cards.
 * Um id desconhecido significaria "card que ainda não chegou", não "documento corrompido". Quem
 * tem como conferir é o Backend, que grava os dois e recusa limite de grandeza não declarada.
 *
 * <p>O que continua sendo validado aqui é a <b>forma</b>: números finitos, ordenação dos limiares,
 * tempos não negativos e ausência de grandeza repetida — tudo verificável sem saber o que a
 * unidade mede.
 */
public record ConfiguracaoSondaRemota(int schemaVersion, long unidadeSondaId, long revisao,
    List<Limite> limites, String atualizadoPor, String atualizadoEm) implements DocumentoDaUnidade {
    public ConfiguracaoSondaRemota {
        if (schemaVersion != 1 || unidadeSondaId <= 0 || revisao < 0) throw new IllegalArgumentException("Snapshot invalido.");
        validar(new Alteracao(revisao, limites));
        if (revisao > 0) {
            if (atualizadoPor == null || atualizadoPor.isBlank() || atualizadoEm == null) throw new IllegalArgumentException("Autoria ausente.");
            Instant.parse(atualizadoEm);
        }
        limites = List.copyOf(limites);
    }
    public record Alteracao(long revisao, List<Limite> limites) {}

    /**
     * @param serie qual das séries de um card de stroke (RN-098); {@code null} nos demais tipos
     */
    public record Limite(String dispositivoId, String serie, Double minimoAtencao, Double maximoAtencao,
        Double minimoCritico, Double maximoCritico, int segundosParaAbrir, int segundosParaFechar, boolean ativo) {

        /**
         * ⚠️ As três séries de um contador compartilham o {@code dispositivoId}. Chavear só por ele
         * faria o limite de vazão e o de volume acumulado colidirem — e um deles sumiria.
         */
        public String chave() {
            return serie == null || serie.isBlank() ? dispositivoId : dispositivoId + "|" + serie;
        }
    }

    public static void validar(Alteracao update) {
        if (update == null || update.revisao < 0 || update.limites == null)
            throw new IllegalArgumentException("Configuracao de sonda invalida.");
        var chaves = new HashSet<String>();
        for (var limit : update.limites) {
            if (limit == null || limit.dispositivoId == null || limit.dispositivoId.isBlank())
                throw new IllegalArgumentException("Limite sem dispositivo.");
            if (!chaves.add(limit.chave()))
                throw new IllegalArgumentException("Grandeza repetida: " + limit.chave() + ".");
            if (limit.segundosParaAbrir < 0 || limit.segundosParaFechar < 0)
                throw new IllegalArgumentException("Os tempos devem ser inteiros nao negativos em segundos.");
            var values = Arrays.asList(limit.minimoAtencao, limit.maximoAtencao, limit.minimoCritico, limit.maximoCritico);
            if (values.stream().filter(Objects::nonNull).anyMatch(v -> !Double.isFinite(v)))
                throw new IllegalArgumentException("Os limites devem ser numeros finitos.");
            if (limit.ativo && values.stream().allMatch(Objects::isNull))
                throw new IllegalArgumentException("Informe ao menos um limite para ativar a grandeza.");
            if (greater(limit.minimoCritico, limit.minimoAtencao) || greater(limit.maximoAtencao, limit.maximoCritico))
                throw new IllegalArgumentException("Os limites criticos devem ficar fora dos limites de atencao.");
            for (Double low : Arrays.asList(limit.minimoCritico, limit.minimoAtencao))
                for (Double high : Arrays.asList(limit.maximoAtencao, limit.maximoCritico))
                    if (low != null && high != null && low >= high)
                        throw new IllegalArgumentException("O limite minimo deve ser menor que o maximo.");
        }
    }
    private static boolean greater(Double a, Double b) { return a != null && b != null && a > b; }
}
