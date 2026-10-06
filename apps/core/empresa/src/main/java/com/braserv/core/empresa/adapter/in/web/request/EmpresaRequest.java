package com.braserv.core.empresa.adapter.in.web.request;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;

public record EmpresaRequest(
		@NotBlank String nome,
		String telefone,
		String cnpj,
		@Email String email,
		String cep,
		String logradouro,
		String bairro,
		String cidade,
		String estado,
		String numero,
		String complemento) {
}
