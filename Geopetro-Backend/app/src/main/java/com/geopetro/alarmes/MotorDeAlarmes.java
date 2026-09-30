package com.geopetro.alarmes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.locks.Lock;
import java.util.concurrent.locks.ReentrantLock;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionTemplate;

import com.geopetro.alarmes.AvaliadorDeAlarme.Estado;
import com.geopetro.alarmes.AvaliadorDeAlarme.Extremo;
import com.geopetro.alarmes.AvaliadorDeAlarme.Resultado;
import com.geopetro.configuracaosonda.ConfiguracaoSonda.Limite;
import com.geopetro.configuracaosonda.LimitesDeclarados;
import com.geopetro.realtime.dto.EstadoRealtimeDTO.LeituraRealtimeDTO;

/**
 * O servidor avaliando o que a sonda publica — passo 2 de {@code specs/features/alarmes.md}.
 *
 * <h2>De onde vem a leitura</h2>
 * Do canal de tempo real, que é o <b>único caminho por onde o Backend recebe leitura sem pedir</b>.
 * O histórico vai por MQTT direto à Telemetria, e o Backend só o consulta sob demanda: esperar por
 * ali seria transformar uma consulta em gatilho.
 *
 * <p>⚠️ <b>O custo dessa escolha:</b> o canal de tempo real é declaradamente com perda
 * ({@code websocket-realtime.md}). Sonda com a conexão caída não alarma no servidor, ainda que o
 * MQTT siga gravando. Isso é coerente com {@link com.geopetro.alarmes.EventoAlarme} — silêncio não é
 * alarme (RN-070) — mas <b>não</b> é o mesmo que dizer que nada se perde.
 *
 * <p>⚠️ <b>Segunda consequência, menos óbvia:</b> o tempo real carrega só cards <b>visíveis</b>
 * (RN-037). Um card ativo e invisível é lido e gravado na borda, e nunca chega aqui — então um
 * limite sobre ele nunca dispara. Hoje a visibilidade controla, sem dizer, o que é vigiado.
 *
 * <h2>O relógio é o do servidor</h2>
 * {@code ocorridoEm} e a contagem dos tempos mínimos usam o instante de recepção, não o
 * {@code timestamp} da mensagem. O histórico tem um relógio só: uma estação com a hora errada não
 * embaralha a ordem dos eventos da frota nem faz um tempo mínimo vencer na hora. O preço é o atraso
 * de rede embutido no instante do fato — e num canal de "agora" ele é pequeno.
 *
 * <h2>Estado em memória, log em disco</h2>
 * A projeção do que está alarmando vive num mapa; a verdade vive no log. Ao subir, o mapa é
 * reconstruído a partir dos episódios que nunca fecharam — sem isso, um reinício no meio de uma
 * excursão faria a próxima leitura abrir um <b>segundo</b> episódio para a mesma excursão.
 *
 * <h2>⚠️ A projeção só muda depois do commit</h2>
 * A transação é <b>explícita</b>, e não uma anotação: {@code saveAll} ter retornado não prova que a
 * transação confirmou. Com {@code @Transactional}, uma falha na confirmação deixava a memória
 * dizendo que o alarme abriu e o banco sem evento nenhum — tela e histórico divergindo, e a próxima
 * leitura na mesma severidade sem gerar outro {@code ABRIU}, porque a memória já o considerava
 * ocorrido. Aqui o mapa só é tocado <b>depois</b> de {@code execute} retornar, isto é, depois do
 * commit; se ele estourar, a memória fica como estava e a próxima leitura de fato tenta de novo.
 *
 * <h2>⚠️ Uma unidade de cada vez</h2>
 * {@code setPreserveReceiveOrder} ordena as mensagens de <b>uma sessão</b>. Duas sessões STOMP da
 * mesma unidade — uma estação reconectando antes de a anterior cair, ou duas instalações apontadas
 * ao mesmo id — correriam uma contra a outra: as duas leriam o mapa sem episódio e abririam dois.
 * A trava por unidade cobre a avaliação inteira, <b>incluindo o commit</b>, e não custa nada às
 * demais unidades, que têm travas próprias.
 */
@Service
public class MotorDeAlarmes {

	private static final Logger log = LoggerFactory.getLogger(MotorDeAlarmes.class);

	/** Identidade da grandeza vigiada: unidade mais {@code dispositivoId} mais série (RN-098). */
	private record Chave(long unidadeSondaId, String dispositivoId, String serie) {
		static Chave de(long unidadeSondaId, Limite limite) {
			return new Chave(unidadeSondaId, limite.dispositivoId(), normalizar(limite.serie()));
		}
	}

	/** O que um ciclo produziu e ainda não publicou na projeção. */
	private record Ciclo(Map<Chave, Estado> atualizados) {
	}

	private final Map<Chave, Estado> estados = new ConcurrentHashMap<>();
	private final Map<Long, Lock> travas = new ConcurrentHashMap<>();
	private final EventoAlarmeRepository eventos;
	private final ExtremoDoEpisodioRepository extremos;
	private final LimitesDeclarados limites;
	private final TransactionTemplate transacoes;

	/** {@code @Autowired} porque há dois construtores: sem ele o Spring não escolhe nenhum. */
	@Autowired
	public MotorDeAlarmes(EventoAlarmeRepository eventos, ExtremoDoEpisodioRepository extremos,
			LimitesDeclarados limites, PlatformTransactionManager gerenciador) {
		this(eventos, extremos, limites, new TransactionTemplate(gerenciador));
	}

	/** Recebe o template pronto para o teste poder injetar uma transação que falha ao confirmar. */
	MotorDeAlarmes(EventoAlarmeRepository eventos, ExtremoDoEpisodioRepository extremos,
			LimitesDeclarados limites, TransactionTemplate transacoes) {
		this.eventos = eventos;
		this.extremos = extremos;
		this.limites = limites;
		this.transacoes = transacoes;
	}

	/**
	 * Avalia um ciclo de leituras de uma unidade.
	 *
	 * @return o que está alarmando <b>depois</b> deste ciclo — é o que viaja junto das leituras que
	 *         o provocaram, para o destaque na tela nunca descrever a leitura anterior
	 */
	public List<AlarmeAtivo> avaliar(long unidadeSondaId, List<LeituraRealtimeDTO> leituras) {
		Lock trava = travas.computeIfAbsent(unidadeSondaId, id -> new ReentrantLock());
		trava.lock();
		try {
			Ciclo ciclo = transacoes.execute(status -> gravar(unidadeSondaId, leituras));
			// Aqui a transacao ja confirmou: so agora a tela pode falar de um episodio que existe.
			if (ciclo != null) {
				estados.putAll(ciclo.atualizados());
			}
			return ativos(unidadeSondaId);
		} finally {
			trava.unlock();
		}
	}

	/** Roda dentro da transação: calcula e grava, sem tocar na projeção. */
	private Ciclo gravar(long unidadeSondaId, List<LeituraRealtimeDTO> leituras) {
		Map<Chave, Limite> vigiadas = vigiadas(unidadeSondaId);
		Instant agora = Instant.now();
		var registrados = new ArrayList<EventoAlarme>();
		var picos = new LinkedHashMap<String, Extremo>();
		var atualizados = new HashMap<Chave, Estado>();

		for (LeituraRealtimeDTO leitura : leituras == null ? List.<LeituraRealtimeDTO>of() : leituras) {
			// Grandeza sem valor nao e publicada (RN-099); se vier, nao e medicao e nao alarma.
			if (leitura == null || leitura.valor() == null || !Double.isFinite(leitura.valor())) {
				continue;
			}
			var chave = new Chave(unidadeSondaId, leitura.dispositivoId(), normalizar(leitura.serie()));
			Limite limite = vigiadas.get(chave);
			if (limite == null) {
				continue;
			}
			// ⚠️ O estado de partida sai de `atualizados` antes de `estados`: duas leituras da mesma
			// identidade no mesmo ciclo enxergariam ambas o mapa anterior — vazio — e abririam dois
			// episodios para uma excursao so, um deles sem estado que o feche depois.
			Estado anterior = atualizados.containsKey(chave) ? atualizados.get(chave) : estados.get(chave);
			Resultado resultado = AvaliadorDeAlarme.avaliar(anterior, limite, unidadeSondaId,
					leitura.valor(), agora);
			atualizados.put(chave, resultado.estado());
			if (resultado.evento() != null) {
				registrados.add(resultado.evento());
			}
			registrarPico(picos, resultado.extremo(), anterior);
		}
		encerrarOrfaos(unidadeSondaId, vigiadas, agora, registrados, picos, atualizados);
		persistir(registrados, picos, agora);
		return new Ciclo(atualizados);
	}

	/**
	 * Guarda o extremo só quando ele muda.
	 *
	 * <p>Uma pressão dez minutos acima do limite produz uma escrita na abertura e mais uma a cada
	 * novo recorde — não uma por leitura. Um valor que oscila sem bater o pico anterior não escreve
	 * nada.
	 */
	private void registrarPico(Map<String, Extremo> picos, Extremo extremo, Estado anterior) {
		if (extremo == null) {
			return;
		}
		boolean mesmoEpisodio = anterior != null && extremo.episodioId().equals(anterior.episodioId());
		if (mesmoEpisodio && Objects.equals(anterior.valorExtremo(), extremo.valor())
				&& anterior.limiteViolado() == extremo.limiteViolado()) {
			return;
		}
		picos.put(extremo.episodioId(), extremo);
	}

	/**
	 * Fecha episódio de grandeza que deixou de ser vigiada.
	 *
	 * <p>Desativar ou apagar um limite com alarme aberto deixaria o episódio na tela para sempre,
	 * sobre um limite que já não existe — e nada no sistema o fecharia.
	 */
	private void encerrarOrfaos(long unidadeSondaId, Map<Chave, Limite> vigiadas, Instant agora,
			List<EventoAlarme> registrados, Map<String, Extremo> picos, Map<Chave, Estado> atualizados) {
		for (var entrada : estados.entrySet()) {
			Chave chave = entrada.getKey();
			if (chave.unidadeSondaId() != unidadeSondaId || vigiadas.containsKey(chave)
					|| !entrada.getValue().temEpisodioAberto()) {
				continue;
			}
			Resultado resultado = AvaliadorDeAlarme.encerrar(entrada.getValue(), unidadeSondaId,
					chave.dispositivoId(), chave.serie(), agora);
			atualizados.put(chave, resultado.estado());
			if (resultado.evento() != null) {
				registrados.add(resultado.evento());
			}
			registrarPico(picos, resultado.extremo(), entrada.getValue());
		}
	}

	/** Grava os fatos e os extremos. A projeção só muda depois de a transação confirmar. */
	private void persistir(List<EventoAlarme> registrados, Map<String, Extremo> picos, Instant agora) {
		if (!picos.isEmpty()) {
			// Antes dos fatos: um ABRIU sem a linha de extremo correspondente deixaria a
			// reconstrucao sem o valor de partida do episodio.
			extremos.saveAll(picos.values().stream()
					.map(extremo -> ExtremoDoEpisodioEntity.de(extremo, agora)).toList());
		}
		if (!registrados.isEmpty()) {
			eventos.saveAll(registrados.stream().map(EventoAlarmeEntity::de).toList());
			for (EventoAlarme evento : registrados) {
				log.info("Alarme {} {} em unidade={} grandeza={} valor={}", evento.tipo(), evento.severidade(),
						evento.unidadeSondaId(), evento.grandeza().chave(), evento.valor());
			}
		}
	}

	/** Só limite ativo vigia. Desativado não avalia, e o que estava aberto por ele fecha. */
	private Map<Chave, Limite> vigiadas(long unidadeSondaId) {
		var mapa = new HashMap<Chave, Limite>();
		for (Limite limite : limites.de(unidadeSondaId)) {
			if (limite != null && limite.ativo()) {
				mapa.put(Chave.de(unidadeSondaId, limite), limite);
			}
		}
		return mapa;
	}

	/** O que está alarmando agora numa unidade, do mais grave para o mais antigo. */
	public List<AlarmeAtivo> ativos(long unidadeSondaId) {
		var lista = new ArrayList<AlarmeAtivo>();
		estados.forEach((chave, estado) -> {
			if (chave.unidadeSondaId() == unidadeSondaId && estado.temEpisodioAberto()) {
				lista.add(new AlarmeAtivo(unidadeSondaId, chave.dispositivoId(), chave.serie(),
						estado.episodioId(), estado.confirmada(), estado.abertoEm(), estado.valorExtremo(),
						estado.limiteViolado()));
			}
		});
		lista.sort(Comparator
				.comparing((AlarmeAtivo a) -> -EventoAlarme.Severidade.ordem(a.severidadeAtual()))
				.thenComparing(AlarmeAtivo::desde));
		return List.copyOf(lista);
	}

	/**
	 * Reconstrói a projeção a partir dos episódios que nunca fecharam.
	 *
	 * <p>Roda no {@code ApplicationReadyEvent} e não no construtor: precisa do banco de pé. Falha aqui
	 * não impede a aplicação de subir — o motor volta com a memória limpa, o que é ruim mas visível
	 * no log, e melhor do que uma aplicação que não sobe por causa do histórico de alarmes.
	 *
	 * <p>⚠️ O extremo vem da <b>sua própria linha</b>, e não do último fato: reiniciar depois de uma
	 * leitura de 200 que não gerou transição nenhuma reduziria a projeção ao valor do {@code ABRIU}.
	 */
	@EventListener(ApplicationReadyEvent.class)
	@Transactional(readOnly = true)
	public void reconstruirProjecao() {
		try {
			var porEpisodio = new LinkedHashMap<String, List<EventoAlarme>>();
			for (EventoAlarmeEntity entity : eventos.fatosDosEpisodiosAbertos()) {
				porEpisodio.computeIfAbsent(entity.episodioId, id -> new ArrayList<>()).add(entity.paraDominio());
			}
			Map<String, ExtremoDoEpisodioEntity> picos = porEpisodio.isEmpty() ? Map.of()
					: indexarExtremos(porEpisodio.keySet());
			for (List<EventoAlarme> fatos : porEpisodio.values()) {
				EventoAlarme abertura = fatos.get(0);
				EventoAlarme atual = fatos.get(fatos.size() - 1);
				var chave = new Chave(atual.unidadeSondaId(), atual.dispositivoId(), normalizar(atual.serie()));
				ExtremoDoEpisodioEntity pico = picos.get(atual.episodioId());
				// `desde` recebe o instante do ultimo fato: a severidade vale desde entao, e o tempo
				// minimo da proxima transicao so comeca a contar quando a leitura mudar.
				estados.put(chave, new Estado(atual.episodioId(), abertura.ocorridoEm(), atual.severidade(),
						atual.severidade(), atual.ocorridoEm(),
						pico == null ? atual.valor() : pico.valor,
						pico == null ? atual.limiteViolado() : pico.limiteViolado));
			}
			if (!porEpisodio.isEmpty()) {
				log.info("Projecao de alarmes reconstruida: {} episodios abertos.", porEpisodio.size());
			}
		} catch (RuntimeException e) {
			log.error("Projecao de alarmes nao reconstruida; o motor sobe sem os episodios abertos.", e);
		}
	}

	private Map<String, ExtremoDoEpisodioEntity> indexarExtremos(Collection<String> episodioIds) {
		var mapa = new HashMap<String, ExtremoDoEpisodioEntity>();
		for (ExtremoDoEpisodioEntity entity : extremos.findByEpisodioIdIn(episodioIds)) {
			mapa.put(entity.episodioId, entity);
		}
		return mapa;
	}

	/**
	 * Série vazia e série ausente são a mesma coisa: card de uma grandeza só (RN-098).
	 *
	 * <p>Sem isto, um limite gravado com {@code ""} nunca casaria com a leitura que traz {@code null},
	 * e a grandeza ficaria sem vigilância sem que nada indicasse o motivo.
	 */
	private static String normalizar(String serie) {
		return serie == null || serie.isBlank() ? null : serie;
	}
}
