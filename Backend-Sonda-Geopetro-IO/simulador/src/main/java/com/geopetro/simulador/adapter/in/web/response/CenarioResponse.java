package com.geopetro.simulador.adapter.in.web.response;

import com.geopetro.simulador.adapter.out.persistence.entity.CenarioSimuladorEntity;
import java.time.LocalDateTime;

public record CenarioResponse(
        Long id,
        String nome,
        String operacao,
        Long pastaId,
        String pastaNome,
        String formValue,
        String dadosRelatorio,
        PocoResponse poco,
        String criadoPor,
        LocalDateTime criadoEm,
        LocalDateTime atualizadoEm
) {
    public static CenarioResponse de(CenarioSimuladorEntity e) {
        return new CenarioResponse(
                e.getId(),
                e.getNome(),
                e.getOperacao(),
                e.getPasta() != null ? e.getPasta().getId() : null,
                e.getPasta() != null ? e.getPasta().getNome() : null,
                e.getFormValue(),
                e.getDadosRelatorio(),
                e.getPoco() == null ? null : PocoResponse.de(e.getPoco()),
                e.getCriadoPor(),
                e.getCriadoEm(),
                e.getAtualizadoEm()
        );
    }
}
