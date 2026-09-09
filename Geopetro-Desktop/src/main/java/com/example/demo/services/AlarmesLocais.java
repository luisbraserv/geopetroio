package com.example.demo.services;

import java.time.Instant;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.example.demo.models.ConfiguracaoSondaRemota;
import com.example.demo.models.ConfiguracaoSondaRemota.Limite;
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
 * Os limites chegam pelo canal de configuração e ficam em <b>cache em disco</b>
 * ({@code ConfiguracaoRemotaStore}). Uma sonda que perdeu a internet continua lendo o CLP,
 * convertendo e alarmando localmente — que é exatamente a situação em que o operador ao lado do
 * equipamento é a única pessoa que pode agir.
 *
 * <h2>⚠️ A estação vê mais que o servidor</h2>
 * Aqui entram <b>todos os cards ativos</b>, inclusive os invisíveis. O servidor avalia pelo canal de
 * tempo real, que só carrega os visíveis (RN-037 encontrando RN-102), então um limite sobre card
 * invisível dispara <b>na sonda</b> e não no servidor. Isso reduz o alcance de
 * {@code OQ-050} sem resolvê-la: a supervisão remota continua sem ver aquele alarme.
 */
@Service
public class AlarmesLocais {

	private static final Logger logger = LoggerFactory.getLogger(AlarmesLocais.class);

	private final SinalSonoro sinal;

	/** Estado por grandeza, entre um ciclo e o seguinte. */
	private final Map<String, Estado> estados = new ConcurrentHashMap<>();

	/** O que vale agora, para a tela ler sem recalcular nada. */
	private volatile Map<String, Severidade> vigentes = Map.of();

	public AlarmesLocais(SinalSonoro sinal) {
		this.sinal = sinal;
	}

	/**
	 * Avalia um ciclo de leituras contra os limites vigentes.
	 *
	 * <p>Grandeza sem valor não é avaliada: não houve medição, e RN-099 já diz que a ausência é
	 * lacuna honesta. Tratá-la como dentro da faixa apagaria um alarme aceso por falta de dado.
	 *
	 * @param limites documento vigente, ou {@code null} se ainda não chegou — e aí nada alarma,
	 *                que é o estado normal de uma sonda sem limite configurado
	 */
	public void avaliar(List<Grandeza> grandezas, ConfiguracaoSondaRemota limites, Instant agora) {
		Map<String, Limite> vigiadas = vigiadas(limites);
		boolean agravou = false;

		for (Grandeza grandeza : grandezas == null ? List.<Grandeza>of() : grandezas) {
			// ⚠️ Grandeza sem valor NAO e avaliada, e por isso nao apaga o que estava aceso. Nao
			// houve medicao que desminta o alarme; trata-la como dentro da faixa apagaria o
			// destaque por FALTA DE DADO — o oposto do que RN-099 estabelece.
			if (grandeza == null || !grandeza.temValor()) {
				continue;
			}
			String chave = chave(grandeza);
			Limite limite = vigiadas.get(chave);
			if (limite == null) {
				continue;
			}
			Estado anterior = estados.get(chave);
			Estado atual = AvaliadorLocalDeAlarme.avaliar(anterior, limite, grandeza.valor(), agora);
			estados.put(chave, atual);

			if (piorou(anterior, atual)) {
				agravou = true;
				logger.info("Alarme local {} em {} valor={}", atual.confirmada(), chave, grandeza.valor());
			}
		}

		// Grandeza que deixou de ser vigiada — limite apagado ou desativado — perde o estado:
		// manter o destaque de algo que ninguem mais vigia seria mentira na tela.
		estados.keySet().retainAll(vigiadas.keySet());

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

	/** Só limite ativo vigia; desativado hiberna com o card (RN-091). */
	private static Map<String, Limite> vigiadas(ConfiguracaoSondaRemota limites) {
		if (limites == null || limites.limites() == null) {
			return Map.of();
		}
		var mapa = new HashMap<String, Limite>();
		for (Limite limite : limites.limites()) {
			if (limite != null && limite.ativo()) {
				mapa.put(limite.chave(), limite);
			}
		}
		return mapa;
	}


	/** A mesma chave do limite: as três séries de um contador compartilham o id (RN-098). */
	private static String chave(Grandeza grandeza) {
		String serie = grandeza.serie();
		return serie == null || serie.isBlank()
				? grandeza.dispositivoId()
				: grandeza.dispositivoId() + "|" + serie;
	}
}
