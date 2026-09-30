package com.geopetro.alarmes;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;

import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.core.exception.BusinessException;

/**
 * O que aconteceu — a leitura do log de eventos, agrupada em excursões.
 *
 * <h2>Três consultas, e as duas últimas são o que torna o resumo honesto</h2>
 * A primeira acha <b>quais episódios</b> tiveram algum fato na janela. A segunda traz os fatos
 * desses episódios <b>por inteiro</b>, sem recortá-los pela janela. A terceira traz o <b>pico</b> de
 * cada um.
 *
 * <p>⚠️ Sem a segunda, um episódio que abriu antes do início da janela apareceria começando por
 * {@code ESCALOU} — a tela mostraria uma escalada sem a abertura que a explica, e o "desde" seria a
 * hora errada.
 *
 * <p>⚠️ Sem a terceira, o extremo sairia dos fatos — e o pico de uma excursão quase nunca é um fato:
 * 130 abre, 200 não muda severidade e não registra nada, 90 fecha. O histórico diria 130.
 *
 * <h2>⚠️ A janela é obrigatória, e o resultado tem teto</h2>
 * O log é <i>append-only</i> e não tem política de retenção
 * ([OQ-051](../../../../../../specs/open-questions.md)). Uma consulta sem limite funcionaria bem por
 * meses e depois derrubaria a tela de uma sonda movimentada, sem nada anunciando a mudança. O teto é
 * declarado na resposta, então quem consultou sabe que está vendo uma parte.
 */
@Service
public class HistoricoDeAlarmes {

	/** Acima disto, a resposta vem cortada e o diz. Estreitar a janela é o caminho para ver mais. */
	static final int MAXIMO_EPISODIOS = 200;

	/** Janela máxima de consulta. Sem teto, um `inicio` de 1970 varreria a tabela inteira. */
	static final int MAXIMO_DIAS = 92;

	private final EventoAlarmeRepository eventos;
	private final ExtremoDoEpisodioRepository extremos;

	public HistoricoDeAlarmes(EventoAlarmeRepository eventos, ExtremoDoEpisodioRepository extremos) {
		this.eventos = eventos;
		this.extremos = extremos;
	}

	/**
	 * @param truncado {@code true} quando havia mais episódios do que o teto — a lista é a parte
	 *                 mais recente, e não o total
	 */
	public record Pagina(List<EpisodioAlarme> episodios, boolean truncado) {
	}

	@Transactional(readOnly = true)
	public Pagina consultar(long unidadeSondaId, Instant inicio, Instant fim) {
		validar(inicio, fim);

		// Pede um a mais que o teto: se vier, e porque havia mais, e nao ha segunda consulta so para
		// descobrir isso.
		List<String> ids = eventos.episodiosNaJanela(unidadeSondaId, inicio, fim,
				PageRequest.of(0, MAXIMO_EPISODIOS + 1));
		boolean truncado = ids.size() > MAXIMO_EPISODIOS;
		if (truncado) {
			ids = ids.subList(0, MAXIMO_EPISODIOS);
		}
		if (ids.isEmpty()) {
			return new Pagina(List.of(), false);
		}

		var porEpisodio = new LinkedHashMap<String, List<EventoAlarme>>();
		for (String id : ids) {
			// Pre-popula na ordem da consulta: e ela que define a ordem de exibicao, e o agrupamento
			// abaixo chega com os fatos em ordem de gravacao, nao de episodio.
			porEpisodio.put(id, new ArrayList<>());
		}
		for (EventoAlarmeEntity entity : eventos.findByEpisodioIdInOrderByIdAsc(ids)) {
			porEpisodio.get(entity.episodioId).add(entity.paraDominio());
		}

		// ⚠️ Terceira consulta, e ela e o que torna o extremo honesto: o pico costuma acontecer
		// entre duas transicoes e nao gera fato nenhum — deduzi-lo dos fatos subestima a excursao.
		var picos = new HashMap<String, Double>();
		for (ExtremoDoEpisodioEntity extremo : extremos.findByEpisodioIdIn(ids)) {
			picos.put(extremo.episodioId, extremo.valor);
		}

		var episodios = new ArrayList<EpisodioAlarme>(porEpisodio.size());
		for (var entrada : porEpisodio.entrySet()) {
			if (!entrada.getValue().isEmpty()) {
				episodios.add(EpisodioAlarme.de(entrada.getValue(), picos.get(entrada.getKey())));
			}
		}
		return new Pagina(List.copyOf(episodios), truncado);
	}

	private static void validar(Instant inicio, Instant fim) {
		if (inicio == null || fim == null || !inicio.isBefore(fim)) {
			throw new BusinessException("Informe um periodo com inicio anterior ao fim.");
		}
		if (inicio.plusSeconds(MAXIMO_DIAS * 86400L).isBefore(fim)) {
			throw new BusinessException("O periodo nao pode passar de " + MAXIMO_DIAS + " dias.");
		}
	}
}
