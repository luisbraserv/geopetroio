package com.geopetro.prontidao;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.geopetro.cards.CardsDeclarados;
import com.geopetro.configuracaosonda.LimitesDeclarados;
import com.geopetro.monitoramento.SondaMonitoramentoService;

/**
 * O estado de configuração da frota, unidade a unidade — [OQ-049].
 *
 * <h2>Três consultas, e não três por unidade</h2>
 * As unidades do usuário, os resumos de cards e os de limites vêm em consultas separadas e se
 * cruzam em memória. Perguntar documento por documento cresceria com a frota — e esta tela existe
 * justamente para ser aberta com a frota inteira à vista.
 *
 * <h2>⚠️ O escopo é o mesmo do monitoramento</h2>
 * Reaproveita {@link SondaMonitoramentoService#listarSondasDoUsuario}: perfis operacionais enxergam
 * a frota inteira, {@code CLIENTE} só as sondas concedidas (RN-047). Uma lista própria aqui
 * divergiria da outra na primeira mudança de regra — e vazaria a existência de sondas de outro
 * cliente, ainda que só pelo nome.
 *
 * <p>Unidade sem documento nenhum aparece com revisão {@code 0} e contadores zerados. <b>Ela precisa
 * aparecer</b>: é exatamente a unidade que a tela existe para encontrar.
 */
@Service
public class ProntidaoService {

	private final SondaMonitoramentoService sondas;
	private final CardsDeclarados cards;
	private final LimitesDeclarados limites;

	public ProntidaoService(SondaMonitoramentoService sondas, CardsDeclarados cards,
			LimitesDeclarados limites) {
		this.sondas = sondas;
		this.cards = cards;
		this.limites = limites;
	}

	@Transactional(readOnly = true)
	public List<ProntidaoDaUnidade> daFrota(String username) {
		Map<Long, CardsDeclarados.Resumo> porCards = indexar(cards.resumos(),
				CardsDeclarados.Resumo::unidadeSondaId);
		Map<Long, LimitesDeclarados.Resumo> porLimites = indexar(limites.resumos(),
				LimitesDeclarados.Resumo::unidadeSondaId);

		return sondas.listarSondasDoUsuario(username).stream().map(sonda -> {
			var card = porCards.get(sonda.id());
			var limite = porLimites.get(sonda.id());
			return new ProntidaoDaUnidade(sonda.id(), sonda.nome(), sonda.apelido(),
					card == null ? 0 : card.revisao(),
					card == null ? 0 : card.ativos(),
					card == null ? 0 : card.declarados(),
					card == null ? null : card.atualizadoPor(),
					card == null ? null : card.atualizadoEm(),
					limite == null ? 0 : limite.revisao(),
					limite == null ? 0 : limite.ativos(),
					limite == null ? 0 : limite.declarados(),
					limite == null ? null : limite.atualizadoPor(),
					limite == null ? null : limite.atualizadoEm());
		}).toList();
	}

	private static <T> Map<Long, T> indexar(List<T> resumos, java.util.function.ToLongFunction<T> chave) {
		var mapa = new HashMap<Long, T>();
		for (T resumo : resumos) {
			mapa.put(chave.applyAsLong(resumo), resumo);
		}
		return mapa;
	}
}
