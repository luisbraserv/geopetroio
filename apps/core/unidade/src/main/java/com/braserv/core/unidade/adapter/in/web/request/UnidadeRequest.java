package com.braserv.core.unidade.adapter.in.web.request;

import com.braserv.core.unidade.domain.TipoUnidade;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UnidadeRequest(@NotBlank String nome, String apelido, @NotNull TipoUnidade tipo,
		@NotNull Long setorId) {
}
