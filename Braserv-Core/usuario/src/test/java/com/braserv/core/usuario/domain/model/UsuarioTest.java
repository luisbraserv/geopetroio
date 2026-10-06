package com.braserv.core.usuario.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import com.braserv.core.usuario.domain.exception.UsuarioInvalidoException;

class UsuarioTest {

	@Test
	void deveCriarUsuarioClienteValido() {
		UsuarioCliente usuario = new UsuarioCliente(1, "Braserv", "Luis123", "Senha@123", "Luis",
				Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"), endereco());

		assertEquals(Role.CLIENTE, usuario.getRole());
		assertEquals(StatusUsuario.ATIVO, usuario.getStatus());
		assertEquals("Braserv", usuario.getEmpresa());
	}

	@Test
	void deveCriarUsuarioInternoValido() {
		UsuarioInterno usuario = new UsuarioInterno(100, "Luis123", "Senha@123", "Luis",
				Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"), endereco(),
				java.util.Set.of(Role.INTERNO));

		assertEquals(Role.INTERNO, usuario.getRole());
		assertEquals(100, usuario.getMatricula());
	}

	/** RN-064 — o interno nao tem mais regional nem setor; so matricula o distingue do cliente. */
	@Test
	void deveRejeitarMatriculaInvalida() {
		assertThrows(UsuarioInvalidoException.class,
				() -> new UsuarioInterno(0, "Luis123", "Senha@123", "Luis",
						Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"),
						endereco(), java.util.Set.of(Role.INTERNO)));
	}

	@Test
	void deveRejeitarUsernameComCaracterEspecial() {
		assertThrows(UsuarioInvalidoException.class,
				() -> new UsuarioCliente(1, "Braserv", "Luis@123", "Senha@123", "Luis",
						Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"),
						endereco()));
	}

	@Test
	void deveRejeitarPasswordSemCaracterEspecial() {
		assertThrows(UsuarioInvalidoException.class,
				() -> new UsuarioInterno(100, "Luis123", "Senha123", "Luis",
						Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"),
						endereco(), java.util.Set.of(Role.INTERNO)));
	}

	private Endereco endereco() {
		return Endereco.comTratamento("29123456", "Rua A", "Centro", "Vitoria", "ES", "10", null);
	}
}
