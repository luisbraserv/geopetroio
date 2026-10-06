package com.example.demo.models;

import java.time.LocalDateTime;

/**
 * Modelo de dados da Sonda
 * Representa os dados recebidos do PLC
 */
public class SondaData {
    
    // Identificação
    private Long id;
    private String sondaId;
    
    // Dados recebidos do PLC
    private Double peso;                    // Peso da coluna (lbs)
    private Double pressao01;               // T. Ch. Hid. Tubos (lbf/pe)
    private Double pressao02;               // T. Ch Flutuante (lbf/pe)
    private Double pressao03;               // P. Bomba de Lama (psi)
    private Double pressao04;               // ESCP (psi)
    private Double stroke;                  // Stroke (rpm) - para calcular vazão depois
    
    // Dados calculados
    private Double vazao;                   // Vazão calculada a partir do stroke (bpm)
    
    // Controle
    private LocalDateTime timestamp;        // Hora do último update
    private String status;                  // Status: "OK", "ALERTA", "ERRO"
    private Boolean ativo;                  // Se está ativo ou não
    
    // Construtores
    public SondaData() {
    }
    
    public SondaData(Long id, String sondaId, Double peso, Double pressao01, Double pressao02,
                     Double pressao03, Double pressao04, Double stroke, Double vazao,
                     LocalDateTime timestamp, String status, Boolean ativo) {
        this.id = id;
        this.sondaId = sondaId;
        this.peso = peso;
        this.pressao01 = pressao01;
        this.pressao02 = pressao02;
        this.pressao03 = pressao03;
        this.pressao04 = pressao04;
        this.stroke = stroke;
        this.vazao = vazao;
        this.timestamp = timestamp;
        this.status = status;
        this.ativo = ativo;
    }
    
    // Getters e Setters
    public Long getId() {
        return id;
    }
    
    public void setId(Long id) {
        this.id = id;
    }
    
    public String getSondaId() {
        return sondaId;
    }
    
    public void setSondaId(String sondaId) {
        this.sondaId = sondaId;
    }
    
    public Double getPeso() {
        return peso;
    }
    
    public void setPeso(Double peso) {
        this.peso = peso;
    }
    
    public Double getPressao01() {
        return pressao01;
    }
    
    public void setPressao01(Double pressao01) {
        this.pressao01 = pressao01;
    }
    
    public Double getPressao02() {
        return pressao02;
    }
    
    public void setPressao02(Double pressao02) {
        this.pressao02 = pressao02;
    }
    
    public Double getPressao03() {
        return pressao03;
    }
    
    public void setPressao03(Double pressao03) {
        this.pressao03 = pressao03;
    }
    
    public Double getPressao04() {
        return pressao04;
    }
    
    public void setPressao04(Double pressao04) {
        this.pressao04 = pressao04;
    }
    
    public Double getStroke() {
        return stroke;
    }
    
    public void setStroke(Double stroke) {
        this.stroke = stroke;
    }
    
    public Double getVazao() {
        return vazao;
    }
    
    public void setVazao(Double vazao) {
        this.vazao = vazao;
    }
    
    public LocalDateTime getTimestamp() {
        return timestamp;
    }
    
    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }
    
    public String getStatus() {
        return status;
    }
    
    public void setStatus(String status) {
        this.status = status;
    }
    
    public Boolean getAtivo() {
        return ativo;
    }
    
    public void setAtivo(Boolean ativo) {
        this.ativo = ativo;
    }
    
    /**
     * Calcula a vazão a partir do stroke
     * Será implementado depois com a fórmula correta do PLC
     */
    public void calcularVazao() {
        if (stroke != null && stroke > 0) {
            // TODO: Implementar fórmula correta de cálculo de vazão a partir do stroke
            // Por enquanto deixa o stroke como referência
            this.vazao = stroke;
        }
    }
    
    /**
     * Define o timestamp atual
     */
    public void atualizarTimestamp() {
        this.timestamp = LocalDateTime.now();
    }
}
