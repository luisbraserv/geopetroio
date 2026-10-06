package com.braserv.core.unidade.domain;

/**
 * Tipo de equipamento cadastrado como Unidade — RN-065.
 *
 * <p>Sonda e um dos tipos, nao o cadastro: por isso a entidade se chama Unidade (RN-119).
 *
 * <p><b>Classificacao apenas</b> — RN-074. A telemetria segue exclusiva de sonda de perfuracao,
 * com as mesmas cinco grandezas: todo o caminho de captura (enderecos no DB1 do CLP, conversoes,
 * vocabulario de dispositivos, cards da tela) foi escrito para ela. Uma unidade de outro tipo
 * existe no cadastro <b>sem monitoramento</b>, e a tela dela nao tem dado para mostrar.
 */
public enum TipoUnidade {

	/** Sonda de perfuracao / workover — o unico tipo com telemetria hoje. */
	SONDA,

	UNIDADE_BOMBEIO,

	SLICKLINE_WIRELINE,

	CIMENTACAO,

	/** Unidade de cimentacao e acidificacao. */
	UCAQ
}
