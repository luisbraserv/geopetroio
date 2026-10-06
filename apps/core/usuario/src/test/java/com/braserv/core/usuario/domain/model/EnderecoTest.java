package com.braserv.core.usuario.domain.model;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import org.junit.jupiter.api.Test;

class EnderecoTest {

	@Test
	void deveTratarEnderecoComCepMascaradoEEspacos() {
		Endereco endereco = Endereco.comTratamento("29.123-456", "  Avenida Brasil  ", "  Jardim Camburi ",
				" Vitoria ", " es ", " 1000 ", " ");

		assertEquals("29123-456", endereco.getCep());
		assertEquals("Avenida Brasil", endereco.getLogradouro());
		assertEquals("Jardim Camburi", endereco.getBairro());
		assertEquals("Vitoria", endereco.getCidade());
		assertEquals("ES", endereco.getEstado());
		assertEquals("1000", endereco.getNumero());
		assertEquals("", endereco.getComplemento());
	}

	@Test
	void deveRejeitarCepSemOitoDigitos() {
		assertThrows(IllegalArgumentException.class,
				() -> Endereco.comTratamento("29123", "Rua A", "Centro", "Vitoria", "ES", "10", null));
	}
}
