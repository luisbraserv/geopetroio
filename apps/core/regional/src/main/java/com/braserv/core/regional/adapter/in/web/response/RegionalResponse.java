package com.braserv.core.regional.adapter.in.web.response;

import com.braserv.core.regional.adapter.out.persistence.entity.RegionalEntity;

public record RegionalResponse(Long id, String nome, String centroCusto) {

	public static RegionalResponse de(RegionalEntity regional) {
		return new RegionalResponse(regional.getId(), regional.getNome(), regional.getCentroCusto());
	}
}
