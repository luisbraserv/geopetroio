package com.geopetro.desktop.cartaoperacao;

import java.nio.file.Path;
import java.time.LocalDateTime;

public class GeneratedOperationChart {

    private final String title;
    private final String wellName;
    private final LocalDateTime createdAt;
    private final Path pdfPath;

    public GeneratedOperationChart(String title, String wellName, LocalDateTime createdAt, Path pdfPath) {
        this.title = title;
        this.wellName = wellName;
        this.createdAt = createdAt;
        this.pdfPath = pdfPath;
    }

    public String getTitle() { return title; }
    public String getWellName() { return wellName; }
    public LocalDateTime getCreatedAt() { return createdAt; }
    public Path getPdfPath() { return pdfPath; }
}