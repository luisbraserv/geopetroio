package com.example.demo.services;

import java.time.Instant;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.example.demo.services.AlarmesDaEstacao.AlarmeLocal;
import com.example.demo.services.AvaliadorLocalDeAlarme.Estado;
import com.example.demo.services.AvaliadorLocalDeAlarme.Severidade;
import com.example.demo.services.LeituraDeCards.Grandeza;

/**
 * O alarme da estação — passo 3 de {@code specs/features/alarmes.md}.
 *
 * <h2>⚠️ Sinaliza, e não registra</h2>
 * <b>Nada aqui é gravado ou publicado.</b> O histórico de eventos tem um produtor só, o Backend
 * (§3 da spec): dois produtores exigiriam deduplicação por janela de tempo, com relógios diferentes
 * nos dois lados. O que esta classe guarda vive em memória e morre com o processo.
 *
 * <h2>Funciona sem rede, e é esse o ponto</h2>
 * A faixa vem de {@link AlarmesDaEstacao} — configuração <b>desta estação</b>, gravada em disco
 * aqui mesmo ({@code specs/features/configuracao-da-estacao.md §3}). Não há documento remoto no
 * caminho: uma sonda que nunca teve internet continua lendo o CLP, convertendo e alarmando.
 *
 * <p>⚠️ <b>Isto mudou.</b> Até 2026-09-09 a faixa vinha do documento de limites do servidor, e uma
 * unidade que nunca o recebeu não alarmava nada — o beep desta máquina dependia de uma volta pela
 * rede para responder o que já estava respondido aqui.
 *
 * <h2>⚠️ A estação vê mais que o servidor</h2>
 * Aqui entram <b>todos os cards ativos</b>, inclusive os invisíveis. O servidor avalia pelo canal de
 * tempo real, que só carrega os visíveis (RN-037 encontrando RN-102), então grandeza de card
 * invisível só é vigiada <b>na sonda</b>. É o que reduz o alcance de {@code OQ-050} — e depende de o
 * dashboard continuar mostrando card ativo invisível, sem o que essas grandezas ficariam sem alarme
 * em lugar nenhum.
 */
@Service
public class AlarmesLocais {

	private static final Logger logger = LoggerFactory.getLogger(AlarmesLocais.class);

	private final SinalSonoro sinal;
	private final AlarmesDaEstacao alarmes;

	/** Estado por grandeza, entre um ciclo e o seguinte. */
	private final Map<String, Estado> estados = new ConcurrentHashMap<>();

	/** O que vale agora, para a tela ler sem recalcular nada. */
	private volatile Map<String, Severidade> vigentes = Map.of();

	public AlarmesLocais(SinalSonoro sinal, AlarmesDaEstacao alarmes) {
		this.sinal = sinal;
		this.alarmes = alarmes;
	}

	/**
	 * Avalia um ciclo de leituras contra os alarmes configurados <b>nesta estação</b>.
	 *
	 * <p>Grandeza sem valor não é avaliada: não houve medição, e RN-099 já diz que a ausência é
	 * lacuna honesta. Tratá-la como dentro da faixa apagaria um alarme aceso por falta de dado.
	 *
	 * <p>Estação sem alarme configurado não alarma nada — estado normal, e não pendência.
	 */
	public void avaliar(List<Grandeza> grandezas, Instant agora) {
		Map<String, AlarmeLocal> vigiadas = alarmes.vigiadas();
		var presentes = new HashSet<String>();
		boolean agravou = false;

		for (Grandeza grandeza : grandezas == null ? List.<Grandeza>of() : grandezas) {
			// ⚠️ Grandeza sem valor NAO e avaliada, e por isso nao apaga o que estava aceso. Nao
			// houve medicao que desminta o alarme; trata-la como dentro da faixa apagaria o
			// destaque por FALTA DE DADO — o oposto do que RN-099 estabelece.
			if (grandeza == null) {
				continue;
			}
			// ⚠️ O card entrou no ciclo, entao ele existe e esta ATIVO. Isto vale mesmo sem valor:
			// e o que distingue "faltou a medicao agora" de "o card saiu do documento" — o primeiro
			// conserva o destaque, o segundo o apaga.
			String chave = chave(grandeza);
			presentes.add(chave);

			if (!grandeza.temValor()) {
				continue;
			}
			AlarmeLocal alarme = vigiadas.get(chave);
			if (alarme == null) {
				continue;
			}
			Estado anterior = estados.get(chave);
			Estado atual = AvaliadorLocalDeAlarme.avaliar(anterior, alarme.comoFaixa(), grandeza.valor(), agora);
			estados.put(chave, atual);

			if (piorou(anterior, atual)) {
				agravou = true;
				logger.info("Alarme local {} em {} valor={}", atual.confirmada(), chave, grandeza.valor());
			}
		}

		// Grandeza que deixou de ser vigiada — alarme apagado ou desligado no sininho — perde o
		// estado: manter o destaque de algo que ninguem mais vigia seria mentira na tela.
		//
		// ⚠️ E tambem a que saiu do ciclo, porque o card foi DESATIVADO: o alarme local hiberna
		// junto com ele (RN-091), como o limite remoto ja hibernava. Sem esta segunda condicao o
		// destaque de um card desativado ficaria aceso para sempre — ele nunca mais voltaria ao
		// ciclo para se desmentir.
		estados.keySet().removeIf(chave -> !vigiadas.containsKey(chave) || !presentes.contains(chave));

		// O que a tela le sai do ESTADO, e nao do ciclo: assim uma grandeza que faltou neste ciclo
		// conserva o destaque que ja tinha.
		var novos = new LinkedHashMap<String, Severidade>();
		estados.forEach((chave, estado) -> {
			if (estado.confirmada() != null) {
				novos.put(chave, estado.confirmada());
			}
		});
		vigentes = Map.copyOf(novos);

		if (agravou) {
			sinal.alertar();
		}
	}

	/** A severidade que vale para esta grandeza agora, ou {@code null} se está dentro da faixa. */
	public Severidade severidadeDe(Grandeza grandeza) {
		return grandeza == null ? null : vigentes.get(chave(grandeza));
	}

	/** A pior severidade acesa na unidade, para um aviso único no topo da tela. */
	public Severidade pior() {
		Severidade pior = null;
		for (Severidade severidade : vigentes.values()) {
			if (Severidade.ordem(severidade) > Severidade.ordem(pior)) {
				pior = severidade;
			}
		}
		return pior;
	}

	public int quantidade() {
		return vigentes.size();
	}

	/**
	 * ⚠️ O som toca no <b>agravamento</b>, não enquanto o alarme durar.
	 *
	 * <p>Repetir a cada ciclo seria um bipe por segundo — o operador desligaria o som da estação, e
	 * aí o próximo alarme não avisaria ninguém.
	 */
	private static boolean piorou(Estado anterior, Estado atual) {
		int antes = Severidade.ordem(anterior == null ? null : anterior.confirmada());
		return Severidade.ordem(atual.confirmada()) > antes;
	}


	/** A mesma chave do limite: as três séries de um contador compartilham o id (RN-098). */
	private static String chave(Grandeza grandeza) {
		String serie = grandeza.serie();
		return serie == null || serie.isBlank()
				? grandeza.dispositivoId()
				: grandeza.dispositivoId() + "|" + serie;
	}
}
