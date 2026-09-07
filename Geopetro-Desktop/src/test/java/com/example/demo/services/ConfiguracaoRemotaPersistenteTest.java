package com.example.demo.services;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import com.example.demo.models.ConfiguracaoSondaRemota;

/**
 * RN-088 — a configuracao sobrevive ao reinicio do app.
 *
 * <p>Enquanto o cache era so de memoria, reiniciar sem rede custava os limites de alarme. Com os
 * cards vindo da configuracao, custaria <b>toda a telemetria da unidade</b>: sem configuracao o
 * Desktop nao sabe o que ler.
 */
class ConfiguracaoRemotaPersistenteTest {

	@TempDir
	Path pasta;

	private static final String CHAVE = "https://backend\nana";

	private ConfiguracaoRemotaStore store() {
		return new ConfiguracaoRemotaStore(pasta.resolve("configuracao-remota.json"));
	}

	private ConfiguracaoSondaRemota snapshot(long unidade, long revisao) {
		return new ConfiguracaoSondaRemota(1, unidade, revisao, List.of(), "ana", "2026-09-07T12:00:00Z");
	}

	/** Simula fechar e reabrir o app: instancia nova, mesmo disco. */
	private ConfiguracaoRemotaState reabrir() {
		return new ConfiguracaoRemotaState(store());
	}

	@Test
	@DisplayName("o snapshot sobrevive ao reinicio, sem rede")
	void sobreviveAoReinicio() {
		var antes = reabrir();
		long geracao = antes.conectar(CHAVE, 7L);
		assertTrue(antes.aceitar(geracao, snapshot(7, 4)));

		// Nenhuma rede depois daqui: o proximo processo so tem o disco.
		var depois = reabrir();
		depois.conectar(CHAVE, 7L);

		assertEquals(4, depois.atual().orElseThrow().revisao());
	}

	@Test
	@DisplayName("o snapshot restaurado nao e substituido por revisao menor ou igual")
	void restauradoNaoRegride() {
		var antes = reabrir();
		antes.aceitar(antes.conectar(CHAVE, 7L), snapshot(7, 4));

		var depois = reabrir();
		long geracao = depois.conectar(CHAVE, 7L);

		assertFalse(depois.aceitar(geracao, snapshot(7, 3)), "revisao menor nao entra");
		assertFalse(depois.aceitar(geracao, snapshot(7, 4)), "revisao igual nao entra");
		assertTrue(depois.aceitar(geracao, snapshot(7, 5)), "revisao maior entra");
		assertEquals(5, depois.atual().orElseThrow().revisao());
	}

	@Test
	@DisplayName("configuracao de outra unidade nao e restaurada")
	void naoRestauraDeOutraUnidade() {
		var antes = reabrir();
		antes.aceitar(antes.conectar(CHAVE, 7L), snapshot(7, 4));

		var depois = reabrir();
		depois.conectar(CHAVE, 8L);

		assertTrue(depois.atual().isEmpty());
	}

	@Test
	@DisplayName("configuracao de outro servidor ou usuario nao e restaurada")
	void naoRestauraDeOutraConta() {
		var antes = reabrir();
		antes.aceitar(antes.conectar(CHAVE, 7L), snapshot(7, 4));

		assertTrue(reabrir().atual(CHAVE, 7L).isEmpty(), "sem conectar, nada e carregado");

		var outraConta = reabrir();
		outraConta.conectar("https://backend\noutra", 7L);
		assertTrue(outraConta.atual().isEmpty());

		var outroServidor = reabrir();
		outroServidor.conectar("https://outro\nana", 7L);
		assertTrue(outroServidor.atual().isEmpty());
	}

	@Test
	@DisplayName("arquivo corrompido e ignorado, e o app sobe sem configuracao")
	void arquivoCorrompidoNaoDerruba() throws Exception {
		Files.writeString(pasta.resolve("configuracao-remota.json"), "{ isto nao e json valido");

		var estado = reabrir();
		estado.conectar(CHAVE, 7L);

		assertTrue(estado.atual().isEmpty());
		// E continua funcionando: o snapshot que vier pela rede entra normalmente.
		assertTrue(estado.aceitar(estado.conectar(CHAVE, 7L), snapshot(7, 1)));
	}

	@Test
	@DisplayName("falha ao gravar nao derruba a aplicacao")
	void falhaAoGravarNaoDerruba() {
		// Caminho impossivel de criar: o pai e um arquivo, nao um diretorio.
		Path bloqueado = pasta.resolve("arquivo.txt").resolve("sub").resolve("c.json");
		var estado = new ConfiguracaoRemotaState(new ConfiguracaoRemotaStore(bloqueado));

		long geracao = estado.conectar(CHAVE, 7L);

		assertTrue(estado.aceitar(geracao, snapshot(7, 1)), "a memoria continua funcionando");
		assertEquals(1, estado.atual().orElseThrow().revisao());
	}

	@Test
	@DisplayName("nao sobra arquivo temporario apos gravar")
	void naoDeixaTemporario() throws Exception {
		var estado = reabrir();
		estado.aceitar(estado.conectar(CHAVE, 7L), snapshot(7, 1));
		estado.aceitar(estado.conectar(CHAVE, 7L), snapshot(7, 2));

		try (var arquivos = Files.list(pasta)) {
			assertTrue(arquivos.noneMatch(f -> f.getFileName().toString().endsWith(".tmp")));
		}
	}

	@Test
	@DisplayName("a senha nunca chega ao disco")
	void naoGravaSenha() throws Exception {
		var estado = reabrir();
		estado.aceitar(estado.conectar(CHAVE, 7L), snapshot(7, 1));

		String gravado = Files.readString(pasta.resolve("configuracao-remota.json"));
		assertTrue(gravado.contains("ana"), "a chave identifica servidor e usuario");
		assertFalse(gravado.contains("senha"), "credencial nao passa pelo cache");
	}
}
