package com.geopetro.realtime.dto;

import java.time.Instant;
import java.util.List;

import com.geopetro.alarmes.AlarmeAtivo;

/**
 * Estado instantaneo de uma Unidade/Sonda, retransmitido em tempo real.
 *
 * <p><b>Nao e persistido.</b> Este canal existe apenas para refletir o "agora" na tela; o historico
 * segue pelo caminho MQTT -> Geopetro-Telemetria -> InfluxDB. Ver
 * {@code specs/SDD/software/apis/websocket-realtime.md}.
 *
 * <h2>⚠️ Os campos fixos sairam — 2026-09-08</h2>
 * Eram {@code pesoColuna}, {@code torqueTubos}, {@code torqueFlutuante}, {@code pressaoBomba},
 * {@code vazao} e {@code strokeAtual}, espelhando os cinco dispositivos que toda sonda tinha.
 *
 * <p>Com <a href="../../../../../../../../../specs/SDD/negocio/requisitos/cards-configuraveis.md">cards por
 * unidade</a> o conjunto passou a variar de sonda para sonda: uma unidade com dois cards de torque e
 * um de temperatura nao cabe em campos fixos — eles seriam uma <b>verdade parcial se passando por
 * completa</b>.
 *
 * <h2>O backend nao interpreta o conteudo</h2>
 * Ele valida a origem e o acesso, e retransmite. Cada leitura ja carrega tipo e unidade (RN-097),
 * entao nao ha aqui vocabulario de dispositivo nenhum para manter — e um card de um tipo novo
 * atravessa sem que este arquivo mude.
 *
 * <h2>O que esta alarmando viaja junto — 2026-09-09</h2>
 * O campo {@code alarmes} <b>nao vem do Desktop</b>: e o servidor que o acrescenta ao retransmitir,
 * a partir da avaliacao deste mesmo ciclo. O Desktop publica sem ele, e o valor recebido de um
 * produtor e ignorado — quem decide o que alarma e quem tem os limites.
 *
 * <p>⚠️ <b>Por que junto, e nao num topico proprio.</b> O destaque descreve <b>estes</b> numeros.
 * Em canais separados os dois chegariam em ordens diferentes, e a tela mostraria um valor com o
 * destaque do ciclo anterior — um alarme aceso sobre um numero que ja voltou a faixa, ou pior, o
 * contrario.
 *
 * @param unidadeSondaId id da Unidade/Sonda no cadastro — identifica a origem e o topico de destino
 * @param timestamp      instante da leitura no CLP, em UTC
 * @param leituras       so cards visiveis, e so grandezas com valor (RN-037, RN-099)
 * @param alarmes        episodios abertos apos este ciclo; preenchido pelo servidor, nulo no envio
 */
public record EstadoRealtimeDTO(
		Long unidadeSondaId,
		Instant timestamp,
		List<LeituraRealtimeDTO> leituras,
		List<AlarmeAtivo> alarmes) {

	/**
	 * Uma leitura, na mesma forma do MQTT ({@code mqtt-telemetria.md §3}).
	 *
	 * @param serie      distingue as tres grandezas de um card de stroke (RN-098); ausente nas demais
	 * @param enderecoDb onde foi lido neste ciclo, como {@code DBW10}
	 * @param valorBruto o que veio do CLP antes da conversao
	 */
	public record LeituraRealtimeDTO(
			String dispositivoId,
			String serie,
			String tipo,
			String unidade,
			String enderecoDb,
			Double valor,
			Double valorBruto) {
	}
}
