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
 *       <td>Configuração de outra Unidade/Sonda entrar como se fosse desta</td></tr>
 *   <tr><td>Revisão maior</td>
 *       <td>Regressão: um snapshot antigo que chegue fora de ordem não desfaz o mais novo</td></tr>
 * </table>
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
	private T current;

	protected EstadoDeDocumento(SnapshotStore<T> store) {
		this.store = store;
	}

	/**
	 * Troca de servidor, usuário ou unidade descarta o que estava em memória. Em seguida, se não
	 * houver nada, tenta o disco: é o caminho de quem acabou de abrir o app.
	 *
	 * <p>O snapshot restaurado entra como atual, então {@link #aceitar} continua exigindo revisão
	 * <b>maior</b> para substituí-lo — um snapshot atrasado que chegue depois não regride a
	 * configuração.
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
				|| snapshot.unidadeSondaId() != unidade
				|| (current != null && snapshot.revisao() <= current.revisao())) {
			return false;
		}
		current = snapshot;
		if (store != null) {
			store.gravar(backend, unidade, snapshot);
		}
		return true;
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
