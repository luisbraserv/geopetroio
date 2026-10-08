package com.geopetro.desktop.calculos;

public class ChaveHidraulicaConfig {

    private double diametroPistaoIn;
    private double diametroHasteIn;
    private double bracoAlavancaFt;
    private TipoMovimento tipoMovimento;

    public ChaveHidraulicaConfig() {
        this.diametroPistaoIn = 0.0;
        this.diametroHasteIn  = 0.0;
        this.bracoAlavancaFt = 0.0;
        this.tipoMovimento    = null;
    }

    public double getDiametroPistaoIn()              { return diametroPistaoIn; }
    public void   setDiametroPistaoIn(double v)      { this.diametroPistaoIn = v; }

    public double getDiametroHasteIn()               { return diametroHasteIn; }
    public void   setDiametroHasteIn(double v)       { this.diametroHasteIn = v; }

    public double getBracoAlavancaFt()             { return bracoAlavancaFt; }
    public void   setBracoAlavancaFt(double v)     { this.bracoAlavancaFt = v; }

    public TipoMovimento getTipoMovimento()          { return tipoMovimento; }
    public void setTipoMovimento(TipoMovimento v)    { this.tipoMovimento = v; }

    public boolean isConfigurado() {
        return diametroPistaoIn > 0
                && diametroHasteIn >= 0
                && diametroHasteIn < diametroPistaoIn
                && bracoAlavancaFt > 0
                && tipoMovimento != null;
    }
}
