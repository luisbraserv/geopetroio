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
import com.braservpetroleo.telemetria.geopetroio.domain.CatalogoDispositivos;
import com.braservpetroleo.telemetria.geopetroio.domain.LeituraTelemetria;
import com.braservpetroleo.telemetria.geopetroio.domain.TelemetriaBatch;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Converte o payload JSON recebido do broker no modelo canonico {@link TelemetriaBatch}.
 *
 * <p><b>Aceita dois formatos</b>, conforme decidido em
 * {@code specs/contracts/mqtt-telemetria.md} secao 9. A frota e atualizada por instalador .exe em
 * campo, e esse cronograma nao pode bloquear o deploy deste servico — portanto o consumidor entende
 * o formato antigo ate que todo o parque esteja migrado.
 *
 * <p><b>Formato alvo</b> (detectado pela presenca de {@code idSondaUnidade}):
 * <pre>
 * {"idSondaUnidade":"SPT-144","dataHora":"...","leituras":[
 *    {"dispositivoId":"PESO_COLUNA_01","nome":"...","codigoOrigem":"B002","tipo":"PESO",
 *     "unidade":"lbf","valor":12450.75,"valorBruto":512,"unidadeValorBruto":"..."}]}
 * </pre>
 *
 * <p><b>Formato antigo</b> (envelope usa {@code unidade} como id da sonda):
 * <pre>
 * {"unidade":"UC-01","dataHora":"...","leituras":[{"dispositivo":"VAZAO_01","valor":0.523}]}
 * </pre>
 *
 * <p>⚠️ Atencao a colisao de nomes: no formato antigo {@code unidade} no <b>envelope</b> e o id da
 * sonda; no formato novo {@code unidade} dentro de cada <b>leitura</b> e a unidade de medida. Por
 * isso a deteccao olha {@code idSondaUnidade} no envelope, e nunca {@code unidade}.
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
	 * @param topicoUnidade id da sonda extraido do topico, usado como fallback e para detectar
	 *                      divergencia com o corpo da mensagem
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

		boolean formatoNovo = raiz.hasNonNull("idSondaUnidade");
		String idSonda = formatoNovo
				? texto(raiz, "idSondaUnidade")
				: texto(raiz, "unidade");

		if (idSonda == null || idSonda.isBlank()) {
			// O topico ja carrega a unidade; usa-lo evita descartar uma leitura por um campo ausente.
			idSonda = topicoUnidade;
		}
		else if (topicoUnidade != null && !topicoUnidade.isBlank() && !topicoUnidade.equals(idSonda)) {
			// Divergencia entre topico e corpo: o topico e a fonte de verdade (define o roteamento),
			// mas isso indica produtor mal configurado e merece visibilidade.
			log.warn("Divergencia de unidade: topico='{}' corpo='{}'. Usando o do topico.",
					topicoUnidade, idSonda);
			idSonda = topicoUnidade;
		}

		Instant dataHora = parseDataHora(texto(raiz, "dataHora"));

		JsonNode leiturasNode = raiz.get("leituras");
		if (leiturasNode == null || !leiturasNode.isArray() || leiturasNode.isEmpty()) {
			throw new PayloadInvalidoException("campo 'leituras' ausente ou vazio");
		}

		List<LeituraTelemetria> leituras = new ArrayList<>();
		for (JsonNode node : leiturasNode) {
			try {
				leituras.add(formatoNovo ? leituraNova(node) : leituraAntiga(node));
			}
			catch (RuntimeException e) {
				// Uma leitura corrompida nao deve descartar o ciclo inteiro: as demais grandezas
				// daquele instante continuam validas e uteis.
				log.warn("Leitura ignorada no batch da unidade '{}': {}", idSonda, e.getMessage());
			}
		}
		if (leituras.isEmpty()) {
			throw new PayloadInvalidoException("nenhuma leitura valida no batch");
		}

		return new TelemetriaBatch(idSonda, dataHora, leituras);
	}

	private LeituraTelemetria leituraNova(JsonNode node) {
		String dispositivoId = normalizar(texto(node, "dispositivoId"));
		var catalogo = CatalogoDispositivos.buscar(dispositivoId);
		if (catalogo.isEmpty()) {
			log.warn("dispositivoId desconhecido: '{}'. Gravando com os metadados informados.", dispositivoId);
		}

		return new LeituraTelemetria(
				dispositivoId,
				coalesce(texto(node, "nome"), catalogo.map(d -> d.nome()).orElse(dispositivoId)),
				coalesce(texto(node, "codigoOrigem"), catalogo.map(d -> d.codigoOrigem()).orElse("DESCONHECIDO")),
				coalesce(texto(node, "tipo"), catalogo.map(d -> d.tipo()).orElse("DESCONHECIDO")),
				coalesce(texto(node, "unidade"), catalogo.map(d -> d.unidade()).orElse("")),
				numeroObrigatorio(node, "valor"),
				numeroOpcional(node, "valorBruto"),
				texto(node, "unidadeValorBruto"));
	}

	/**
	 * Formato antigo: so ha {@code dispositivo} e {@code valor}. Os metadados descritivos vem do
	 * catalogo, para que o dado grave com as mesmas tags do formato novo.
	 */
	private LeituraTelemetria leituraAntiga(JsonNode node) {
		String dispositivoId = normalizar(texto(node, "dispositivo"));
		var catalogo = CatalogoDispositivos.buscar(dispositivoId);

		return new LeituraTelemetria(
				dispositivoId,
				catalogo.map(d -> d.nome()).orElse(dispositivoId),
				catalogo.map(d -> d.codigoOrigem()).orElse("DESCONHECIDO"),
				catalogo.map(d -> d.tipo()).orElse("DESCONHECIDO"),
				catalogo.map(d -> d.unidade()).orElse(""),
				numeroObrigatorio(node, "valor"),
				null,
				null);
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
