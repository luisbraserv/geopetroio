package com.example.demo.models;

import java.time.Instant;
import java.util.*;


public record ConfiguracaoSondaRemota(int schemaVersion, long unidadeSondaId, long revisao,
    List<Limite> limites, String atualizadoPor, String atualizadoEm) {
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
    public record Limite(String dispositivoId, Double minimoAtencao, Double maximoAtencao,
        Double minimoCritico, Double maximoCritico, int segundosParaAbrir, int segundosParaFechar, boolean ativo) {}
    private static final Set<String> DISPOSITIVOS = Set.of("VAZAO_01", "PESO_COLUNA_01", "TORQUE_01", "TORQUE_02", "PRESSAO_01");
    public static void validar(Alteracao update) {
        if (update == null || update.revisao < 0 || update.limites == null || update.limites.size() > 5)
            throw new IllegalArgumentException("Configuracao de sonda invalida.");
        var ids = new HashSet<String>();
        for (var limit : update.limites) {
            if (limit == null || limit.dispositivoId == null || !DISPOSITIVOS.contains(limit.dispositivoId) || !ids.add(limit.dispositivoId))
                throw new IllegalArgumentException("Dispositivo desconhecido ou repetido.");
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
