package com.geopetro.comum.port;

import java.util.List;
import java.util.Optional;

/**
 * O catalogo de unidades do Braserv-Core — spec braserv-core §7.
 *
 * <p>Leitura vem de um cache curto (60 s): uma unidade criada ou inativada no core aparece aqui em
 * ate um minuto. Antes de <b>gravar</b> qualquer dado que referencie uma unidade, use
 * {@link #buscarSemCache}: ela pode ter sido excluida agora ha pouco.
 */
public interface CatalogoDeUnidadesPort {

	/** Todas, ativas e inativas. */
	List<Unidade> listar();

	Optional<Unidade> buscar(long id);

	/** Pelo nome, que e a chave de integracao com MQTT e InfluxDB (RN-018). */
	Optional<Unidade> buscarPorNome(String nome);

	/** Pergunta ao core agora, sem cache. */
	Optional<Unidade> buscarSemCache(long id);

	/**
	 * @param tipo   {@code SONDA}, {@code UNIDADE_BOMBEIO}... (RN-065)
	 * @param status {@code ATIVA} ou {@code INATIVA} (RN-116)
	 */
	record Unidade(Long id, String nome, String apelido, String tipo, String status, Long setorId) {
		public boolean ativa() {
			return "ATIVA".equals(status);
		}
	}
}
