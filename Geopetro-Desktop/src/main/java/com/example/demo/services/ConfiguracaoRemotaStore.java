package com.example.demo.services;

import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Objects;
import java.util.Optional;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import com.example.demo.config.AppPaths;
import com.example.demo.models.ConfiguracaoSondaRemota;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Cache em disco do ultimo snapshot valido de configuracao — RN-088.
 *
 * <h2>Por que existe</h2>
 * Ate aqui o cache era so em memoria. Um Desktop que reiniciava sem rede perdia os limites de
 * alarme e continuava lendo o CLP e publicando: incomodo, nao fatal.
 *
 * <p>Com os cards vindos da configuracao, a conta muda: <b>sem configuracao o Desktop nao sabe o
 * que ler, e a telemetria da unidade para por inteiro</b>. O cache em disco deixa de ser melhoria
 * e vira requisito.
 *
 * <h2>O que e gravado</h2>
 * O snapshot e a chave a que ele pertence — servidor, usuario e unidade. Sem a chave, trocar de
 * backend ou de unidade serviria configuracao de outro lugar depois de um reinicio.
 *
 * <p><b>Nao grava senha.</b> A chave usa servidor e usuario, que ja estao no arquivo de
 * configuracoes; a credencial nao passa por aqui.
 *
 * <h2>Falha nunca derruba o app</h2>
 * Ler ou gravar pode falhar — disco cheio, permissao, arquivo truncado por queda de energia numa
 * unidade. Toda falha vira log e segue: no pior caso o Desktop age como agia antes, esperando o
 * snapshot chegar pela rede.
 */
public class ConfiguracaoRemotaStore {

	private static final Logger logger = LoggerFactory.getLogger(ConfiguracaoRemotaStore.class);
	private static final ObjectMapper JSON = new ObjectMapper();

	private final Path arquivo;

	public ConfiguracaoRemotaStore() {
		this(AppPaths.configDir().resolve("configuracao-remota.json"));
	}

	ConfiguracaoRemotaStore(Path arquivo) {
		this.arquivo = arquivo;
	}

	/** Envelope gravado: o snapshot mais a identidade a que ele pertence. */
	record Entrada(String chave, Long unidade, ConfiguracaoSondaRemota snapshot) {
	}

	/**
	 * @return o snapshot gravado, se ele pertencer exatamente a esta chave e unidade
	 */
	public Optional<ConfiguracaoSondaRemota> carregar(String chave, Long unidade) {
		if (chave == null || unidade == null || !Files.exists(arquivo)) {
			return Optional.empty();
		}
		try {
			Entrada entrada = JSON.readValue(Files.readString(arquivo), Entrada.class);
			if (entrada == null || entrada.snapshot() == null
					|| !Objects.equals(entrada.chave(), chave)
					|| !Objects.equals(entrada.unidade(), unidade)) {
				return Optional.empty();
			}
			logger.info("Configuracao restaurada do disco: unidade {}, revisao {}",
					unidade, entrada.snapshot().revisao());
			return Optional.of(entrada.snapshot());
		} catch (Exception e) {
			// Arquivo corrompido ou de um formato antigo. Descartar e esperar a rede e melhor que
			// subir com configuracao que ninguem consegue interpretar.
			logger.warn("Cache de configuracao ilegivel, sera ignorado: {}", e.getMessage());
			return Optional.empty();
		}
	}

	/** Grava de forma atomica: o arquivo final nunca fica pela metade. */
	public void gravar(String chave, Long unidade, ConfiguracaoSondaRemota snapshot) {
		if (chave == null || unidade == null || snapshot == null) {
			return;
		}
		Path temporario = null;
		try {
			Files.createDirectories(arquivo.getParent());
			temporario = Files.createTempFile(arquivo.getParent(), "configuracao-remota", ".tmp");
			Files.writeString(temporario, JSON.writeValueAsString(new Entrada(chave, unidade, snapshot)));
			mover(temporario, arquivo);
			temporario = null;
		} catch (Exception e) {
			logger.warn("Nao foi possivel gravar o cache de configuracao: {}", e.getMessage());
		} finally {
			apagarSobra(temporario);
		}
	}

	/**
	 * Prefere a movimentacao atomica; alguns sistemas de arquivos do Windows a recusam quando o
	 * destino existe, e ai o REPLACE_EXISTING simples resolve.
	 */
	private static void mover(Path origem, Path destino) throws IOException {
		try {
			Files.move(origem, destino, StandardCopyOption.ATOMIC_MOVE, StandardCopyOption.REPLACE_EXISTING);
		} catch (AtomicMoveNotSupportedException e) {
			Files.move(origem, destino, StandardCopyOption.REPLACE_EXISTING);
		}
	}

	private static void apagarSobra(Path temporario) {
		if (temporario == null) {
			return;
		}
		try {
			Files.deleteIfExists(temporario);
		} catch (IOException ignorado) {
			// Sobra de arquivo temporario nao justifica derrubar nada.
		}
	}
}
