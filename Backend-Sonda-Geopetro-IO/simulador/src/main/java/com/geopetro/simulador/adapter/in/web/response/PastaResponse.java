package com.geopetro.simulador.adapter.in.web.response;

import com.geopetro.simulador.adapter.out.persistence.entity.PastaSimuladorEntity;
import java.time.LocalDateTime;

public record PastaResponse(
        Long id,
        String nome,
        String operacao,
        String criadoPor,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm,
        int totalCenarios
) {
    public static PastaResponse de(PastaSimuladorEntity e) {
        return new PastaResponse(
                e.getId(),
                e.getNome(),
                e.getOperacao(),
                e.getCriadoPor(),
                e.getCriadoEm(),
                e.getAtualizadoEm(),
                e.getCenarios().size()
        );
    }
}
