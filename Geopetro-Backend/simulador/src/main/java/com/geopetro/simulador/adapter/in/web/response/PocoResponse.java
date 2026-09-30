package com.geopetro.simulador.adapter.in.web.response;

import com.geopetro.simulador.domain.PocoGeometry;
import com.geopetro.simulador.adapter.out.persistence.entity.PocoEntity;
import java.time.LocalDateTime;

public record PocoResponse(Long id, String nome, PocoGeometry geometria, Long version,
        String atualizadoPor, LocalDateTime atualizadoEm) {
    public static PocoResponse de(PocoEntity e) {
        return new PocoResponse(e.getId(), e.getNome(), e.getGeometria(), e.getVersion(),
                e.getAtualizadoPor(), e.getAtualizadoEm());
    }
}
