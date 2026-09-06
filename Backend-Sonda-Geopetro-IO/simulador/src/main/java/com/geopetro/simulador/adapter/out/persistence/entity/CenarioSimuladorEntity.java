package com.geopetro.simulador.adapter.out.persistence.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;

@Entity
@Table(name = "simulador_cenarios")
public class CenarioSimuladorEntity {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    @Column(nullable = false, length = 16)
    private String operacao;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "pasta_id")
    private PastaSimuladorEntity pasta;

    @ManyToOne(fetch = FetchType.EAGER)
    @JoinColumn(name = "poco_id", foreignKey = @ForeignKey(name = "fk_cenario_poco"))
    private PocoEntity poco;

    public PocoEntity getPoco() { return poco; }
    public void setPoco(PocoEntity poco) { this.poco = poco; }

    @Column(name = "form_value", nullable = false, columnDefinition = "LONGTEXT")
    private String formValue;

    @Column(name = "dados_relatorio", columnDefinition = "TEXT")
    private String dadosRelatorio;

    @Column(name = "criado_por", nullable = false)
    private String criadoPor;

    @Column(name = "criado_em")
    private LocalDateTime criadoEm;

    @Column(name = "atualizado_em")
    private LocalDateTime atualizadoEm;

    @PrePersist
    void prePersist() {
        LocalDateTime agora = LocalDateTime.now();
        criadoEm = agora;
        atualizadoEm = agora;
    }

    @PreUpdate
    void preUpdate() {
        atualizadoEm = LocalDateTime.now();
    }

    public Long getId() { return id; }
    public void setId(Long id) { this.id = id; }
    public String getNome() { return nome; }
    public void setNome(String nome) { this.nome = nome; }
    public String getOperacao() { return operacao; }
    public void setOperacao(String operacao) { this.operacao = operacao; }
    public PastaSimuladorEntity getPasta() { return pasta; }
    public void setPasta(PastaSimuladorEntity pasta) { this.pasta = pasta; }
    public String getFormValue() { return formValue; }
    public void setFormValue(String formValue) { this.formValue = formValue; }
    public String getDadosRelatorio() { return dadosRelatorio; }
    public void setDadosRelatorio(String dadosRelatorio) { this.dadosRelatorio = dadosRelatorio; }
    public String getCriadoPor() { return criadoPor; }
    public void setCriadoPor(String criadoPor) { this.criadoPor = criadoPor; }
    public LocalDateTime getCriadoEm() { return criadoEm; }
    public LocalDateTime getAtualizadoEm() { return atualizadoEm; }
}
