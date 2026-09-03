package com.geopetro.unidadesonda.adapter.in.web.response;

import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;

public record UnidadeSondaResponse(
		Long id,
		String nome,
		String apelido,
		Long setorId,
		String setorNome,
		Long regionalId,
		String regionalNome) {

	public static UnidadeSondaResponse de(UnidadeSondaEntity unidade) {
		return new UnidadeSondaResponse(
				unidade.getId(),
				unidade.getNome(),
				unidade.getApelido(),
				unidade.getSetor().getId(),
				unidade.getSetor().getNome(),
				unidade.getSetor().getRegional().getId(),
				unidade.getSetor().getRegional().getNome());
	}
}
