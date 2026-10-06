package com.braserv.core.usuario.domain.model;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;

/** RN-061 — politica de senha unificada. */
class PoliticaSenhaTest {

	@ParameterizedTest
	@ValueSource(strings = {
			"Senha@123",
			"aB3$efgh",
			"aB3$efghijklmnopqrst",
			"Braserv#2026",
			"Sénha@123"
	})
	void deveAceitarSenhaQueAtendeAPolitica(String senha) {
		assertDoesNotThrow(() -> PoliticaSenha.validar(senha));
	}

	@Test
	void deveRejeitarSenhaComMenosDeOitoCaracteres() {
		UsuarioInvalidoException erro = assertThrows(UsuarioInvalidoException.class,
				() -> PoliticaSenha.validar("aB3$efg"));

		assertTrue(erro.getMessage().contains("de 8 a 20 caracteres"), erro.getMessage());
	}

	@Test
	void deveRejeitarSenhaComMaisDeVinteCaracteres() {
		assertThrows(UsuarioInvalidoException.class, () -> PoliticaSenha.validar("aB3$efghijklmnopqrstu"));
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"SENHA@123",
			"senha@123",
			"Senha@abc",
			"Senha1234"
	})
	void deveRejeitarSenhaSemAlgumaDasQuatroClasses(String senha) {
		assertThrows(UsuarioInvalidoException.class, () -> PoliticaSenha.validar(senha));
	}

	@Test
	void deveRejeitarSenhaNulaOuVazia() {
		assertThrows(UsuarioInvalidoException.class, () -> PoliticaSenha.validar(null));
		assertThrows(UsuarioInvalidoException.class, () -> PoliticaSenha.validar(""));
	}

	@Test
	void espacoNaoContaComoCaractereEspecial() {
		UsuarioInvalidoException erro = assertThrows(UsuarioInvalidoException.class,
				() -> PoliticaSenha.validar("Senha 123"));

		assertTrue(erro.getMessage().contains("caractere especial"), erro.getMessage());
	}

	@Test
	void deveReunirTodasAsPendenciasNumaMensagemSo() {
		UsuarioInvalidoException erro = assertThrows(UsuarioInvalidoException.class,
				() -> PoliticaSenha.validar("abc"));

		String mensagem = erro.getMessage();
		assertTrue(mensagem.contains("de 8 a 20 caracteres"), mensagem);
		assertTrue(mensagem.contains("maiuscula"), mensagem);
		assertTrue(mensagem.contains("digito"), mensagem);
		assertTrue(mensagem.contains("caractere especial"), mensagem);
	}
}
