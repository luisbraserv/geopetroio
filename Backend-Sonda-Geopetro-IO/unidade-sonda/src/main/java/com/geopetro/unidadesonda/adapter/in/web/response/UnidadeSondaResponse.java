package com.geopetro.unidadesonda.adapter.in.web.response;

import com.geopetro.unidadesonda.adapter.out.persistence.entity.UnidadeSondaEntity;
import com.geopetro.unidadesonda.domain.TipoUnidadeSonda;

public record UnidadeSondaResponse(
		Long id,
		String nome,
		String apelido,
		TipoUnidadeSonda tipo,
		Long setorId,
		String setorNome,
		Long regionalId,
		String regionalNome) {

	public static UnidadeSondaResponse de(UnidadeSondaEntity unidade) {
		return new UnidadeSondaResponse(
				unidade.getId(),
				unidade.getNome(),
				unidade.getApelido(),
				unidade.getTipo(),
				unidade.getSetor().getId(),
				unidade.getSetor().getNome(),
				unidade.getSetor().getRegional().getId(),
				unidade.getSetor().getRegional().getNome());
	}
}
