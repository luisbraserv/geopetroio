package com.example.demo.models;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

import java.time.LocalDateTime;

@Entity
public class SondaReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDateTime timestamp;

    // B002 — Peso Coluna (lbf calculado)
    private Double pesoColunLbf;

    // B003 — Torque Ch. Hid. Tubos (lbf·ft)
    private Double torqueTubos;

    // B004 — Torque Ch. Flutuante (lbf·ft)
    private Double torqueFluante;

    // B005 — Pressão Bomba/ESCP (psi)
    private Double pressaoBomba;

    // B001 — Vazão (bbl/min)
    private Double vazaoBblMin;

    // stroke atual
    private Long strokeAtual;

    public SondaReading() {}

    public SondaReading(LocalDateTime timestamp, Double pesoColunLbf, Double torqueTubos,
                         Double torqueFluante, Double pressaoBomba, Double vazaoBblMin, Long strokeAtual) {
        this.timestamp    = timestamp;
        this.pesoColunLbf = pesoColunLbf;
        this.torqueTubos  = torqueTubos;
        this.torqueFluante = torqueFluante;
        this.pressaoBomba = pressaoBomba;
        this.vazaoBblMin  = vazaoBblMin;
        this.strokeAtual  = strokeAtual;
    }

    public Long getId()                     { return id; }
    public LocalDateTime getTimestamp()     { return timestamp; }
    public Double getPesoColunLbf()         { return pesoColunLbf; }
    public Double getTorqueTubos()          { return torqueTubos; }
    public Double getTorqueFluante()        { return torqueFluante; }
    public Double getPressaoBomba()         { return pressaoBomba; }
    public Double getVazaoBblMin()          { return vazaoBblMin; }
    public Long getStrokeAtual()            { return strokeAtual; }
}
