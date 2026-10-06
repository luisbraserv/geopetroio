package com.geopetro.comum.port;

import java.util.Optional;
import java.util.Set;

/**
 * O acesso <b>atual</b> de um usuario, segundo o Braserv-Core — spec braserv-core §6.6.
 *
 * <p>O token diz quais eram as roles no login; o usuario pode ter sido desativado ou alterado
 * depois. Esta porta responde o estado de agora, e alimenta o corte de acesso (RN-062, RN-107), o
 * escopo de unidades (RN-047, RN-048), quem configura cards (RN-086) e as permissoes do tempo real.
 */
public interface AcessoDoUsuarioPort {

	/**
	 * @return vazio se o usuario nao existe no core
	 * @throws BraservCoreIndisponivelException se o core nao respondeu e nao ha resposta recente
	 *                                          o bastante para usar no lugar
	 */
	Optional<AcessoDoUsuario> buscar(String username);

	/**
	 * @param tipo       {@code CLIENTE} ou {@code INTERNO}
	 * @param roles      roles atuais, pelo nome; uma role que este backend nao conhece e ignorada
	 * @param unidadeIds unidades concedidas ao cliente (RN-048); vazio para {@code INTERNO}
	 */
	record AcessoDoUsuario(String username, String tipo, boolean ativo, Set<String> roles, Set<Long> unidadeIds) {
		public AcessoDoUsuario {
			roles = roles == null ? Set.of() : Set.copyOf(roles);
			unidadeIds = unidadeIds == null ? Set.of() : Set.copyOf(unidadeIds);
		}

		public boolean cliente() {
			return "CLIENTE".equals(tipo);
		}
	}

	/** O Braserv-Core nao respondeu, e nao ha resposta recente o bastante para usar no lugar. */
	class BraservCoreIndisponivelException extends RuntimeException {
		public BraservCoreIndisponivelException(String mensagem, Throwable causa) {
			super(mensagem, causa);
		}
	}
}
