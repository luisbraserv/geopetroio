package com.geopetro.desktop.alarmes;

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

import com.geopetro.desktop.alarmes.AvaliadorLocalDeAlarme.Faixa;
import com.geopetro.desktop.comum.AppPaths;
import com.geopetro.desktop.services.CalibracaoDeCards;
import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * O alarme desta estação, configurado nesta estação —
 * {@code specs/SDD/negocio/requisitos/configuracao-da-estacao.md §3}.
 *
 * <h2>Por que não vem do servidor</h2>
 * O valor <b>nasce aqui</b>: a estação lê o CLP, converte e sabe o número antes de qualquer outro.
 * Mandá-lo ao servidor, deixar o servidor decidir que está fora da faixa e trazer a decisão de volta
 * para tocar um beep na mesma máquina é uma volta pela rede para responder o que já estava
 * respondido ali — e a volta é justamente o que falta quando o alarme importa, porque a sonda sem
 * internet é o cenário em que o operador ao lado do equipamento é a única pessoa que pode agir.
 *
 * <h2>⚠️ São dois alarmes, e eles não se falam</h2>
 * O do servidor continua existindo, configurado no Front por quem enxerga a sonda (RN-069), e
 * responde <i>"o que aconteceu nesta sonda?"</i>. Este responde <i>"eu, aqui, preciso olhar isto
 * agora?"</i>. Divergirem é <b>comportamento correto</b>: o operador aperta o limite dele para uma
 * manobra sem alterar o que a supervisão vigia, e vice-versa.
 *
 * <h2>Arquivo próprio, por {@code dispositivoId}</h2>
 * Em {@code config/alarmes-locais.json}, pelo mesmo motivo de {@link CalibracaoDeCards}:
 * {@code app-settings.json} é lido e escrito com regex, e um mapa aninhado ali seria frágil sem
 * necessidade.
 *
 * <p>⚠️ <b>Por chave de grandeza, nunca por posição.</b> O documento de cards é reescrito a cada
 * publicação e a ordem da tela muda; uma configuração presa à posição migraria de grandeza sozinha,
 * e o alarme passaria a vigiar outra coisa <b>em silêncio</b> — um número plausível e errado, que é
 * o defeito mais caro desta base.
 *
 * <p>Falha de leitura vira log e segue sem alarme configurado: a tela mostra o sininho apagado, que
 * é visível, em vez de apitar por uma faixa que ninguém escolheu.
 */
@Service
public class AlarmesDaEstacao {

	private static final Logger logger = LoggerFactory.getLogger(AlarmesDaEstacao.class);

	/** Arquivo gravado antes de um campo existir não pode derrubar a configuração inteira. */
	private static final ObjectMapper JSON = new ObjectMapper()
			.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);

	/**
	 * O tempo mínimo não aparece na tela do sininho — o operador informa faixa e liga/desliga.
	 *
	 * <p>⚠️ Ele continua existindo, invisível, e é ele que impede o alarme de se destruir: sem
	 * tempo mínimo, um valor tremendo na fronteira produz um bipe por segundo, o operador desliga o
	 * som da estação e o próximo alarme de verdade não avisa ninguém.
	 *
	 * <p>São os mesmos números do servidor, para os dois lados não divergirem por acidente.
	 */
	static final int SEGUNDOS_PARA_ABRIR = 3;
	static final int SEGUNDOS_PARA_FECHAR = 5;

	private final Path arquivo;

	/** Cache em memória; o disco é a fonte, lido uma vez e reescrito a cada gravação. */
	private Map<String, AlarmeLocal> porGrandeza;

	public AlarmesDaEstacao() {
		this(AppPaths.configDir().resolve("alarmes-locais.json"));
	}

	AlarmesDaEstacao(Path arquivo) {
		this.arquivo = arquivo;
	}

	/**
	 * O alarme que esta estação vigia numa grandeza.
	 *
	 * @param serie  {@code null} para card de uma grandeza só; uma das três num contador (RN-098)
	 * @param ativo  liga/desliga <b>sem perder a faixa</b> — quem desliga para uma manobra encontra
	 *               os números onde deixou
	 */
	@JsonIgnoreProperties(ignoreUnknown = true)
	public record AlarmeLocal(String dispositivoId, String serie, Double minimo, Double maximo, boolean ativo) {

		/** A mesma chave do resto do sistema: as três séries de um contador compartilham o id. */
		public String chave() {
			return chaveDe(dispositivoId, serie);
		}

		/**
		 * ⚠️ Ativo sem faixa nenhuma não vigia coisa alguma.
		 *
		 * <p>É o engano mais fácil de cometer na tela: marcar o sininho e sair sem digitar número.
		 * Tratar isso como vigilância deixaria o sininho aceso sobre uma grandeza que nunca vai
		 * apitar — pior que apagado, porque promete o que não cumpre.
		 */
		public boolean vigia() {
			return ativo && (minimo != null || maximo != null);
		}

		/**
		 * A faixa que a regra avalia.
		 *
		 * <p>O par de <b>atenção</b> fica vazio: a tela do sininho oferece um nível só, e o motor
		 * continua com os dois porque um segundo nível no futuro não deve custar reescrita.
		 */
		public Faixa comoFaixa() {
			return new Faixa(null, null, minimo, maximo, SEGUNDOS_PARA_ABRIR, SEGUNDOS_PARA_FECHAR);
		}
	}

	public static String chaveDe(String dispositivoId, String serie) {
		return serie == null || serie.isBlank() ? dispositivoId : dispositivoId + "|" + serie;
	}

	/** {@code null} quando aquela grandeza não tem alarme configurado nesta estação. */
	public synchronized AlarmeLocal para(String dispositivoId, String serie) {
		if (dispositivoId == null || dispositivoId.isBlank()) {
			return null;
		}
		return carregar().get(chaveDe(dispositivoId, serie));
	}

	/**
	 * O que vigia de fato agora, por chave de grandeza.
	 *
	 * <p>Só entram os que estão ativos <b>e</b> têm ao menos um limiar — ver {@link AlarmeLocal#vigia()}.
	 */
	public synchronized Map<String, AlarmeLocal> vigiadas() {
		var mapa = new LinkedHashMap<String, AlarmeLocal>();
		carregar().forEach((chave, alarme) -> {
			if (alarme != null && alarme.vigia()) {
				mapa.put(chave, alarme);
			}
		});
		return Map.copyOf(mapa);
	}

	public synchronized void gravar(AlarmeLocal alarme) {
		if (alarme == null || alarme.dispositivoId() == null || alarme.dispositivoId().isBlank()) {
			return;
		}
		Map<String, AlarmeLocal> mapa = carregar();
		mapa.put(alarme.chave(), alarme);
		persistir(mapa);
	}

	/**
	 * Apaga a configuração de uma grandeza.
	 *
	 * <p>⚠️ Não confundir com desativar: desativar guarda a faixa para quando ela voltar a valer;
	 * apagar é para quem não quer mais o alarme ali.
	 */
	public synchronized void remover(String dispositivoId, String serie) {
		Map<String, AlarmeLocal> mapa = carregar();
		if (mapa.remove(chaveDe(dispositivoId, serie)) != null) {
			persistir(mapa);
		}
	}

	private Map<String, AlarmeLocal> carregar() {
		if (porGrandeza != null) {
			return porGrandeza;
		}
		porGrandeza = new LinkedHashMap<>();
		if (!Files.exists(arquivo)) {
			return porGrandeza;
		}
		try {
			porGrandeza = JSON.readValue(Files.readString(arquivo),
					new TypeReference<LinkedHashMap<String, AlarmeLocal>>() {
					});
		} catch (Exception e) {
			// Arquivo truncado por queda de energia numa unidade, por exemplo. Seguir sem alarme e
			// com o sininho apagado e visivel e melhor que apitar por uma faixa que ninguem escolheu.
			logger.warn("Alarmes locais ilegiveis ({}). Seguindo sem alarme configurado.", e.getMessage());
			porGrandeza = new LinkedHashMap<>();
		}
		return porGrandeza;
	}

	private void persistir(Map<String, AlarmeLocal> mapa) {
		Path temporario = null;
		try {
			Files.createDirectories(arquivo.getParent());
			temporario = Files.createTempFile(arquivo.getParent(), "alarmes-locais", ".tmp");
			Files.writeString(temporario, JSON.writeValueAsString(mapa));
			mover(temporario, arquivo);
			porGrandeza = mapa;
		} catch (Exception e) {
			logger.warn("Nao foi possivel gravar os alarmes locais: {}", e.getMessage());
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
