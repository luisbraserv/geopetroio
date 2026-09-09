package com.geopetro.configuracaosonda;

import java.time.Instant;
import java.util.*;

import com.geopetro.cards.GrandezasDeCard.Grandeza;
import com.geopetro.core.exception.BusinessException;

/**
 * Documento de limites de alarme de uma Unidade/Sonda.
 *
 * <p><b>Separado do documento de cards</b>, com revisão e endpoint próprios (RN-089): quem ajusta um
 * limite é quem enxerga a sonda, inclusive {@code CLIENTE} (RN-069), e quem configura os cards é
 * {@code ADMIN} ou {@code SUPORTE} (RN-086). Num documento só, o cliente devolveria os cards junto
 * ao salvar um limite, e a autorização viraria uma comparação campo a campo.
 *
 * <h2>⚠️ O vocabulário não é do sistema — é de cada unidade</h2>
 * Até 2026-09-08 esta classe carregava a lista fixa {@code VAZAO_01}, {@code PESO_COLUNA_01},
 * {@code TORQUE_01}, {@code TORQUE_02} e {@code PRESSAO_01}, e um teto de cinco limites. Aquele
 * número era a contagem das cinco grandezas que <b>toda</b> sonda tinha.
 *
 * <p>Com cards por unidade isso deixou de valer: uma unidade com um card de temperatura não
 * conseguia ter limite nenhum para ele, e uma com três cards de torque não cabia no teto. O
 * vocabulário passa a ser <b>o que a unidade declara no documento de cards</b> — ver
 * {@code specs/contracts/configuracao-sonda.md §5}.
 */
public record ConfiguracaoSonda(int schemaVersion, long unidadeSondaId, long revisao,
        List<Limite> limites, String atualizadoPor, Instant atualizadoEm) {

    public ConfiguracaoSonda { limites = List.copyOf(limites); }

    public record Alteracao(long revisao, List<Limite> limites) {}

    /**
     * O limite de uma grandeza.
     *
     * @param serie qual das séries de um card de stroke (RN-098); {@code null} nos demais tipos
     */
    public record Limite(String dispositivoId, String serie, Double minimoAtencao, Double maximoAtencao,
        Double minimoCritico, Double maximoCritico, int segundosParaAbrir, int segundosParaFechar, boolean ativo) {

        /**
         * ⚠️ <b>{@code serie} não é detalhe de exibição, é parte da identidade.</b> As três séries de
         * um contador compartilham o {@code dispositivoId}: sem ela, "acima de 8" não diz se fala de
         * vazão — alarme plausível — ou de volume acumulado, que só cresce e dispararia uma vez para
         * nunca mais fechar.
         */
        public String chave() { return Grandeza.chave(dispositivoId, serie); }
    }

    /**
     * @param grandezasDeclaradas chaves que a unidade declara no documento de cards, ativas ou não —
     *                            o limite de um card desativado <b>hiberna</b>, não é apagado (RN-091)
     */
    public static void validar(Alteracao update, Set<String> grandezasDeclaradas) {
        if (update == null || update.revisao < 0 || update.limites == null)
            throw new BusinessException("Configuracao de sonda invalida.");
        var chaves = new HashSet<String>();
        for (var limit : update.limites) {
            if (limit == null || limit.dispositivoId == null || limit.dispositivoId.isBlank())
                throw new BusinessException("Limite sem dispositivo.");
            var chave = limit.chave();
            // Recusar aqui é o que impede um limite orfao: uma grandeza que a unidade nao mede nunca
            // produziria leitura, e o limite ficaria no documento parecendo vigiar alguma coisa.
            if (!grandezasDeclaradas.contains(chave))
                throw new BusinessException("A unidade nao declara a grandeza " + chave
                    + ". Configure o card antes do limite.");
            if (!chaves.add(chave))
                throw new BusinessException("Grandeza repetida: " + chave + ".");
            if (limit.segundosParaAbrir < 0 || limit.segundosParaFechar < 0)
                throw new BusinessException("Os tempos devem ser inteiros nao negativos em segundos.");
            var values = Arrays.asList(limit.minimoAtencao, limit.maximoAtencao, limit.minimoCritico, limit.maximoCritico);
            if (values.stream().filter(Objects::nonNull).anyMatch(v -> !Double.isFinite(v)))
                throw new BusinessException("Os limites devem ser numeros finitos.");
            if (limit.ativo && values.stream().allMatch(Objects::isNull))
                throw new BusinessException("Informe ao menos um limite para ativar a grandeza.");
            if (greater(limit.minimoCritico, limit.minimoAtencao) || greater(limit.maximoAtencao, limit.maximoCritico))
                throw new BusinessException("Os limites criticos devem ficar fora dos limites de atencao.");
            for (Double low : Arrays.asList(limit.minimoCritico, limit.minimoAtencao))
                for (Double high : Arrays.asList(limit.maximoAtencao, limit.maximoCritico))
                    if (low != null && high != null && low >= high)
                        throw new BusinessException("O limite minimo deve ser menor que o maximo.");
        }
    }

    private static boolean greater(Double a, Double b) { return a != null && b != null && a > b; }
}
