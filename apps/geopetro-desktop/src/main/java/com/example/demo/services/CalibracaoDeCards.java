package com.example.demo.services;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import com.example.demo.config.AppPaths;
import com.example.demo.models.AppSettings;
import com.example.demo.models.CardsDaUnidade;
import com.example.demo.models.CardsDaUnidade.Card;
import com.example.demo.models.ChaveHidraulicaConfig;
import com.example.demo.models.PesoColunaConfig;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * A calibração de cada card, guardada por {@code dispositivoId} — o que substitui os slots
 * posicionais.
 *
 * <h2>O problema que isto resolve</h2>
 * Até aqui a calibração era ligada por <b>posição</b>: {@code pesoColuna} era do card de peso,
 * {@code chaveTubos} do primeiro torque, {@code chaveFlutuante} do segundo, e {@code sensor01..04}
 * dos quatro canais analógicos nessa ordem. Funcionava porque o mapeamento era fixo — um card de
 * peso e dois de torque, sempre nos mesmos endereços.
 *
 * <p>Com cards configuráveis a posição deixa de identificar coisa alguma: um terceiro card de torque
 * não tem slot, e reordenar a tela trocaria a calibração de lugar. ⚠️ O desfecho seria o mais caro
 * desta base — <b>um número plausível e errado</b>, porque a conversão continua rodando.
 *
 * <h2>O que fica aqui e o que fica no documento</h2>
 * A linha é <b>medição de campo</b> contra <b>valor de placa</b>. O {@code rangeSensorBar} do
 * transmissor está impresso nele e vive no documento de cards, com o resto da escala. Aqui ficam a
 * geometria do sargento e da chave, medidas na unidade, e a sensibilidade, que é trim ajustado ali.
 *
 * <h2>Arquivo próprio</h2>
 * Em {@code config/calibracao-cards.json}, e não dentro de {@code app-settings.json}: aquele arquivo
 * é lido e escrito com regex e concatenação de string, e um mapa aninhado ali seria frágil sem
 * necessidade.
 *
 * <p>Falha de leitura ou escrita vira log e segue. No pior caso a calibração volta ao padrão e a
 * tela mostra "ainda não calibrado" — visível, que é o oposto de um número errado em silêncio.
 */
@Service
public class CalibracaoDeCards {

	private static final Logger logger = LoggerFactory.getLogger(CalibracaoDeCards.class);

	/**
	 * ⚠️ As duas configurações são necessárias, e por motivos diferentes.
	 *
	 * <p>{@code REQUIRE_SETTERS_FOR_GETTERS}: {@link PesoColunaConfig} tem getters <b>derivados</b>
	 * ({@code isConfigurado()}, {@code raioEfetivoPol()}) que o Jackson gravaria como se fossem
	 * campos. Além de ruído, seriam valores calculados congelados no arquivo — divergindo dos
	 * originais assim que alguém editasse a geometria. Gravar só o que tem setter grava só o que dá
	 * para restaurar.
	 *
	 * <p>{@code FAIL_ON_UNKNOWN_PROPERTIES} desligado: arquivos gravados antes disto trazem aqueles
	 * campos derivados, e recusá-los descartaria a calibração inteira de uma unidade em campo.
	 */
	private static final ObjectMapper JSON = new ObjectMapper()
			.configure(MapperFeature.REQUIRE_SETTERS_FOR_GETTERS, true)
			.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

	/**
	 * Endereços que o código de endereço fixo usava, e de quem era a calibração de cada um.
	 *
	 * <p>É a ponte da migração: o card que lê o endereço que o código antigo lia para o peso herda a
	 * calibração do peso. Ligar por endereço, e não pela ordem dos cards, acerta mesmo que a unidade
	 * tenha sido configurada numa ordem diferente.
	 */
	private static final int BYTE_PESO = 4;
	private static final int BYTE_TORQUE_TUBOS = 6;
	private static final int BYTE_TORQUE_FLUTUANTE = 8;
	private static final int BYTE_PRESSAO = 10;

	private final Path arquivo;

	/** Cache em memória; o disco é a fonte, lida uma vez e reescrita a cada gravação. */
	private Map<String, Calibracao> porCard;

	public CalibracaoDeCards() {
		this(AppPaths.configDir().resolve("calibracao-cards.json"));
	}

	CalibracaoDeCards(Path arquivo) {
		this.arquivo = arquivo;
	}

	/**
	 * O que a estação mediu para um card.
	 *
	 * <p>Os três campos convivem porque um card usa um deles: peso usa {@code peso}, torque usa
	 * {@code chave}, e todo analógico usa {@code sensibilidade}.
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record Calibracao(double sensibilidade, PesoColunaConfig peso, ChaveHidraulicaConfig chave) {

		public static Calibracao padrao() {
			return new Calibracao(1.0, new PesoColunaConfig(), new ChaveHidraulicaConfig());
		}

		public Calibracao comSensibilidade(double nova) {
			return new Calibracao(nova, peso, chave);
		}

		public Calibracao comPeso(PesoColunaConfig novo) {
			return new Calibracao(sensibilidade, novo, chave);
		}

		public Calibracao comChave(ChaveHidraulicaConfig nova) {
			return new Calibracao(sensibilidade, peso, nova);
		}
	}

	/** Nunca devolve {@code null}: card sem calibração vem no padrão, e a tela mostra isso. */
	public synchronized Calibracao para(String dispositivoId) {
		if (dispositivoId == null || dispositivoId.isBlank()) {
			return Calibracao.padrao();
		}
		return carregar().getOrDefault(dispositivoId, Calibracao.padrao());
	}

	public synchronized void gravar(String dispositivoId, Calibracao calibracao) {
		if (dispositivoId == null || dispositivoId.isBlank() || calibracao == null) {
			return;
		}
		Map<String, Calibracao> mapa = carregar();
		mapa.put(dispositivoId, calibracao);
		persistir(mapa);
	}

	/**
	 * Traz a calibração dos slots posicionais para os ids do documento — uma vez só.
	 *
	 * <p>Roda quando um card ainda não tem entrada própria. A regra é por <b>endereço</b>: o card que
	 * lê o byte que o código antigo lia para o peso recebe a calibração do peso, e assim por diante.
	 *
	 * <p>⚠️ <b>Não apaga nada do {@code app-settings.json}.</b> Os valores antigos ficam onde estão:
	 * se a migração errar, o original continua disponível para conferência — e uma calibração medida
	 * em campo não é coisa que se descarte por conveniência de código.
	 *
	 * @return quantos cards receberam calibração agora
	 */
	public synchronized int migrar(CardsDaUnidade documento, AppSettings legado) {
		if (documento == null || legado == null || documento.cards().isEmpty()) {
			return 0;
		}
		Map<String, Calibracao> mapa = carregar();
		int migrados = 0;

		for (Card card : documento.cards()) {
			String id = card.dispositivoId();
			if (id == null || id.isBlank() || mapa.containsKey(id)) {
				continue;
			}
			Calibracao herdada = herancaDe(card, legado);
			if (herdada != null) {
				mapa.put(id, herdada);
				migrados++;
				logger.info("Calibracao migrada para o card {} a partir do endereco DBW{}.",
						id, card.byteInicial());
			}
		}

		if (migrados > 0) {
			persistir(mapa);
		}
		return migrados;
	}

	/**
	 * A calibração que o endereço do card tinha no mapeamento fixo, ou {@code null} se aquele
	 * endereço não era usado — caso em que o card nasce sem calibração e a tela avisa.
	 */
	private Calibracao herancaDe(Card card, AppSettings legado) {
		return switch (card.tipo()) {
			case PESO -> card.byteInicial() == BYTE_PESO
					? new Calibracao(sensibilidade(legado, 1), legado.getPesoColuna(), new ChaveHidraulicaConfig())
					: null;
			case TORQUE -> switch (card.byteInicial()) {
				case BYTE_TORQUE_TUBOS ->
					new Calibracao(sensibilidade(legado, 2), new PesoColunaConfig(), legado.getChaveTubos());
				case BYTE_TORQUE_FLUTUANTE ->
					new Calibracao(sensibilidade(legado, 3), new PesoColunaConfig(), legado.getChaveFlutuante());
				default -> null;
			};
			// Pressao so tem sensibilidade: o range vem do documento. Os dois cards de pressao de
			// hoje leem o mesmo DBW10, entao herdam a mesma.
			case PRESSAO -> card.byteInicial() == BYTE_PRESSAO
					? Calibracao.padrao().comSensibilidade(sensibilidade(legado, 4))
					: null;
			// Tipos novos nao tinham endereco fixo: nao ha o que herdar.
			case TEMPERATURA, NIVEL_TANQUE, CONTADOR_STROKE -> null;
		};
	}

	private static double sensibilidade(AppSettings legado, int indice) {
		var sensor = switch (indice) {
			case 1 -> legado.getSensor01();
			case 2 -> legado.getSensor02();
			case 3 -> legado.getSensor03();
			default -> legado.getSensor04();
		};
		return sensor == null ? 1.0 : sensor.getSensibilidade();
	}

	private Map<String, Calibracao> carregar() {
		if (porCard != null) {
			return porCard;
		}
		porCard = new LinkedHashMap<>();
		if (!Files.exists(arquivo)) {
			return porCard;
		}
		try {
			porCard = JSON.readValue(Files.readString(arquivo), new TypeReference<LinkedHashMap<String, Calibracao>>() {
			});
		} catch (Exception e) {
			// Arquivo truncado por queda de energia numa unidade, por exemplo. Segue no padrao, e a
			// tela mostra "ainda nao calibrado" em vez de converter com valor duvidoso.
			logger.warn("Calibracao dos cards ilegivel ({}). Seguindo sem ela.", e.getMessage());
			porCard = new LinkedHashMap<>();
		}
		return porCard;
	}

	private void persistir(Map<String, Calibracao> mapa) {
		Path temporario = null;
		try {
			Files.createDirectories(arquivo.getParent());
			temporario = Files.createTempFile(arquivo.getParent(), "calibracao-cards", ".tmp");
			Files.writeString(temporario, JSON.writeValueAsString(mapa));
			mover(temporario, arquivo);
			porCard = mapa;
		} catch (Exception e) {
			logger.warn("Nao foi possivel gravar a calibracao dos cards: {}", e.getMessage());
			if (temporario != null) {
				try {
					Files.deleteIfExists(temporario);
				} catch (IOException ignorado) {
					// Sobra um .tmp no diretorio de configuracao; nao vale derrubar nada por isso.
				}
			}
		}
	}

	/** Grava em temporário e move: uma queda no meio da escrita não deixa o arquivo pela metade. */
	private static void mover(Path origem, Path destino) throws IOException {
		try {
			Files.move(origem, destino, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
		} catch (AtomicMoveNotSupportedException semAtomico) {
			Files.move(origem, destino, StandardCopyOption.REPLACE_EXISTING);
		}
	}
}
