package com.geopetro.alarmes;

import java.time.Instant;
import java.util.List;

import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;
import com.geopetro.alarmes.EventoAlarme.Tipo;

/**
 * Uma excursão inteira, montada a partir dos fatos que a compõem.
 *
 * <h2>Por que o histórico devolve episódios, e não os fatos crus</h2>
 * A supervisão pergunta <b>"quantas vezes a pressão saiu da faixa no turno?"</b>, não "quantas
 * linhas foram gravadas". Um episódio que abriu em atenção, escalou para crítico e fechou são
 * <b>três linhas e uma excursão</b> — devolver as três soltas obrigaria cada tela a reconstruir o
 * agrupamento, e a primeira que errasse contaria a mesma excursão como três alarmes.
 *
 * <p>Os {@code fatos} vão junto porque a sequência <b>é</b> a história: quando escalou e quando
 * recuou não se deduz do resumo.
 *
 * @param severidadeMaxima o pior que o episódio chegou a ser — não o que era ao fechar
 * @param fechadoEm        {@code null} enquanto o episódio não fechou
 * @param valorExtremo     o pior valor medido, na direção violada
 */
public record EpisodioAlarme(String episodioId, long unidadeSondaId, String dispositivoId, String serie,
		Severidade severidadeMaxima, LimiteViolado limiteViolado, Instant abertoEm, Instant fechadoEm,
		Double valorExtremo, List<Fato> fatos) {

	public EpisodioAlarme {
		fatos = List.copyOf(fatos);
	}

	/** Um fato da sequência, sem repetir a identidade que já está no episódio. */
	public record Fato(Tipo tipo, Severidade severidade, Instant ocorridoEm, double valor) {
	}

	public boolean aberto() {
		return fechadoEm == null;
	}

	/**
	 * Monta o episódio a partir dos seus fatos, <b>em ordem de gravação</b>.
	 *
	 * <p>⚠️ Os fatos precisam ser os do episódio <b>inteiro</b>, e não só os que caíram na janela
	 * consultada: um episódio que abriu antes do início da janela apareceria começando por
	 * {@code ESCALOU}, e a tela mostraria uma escalada sem a abertura que a explica.
	 *
	 * @param extremoGravado o pico vindo de {@link ExtremoDoEpisodioEntity}. ⚠️ <b>Ele é a resposta
	 *                       certa e os fatos não são</b>: o pico costuma acontecer entre duas
	 *                       transições e não gera fato nenhum — 130 abre, 200 não muda severidade,
	 *                       90 fecha, e olhar só os fatos devolveria 130. {@code null} apenas para
	 *                       episódio anterior à linha de extremo existir, e aí os fatos são o melhor
	 *                       disponível
	 */
	static EpisodioAlarme de(List<EventoAlarme> fatos, Double extremoGravado) {
		EventoAlarme abertura = fatos.get(0);
		EventoAlarme ultimo = fatos.get(fatos.size() - 1);

		Severidade maxima = abertura.severidade();
		for (EventoAlarme fato : fatos) {
			if (Severidade.ordem(fato.severidade()) > Severidade.ordem(maxima)) {
				maxima = fato.severidade();
			}
		}

		// A direcao vem da ABERTURA: e ela que descreve a excursao. Trocar de lado no meio do mesmo
		// episodio e possivel e exotico — e o resumo continua dizendo por onde ela comecou.
		LimiteViolado lado = abertura.limiteViolado();

		return new EpisodioAlarme(abertura.episodioId(), abertura.unidadeSondaId(), abertura.dispositivoId(),
				abertura.serie(), maxima, lado, abertura.ocorridoEm(),
				ultimo.tipo() == Tipo.FECHOU ? ultimo.ocorridoEm() : null,
				extremoGravado != null ? extremoGravado : extremo(fatos, lado),
				fatos.stream()
						.map(f -> new Fato(f.tipo(), f.severidade(), f.ocorridoEm(), f.valor()))
						.toList());
	}

	/**
	 * O pior valor <b>entre os fatos</b>, na direção violada — só para episódio sem linha de extremo.
	 *
	 * <p>⚠️ Isto <b>subestima</b> a excursão sempre que o pico aconteceu entre duas transições, que é
	 * o caso comum. Serve de último recurso para os episódios anteriores a
	 * {@link ExtremoDoEpisodioEntity} existir: o pico deles não foi gravado por ninguém e não volta.
	 *
	 * <p>O {@code FECHOU} entra na conta sem estragá-la: fechar significa ter voltado para dentro da
	 * faixa, e um valor de dentro nunca é mais extremo que um de fora, dos dois lados.
	 */
	private static Double extremo(List<EventoAlarme> fatos, LimiteViolado lado) {
		Double pior = null;
		for (EventoAlarme fato : fatos) {
			if (pior == null
					|| (lado == LimiteViolado.MIN ? fato.valor() < pior : fato.valor() > pior)) {
				pior = fato.valor();
			}
		}
		return pior;
	}
}
