package com.example.demo.models;

import java.time.Instant;
import java.util.List;

/**
 * Estado instantaneo da unidade, publicado no canal de tempo real.
 *
 * <p>Record imutavel de proposito: e trocado entre a thread de leitura do CLP e o worker WebSocket
 * atraves de um {@code AtomicReference}. Sendo imutavel, a troca e segura sem lock nenhum — o worker
 * sempre le um estado coerente, nunca um meio-atualizado.
 *
 * <h2>⚠️ Os campos fixos sairam — 2026-09-08</h2>
 * Ate aqui eram {@code pesoColuna}, {@code torqueTubos}, {@code torqueFlutuante},
 * {@code pressaoBomba}, {@code vazao} e {@code strokeAtual}. Com cards por unidade eles deixaram de
 * conseguir representar uma sonda: com dois cards de torque e um de temperatura, seriam uma
 * <b>verdade parcial se passando por completa</b>.
 *
 * <p>Contrato em {@code specs/SDD/software/apis/websocket-realtime.md §3}, mesma forma do MQTT. Isto
 * <b>quebra o consumidor Angular</b> ate o passo 8 — decisao registrada, com o custo a vista, em
 * {@code mqtt-telemetria.md §10}.
 *
 * @param unidadeSondaId id da Unidade/Sonda no cadastro do Geopetro-Backend
 * @param timestamp      instante da leitura, em UTC
 * @param leituras       so cards visiveis, e so grandezas com valor (RN-037, RN-099)
 */
public record EstadoAtual(
		Long unidadeSondaId,
		Instant timestamp,
		List<LeituraPublicada> leituras) {

	public EstadoAtual {
		leituras = leituras == null ? List.of() : List.copyOf(leituras);
	}
}
