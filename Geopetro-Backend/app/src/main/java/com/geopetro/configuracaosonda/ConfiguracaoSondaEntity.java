package com.geopetro.configuracaosonda;
import jakarta.persistence.*;
import java.time.Instant;
@Entity @Table(name = "configuracao_sonda")
public class ConfiguracaoSondaEntity {
    @Id @Column(name = "unidade_sonda_id") Long unidadeSondaId;
    @Version Long version;
    @Column(name = "limites_json", nullable = false, columnDefinition = "LONGTEXT") String limitesJson;
    @Column(name = "atualizado_por", nullable = false) String atualizadoPor;
    @Column(name = "atualizado_em", nullable = false) Instant atualizadoEm;
    public ConfiguracaoSondaEntity() {}
}
