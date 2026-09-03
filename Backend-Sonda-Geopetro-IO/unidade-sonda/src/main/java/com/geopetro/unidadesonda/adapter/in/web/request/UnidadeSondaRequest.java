package com.geopetro.unidadesonda.adapter.in.web.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record UnidadeSondaRequest(@NotBlank String nome, String apelido, @NotNull Long setorId) {
}
