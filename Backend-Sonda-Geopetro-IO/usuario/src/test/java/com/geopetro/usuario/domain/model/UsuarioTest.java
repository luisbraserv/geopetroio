package com.geopetro.usuario.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

import com.geopetro.usuario.domain.exception.UsuarioInvalidoException;

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
		UsuarioInterno usuario = new UsuarioInterno(100, null, null, "Luis123", "Senha@123", "Luis",
				Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"), endereco(),
				java.util.Set.of(Role.INTERNO));

		assertEquals(Role.INTERNO, usuario.getRole());
		assertEquals(100, usuario.getMatricula());
		assertNull(usuario.getRegionalId());
	}

	@Test
	void deveCriarUsuarioInternoComRegional() {
		UsuarioInterno usuario = new UsuarioInterno(100, 1L, "Bahia", "Luis123", "Senha@123", "Luis",
				Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"), endereco(),
				java.util.Set.of(Role.INTERNO));

		assertEquals(1L, usuario.getRegionalId());
		assertEquals("Bahia", usuario.getRegionalNome());
	}

	@Test
	void deveCriarUsuarioInternoComMultiplasRegionaisESetores() {
		UsuarioInterno usuario = new UsuarioInterno(100, 7L, "Brasil",
				java.util.List.of(new UsuarioInterno.RegionalRef(7L, "Brasil"),
						new UsuarioInterno.RegionalRef(2L, "Bahia")),
				java.util.List.of(new UsuarioInterno.SetorRef(1L, "Cimentacao Onshore", 7L, "Brasil"),
						new UsuarioInterno.SetorRef(2L, "Cimentacao Offshore", 7L, "Brasil")),
				"Luis123", "Senha@123", "Luis", Telefone.comTratamento("11999999999"),
				Email.comTratamento("luis@braserv.com.br"), endereco(), java.util.Set.of(Role.INTERNO));

		assertEquals(7L, usuario.getRegionalId());
		assertEquals(java.util.Set.of(7L, 2L), usuario.getRegionalIds());
		assertEquals(java.util.Set.of(1L, 2L), usuario.getSetorIds());
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
				() -> new UsuarioInterno(100, null, null, "Luis123", "Senha123", "Luis",
						Telefone.comTratamento("11999999999"), Email.comTratamento("luis@braserv.com.br"),
						endereco(), java.util.Set.of(Role.INTERNO)));
	}

	private Endereco endereco() {
		return Endereco.comTratamento("29123456", "Rua A", "Centro", "Vitoria", "ES", "10", null);
	}
}
