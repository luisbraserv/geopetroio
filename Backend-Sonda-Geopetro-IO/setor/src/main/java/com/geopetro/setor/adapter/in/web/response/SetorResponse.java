package com.geopetro.setor.adapter.in.web.response;

import com.geopetro.setor.adapter.out.persistence.entity.SetorEntity;

public record SetorResponse(Long id, String nome, String centroCusto, Long regionalId, String regionalNome) {

	public static SetorResponse de(SetorEntity setor) {
		return new SetorResponse(
				setor.getId(),
				setor.getNome(),
				setor.getCentroCusto(),
				setor.getRegional().getId(),
				setor.getRegional().getNome());
	}
}
