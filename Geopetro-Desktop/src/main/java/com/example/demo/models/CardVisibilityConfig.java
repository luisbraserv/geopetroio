package com.example.demo.models;

public class CardVisibilityConfig {

    private boolean pesoColuna  = true;
    private boolean chHidTubos  = true;
    private boolean chFlutuante = true;
    private boolean bombaLama   = true;
    private boolean escp        = true;
    private boolean vazao       = true;

    public boolean isPesoColuna()  { return pesoColuna; }
    public void setPesoColuna(boolean v)  { this.pesoColuna = v; }

    public boolean isChHidTubos()  { return chHidTubos; }
    public void setChHidTubos(boolean v)  { this.chHidTubos = v; }

    public boolean isChFlutuante() { return chFlutuante; }
    public void setChFlutuante(boolean v) { this.chFlutuante = v; }

    public boolean isBombaLama()   { return bombaLama; }
    public void setBombaLama(boolean v)   { this.bombaLama = v; }

    public boolean isEscp()        { return escp; }
    public void setEscp(boolean v)        { this.escp = v; }

    public boolean isVazao()       { return vazao; }
    public void setVazao(boolean v)       { this.vazao = v; }
}
