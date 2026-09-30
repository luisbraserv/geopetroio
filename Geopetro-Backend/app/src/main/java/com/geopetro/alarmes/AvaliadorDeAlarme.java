package com.geopetro.alarmes;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import com.geopetro.alarmes.EventoAlarme.LimiteViolado;
import com.geopetro.alarmes.EventoAlarme.Severidade;
import com.geopetro.alarmes.EventoAlarme.Tipo;
import com.geopetro.configuracaosonda.ConfiguracaoSonda.Limite;

/**
 * A regra do alarme, sem Spring, sem banco e sem relógio próprio — RN-068, RN-071.
 *
 * <h2>Por que é função pura</h2>
 * Toda a dificuldade do alarme está aqui: quando uma leitura vira fato e quando não vira. Uma
 * função de {@code (estado, limite, valor, instante)} para {@code (estado, evento?)} se testa com
 * uma sequência de leituras e um relógio de mentira, sem subir contexto nem esperar segundos de
 * verdade. O {@link MotorDeAlarmes} cuida do resto: de onde vem a leitura, onde o estado mora e
 * quem grava o evento.
 *
 * <h2>⚠️ O tempo mínimo vale nas duas direções, e são dois tempos diferentes</h2>
 * Subir de severidade — abrir ou escalar — espera {@code segundosParaAbrir} sustentados. Descer —
 * reduzir ou fechar — espera {@code segundosParaFechar}. Sem isso, um valor tremendo na fronteira
 * geraria um par abriu/fechou por segundo, e o histórico viraria ruído que ensina o operador a
 * ignorar o alarme.
 *
 * <p>O tempo conta desde que as <b>leituras</b> passaram a mostrar a nova severidade, não desde a
 * última transição: uma excursão que vai e volta dentro da janela nunca completa a contagem, que é
 * exatamente o que se quer.
 *
 * <h2>Abrir direto em crítico é um fato só</h2>
 * Uma pressão que salta da faixa para além do limite crítico produz <b>um</b> {@code ABRIU} com
 * severidade {@code CRITICO} — não um {@code ABRIU} em atenção seguido de {@code ESCALOU}. Inventar
 * a escalada seria registrar um fato que não houve.
 */
public final class AvaliadorDeAlarme {

	private AvaliadorDeAlarme() {
	}

	/**
	 * O que se sabe de uma grandeza entre uma leitura e a seguinte.
	 *
	 * @param episodioId  {@code null} quando não há episódio aberto
	 * @param abertoEm    quando o episódio abriu — sobrevive à escalada e ao recuo, e é o "desde"
	 *                    que a tela mostra; não confundir com {@code desde}
	 * @param confirmada  a severidade que já virou fato; {@code null} é dentro da faixa
	 * @param observada   a severidade que as leituras vêm mostrando — candidata, ainda não é fato
	 * @param desde       desde quando as leituras mostram {@code observada}
	 * @param valorExtremo o pior valor do episódio, na direção violada
	 */
	public record Estado(String episodioId, Instant abertoEm, Severidade confirmada, Severidade observada,
			Instant desde, Double valorExtremo, LimiteViolado limiteViolado) {

		public static Estado inicial() {
			return new Estado(null, null, null, null, null, null, null);
		}

		public boolean temEpisodioAberto() {
			return episodioId != null;
		}
	}

	/**
	 * O pior valor de um episódio, para gravar <b>fora</b> do log de fatos — RN-076.
	 *
	 * <h2>⚠️ Por que o extremo não cabe no evento</h2>
	 * O log guarda <b>transições</b>, e o pico costuma acontecer entre duas delas: 130 abre, 200 não
	 * muda severidade nenhuma e não gera fato, 90 fecha. Ler o extremo dos fatos devolveria 130 —
	 * subestimando a excursão com todas as leituras tendo chegado corretamente ao servidor.
	 *
	 * <p>Guardar o pico <b>dentro</b> do evento confundiria duas coisas diferentes: {@code valor} é a
	 * leitura que provocou o fato, e continua sendo. O extremo é do episódio, não do fato — por isso
	 * viaja separado, para uma linha por episódio que o motor atualiza enquanto ele estiver aberto.
	 */
	public record Extremo(String episodioId, long unidadeSondaId, double valor, LimiteViolado limiteViolado) {
	}

	/**
	 * @param evento  {@code null} quando a leitura não mudou nada — o caso comum
	 * @param extremo o pior valor do episódio tocado por esta leitura; {@code null} quando não há
	 *                episódio nenhum envolvido. Vem preenchido também no {@code FECHOU}, onde o
	 *                estado já foi zerado mas o pico da excursão ainda precisa ficar gravado
	 */
	public record Resultado(Estado estado, EventoAlarme evento, Extremo extremo) {
	}

	public static Resultado avaliar(Estado anterior, Limite limite, long unidadeSondaId, double valor,
			Instant agora) {
		Estado estado = anterior == null ? Estado.inicial() : anterior;
		Severidade lida = severidadeDe(limite, valor);
		LimiteViolado violado = lida == null ? estado.limiteViolado() : ladoViolado(limite, valor);

		// A contagem reinicia quando a leitura muda de severidade — e so ai.
		Instant desde = estado.observada() == lida && estado.desde() != null ? estado.desde() : agora;
		Double extremo = extremo(estado, violado, valor, lida);
		Estado observando = new Estado(estado.episodioId(), estado.abertoEm(), estado.confirmada(), lida, desde,
				extremo, violado);

		if (lida == estado.confirmada() || !tempoCumprido(limite, estado.confirmada(), lida, desde, agora)) {
			// Sem transicao, mas o extremo pode ter avancado — e este e exatamente o caso que o log
			// de fatos nao registra sozinho.
			return new Resultado(observando, null, extremoDe(observando, unidadeSondaId));
		}
		return transicao(observando, limite, unidadeSondaId, valor, agora, lida, violado);
	}

	/** {@code null} quando não há episódio aberto: não há excursão de que falar. */
	private static Extremo extremoDe(Estado estado, long unidadeSondaId) {
		return estado.temEpisodioAberto() && estado.valorExtremo() != null
				? new Extremo(estado.episodioId(), unidadeSondaId, estado.valorExtremo(), estado.limiteViolado())
				: null;
	}

	/**
	 * A leitura deixou de ser candidata e virou fato.
	 *
	 * <p>O {@code episodioId} nasce no {@code ABRIU} e morre no {@code FECHOU}: escalar e reduzir
	 * acontecem <b>dentro</b> do mesmo episódio, que é o que permite contar uma excursão como uma.
	 */
	private static Resultado transicao(Estado estado, Limite limite, long unidadeSondaId, double valor,
			Instant agora, Severidade lida, LimiteViolado violado) {
		Tipo tipo = tipoDaTransicao(estado.confirmada(), lida);
		String episodioId = tipo == Tipo.ABRIU ? UUID.randomUUID().toString() : estado.episodioId();
		Instant abertoEm = tipo == Tipo.ABRIU ? agora : estado.abertoEm();

		// No FECHOU o evento carrega a severidade e o lado que o episodio tinha ao terminar: "fechou"
		// sozinho nao diria de que excursao se trata.
		Severidade severidade = tipo == Tipo.FECHOU ? estado.confirmada() : lida;
		LimiteViolado lado = tipo == Tipo.FECHOU ? estado.limiteViolado() : violado;

		var evento = new EventoAlarme(null, episodioId, unidadeSondaId, limite.dispositivoId(), limite.serie(),
				tipo, severidade, agora, valor, lado);

		Estado depois = tipo == Tipo.FECHOU
				? new Estado(null, null, null, null, agora, null, null)
				: new Estado(episodioId, abertoEm, lida, lida, estado.desde(), estado.valorExtremo(), violado);

		// No FECHOU o estado ja foi zerado, mas o pico da excursao e justamente o que o historico
		// precisa: ele vem de `estado`, que ainda o carrega, e nao de `depois`.
		Extremo extremo = estado.valorExtremo() == null ? null
				: new Extremo(episodioId, unidadeSondaId, estado.valorExtremo(),
						tipo == Tipo.FECHOU ? estado.limiteViolado() : violado);
		return new Resultado(depois, evento, extremo);
	}

	/**
	 * Encerra um episódio sem esperar tempo nenhum, porque ninguém está mais vigiando a grandeza.
	 *
	 * <p>Acontece quando o limite é desativado ou apagado com um alarme aberto. ⚠️ A alternativa era
	 * deixar o episódio aberto para sempre: ele apareceria na tela de alarmes ativos indefinidamente,
	 * sobre um limite que já não existe, e nada no sistema o fecharia.
	 *
	 * <p>O {@code FECHOU} registra o valor extremo do episódio, não uma leitura nova — não houve
	 * leitura nenhuma: o que mudou foi a configuração.
	 */
	public static Resultado encerrar(Estado estado, long unidadeSondaId, String dispositivoId, String serie,
			Instant agora) {
		if (estado == null || !estado.temEpisodioAberto()) {
			return new Resultado(estado == null ? Estado.inicial() : estado, null, null);
		}
		// valorExtremo e nao-nulo sempre que ha episodio aberto: ele nasce na leitura que abriu, e a
		// reconstrucao o traz da linha de extremo do episodio. Deixar estourar aqui e melhor que
		// inventar um numero — o log de eventos nao aceita valor que ninguem mediu.
		var evento = new EventoAlarme(null, estado.episodioId(), unidadeSondaId, dispositivoId, serie,
				Tipo.FECHOU, estado.confirmada(), agora, estado.valorExtremo(), estado.limiteViolado());
		var extremo = new Extremo(estado.episodioId(), unidadeSondaId, estado.valorExtremo(),
				estado.limiteViolado());
		return new Resultado(Estado.inicial(), evento, extremo);
	}

	private static Tipo tipoDaTransicao(Severidade confirmada, Severidade lida) {
		if (confirmada == null) {
			return Tipo.ABRIU;
		}
		if (lida == null) {
			return Tipo.FECHOU;
		}
		return Severidade.ordem(lida) > Severidade.ordem(confirmada) ? Tipo.ESCALOU : Tipo.REDUZIU;
	}

	/** Subir espera o tempo de abrir; descer, o de fechar. */
	private static boolean tempoCumprido(Limite limite, Severidade confirmada, Severidade lida, Instant desde,
			Instant agora) {
		int segundos = Severidade.ordem(lida) > Severidade.ordem(confirmada)
				? limite.segundosParaAbrir()
				: limite.segundosParaFechar();
		return !Duration.between(desde, agora).minusSeconds(segundos).isNegative();
	}

	/**
	 * O pior valor do episódio, na direção que está sendo violada.
	 *
	 * <p>Recomeça quando o lado violado troca: um episódio que abriu por máximo e desabou abaixo do
	 * mínimo teria como "extremo" o pico antigo, que já não descreve o que está acontecendo.
	 */
	private static Double extremo(Estado estado, LimiteViolado violado, double valor, Severidade lida) {
		if (lida == null && !estado.temEpisodioAberto()) {
			return null;
		}
		if (estado.valorExtremo() == null || violado != estado.limiteViolado()) {
			return valor;
		}
		return violado == LimiteViolado.MIN
				? Math.min(estado.valorExtremo(), valor)
				: Math.max(estado.valorExtremo(), valor);
	}

	/** Fora do crítico é crítico; fora da atenção é atenção; o resto é dentro da faixa. */
	static Severidade severidadeDe(Limite limite, double valor) {
		if (abaixo(valor, limite.minimoCritico()) || acima(valor, limite.maximoCritico())) {
			return Severidade.CRITICO;
		}
		if (abaixo(valor, limite.minimoAtencao()) || acima(valor, limite.maximoAtencao())) {
			return Severidade.ATENCAO;
		}
		return null;
	}

	private static LimiteViolado ladoViolado(Limite limite, double valor) {
		boolean porBaixo = abaixo(valor, limite.minimoCritico()) || abaixo(valor, limite.minimoAtencao());
		return porBaixo ? LimiteViolado.MIN : LimiteViolado.MAX;
	}

	private static boolean abaixo(double valor, Double minimo) {
		return minimo != null && valor < minimo;
	}

	private static boolean acima(double valor, Double maximo) {
		return maximo != null && valor > maximo;
	}
}
