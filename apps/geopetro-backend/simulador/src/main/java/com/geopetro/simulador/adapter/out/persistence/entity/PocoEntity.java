package com.geopetro.simulador.adapter.out.persistence.entity;

import com.geopetro.simulador.domain.PocoGeometry;
import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "simulador_pocos")
public class PocoEntity {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;
    @Version @Column(nullable = false)
    private Long version;
    @Column(nullable = false)
    private String nome;
    @Convert(converter = PocoGeometryConverter.class)
    @Column(nullable = false, columnDefinition = "LONGTEXT")
    private PocoGeometry geometria;
    @Column(name = "atualizado_por", nullable = false)
    private String atualizadoPor;
    @Column(name = "atualizado_em", nullable = false)
    private LocalDateTime atualizadoEm;
    @PrePersist @PreUpdate
    void timestamp() { atualizadoEm = LocalDateTime.now(); }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public Long getVersion() { return version; }
    public void setVersion(Long version) { this.version = version; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public PocoGeometry getGeometria() { return geometria; }
    public void setGeometria(PocoGeometry geometria) { this.geometria = geometria; }
    public String getAtualizadoPor() { return atualizadoPor; }
    public void setAtualizadoPor(String atualizadoPor) { this.atualizadoPor = atualizadoPor; }
    public LocalDateTime getAtualizadoEm() { return atualizadoEm; }
}
