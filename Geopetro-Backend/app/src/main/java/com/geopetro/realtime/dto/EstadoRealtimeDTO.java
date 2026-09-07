package com.geopetro.realtime.dto;

import java.time.Instant;

/**
 * Estado instantaneo de uma Unidade/Sonda, retransmitido em tempo real.
 *
 * <p><b>Nao e persistido.</b> Este canal existe apenas para refletir o "agora" na tela; o historico
 * segue pelo caminho MQTT -> Backend-Telemetria -> InfluxDB. Ver
 * {@code specs/contracts/websocket-realtime.md}.
 *
 * <p>Os nomes de campo espelham as grandezas ja usadas no monitoramento historico, para que a tela
 * possa alimentar os mesmos cards com qualquer uma das duas origens.
 *
 * @param unidadeSondaId  id da Unidade/Sonda no cadastro — identifica a origem e o topico de destino
 * @param timestamp       instante da leitura no CLP, em UTC
 * @param pesoColuna      lbf   (B002)
 * @param torqueTubos     lbf.ft (B003)
 * @param torqueFlutuante lbf.ft (B004)
 * @param pressaoBomba    psi   (B005)
 * @param vazao           bbl/min (B001, por delta de strokes)
 * @param strokeAtual     contagem de strokes do ciclo corrente
 */
public record EstadoRealtimeDTO(
		Long unidadeSondaId,
		Instant timestamp,
		Double pesoColuna,
		Double torqueTubos,
		Double torqueFlutuante,
		Double pressaoBomba,
		Double vazao,
		Long strokeAtual) {
}
