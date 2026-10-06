package com.example.demo.services;

import java.util.Objects;
import java.util.Optional;

import com.example.demo.models.DocumentoDaUnidade;

/**
 * O último snapshot válido de um documento, isolado por backend/unidade e geração de conexão.
 *
 * <h2>As três guardas, e o que cada uma evita</h2>
 * <table>
 *   <tr><th>Guarda</th><th>O que evita</th></tr>
 *   <tr><td>Geração de conexão</td>
 *       <td>Um snapshot que chega atrasado, de uma conexão já encerrada, sobrescrever o atual</td></tr>
 *   <tr><td>Unidade</td>
 *       <td>Configuração de outra Unidade entrar como se fosse desta</td></tr>
 *   <tr><td>Revisão maior</td>
 *       <td>Regressão: um snapshot antigo que chegue fora de ordem não desfaz o mais novo</td></tr>
 * </table>
 *
 * <h2>O servidor manda sobre o disco</h2>
 * A guarda de revisão vale <b>dentro de uma conexão</b>. A primeira resposta do servidor em cada
 * conexão substitui o que estiver em memória, mesmo com revisão menor ou igual: o que veio do disco
 * é só o que a estação sabia da última vez, e o servidor pode ter mudado por baixo — banco recriado,
 * cards apagados, revisão recomeçando do zero, o mesmo id apontando para outra unidade. Até
 * 2026-10-02 a regra era "só revisão maior" desde o disco, e um cache de revisão 8 recusava para
 * sempre a unidade vazia (revisão 0) que o servidor respondia: a estação seguia mostrando e lendo os
 * cards de outra configuração.
 *
 * <p>Respaldado por {@link SnapshotStore}: o último snapshot válido sobrevive ao reinício do app
 * (RN-088). Sem isso, um Desktop que reinicia sem rede não saberia o que ler.
 *
 * @param <T> o documento guardado
 */
public abstract class EstadoDeDocumento<T extends DocumentoDaUnidade> {

	private final SnapshotStore<T> store;

	private String backend;
	private Long unidade;
	private long generation;
	/** Conexão em que o servidor já respondeu; dali em diante, só revisão maior substitui. */
	private long confirmadoNaGeracao = -1;
	private T current;

	protected EstadoDeDocumento(SnapshotStore<T> store) {
		this.store = store;
	}

	/**
	 * Troca de servidor, usuário ou unidade descarta o que estava em memória. Em seguida, se não
	 * houver nada, tenta o disco: é o caminho de quem acabou de abrir o app.
	 *
	 * <p>O snapshot restaurado entra como atual só até o servidor responder: a primeira resposta da
	 * conexão o substitui, qualquer que seja a revisão (ver a classe).
	 */
	public synchronized long conectar(String backend, Long unidade) {
		if (!Objects.equals(this.backend, backend) || !Objects.equals(this.unidade, unidade)) {
			current = null;
		}
		this.backend = backend;
		this.unidade = unidade;
		if (current == null && store != null) {
			current = store.carregar(backend, unidade).orElse(null);
		}
		return ++generation;
	}

	public synchronized boolean aceitar(long connection, T snapshot) {
		if (connection != generation || unidade == null || snapshot == null
				|| snapshot.unidadeId() != unidade) {
			return false;
		}
		boolean primeiraRespostaDaConexao = confirmadoNaGeracao != connection;
		if (!primeiraRespostaDaConexao && current != null && snapshot.revisao() <= current.revisao()) {
			return false;
		}
		current = snapshot;
		confirmadoNaGeracao = connection;
		if (store != null) {
			store.gravar(backend, unidade, snapshot);
		}
		return true;
	}

	/**
	 * O servidor respondeu que esta unidade não está disponível para este usuário: o documento dela,
	 * em memória e em disco, deixa de valer.
	 *
	 * <p>Apagar também o disco é deliberado. Só a memória não bastaria: a próxima tentativa de
	 * conexão restauraria o cache e a tela voltaria a mostrar, por alguns segundos a cada volta, os
	 * cards de uma unidade que o servidor já disse não ser desta estação.
	 *
	 * <p>Só age se a chave e a unidade ainda forem as atuais — uma troca de unidade no meio do
	 * caminho não apaga o documento da nova.
	 */
	public synchronized void descartar(String backend, Long unidade) {
		if (!Objects.equals(this.backend, backend) || !Objects.equals(this.unidade, unidade)) {
			return;
		}
		current = null;
		if (store != null) {
			store.apagar(backend, unidade);
		}
	}

	/** O snapshot atual, mas só se pertencer ao backend e à unidade pedidos. */
	public synchronized Optional<T> atual(String backend, Long unidade) {
		return Objects.equals(this.backend, backend) && Objects.equals(this.unidade, unidade)
				? atual()
				: Optional.empty();
	}

	public synchronized Optional<T> atual() {
		return Optional.ofNullable(current);
	}
}
