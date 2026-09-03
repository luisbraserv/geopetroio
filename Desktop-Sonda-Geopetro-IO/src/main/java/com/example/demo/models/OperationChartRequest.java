package com.example.demo.models;

import java.time.LocalDateTime;

public class OperationChartRequest {

    private final String title;
    private final String wellName;
    private final LocalDateTime start;
    private final LocalDateTime end;

    // variáveis selecionadas
    private final boolean includePesoColuna;
    private final boolean includeTorqueTubos;
    private final boolean includeTorqueFlutuante;
    private final boolean includePressaoBomba;
    private final boolean includeFlowRate;

    public OperationChartRequest(String title, String wellName, LocalDateTime start, LocalDateTime end,
                                  boolean includePesoColuna, boolean includeTorqueTubos,
                                  boolean includeTorqueFlutuante, boolean includePressaoBomba,
                                  boolean includeFlowRate) {
        this.title                 = title;
        this.wellName              = wellName;
        this.start                 = start;
        this.end                   = end;
        this.includePesoColuna     = includePesoColuna;
        this.includeTorqueTubos    = includeTorqueTubos;
        this.includeTorqueFlutuante = includeTorqueFlutuante;
        this.includePressaoBomba   = includePressaoBomba;
        this.includeFlowRate       = includeFlowRate;
    }

    public String getTitle()                   { return title; }
    public String getWellName()                { return wellName; }
    public LocalDateTime getStart()            { return start; }
    public LocalDateTime getEnd()              { return end; }
    public boolean isIncludePesoColuna()       { return includePesoColuna; }
    public boolean isIncludeTorqueTubos()      { return includeTorqueTubos; }
    public boolean isIncludeTorqueFlutuante()  { return includeTorqueFlutuante; }
    public boolean isIncludePressaoBomba()     { return includePressaoBomba; }
    public boolean isIncludeFlowRate()         { return includeFlowRate; }

    public boolean hasAnyVariable() {
        return includePesoColuna || includeTorqueTubos || includeTorqueFlutuante
                || includePressaoBomba || includeFlowRate;
    }
}
