package com.geopetro.usuario.domain.model;

import java.util.ArrayList;
import java.util.List;

import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;

/**
 * Politica de senha do sistema — RN-061.
 *
 * <p>Oito a vinte caracteres, com minuscula, maiuscula, digito e caractere especial. Vale em
 * <b>todos</b> os caminhos que definem senha: criacao de cliente, criacao de interno e a troca
 * pelo proprio usuario.
 *
 * <p><b>Incide sobre a definicao, nunca sobre a verificacao.</b> Senhas ja gravadas que nao
 * atendam a regra continuam autenticando normalmente — forcar adequacao exigiria troca
 * compulsoria, que nao foi decidida.
 *
 * <p>Deliberadamente fora de escopo: expiracao periodica, historico de senhas anteriores e
 * bloqueio por tentativas.
 */
public final class PoliticaSenha {

	public static final int TAMANHO_MINIMO = 8;
	public static final int TAMANHO_MAXIMO = 20;

	private PoliticaSenha() {
	}

	/**
	 * Valida a senha informada, lancando {@link UsuarioInvalidoException} quando ela nao atende
	 * a politica. Reune todas as exigencias nao cumpridas numa mensagem so — apontar uma falha
	 * por vez faz o usuario descobrir a regra por tentativa e erro.
	 */
	public static void validar(String senha) {
		if (senha == null || senha.isEmpty()) {
			throw new UsuarioInvalidoException("Senha e obrigatoria.");
		}

		List<String> pendencias = new ArrayList<>();

		if (senha.length() < TAMANHO_MINIMO || senha.length() > TAMANHO_MAXIMO) {
			pendencias.add("ter de %d a %d caracteres".formatted(TAMANHO_MINIMO, TAMANHO_MAXIMO));
		}
		if (!contem(senha, Character::isLowerCase)) {
			pendencias.add("uma letra minuscula");
		}
		if (!contem(senha, Character::isUpperCase)) {
			pendencias.add("uma letra maiuscula");
		}
		if (!contem(senha, Character::isDigit)) {
			pendencias.add("um digito");
		}
		if (!contem(senha, PoliticaSenha::isEspecial)) {
			pendencias.add("um caractere especial");
		}

		if (!pendencias.isEmpty()) {
			throw new UsuarioInvalidoException("A senha deve " + String.join(", ", pendencias) + ".");
		}
	}

	/**
	 * Espaco em branco nao conta como caractere especial: e invisivel na conferencia, sobrevive
	 * mal a copia e colagem, e aceita-lo deixaria a senha depender de algo que o usuario nao ve.
	 */
	private static boolean isEspecial(char caractere) {
		return !Character.isLetterOrDigit(caractere) && !Character.isWhitespace(caractere);
	}

	private static boolean contem(String senha, CaracterePredicado predicado) {
		for (char caractere : senha.toCharArray()) {
			if (predicado.testa(caractere)) {
				return true;
			}
		}
		return false;
	}

	@FunctionalInterface
	private interface CaracterePredicado {
		boolean testa(char caractere);
	}
}
