package com.example.braservhorusdesktop.model;

import java.time.LocalDateTime;

public class RegistroOperacao {

    private LocalDateTime timestamp;
    private double pressao;
    private long strokeAtual;
    private long strokeCumulativo;
    private double vazaoAtual;
    private double volumeBombeado;

    public RegistroOperacao() {
    }

    public RegistroOperacao(
            LocalDateTime timestamp,
            double pressao,
            long strokeAtual,
            long strokeCumulativo,
            double vazaoAtual,
            double volumeBombeado) {
        this.timestamp = timestamp;
        this.pressao = pressao;
        this.strokeAtual = strokeAtual;
        this.strokeCumulativo = strokeCumulativo;
        this.vazaoAtual = vazaoAtual;
        this.volumeBombeado = volumeBombeado;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public double getPressao() {
        return pressao;
    }

    public void setPressao(double pressao) {
        this.pressao = pressao;
    }

    public long getStrokeAtual() {
        return strokeAtual;
    }

    public void setStrokeAtual(long strokeAtual) {
        this.strokeAtual = strokeAtual;
    }

    public long getStrokeCumulativo() {
        return strokeCumulativo;
    }

    public void setStrokeCumulativo(long strokeCumulativo) {
        this.strokeCumulativo = strokeCumulativo;
    }

    public double getVazaoAtual() {
        return vazaoAtual;
    }

    public void setVazaoAtual(double vazaoAtual) {
        this.vazaoAtual = vazaoAtual;
    }

    public double getVolumeBombeado() {
        return volumeBombeado;
    }

    public void setVolumeBombeado(double volumeBombeado) {
        this.volumeBombeado = volumeBombeado;
    }
}