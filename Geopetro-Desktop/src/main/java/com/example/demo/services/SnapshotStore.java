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

import com.example.demo.models.DocumentoDaUnidade;
import com.fasterxml.jackson.databind.ObjectMapper;

/**
 * Cache em disco do último snapshot válido de um documento de configuração — RN-088.
 *
 * <h2>Por que existe</h2>
 * Até 2026-09-07 o cache era só em memória. Um Desktop que reiniciava sem rede perdia os limites de
 * alarme e continuava lendo o CLP: incômodo, não fatal.
 *
 * <p>Com os cards vindos da configuração, a conta muda: <b>sem configuração o Desktop não sabe o que
 * ler, e a telemetria da unidade para por inteiro</b>. O cache em disco deixa de ser melhoria e vira
 * requisito.
 *
 * <h2>O que é gravado</h2>
 * O snapshot e a chave a que ele pertence — servidor, usuário e unidade. Sem a chave, trocar de
 * backend ou de unidade serviria configuração de outro lugar depois de um reinício.
 *
 * <p><b>Não grava senha.</b> A chave usa servidor e usuário, que já estão no arquivo de
 * configurações; a credencial não passa por aqui.
 *
 * <h2>Falha nunca derruba o app</h2>
 * Ler ou gravar pode falhar — disco cheio, permissão, arquivo truncado por queda de energia numa
 * unidade. Toda falha vira log e segue: no pior caso o Desktop age como agia antes, esperando o
 * snapshot chegar pela rede.
 *
 * @param <T> o documento guardado; um arquivo por tipo
 */
public abstract class SnapshotStore<T extends DocumentoDaUnidade> {

	private static final Logger logger = LoggerFactory.getLogger(SnapshotStore.class);
	private static final ObjectMapper JSON = new ObjectMapper();

	private final Path arquivo;
	private final Class<T> tipo;
	private final String rotulo;

	protected SnapshotStore(Path arquivo, Class<T> tipo, String rotulo) {
		this.arquivo = arquivo;
		this.tipo = tipo;
		this.rotulo = rotulo;
	}

	/** Envelope gravado: o snapshot mais a identidade a que ele pertence. */
	private record Entrada<T>(String chave, Long unidade, T snapshot) {
	}

	/**
	 * @return o snapshot gravado, se ele pertencer exatamente a esta chave e unidade
	 */
	public Optional<T> carregar(String chave, Long unidade) {
		if (chave == null || unidade == null || !Files.exists(arquivo)) {
			return Optional.empty();
		}
		try {
			var envelope = JSON.getTypeFactory().constructParametricType(Entrada.class, tipo);
			Entrada<T> entrada = JSON.readValue(Files.readString(arquivo), envelope);
			if (entrada == null || entrada.snapshot() == null
					|| !Objects.equals(entrada.chave(), chave)
					|| !Objects.equals(entrada.unidade(), unidade)) {
				return Optional.empty();
			}
			logger.info("{} restaurada do disco: unidade {}, revisao {}",
					rotulo, unidade, entrada.snapshot().revisao());
			return Optional.of(entrada.snapshot());
		} catch (Exception e) {
			// Arquivo corrompido ou de um formato antigo. Descartar e esperar a rede e melhor que
			// subir com configuracao que ninguem consegue interpretar.
			logger.warn("Cache de {} ilegivel, sera ignorado: {}", rotulo, e.getMessage());
			return Optional.empty();
		}
	}

	/** Grava de forma atômica: o arquivo final nunca fica pela metade. */
	public void gravar(String chave, Long unidade, T snapshot) {
		if (chave == null || unidade == null || snapshot == null) {
			return;
		}
		Path temporario = null;
		try {
			Files.createDirectories(arquivo.getParent());
			temporario = Files.createTempFile(arquivo.getParent(), "snapshot", ".tmp");
			Files.writeString(temporario, JSON.writeValueAsString(new Entrada<>(chave, unidade, snapshot)));
			mover(temporario, arquivo);
			temporario = null;
		} catch (Exception e) {
			logger.warn("Nao foi possivel gravar o cache de {}: {}", rotulo, e.getMessage());
		} finally {
			apagarSobra(temporario);
		}
	}

	/**
	 * Prefere a movimentação atômica; alguns sistemas de arquivos do Windows a recusam quando o
	 * destino existe, e aí o REPLACE_EXISTING simples resolve.
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
