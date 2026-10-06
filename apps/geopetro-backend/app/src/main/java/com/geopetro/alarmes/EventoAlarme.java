package com.geopetro.alarmes;

import java.time.Instant;

import com.geopetro.cards.GrandezasDeCard.Grandeza;

/**
 * Um fato da vida de um alarme — RN-056, RN-076.
 *
 * <h2>Log de fatos, não linha mutável</h2>
 * Uma excursão que atravessa a atenção e chega à crítica é <b>um episódio que escala</b>: a escalada
 * é mais um fato, não um {@code UPDATE} sobre o anterior. O {@code episodioId} agrupa os fatos da
 * mesma excursão, e a tela de "o que está alarmando agora" é projeção deste log, não a sua fonte.
 *
 * <p><b>Vocabulário fechado em quatro fatos.</b> Um log cresce em complexidade pelo número de tipos,
 * não pelo de registros.
 *
 * <h2>⚠️ Um evento por excursão, não por leitura</h2>
 * A 1 leitura/s, uma pressão dez minutos acima do limite geraria 600 registros — e nenhuma tela de
 * histórico sobrevive a isso. O que entra aqui é a <b>transição</b>: abriu, escalou, reduziu,
 * fechou.
 *
 * @param episodioId    agrupa os fatos da mesma excursão; sobrevive à escalada e ao recuo
 * @param serie         qual das séries de um card de stroke (RN-098); {@code null} nos demais tipos
 * @param severidade    no {@code FECHOU}, a severidade que o episódio tinha ao terminar
 * @param valor         a leitura que provocou o fato
 * @param limiteViolado qual lado da faixa foi rompido
 */
public record EventoAlarme(Long id, String episodioId, long unidadeSondaId, String dispositivoId,
		String serie, Tipo tipo, Severidade severidade, Instant ocorridoEm, double valor,
		LimiteViolado limiteViolado) {

	public Grandeza grandeza() {
		return new Grandeza(dispositivoId, serie);
	}

	/** O que aconteceu com o episódio. */
	public enum Tipo {
		ABRIU, ESCALOU, REDUZIU, FECHOU
	}

	/**
	 * Dois níveis — RN-071.
	 *
	 * <p>A ordem importa: é ela que decide se uma transição é <b>subida</b> — e portanto espera
	 * {@code segundosParaAbrir} — ou <b>descida</b>, que espera {@code segundosParaFechar}.
	 */
	public enum Severidade {
		ATENCAO, CRITICO;

		/** {@code null} é "dentro da faixa", e vale zero. */
		static int ordem(Severidade severidade) {
			return severidade == null ? 0 : severidade.ordinal() + 1;
		}
	}

	public enum LimiteViolado {
		MIN, MAX
	}
}
