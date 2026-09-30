package com.geopetro.security.domain;

import org.springframework.http.HttpStatus;

import com.geopetro.core.exception.RegraNegocioException;

public class AutenticacaoInvalidaException extends RegraNegocioException {

	public AutenticacaoInvalidaException() {
		super("Usuário ou senha inválidos.", HttpStatus.UNAUTHORIZED);
	}

	private AutenticacaoInvalidaException(String mensagem) {
		super(mensagem, HttpStatus.UNAUTHORIZED);
	}

	/**
	 * Conta desativada — RN-062. A mensagem distingue o caso porque o sistema nao tem
	 * autocadastro: as contas sao nomeadas e criadas por ADMIN, e mandar o usuario tentar a senha
	 * de novo quando o problema e o status apenas gera chamado.
	 */
	public static AutenticacaoInvalidaException contaDesativada() {
		return new AutenticacaoInvalidaException("Usuário desativado. Procure o administrador.");
	}
}
