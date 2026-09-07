package com.geopetro.monitoramento.dto;

/**
 * Uma Unidade/Sonda que o usuario autenticado pode acompanhar.
 *
 * @param id             id numerico no cadastro — usado no topico de tempo real
 *                       ({@code /topic/realtime/unidades-sondas/{id}}). Estavel a renomeacoes.
 * @param idSondaUnidade nome cadastrado (ex.: SPT-144) — chave de correlacao do historico no
 *                       InfluxDB. Mantido para a consulta de series.
 * @param nome           nome de exibicao
 * @param apelido        apelido opcional
 */
public record SondaDisponivelDTO(
        Long id,
        String idSondaUnidade,
        String nome,
        String apelido
) {}
