package com.example.braservhorusdesktop.dto;

import com.example.braservhorusdesktop.model.UnidadePressao;

public class ConfiguracaoBomba {

    private String ipPlc = "10.0.0.200";
    private double constante;
    private double rangePressaoBar = 400.0;
    private double sensibilidadePressao = 1.0;

    /**
     * Unidade em que a pressao e exibida. Nao afeta a gravacao: o historico segue sempre em PSI.
     */
    private UnidadePressao unidadePressao = UnidadePressao.PSI;

    public ConfiguracaoBomba() {
    }

    public ConfiguracaoBomba(double constante) {
        this.constante = constante;
    }

    public ConfiguracaoBomba(double constante, double rangePressaoBar, double sensibilidadePressao) {
        this.constante = constante;
        this.rangePressaoBar = rangePressaoBar;
        this.sensibilidadePressao = sensibilidadePressao;
    }

    public ConfiguracaoBomba(String ipPlc, double constante, double rangePressaoBar, double sensibilidadePressao) {
        this.ipPlc = ipPlc;
        this.constante = constante;
        this.rangePressaoBar = rangePressaoBar;
        this.sensibilidadePressao = sensibilidadePressao;
    }

    public String getIpPlc() {
        return ipPlc;
    }

    public void setIpPlc(String ipPlc) {
        this.ipPlc = ipPlc;
    }

    public double getConstante() {
        return constante;
    }

    public void setConstante(double constante) {
        this.constante = constante;
    }

    public double getRangePressaoBar() {
        return rangePressaoBar;
    }

    public void setRangePressaoBar(double rangePressaoBar) {
        this.rangePressaoBar = rangePressaoBar;
    }

    public double getSensibilidadePressao() {
        return sensibilidadePressao;
    }

    public void setSensibilidadePressao(double sensibilidadePressao) {
        this.sensibilidadePressao = sensibilidadePressao;
    }

    public UnidadePressao getUnidadePressao() {
        return unidadePressao;
    }

    public void setUnidadePressao(UnidadePressao unidadePressao) {
        this.unidadePressao = unidadePressao == null ? UnidadePressao.PSI : unidadePressao;
    }

    @Override
    public String toString() {
        return "ConfiguracaoBomba{" +
                "ipPlc='" + ipPlc + '\'' +
                ", constante=" + constante +
                ", rangePressaoBar=" + rangePressaoBar +
                ", sensibilidadePressao=" + sensibilidadePressao +
                ", unidadePressao=" + unidadePressao +
                '}';
    }
}
