package com.braservpetroleo.telemetria.geopetroio.infrastructure.mqtt;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import com.braservpetroleo.telemetria.geopetroio.config.TelemetriaProperties;
import com.braservpetroleo.telemetria.geopetroio.domain.LeituraTelemetria;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Converte o payload JSON recebido do broker no modelo canonico {@link TelemetriaBatch}.
 *
 * <p><b>Formato unico</b> desde 2026-09-08 — cards por unidade
 * ({@code specs/SDD/software/mqtt/mqtt-telemetria.md} secao 3):
 * <pre>
	 * {"idUnidade":"SPT-144","dataHora":"...","leituras":[
 *    {"dispositivoId":"PESO_01","tipo":"PESO","unidade":"lbf",
 *     "enderecoDb":"DBW4","valor":184300.5,"valorBruto":412},
 *    {"dispositivoId":"CONTADOR_STROKE_01","serie":"vazao","tipo":"CONTADOR_STROKE",
 *     "unidade":"bbl/min","enderecoDb":"DBD0","valor":1.52,"valorBruto":148320}]}
 * </pre>
 *
 * <h2>⚠️ O formato antigo deixou de ser aceito</h2>
 * Ele tinha so {@code dispositivo} e {@code valor}, e dependia de {@code CatalogoDispositivos} — uma
 * tabela com os cinco dispositivos que toda sonda tinha — para completar tipo, unidade e nome.
 *
 * <p>A migracao gradual existia para desacoplar o cronograma da frota (instaladores .exe em campo)
 * do deploy deste servico. Ela perdeu o sentido: com cards por unidade, <b>o produtor nao tem como
 * publicar o formato antigo</b>, porque os {@code dispositivoId} fixos nao existem mais e o conjunto
 * varia de unidade para unidade. Nao ha formato antigo a manter. Ver secao 9 do contrato.
 *
 * <p>A colisao de nomes que exigia cuidado — {@code unidade} no envelope era o id da sonda, e dentro
	 * da leitura e a unidade de medida — some junto: so ha {@code idUnidade} no envelope.
 */
@Component
public class TelemetriaPayloadParser {

	private static final Logger log = LoggerFactory.getLogger(TelemetriaPayloadParser.class);

	private final ObjectMapper objectMapper;
	private final ZoneId zonaSonda;

	public TelemetriaPayloadParser(ObjectMapper objectMapper, TelemetriaProperties properties) {
		this.objectMapper = objectMapper;
		this.zonaSonda = ZoneId.of(properties.getZonaSonda());
	}

	/**
	 * @param topicoUnidade nome da unidade extraido do topico; e ele que vale, e o corpo serve para
	 *                      detectar divergencia
	 * @throws PayloadInvalidoException se o payload nao puder ser interpretado
	 */
	public TelemetriaBatch parse(String topicoUnidade, String json) {
		JsonNode raiz;
		try {
			raiz = objectMapper.readTree(json);
		}
		catch (Exception e) {
			throw new PayloadInvalidoException("JSON malformado: " + e.getMessage(), e);
		}
		if (raiz == null || !raiz.isObject()) {
			throw new PayloadInvalidoException("payload nao e um objeto JSON");
		}

		// O topico e a fonte de verdade: e ele que define o roteamento no broker.
		String idUnidade = texto(raiz, "idUnidade");
		if (idUnidade == null || idUnidade.isBlank()) {
			idUnidade = topicoUnidade;
		} else if (topicoUnidade != null && !topicoUnidade.isBlank()
				&& !topicoUnidade.equals(idUnidade)) {
			log.warn("Divergencia de unidade: topico='{}' corpo='{}'. Usando o do topico.",
					topicoUnidade, idUnidade);
			idUnidade = topicoUnidade;
		}
		if (idUnidade == null || idUnidade.isBlank()) {
			throw new PayloadInvalidoException("idUnidade e obrigatorio");
		}

		Instant dataHora = parseDataHora(texto(raiz, "dataHora"));

		JsonNode leiturasNode = raiz.get("leituras");
		if (leiturasNode == null || !leiturasNode.isArray() || leiturasNode.isEmpty()) {
			throw new PayloadInvalidoException("campo 'leituras' ausente ou vazio");
		}

		List<LeituraTelemetria> leituras = new ArrayList<>();
		for (JsonNode node : leiturasNode) {
			try {
				leituras.add(leitura(node));
			}
			catch (RuntimeException e) {
				// Uma leitura corrompida nao deve descartar o ciclo inteiro: as demais grandezas
				// daquele instante continuam validas e uteis.
				log.warn("Leitura ignorada no batch da unidade '{}': {}", idUnidade, e.getMessage());
			}
		}
		if (leituras.isEmpty()) {
			throw new PayloadInvalidoException("nenhuma leitura valida no batch");
		}

		return new TelemetriaBatch(idUnidade, dataHora, leituras);
	}

	/**
	 * A mensagem se descreve — RN-097.
	 *
	 * <p>{@code tipo} e {@code unidade} sao obrigatorios e vem no payload. Antes podiam faltar e
	 * eram completados por {@code CatalogoDispositivos}, uma tabela com os cinco dispositivos que
	 * toda sonda tinha. ⚠️ Com cards por unidade essa tabela deixou de poder existir: nao ha o que
	 * saiba o que e {@code PRESSAO_03} de uma sonda qualquer sem consultar a configuracao dela.
	 *
	 * <p>Leitura sem tipo ou unidade e recusada aqui e ignorada pelo laco acima — o batch segue com
	 * as demais. Grava-la com {@code "DESCONHECIDO"}, como o catalogo fazia, produziria uma serie no
	 * historico que ninguem consegue interpretar depois.
	 */
	private LeituraTelemetria leitura(JsonNode node) {
		return new LeituraTelemetria(
				normalizar(texto(node, "dispositivoId")),
				texto(node, "serie"),
				texto(node, "tipo"),
				texto(node, "unidade"),
				texto(node, "enderecoDb"),
				numeroObrigatorio(node, "valor"),
				numeroOpcional(node, "valorBruto"));
	}

	/**
	 * O produtor publica hora local da sonda, sem offset. Se um offset vier (formato futuro), ele e
	 * respeitado; caso contrario a hora e interpretada na zona configurada.
	 *
	 * <p>Armazenar em UTC no InfluxDB e deliberado: series temporais sem timezone explicito ficam
	 * ambiguas nas transicoes de horario e se a frota se espalhar por fusos.
	 */
	private Instant parseDataHora(String valor) {
		if (valor == null || valor.isBlank()) {
			throw new PayloadInvalidoException("campo 'dataHora' ausente");
		}
		String texto = valor.trim();
		try {
			return OffsetDateTime.parse(texto).toInstant();
		}
		catch (DateTimeParseException semOffset) {
			try {
				return LocalDateTime.parse(texto).atZone(zonaSonda).toInstant();
			}
			catch (DateTimeParseException e) {
				throw new PayloadInvalidoException("dataHora invalida: '" + texto + "'", e);
			}
		}
	}

	private static String texto(JsonNode node, String campo) {
		JsonNode valor = node.get(campo);
		return (valor == null || valor.isNull()) ? null : valor.asText();
	}

	private static double numeroObrigatorio(JsonNode node, String campo) {
		JsonNode valor = node.get(campo);
		if (valor == null || valor.isNull() || !valor.isNumber()) {
			throw new IllegalArgumentException("campo '" + campo + "' ausente ou nao numerico");
		}
		return valor.asDouble();
	}

	private static Double numeroOpcional(JsonNode node, String campo) {
		JsonNode valor = node.get(campo);
		return (valor == null || valor.isNull() || !valor.isNumber()) ? null : valor.asDouble();
	}

	private static String normalizar(String valor) {
		return valor == null ? null : valor.trim().toUpperCase();
	}

	private static String coalesce(String preferido, String alternativo) {
		return (preferido == null || preferido.isBlank()) ? alternativo : preferido;
	}

	/** Payload que nao pode ser interpretado — a mensagem e descartada com log. */
	public static class PayloadInvalidoException extends RuntimeException {
		public PayloadInvalidoException(String mensagem) {
			super(mensagem);
		}

		public PayloadInvalidoException(String mensagem, Throwable causa) {
			super(mensagem, causa);
		}
	}
}
