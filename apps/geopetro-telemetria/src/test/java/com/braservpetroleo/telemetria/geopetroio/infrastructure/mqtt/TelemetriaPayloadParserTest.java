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
 * O parser e a fronteira entre a frota e o historico: e a peca de maior risco do servico.
 *
 * <p>⚠️ Reescrito em 2026-09-08. O formato antigo deixou de ser aceito — com cards por unidade o
 * produtor nao tem como publica-lo, porque os {@code dispositivoId} fixos nao existem mais. Os
 * testes daquele formato sairam <b>junto com o codigo</b>, e nao ficaram passando por acidente sobre
 * um caminho morto.
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
	@DisplayName("interpreta o formato de cards por unidade")
	void formatoDeCards() {
		String json = """
				{
				  "idUnidade": "SPT-144",
				  "dataHora": "2026-09-08T14:32:05.120",
				  "leituras": [
				    {"dispositivoId":"PESO_01","tipo":"PESO","unidade":"lbf",
				     "enderecoDb":"DBW4","valor":184300.5,"valorBruto":412}
				  ]
				}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.idUnidade()).isEqualTo("SPT-144");
		assertThat(batch.leituras()).hasSize(1);
		var leitura = batch.leituras().get(0);
		assertThat(leitura.dispositivoId()).isEqualTo("PESO_01");
		assertThat(leitura.tipo()).isEqualTo("PESO");
		assertThat(leitura.unidade()).isEqualTo("lbf");
		assertThat(leitura.enderecoDb()).isEqualTo("DBW4");
		assertThat(leitura.valor()).isEqualTo(184300.5);
		assertThat(leitura.valorBruto()).isEqualTo(412.0);
		assertThat(leitura.serie()).isNull();
	}

	@Test
	@DisplayName("as tres series de um card de stroke dividem o dispositivoId e se separam por 'serie'")
	void tresSeriesDoStroke() {
		String json = """
				{
				  "idUnidade": "SPT-144",
				  "dataHora": "2026-09-08T14:32:05.120",
				  "leituras": [
				    {"dispositivoId":"CONTADOR_STROKE_01","serie":"stroke","tipo":"CONTADOR_STROKE",
				     "unidade":"stroke","enderecoDb":"DBD0","valor":12,"valorBruto":148320},
				    {"dispositivoId":"CONTADOR_STROKE_01","serie":"vazao","tipo":"CONTADOR_STROKE",
				     "unidade":"bbl/min","enderecoDb":"DBD0","valor":1.52,"valorBruto":148320},
				    {"dispositivoId":"CONTADOR_STROKE_01","serie":"volumeAcumulado",
				     "tipo":"CONTADOR_STROKE","unidade":"bbl","enderecoDb":"DBD0",
				     "valor":18540.0,"valorBruto":148320}
				  ]
				}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.leituras()).hasSize(3);
		assertThat(batch.leituras()).extracting("dispositivoId")
				.containsOnly("CONTADOR_STROKE_01");
		assertThat(batch.leituras()).extracting("serie")
				.containsExactly("stroke", "vazao", "volumeAcumulado");
		// RN-098: sem a tag 'serie' as tres colidiriam no mesmo ponto do InfluxDB — mesma
		// measurement, mesmas tags, mesmo instante — e so a ultima sobreviveria.
		assertThat(batch.leituras()).extracting("unidade")
				.containsExactly("stroke", "bbl/min", "bbl");
	}

	@Test
	@DisplayName("card de um tipo novo atravessa sem que este servico saiba dele")
	void tipoNovoAtravessa() {
		// RN-097: e isto que permite cards por unidade. Com tabela fixa, o primeiro card de tanque
		// da frota seria gravado como "DESCONHECIDO" — ou descartado.
		String json = """
				{
				  "idUnidade": "SPT-150",
				  "dataHora": "2026-09-08T14:32:05.120",
				  "leituras": [
				    {"dispositivoId":"NIVEL_TANQUE_01","tipo":"NIVEL_TANQUE","unidade":"bbl",
				     "enderecoDb":"DBW14","valor":148.2,"valorBruto":380}
				  ]
				}""";

		var leitura = parser.parse("SPT-150", json).leituras().get(0);

		assertThat(leitura.tipo()).isEqualTo("NIVEL_TANQUE");
		assertThat(leitura.unidade()).isEqualTo("bbl");
	}

	@Test
	@DisplayName("leitura sem tipo ou unidade e recusada, e nao gravada como DESCONHECIDO")
	void semTipoOuUnidade() {
		// O catalogo completava o que faltasse. Sem ele, gravar "DESCONHECIDO" produziria uma serie
		// no historico que ninguem consegue interpretar depois — pior que nao gravar.
		String json = """
				{
				  "idUnidade": "SPT-144",
				  "dataHora": "2026-09-08T14:32:05.120",
				  "leituras": [
				    {"dispositivoId":"PESO_01","unidade":"lbf","valor":1},
				    {"dispositivoId":"TORQUE_01","tipo":"TORQUE","valor":2},
				    {"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi",
				     "enderecoDb":"DBW10","valor":812.5}
				  ]
				}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.leituras()).hasSize(1);
		assertThat(batch.leituras().get(0).dispositivoId()).isEqualTo("PRESSAO_01");
	}

	@Test
	@DisplayName("sem enderecoDb a leitura ainda grava, marcada como desconhecido")
	void semEnderecoDb() {
		// O endereco e rastreabilidade, nao identidade: a falta dele nao justifica perder a medicao.
		String json = """
				{"idUnidade":"SPT-144","dataHora":"2026-09-08T14:32:05.120",
				 "leituras":[{"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi","valor":1}]}""";

		assertThat(parser.parse("SPT-144", json).leituras().get(0).enderecoDb())
				.isEqualTo("DESCONHECIDO");
	}

	@Test
	@DisplayName("converte hora local da sonda para UTC")
	void converteParaUtc() {
		String json = """
				{"idUnidade":"SPT-144","dataHora":"2026-09-08T14:32:05.120",
				 "leituras":[{"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi",
				 "enderecoDb":"DBW10","valor":1}]}""";

		Instant esperado = LocalDateTime.parse("2026-09-08T14:32:05.120").atZone(ZONA).toInstant();

		assertThat(parser.parse("SPT-144", json).dataHora()).isEqualTo(esperado);
	}

	@Test
	@DisplayName("respeita o offset quando ele vier explicito")
	void respeitaOffsetExplicito() {
		String json = """
				{"idUnidade":"SPT-144","dataHora":"2026-09-08T14:32:05.120-03:00",
				 "leituras":[{"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi",
				 "enderecoDb":"DBW10","valor":1}]}""";

		assertThat(parser.parse("SPT-144", json).dataHora())
				.isEqualTo(Instant.parse("2026-09-08T17:32:05.120Z"));
	}

	@Test
	@DisplayName("usa a unidade do topico quando o corpo diverge")
	void topicoTemPrecedencia() {
		String json = """
				{"idUnidade":"OUTRA","dataHora":"2026-09-08T14:32:05.120",
				 "leituras":[{"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi",
				 "enderecoDb":"DBW10","valor":1}]}""";

		assertThat(parser.parse("SPT-144", json).idUnidade()).isEqualTo("SPT-144");
	}

	@Test
	@DisplayName("usa a unidade do topico quando o corpo nao a informa")
	void fallbackParaTopico() {
		String json = """
				{"dataHora":"2026-09-08T14:32:05.120",
				 "leituras":[{"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi",
				 "enderecoDb":"DBW10","valor":1}]}""";

		assertThat(parser.parse("SPT-144", json).idUnidade()).isEqualTo("SPT-144");
	}

	@Test
	@DisplayName("descarta leitura invalida mas preserva as demais do ciclo")
	void leituraInvalidaNaoDescartaOCiclo() {
		String json = """
				{
				  "idUnidade": "SPT-144",
				  "dataHora": "2026-09-08T14:32:05.120",
				  "leituras": [
				    {"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi",
				     "enderecoDb":"DBW10","valor":812.5},
				    {"dispositivoId":"","tipo":"PESO","unidade":"lbf","valor":1},
				    {"dispositivoId":"TORQUE_01","tipo":"TORQUE","unidade":"lbf.ft",
				     "enderecoDb":"DBW6","valor":5400}
				  ]
				}""";

		TelemetriaBatch batch = parser.parse("SPT-144", json);

		assertThat(batch.leituras()).hasSize(2);
		assertThat(batch.leituras()).extracting("dispositivoId")
				.containsExactly("PRESSAO_01", "TORQUE_01");
	}

	@Test
	@DisplayName("rejeita JSON malformado")
	void jsonMalformado() {
		assertThatThrownBy(() -> parser.parse("SPT-144", "{isto nao e json"))
				.isInstanceOf(TelemetriaPayloadParser.PayloadInvalidoException.class);
	}

	@Test
	@DisplayName("rejeita batch sem leituras")
	void batchSemLeituras() {
		String json = """
				{"idUnidade":"SPT-144","dataHora":"2026-09-08T14:32:05.120","leituras":[]}""";

		assertThatThrownBy(() -> parser.parse("SPT-144", json))
				.isInstanceOf(TelemetriaPayloadParser.PayloadInvalidoException.class);
	}

	@Test
	@DisplayName("rejeita batch em que nenhuma leitura sobrevive")
	void nenhumaLeituraValida() {
		String json = """
				{"idUnidade":"SPT-144","dataHora":"2026-09-08T14:32:05.120",
				 "leituras":[{"dispositivoId":"PESO_01","valor":1}]}""";

		assertThatThrownBy(() -> parser.parse("SPT-144", json))
				.isInstanceOf(TelemetriaPayloadParser.PayloadInvalidoException.class);
	}

	@Test
	@DisplayName("campo antigo no corpo e ignorado; idUnidade vem do topico")
	void campoAntigoNoCorpoEIgnorado() {
		String json = """
				{"idSondaUnidade":"SPT-144","dataHora":"2026-09-08T14:32:05.120",
				 "leituras":[{"dispositivoId":"PRESSAO_01","tipo":"PRESSAO","unidade":"psi",
				 "enderecoDb":"DBW10","valor":1}]}""";

		assertThat(parser.parse("SPT-144", json).idUnidade()).isEqualTo("SPT-144");
	}
}
