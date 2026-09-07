package com.example.demo.models;

import java.time.Instant;

/**
 * Estado instantaneo da sonda, publicado no canal de tempo real.
 *
 * <p>Record imutavel de proposito: e trocado entre a thread de leitura do CLP e o worker WebSocket
 * atraves de um {@code AtomicReference}. Sendo imutavel, a troca e segura sem lock nenhum — o worker
 * sempre le um estado coerente, nunca um meio-atualizado.
 *
 * @param unidadeSondaId  id da Unidade/Sonda no cadastro do Backend-Sonda
 * @param timestamp       instante da leitura, em UTC
 */
public record EstadoAtual(
		Long unidadeSondaId,
		Instant timestamp,
		double pesoColuna,
		double torqueTubos,
		double torqueFlutuante,
		double pressaoBomba,
		double vazao,
		long strokeAtual) {
}
