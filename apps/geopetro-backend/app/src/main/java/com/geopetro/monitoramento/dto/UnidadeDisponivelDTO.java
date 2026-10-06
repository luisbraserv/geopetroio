package com.geopetro.monitoramento.dto;

import com.geopetro.comum.port.CatalogoDeUnidadesPort.Unidade;

/**
 * Uma unidade que o usuario autenticado pode acompanhar.
 *
 * @param id      id numerico no Braserv-Core — usado em todas as rotas de
 *                {@code /api/monitoramento/unidades/{id}} e no topico de tempo real
 *                ({@code /topic/realtime/unidades/{id}}). Estavel a renomeacoes.
 * @param nome    nome cadastrado (ex.: SPT-144) — chave de correlacao do historico no InfluxDB
 *                (RN-018)
 * @param apelido apelido opcional
 * @param tipo    SONDA, UNIDADE_BOMBEIO... (RN-065)
 */
public record UnidadeDisponivelDTO(Long id, String nome, String apelido, String tipo) {

    public static UnidadeDisponivelDTO de(Unidade unidade) {
        return new UnidadeDisponivelDTO(unidade.id(), unidade.nome(), unidade.apelido(), unidade.tipo());
    }
}
