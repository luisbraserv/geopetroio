package com.braserv.core.usuario.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class EmailTest {

	@Test
	void deveTratarEmailComEspacosEMaiusculas() {
		Email email = Email.comTratamento("  Luis.Silveira@BRASERV.COM.BR  ");

		assertEquals("luis.silveira", email.getUsuario());
		assertEquals("braserv.com.br", email.getDominio());
		assertEquals("luis.silveira@braserv.com.br", email.formatado());
	}

	@Test
	void deveRejeitarEmailSemArroba() {
		assertThrows(IllegalArgumentException.class, () -> Email.comTratamento("luis.silveirabraserv.com.br"));
	}
}
