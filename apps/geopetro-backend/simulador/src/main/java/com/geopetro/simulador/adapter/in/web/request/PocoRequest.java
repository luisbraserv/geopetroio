package com.geopetro.simulador.adapter.in.web.request;

import com.geopetro.simulador.domain.PocoGeometry;
import jakarta.validation.constraints.*;

public record PocoRequest(
        @NotBlank @Size(max = 255) String nome,
        @NotNull PocoGeometry geometria,
        @PositiveOrZero Long version) {}
