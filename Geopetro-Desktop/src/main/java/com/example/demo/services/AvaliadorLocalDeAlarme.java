package com.example.demo.services;

import java.time.Duration;
import java.time.Instant;


/**
 * A regra do alarme na borda — RN-068, RN-071.
 *
 * <h2>⚠️ Isto é metade do avaliador do servidor, e de propósito</h2>
 * O Backend é o <b>único produtor do histórico de eventos</b>
 * ({@code specs/SDD/negocio/requisitos/alarmes.md §3}). A estação <b>sinaliza</b>: som e destaque na tela da
 * sonda, para quem está ao lado do equipamento. Por isso aqui não há {@code episodioId}, nem
 * {@code ABRIU/ESCALOU/REDUZIU/FECHOU}, nem gravação — só <b>que severidade vale agora</b>.
 *
 * <p>Dois produtores do mesmo evento exigiriam deduplicação por janela de tempo, com relógios
 * diferentes nos dois lados. O custo aceito é que uma excursão ocorrida com a sonda offline alerta
 * o operador local e <b>não entra no histórico</b>.
 *
 * <h2>⚠️ A mesma regra, escrita duas vezes</h2>
 * O tempo mínimo e os dois níveis precisam valer igual nos dois lados, ou o operador na sonda vê um
 * estado e a supervisão vê outro. Os projetos são repositórios independentes e não compartilham
 * biblioteca; o que impede a deriva são os testes dos dois lados exercitando a <b>mesma</b>
 * sequência de leituras. Mexer aqui sem mexer lá — ou o contrário — é o erro a evitar.
 *
 * <h2>O tempo mínimo vale nas duas direções</h2>
 * Subir de severidade espera {@code segundosParaAbrir}; descer espera {@code segundosParaFechar}. A
 * contagem reinicia quando a <b>leitura</b> muda de severidade, e não na última transição: uma
 * excursão que vai e volta dentro da janela nunca completa a contagem. Sem isso, um valor tremendo
 * na fronteira acenderia e apagaria o destaque a cada segundo.
 */
public final class AvaliadorLocalDeAlarme {

	private AvaliadorLocalDeAlarme() {
	}

	/**
	 * A faixa que a regra avalia — e nada além disso.
	 *
	 * <h2>Por que o avaliador tem tipo próprio</h2>
	 * Antes ele recebia o {@code Limite} do documento do servidor, e isso o amarrava a um documento
	 * remoto para decidir se o beep desta máquina toca. O alarme da estação passou a ser da estação
	 * ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3}), e a regra não deve saber de onde os
	 * números vieram: aqui entra a faixa, venha ela do sininho ou de qualquer outra origem futura.
	 *
	 * <p>Sem {@code dispositivoId} e sem {@code ativo} de propósito — identidade e liga/desliga são
	 * de quem guarda a configuração, não de quem aplica a regra.
	 */
	public record Faixa(Double minimoAtencao, Double maximoAtencao, Double minimoCritico, Double maximoCritico,
			int segundosParaAbrir, int segundosParaFechar) {
	}

	/** Dois níveis — RN-071. A ordem decide se a transição é subida ou descida. */
	public enum Severidade {
		ATENCAO, CRITICO;

		/** {@code null} é "dentro da faixa", e vale zero. */
		public static int ordem(Severidade severidade) {
			return severidade == null ? 0 : severidade.ordinal() + 1;
		}
	}

	/**
	 * O que se sabe de uma grandeza entre uma leitura e a seguinte.
	 *
	 * @param confirmada a severidade que já vale para a tela; {@code null} é dentro da faixa
	 * @param observada  o que as leituras vêm mostrando — candidata, ainda não vale
	 * @param desde      desde quando as leituras mostram {@code observada}
	 */
	public record Estado(Severidade confirmada, Severidade observada, Instant desde) {

		public static Estado inicial() {
			return new Estado(null, null, null);
		}
	}

	public static Estado avaliar(Estado anterior, Faixa faixa, double valor, Instant agora) {
		Estado estado = anterior == null ? Estado.inicial() : anterior;
		Severidade lida = severidadeDe(faixa, valor);

		Instant desde = estado.observada() == lida && estado.desde() != null ? estado.desde() : agora;

		if (lida == estado.confirmada() || !tempoCumprido(faixa, estado.confirmada(), lida, desde, agora)) {
			return new Estado(estado.confirmada(), lida, desde);
		}
		return new Estado(lida, lida, desde);
	}

	/** Fora do crítico é crítico; fora da atenção é atenção; o resto é dentro da faixa. */
	public static Severidade severidadeDe(Faixa faixa, double valor) {
		if (!Double.isFinite(valor)) {
			return null;
		}
		if (abaixo(valor, faixa.minimoCritico()) || acima(valor, faixa.maximoCritico())) {
			return Severidade.CRITICO;
		}
		if (abaixo(valor, faixa.minimoAtencao()) || acima(valor, faixa.maximoAtencao())) {
			return Severidade.ATENCAO;
		}
		return null;
	}

	private static boolean tempoCumprido(Faixa faixa, Severidade confirmada, Severidade lida, Instant desde,
			Instant agora) {
		int segundos = Severidade.ordem(lida) > Severidade.ordem(confirmada)
				? faixa.segundosParaAbrir()
				: faixa.segundosParaFechar();
		return !Duration.between(desde, agora).minusSeconds(segundos).isNegative();
	}

	private static boolean abaixo(double valor, Double minimo) {
		return minimo != null && valor < minimo;
	}

	private static boolean acima(double valor, Double maximo) {
		return maximo != null && valor > maximo;
	}
}
