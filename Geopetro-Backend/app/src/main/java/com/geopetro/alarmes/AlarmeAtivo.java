package com.geopetro.alarmes;

import java.time.Instant;

import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;

/**
 * O que está alarmando agora — projeção, não fonte.
 *
 * <p>Responde à pergunta da tela ("o que está alarmando?"), que é diferente da pergunta do histórico
 * ("o que aconteceu?"). É <b>derivada</b> do log de eventos e reconstruível a partir dele: nada aqui
 * é verdade que não esteja lá.
 *
 * @param desde        quando o episódio abriu
 * @param valorExtremo o pior valor do episódio, na direção violada
 */
public record AlarmeAtivo(long unidadeSondaId, String dispositivoId, String serie, String episodioId,
		Severidade severidadeAtual, Instant desde, Double valorExtremo, LimiteViolado limiteViolado) {
}
