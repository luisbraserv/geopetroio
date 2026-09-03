package com.geopetro.usuario.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class TelefoneTest {

	@Test
	void deveFormatarTelefoneComDddENumero() {
		Telefone telefone = new Telefone("11", "999999999");

		assertEquals("(11) 99999-9999", telefone.formatado());
	}

	@Test
	void deveTratarTelefoneComMascara() {
		Telefone telefone = Telefone.comTratamento("(21) 98888-7777");

		assertEquals("21", telefone.getDdd());
		assertEquals("988887777", telefone.getNumero());
		assertEquals("(21) 98888-7777", telefone.formatado());
	}

	@Test
	void deveRejeitarTelefoneSemOnzeDigitos() {
		assertThrows(IllegalArgumentException.class, () -> Telefone.comTratamento("99999-9999"));
	}
}
