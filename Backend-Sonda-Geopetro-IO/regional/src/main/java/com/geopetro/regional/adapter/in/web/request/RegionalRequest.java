package com.geopetro.regional.adapter.in.web.request;

import jakarta.validation.constraints.NotBlank;

public record RegionalRequest(@NotBlank String nome, String centroCusto) {
}
