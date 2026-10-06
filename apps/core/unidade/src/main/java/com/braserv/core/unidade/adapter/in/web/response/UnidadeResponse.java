package com.braserv.core.unidade.adapter.in.web.response;

import com.braserv.core.unidade.adapter.out.persistence.entity.UnidadeEntity;
import com.braserv.core.unidade.domain.StatusUnidade;
import com.braserv.core.unidade.domain.TipoUnidade;

public record UnidadeResponse(
		Long id,
		String nome,
		String apelido,
		TipoUnidade tipo,
		StatusUnidade status,
		Long setorId,
		String setorNome,
		Long regionalId,
		String regionalNome) {

	public static UnidadeResponse de(UnidadeEntity unidade) {
		return new UnidadeResponse(
				unidade.getId(),
				unidade.getNome(),
				unidade.getApelido(),
				unidade.getTipo(),
				unidade.getStatus(),
				unidade.getSetor().getId(),
				unidade.getSetor().getNome(),
				unidade.getSetor().getRegional().getId(),
				unidade.getSetor().getRegional().getNome());
	}
}
