package com.example.demo.models;

public class SensorPressaoConfig {

    private double rangeBar;
    private double sensibilidade;

    public SensorPressaoConfig() {
        this.rangeBar      = 400.0;
        this.sensibilidade = 1.0;
    }

    public SensorPressaoConfig(double rangeBar, double sensibilidade) {
        this.rangeBar      = rangeBar;
        this.sensibilidade = sensibilidade;
    }

    public double getRangeBar()              { return rangeBar; }
    public void   setRangeBar(double v)      { this.rangeBar = v; }

    public double getSensibilidade()         { return sensibilidade; }
    public void   setSensibilidade(double v) { this.sensibilidade = v; }
}
