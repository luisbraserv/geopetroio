package com.geopetro.simulador.adapter.in.web.request;

import jakarta.validation.constraints.NotBlank;

public record CenarioRequest(
        @NotBlank(message = "Nome é obrigatório")
        String nome,

        @NotBlank(message = "Operação é obrigatória")
        String operacao,

        Long pastaId,

        @NotBlank(message = "Dados do formulário são obrigatórios")
        String formValue,

        Long pocoId,
        Long pocoVersion,

        String dadosRelatorio
) {}
