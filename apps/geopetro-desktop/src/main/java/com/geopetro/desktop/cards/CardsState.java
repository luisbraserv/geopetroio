package com.geopetro.desktop.cards;


/**
 * Último documento de cards da unidade — o que o ciclo de leitura consulta a cada volta.
 *
 * <p>As guardas de geração, unidade e revisão estão em {@link EstadoDeDocumento}.
 *
 * <p>⚠️ É o <b>único</b> documento que o canal traz desde 2026-09-09. O par dos limites de alarme
 * saiu com o alarme da estação passando a ser configurado na estação
 * ({@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3.3}).
 */
public class CardsState extends EstadoDeDocumento<CardsDaUnidade> {

	public CardsState() {
		this(new CardsStore());
	}

	public CardsState(CardsStore store) {
		super(store);
	}
}
