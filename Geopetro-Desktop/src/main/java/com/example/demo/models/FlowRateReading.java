package com.example.demo.models;

import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;

import java.time.LocalDateTime;

@Entity
public class FlowRateReading {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    private LocalDateTime timestamp;
    private Long currentStroke;
    private Long cumulativeStroke;
    private Double pumpConstant;
    private Double flowRateBblMin;

    public FlowRateReading() {
    }

    public FlowRateReading(
            LocalDateTime timestamp,
            Long currentStroke,
            Long cumulativeStroke,
            Double pumpConstant,
            Double flowRateBblMin) {
        this.timestamp = timestamp;
        this.currentStroke = currentStroke;
        this.cumulativeStroke = cumulativeStroke;
        this.pumpConstant = pumpConstant;
        this.flowRateBblMin = flowRateBblMin;
    }

    public Long getId() {
        return id;
    }

    public LocalDateTime getTimestamp() {
        return timestamp;
    }

    public void setTimestamp(LocalDateTime timestamp) {
        this.timestamp = timestamp;
    }

    public Long getCurrentStroke() {
        return currentStroke;
    }

    public void setCurrentStroke(Long currentStroke) {
        this.currentStroke = currentStroke;
    }

    public Long getCumulativeStroke() {
        return cumulativeStroke;
    }

    public void setCumulativeStroke(Long cumulativeStroke) {
        this.cumulativeStroke = cumulativeStroke;
    }

    public Double getPumpConstant() {
        return pumpConstant;
    }

    public void setPumpConstant(Double pumpConstant) {
        this.pumpConstant = pumpConstant;
    }

    public Double getFlowRateBblMin() {
        return flowRateBblMin;
    }

    public void setFlowRateBblMin(Double flowRateBblMin) {
        this.flowRateBblMin = flowRateBblMin;
    }
}
