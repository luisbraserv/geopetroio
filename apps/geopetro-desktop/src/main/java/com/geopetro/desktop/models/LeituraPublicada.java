package com.geopetro.desktop.models;

import com.fasterxml.jackson.annotation.JsonInclude;

/**
 * Uma leitura como ela viaja — MQTT e tempo real usam <b>a mesma forma</b>.
 *
 * <p>Contrato em
 * {@code specs/SDD/software/mqtt/mqtt-telemetria.md §3} e {@code websocket-realtime.md §3}. O que difere
 * entre os dois canais é o destino e a garantia, não o conteúdo: o MQTT entrega cada leitura (QoS 1),
 * o tempo real sobrescreve e descarta os estados intermediários de propósito.
 *
 * <h2>A mensagem se descreve — RN-097</h2>
 * O tipo e a unidade viajam junto do valor. É isso que permite cards por unidade: um consumidor que
 * dependesse de tabela fixa precisaria conhecer a configuração de cada sonda para gravar uma leitura,
 * e ficaria mudo diante do primeiro card de um tipo novo.
 *
 * <h2>⚠️ O nome NÃO está aqui, de propósito</h2>
 * É rótulo editável. Renomear "Bomba de Lama" para "Bomba 1" faria a mesma série aparecer com dois
 * nomes na mesma linha do tempo, sem nada dizendo qual valia quando. Quem identifica a série é o
 * {@code dispositivoId}, que é gerado e nunca muda (RN-081).
 *
 * @param serie      distingue as três grandezas de um card de stroke (RN-098); <b>ausente</b> no
 *                   JSON para card de uma grandeza só
 * @param enderecoDb onde foi lido <b>neste ciclo</b>. Vai na mensagem mesmo estando no documento: o
 *                   documento guarda o endereço <em>atual</em>, e mudar o {@code byteInicial} de um
 *                   card faria o histórico anterior ser atribuído ao endereço novo
 * @param valorBruto o que veio do CLP antes da conversão — permite reprocessar o histórico se uma
 *                   fórmula ou calibração for corrigida
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
public record LeituraPublicada(
		String dispositivoId,
		String serie,
		String tipo,
		String unidade,
		String enderecoDb,
		double valor,
		double valorBruto) {
}
