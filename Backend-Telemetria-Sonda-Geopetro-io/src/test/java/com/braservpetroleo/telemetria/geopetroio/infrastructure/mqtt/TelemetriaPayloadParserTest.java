package com.braservpetroleo.telemetria.geopetroio.infrastructure.mqtt;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaProperties;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * O parser e a peca de maior risco do servico: e a fronteira entre um produtor que esta em campo
 * (e sera migrado aos poucos) e o resto do sistema.
 */
class TelemetriaPayloadParserTest {

	private static final ZoneId ZONA = ZoneId.of("America/Sao_Paulo");

	private TelemetriaPayloadParser parser;

	@BeforeEach
	void setUp() {
		TelemetriaProperties propriedades = new TelemetriaProperties();
		propriedades.setZonaSonda(ZONA.getId());
		parser = new TelemetriaPayloadParser(new ObjectMapper(), propriedades);
	}

	@Test
	@DisplayName("interpreta o formato alvo com payload rico")
	void formatoNovo() {
		String json = """
				{
				  "idSondaUnidade": "SPT-144",
				  "dataHora": "2026-08-27T14:32:05.120",
				  "leituras": [
				    {"dispositivoId":"PESO_COLUNA_01","nome":"Peso da Coluna","codigoOrigem":"B002",
				     "tipo":"PESO","unidade":"lbf","valor":12450.75,
				     "valorBruto":512,"unidadeValorBruto":"mA_ESCALADO_0_1000"}
				  ]
				}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.idSondaUnidade()).isEqualTo("SPT-144");
		assertThat(batch.leituras()).hasSize(1);
		var leitura = batch.leituras().get(0);
		assertThat(leitura.dispositivoId()).isEqualTo("PESO_COLUNA_01");
		assertThat(leitura.codigoOrigem()).isEqualTo("B002");
		assertThat(leitura.tipo()).isEqualTo("PESO");
		assertThat(leitura.unidade()).isEqualTo("lbf");
		assertThat(leitura.valor()).isEqualTo(12450.75);
		assertThat(leitura.valorBruto()).isEqualTo(512.0);
	}

	@Test
	@DisplayName("interpreta o formato antigo e enriquece pelo catalogo")
	void formatoAntigo() {
		// O formato antigo so traz dispositivo e valor. Sem o enriquecimento, o historico ficaria
		// dividido em dois esquemas de tags conforme a versao do produtor.
		String json = """
				{"unidade":"UC-01","dataHora":"2026-08-27T14:32:05.120",
				 "leituras":[{"dispositivo":"VAZAO_01","valor":0.523}]}""";

		TelemetriaBatch batch = parser.parse("UC-01", json);

		assertThat(batch.idSondaUnidade()).isEqualTo("UC-01");
		var leitura = batch.leituras().get(0);
		assertThat(leitura.dispositivoId()).isEqualTo("VAZAO_01");
		assertThat(leitura.valor()).isEqualTo(0.523);
		assertThat(leitura.nome()).isEqualTo("Vazao");
		assertThat(leitura.codigoOrigem()).isEqualTo("B001");
		assertThat(leitura.tipo()).isEqualTo("VAZAO");
		assertThat(leitura.unidade()).isEqualTo("bbl/min");
		assertThat(leitura.valorBruto()).isNull();
	}

	@Test
	@DisplayName("nao confunde 'unidade' do envelope antigo com 'unidade' de medida do formato novo")
	void naoConfundeCampoUnidade() {
		// Colisao real de nomes: no formato antigo 'unidade' no envelope e o id da sonda; no novo,
		// 'unidade' dentro da leitura e a unidade de medida.
		String json = """
				{"idSondaUnidade":"SPT-145","dataHora":"2026-08-27T14:32:05.120",
				 "leituras":[{"dispositivoId":"PRESSAO_01","unidade":"psi","valor":3200.5}]}""";

		TelemetriaBatch batch = parser.parse("SPT-145", json);

		assertThat(batch.idSondaUnidade()).isEqualTo("SPT-145");
		assertThat(batch.leituras().get(0).unidade()).isEqualTo("psi");
	}

	@Test
	@DisplayName("converte hora local da sonda para UTC")
	void converteParaUtc() {
		String json = """
				{"idSondaUnidade":"SPT-144","dataHora":"2026-08-27T14:32:05.120",
				 "leituras":[{"dispositivoId":"VAZAO_01","valor":1.0}]}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		Instant esperado = LocalDateTime.parse("2026-08-27T14:32:05.120").atZone(ZONA).toInstant();
		assertThat(batch.dataHora()).isEqualTo(esperado);
	}

	@Test
	@DisplayName("respeita o offset quando ele vier explicito")
	void respeitaOffsetExplicito() {
		String json = """
				{"idSondaUnidade":"SPT-144","dataHora":"2026-08-27T17:32:05.120Z",
				 "leituras":[{"dispositivoId":"VAZAO_01","valor":1.0}]}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.dataHora()).isEqualTo(Instant.parse("2026-08-27T17:32:05.120Z"));
	}

	@Test
	@DisplayName("usa a unidade do topico quando o corpo diverge")
	void topicoTemPrecedencia() {
		String json = """
				{"idSondaUnidade":"ERRADO","dataHora":"2026-08-27T14:32:05.120",
				 "leituras":[{"dispositivoId":"VAZAO_01","valor":1.0}]}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.idSondaUnidade()).isEqualTo("SPT-144");
	}

	@Test
	@DisplayName("usa a unidade do topico quando o corpo nao a informa")
	void fallbackParaTopico() {
		String json = """
				{"dataHora":"2026-08-27T14:32:05.120",
				 "leituras":[{"dispositivo":"VAZAO_01","valor":1.0}]}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.idSondaUnidade()).isEqualTo("SPT-144");
	}

	@Test
	@DisplayName("descarta leitura invalida mas preserva as demais do ciclo")
	void leituraInvalidaNaoDescartaOCiclo() {
		// Perder o ciclo inteiro por causa de um sensor com defeito significaria perder tambem as
		// grandezas boas medidas no mesmo instante.
		String json = """
				{"idSondaUnidade":"SPT-144","dataHora":"2026-08-27T14:32:05.120","leituras":[
				  {"dispositivoId":"VAZAO_01","valor":"nao-numerico"},
				  {"dispositivoId":"PESO_COLUNA_01","valor":12450.75}
				]}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.leituras()).hasSize(1);
		assertThat(batch.leituras().get(0).dispositivoId()).isEqualTo("PESO_COLUNA_01");
	}

	@Test
	@DisplayName("aceita dispositivo fora do catalogo sem perder o dado")
	void dispositivoDesconhecido() {
		// Um produtor mais novo pode publicar um sensor que este servico ainda nao conhece.
		// Descartar seria perder dado real; o valor e gravado com metadados genericos.
		String json = """
				{"idSondaUnidade":"SPT-144","dataHora":"2026-08-27T14:32:05.120",
				 "leituras":[{"dispositivoId":"SENSOR_NOVO_09","valor":42.0}]}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		var leitura = batch.leituras().get(0);
		assertThat(leitura.dispositivoId()).isEqualTo("SENSOR_NOVO_09");
		assertThat(leitura.tipo()).isEqualTo("DESCONHECIDO");
		assertThat(leitura.valor()).isEqualTo(42.0);
	}

	@Test
	@DisplayName("rejeita JSON malformado")
	void jsonMalformado() {
		assertThatThrownBy(() -> parser.parse("SPT-144", "{isso nao e json"))
				.isInstanceOf(TelemetriaPayloadParser.PayloadInvalidoException.class);
	}

	@Test
	@DisplayName("rejeita batch sem leituras")
	void batchSemLeituras() {
		String json = """
				{"idSondaUnidade":"SPT-144","dataHora":"2026-08-27T14:32:05.120","leituras":[]}""";

		assertThatThrownBy(() -> parser.parse("SPT-144", json))
				.isInstanceOf(TelemetriaPayloadParser.PayloadInvalidoException.class)
				.hasMessageContaining("leituras");
	}

	@Test
	@DisplayName("rejeita batch sem dataHora")
	void batchSemDataHora() {
		String json = """
				{"idSondaUnidade":"SPT-144","leituras":[{"dispositivoId":"VAZAO_01","valor":1.0}]}""";

		assertThatThrownBy(() -> parser.parse("SPT-144", json))
				.isInstanceOf(TelemetriaPayloadParser.PayloadInvalidoException.class)
				.hasMessageContaining("dataHora");
	}

	@Test
	@DisplayName("rejeita batch em que todas as leituras sao invalidas")
	void todasLeiturasInvalidas() {
		String json = """
				{"idSondaUnidade":"SPT-144","dataHora":"2026-08-27T14:32:05.120",
				 "leituras":[{"dispositivoId":"VAZAO_01"}]}""";

		assertThatThrownBy(() -> parser.parse("SPT-144", json))
				.isInstanceOf(TelemetriaPayloadParser.PayloadInvalidoException.class)
				.hasMessageContaining("nenhuma leitura valida");
	}
}
