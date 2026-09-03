package com.braservpetroleo.telemetria.geopetroio.domain;

/**
 * Uma leitura de um dispositivo da sonda, ja convertida em grandeza de engenharia.
 *
 * <p>Modelo canonico interno: os dois formatos aceitos no MQTT (ver
 * {@code specs/contracts/mqtt-telemetria.md}) sao normalizados para este record antes
 * de chegarem a camada de aplicacao.
 *
 * @param dispositivoId     identificador logico (ex.: PESO_COLUNA_01) — vocabulario fechado
 * @param nome              rotulo legivel (ex.: "Peso da Coluna")
 * @param codigoOrigem      codigo fisico no CLP (B001..B005) — rastreabilidade
 * @param tipo              PESO | TORQUE | PRESSAO | VAZAO
 * @param unidade           unidade de engenharia do valor (ex.: lbf, psi, bbl/min)
 * @param valor             grandeza convertida
 * @param valorBruto        valor lido do CLP antes da conversao; null se nao informado
 * @param unidadeValorBruto unidade do valor bruto; null se nao informado
 */
public record LeituraTelemetria(
		String dispositivoId,
		String nome,
		String codigoOrigem,
		String tipo,
		String unidade,
		double valor,
		Double valorBruto,
		String unidadeValorBruto) {

	public LeituraTelemetria {
		if (dispositivoId == null || dispositivoId.isBlank()) {
			throw new IllegalArgumentException("dispositivoId e obrigatorio");
		}
		if (!Double.isFinite(valor)) {
			throw new IllegalArgumentException(
					"valor deve ser um numero finito (dispositivo " + dispositivoId + ")");
		}
		if (valorBruto != null && !Double.isFinite(valorBruto)) {
			throw new IllegalArgumentException(
					"valorBruto deve ser um numero finito (dispositivo " + dispositivoId + ")");
		}
	}

	public boolean possuiValorBruto() {
		return valorBruto != null;
	}
}
