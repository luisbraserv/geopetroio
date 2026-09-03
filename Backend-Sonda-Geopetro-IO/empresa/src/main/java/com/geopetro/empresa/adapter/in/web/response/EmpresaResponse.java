package com.geopetro.empresa.adapter.in.web.response;

import com.geopetro.empresa.adapter.out.persistence.entity.EmpresaEntity;

public record EmpresaResponse(Long id, String nome, String telefone, String cnpj, String email, String cep,
		String logradouro, String bairro, String cidade, String estado, String numero, String complemento) {

	public static EmpresaResponse de(EmpresaEntity empresa) {
		return new EmpresaResponse(empresa.getId(), empresa.getNome(), empresa.getTelefone(), empresa.getCnpj(),
				empresa.getEmail(), empresa.getCep(), empresa.getLogradouro(), empresa.getBairro(),
				empresa.getCidade(), empresa.getEstado(), empresa.getNumero(), empresa.getComplemento());
	}
}
