package com.geopetro.regional.adapter.in.web.response;

import com.geopetro.regional.adapter.out.persistence.entity.RegionalEntity;

public record RegionalResponse(Long id, String nome, String centroCusto) {

	public static RegionalResponse de(RegionalEntity regional) {
		return new RegionalResponse(regional.getId(), regional.getNome(), regional.getCentroCusto());
	}
}
