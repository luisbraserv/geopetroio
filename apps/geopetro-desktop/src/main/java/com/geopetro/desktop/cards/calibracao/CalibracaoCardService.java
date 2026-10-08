package com.geopetro.desktop.cards.calibracao;

import java.util.List;
import java.util.Objects;

import org.springframework.stereotype.Service;

import com.geopetro.desktop.cards.CardsDaUnidade.Card;
import com.geopetro.desktop.cards.CardsDaUnidade.Parametros;
import com.geopetro.desktop.cards.CardsDaUnidade;
import com.geopetro.desktop.cards.ConfiguracaoCardsClient;
import com.geopetro.desktop.cards.calibracao.CalibracaoDeCards.Calibracao;

/** Salva a escala do transmissor no documento e a calibracao local pelo id do card. */
@Service
public class CalibracaoCardService {

	private final ConfiguracaoCardsClient cliente;
	private final CalibracaoDeCards calibracoes;

	public CalibracaoCardService(ConfiguracaoCardsClient cliente, CalibracaoDeCards calibracoes) {
		this.cliente = cliente;
		this.calibracoes = calibracoes;
	}

	public CardsDaUnidade salvar(CardsDaUnidade base, Card card, double rangeBar, Calibracao calibracao) {
		if (base == null || card == null || card.novo() || !Double.isFinite(rangeBar) || rangeBar <= 0) {
			throw new IllegalArgumentException("Informe um card salvo e um range do sensor maior que zero.");
		}
		Card original = base.cards().stream()
				.filter(c -> Objects.equals(c.dispositivoId(), card.dispositivoId()))
				.findFirst().orElseThrow(() -> new IllegalArgumentException("Card nao encontrado. Recarregue a configuracao."));
		CardsDaUnidade salvo = base;
		Double rangeAtual = original.parametros() == null ? null : original.parametros().rangeSensorBar();
		if (!Objects.equals(rangeAtual, rangeBar)) {
			List<Card> novos = base.cards().stream()
					.map(c -> Objects.equals(c.dispositivoId(), card.dispositivoId())
							? comRange(c, rangeBar) : c)
						.toList();
			salvo = cliente.salvarCards(base.unidadeId(), base, novos);
		}
		calibracoes.gravar(card.dispositivoId(), calibracao);
		return salvo;
	}

	private static Card comRange(Card card, double rangeBar) {
		Parametros p = card.parametros() == null ? Parametros.vazio() : card.parametros();
		Parametros atualizados = new Parametros(rangeBar, p.minimoEscala(), p.maximoEscala(), p.unidade(),
				p.forma(), p.raio(), p.altura(), p.comprimento(), p.largura(),
				p.distanciaMinima(), p.distanciaMaxima(), p.constanteBomba());
		return new Card(card.dispositivoId(), card.nome(), card.tipo(), card.byteInicial(), card.ativo(),
				card.visivel(), card.ordem(), atualizados);
	}
}
