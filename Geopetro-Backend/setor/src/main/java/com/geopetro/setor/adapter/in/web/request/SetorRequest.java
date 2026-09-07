package com.geopetro.setor.adapter.in.web.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record SetorRequest(@NotBlank String nome, String centroCusto, @NotNull Long regionalId) {
}
