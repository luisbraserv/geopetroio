package com.example.demo.services;

import com.example.demo.models.CardsDaUnidade;

/**
 * Último documento de cards da unidade — o que o ciclo de leitura consulta a cada volta.
 *
 * <p>As guardas de geração, unidade e revisão estão em {@link EstadoDeDocumento}. O par dos limites
 * de alarme é {@link ConfiguracaoRemotaState}.
 */
public class CardsState extends EstadoDeDocumento<CardsDaUnidade> {

	public CardsState() {
		this(new CardsStore());
	}

	public CardsState(CardsStore store) {
		super(store);
	}
}
