package com.braservpetroleo.telemetria.geopetroio.domain;

/**
 * Uma leitura de telemetria, ja normalizada.
 *
 * <p>Contrato em {@code specs/contracts/mqtt-telemetria.md §3}. ⚠️ <b>Reescrito em 2026-09-08</b>
 * para cards por unidade.
 *
 * <h2>A mensagem se descreve — RN-097</h2>
 * {@code tipo} e {@code unidade} chegam na mensagem e sao <b>obrigatorios</b>. Antes podiam faltar e
 * eram completados por uma tabela fixa ({@code CatalogoDispositivos}), que sumiu junto com o
 * vocabulario fechado: com cards por unidade, nao ha tabela que saiba o que e {@code PRESSAO_03} de
 * uma sonda qualquer.
 *
 * <h2>O que saiu</h2>
 * <ul>
 *   <li>{@code nome} — rotulo editavel. Renomear faria a mesma serie aparecer com dois nomes na
 *       mesma linha do tempo, sem nada dizendo qual valia quando.</li>
 *   <li>{@code codigoOrigem} — {@code B001..B005} eram codigos de um mapeamento fixo que acabou.
 *       {@code enderecoDb} ocupa o lugar, e agora vem da configuracao da unidade.</li>
 *   <li>{@code unidadeValorBruto} — o bruto e sempre a posicao no laco, na escala do amplificador.
 *       Um campo que so tinha um valor possivel nao era informacao.</li>
 * </ul>
 *
 * @param dispositivoId identificador gerado {@code <TIPO>_<NN>}, imutavel (RN-081)
 * @param serie         distingue as tres grandezas de um card de stroke (RN-098); {@code null} nas demais
 * @param tipo          PESO | TORQUE | PRESSAO | TEMPERATURA | NIVEL_TANQUE | CONTADOR_STROKE
 * @param unidade       unidade de engenharia do valor (lbf, psi, bbl/min, bbl, °C)
 * @param enderecoDb    onde foi lido neste ciclo (ex.: {@code DBW10}) — rastreabilidade
 * @param valor         grandeza convertida
 * @param valorBruto    o que veio do CLP antes da conversao; permite reprocessar o historico
 */
public record LeituraTelemetria(
		String dispositivoId,
		String serie,
		String tipo,
		String unidade,
		String enderecoDb,
		double valor,
		Double valorBruto) {

	public LeituraTelemetria {
		if (dispositivoId == null || dispositivoId.isBlank()) {
			throw new IllegalArgumentException("dispositivoId e obrigatorio");
		}
		// Sem tipo e unidade a leitura nao e interpretavel, e nao ha mais catalogo para completar.
		if (tipo == null || tipo.isBlank()) {
			throw new IllegalArgumentException("tipo e obrigatorio (dispositivo " + dispositivoId + ")");
		}
		if (unidade == null || unidade.isBlank()) {
			throw new IllegalArgumentException("unidade e obrigatoria (dispositivo " + dispositivoId + ")");
		}
		if (!Double.isFinite(valor)) {
			throw new IllegalArgumentException(
					"valor deve ser um numero finito (dispositivo " + dispositivoId + ")");
		}
		if (valorBruto != null && !Double.isFinite(valorBruto)) {
			throw new IllegalArgumentException(
					"valorBruto deve ser um numero finito (dispositivo " + dispositivoId + ")");
		}
		serie = serie == null || serie.isBlank() ? null : serie;
		enderecoDb = enderecoDb == null || enderecoDb.isBlank() ? "DESCONHECIDO" : enderecoDb;
	}

	public boolean possuiValorBruto() {
		return valorBruto != null;
	}

	/** Tag do InfluxDB: as leituras de uma grandeza so ficam com {@code "unica"}. */
	public String serieTag() {
		return serie == null ? "unica" : serie;
	}
}
