package com.example.demo.models;

/**
 * Geometria do sargento (deadline anchor) usada para deduzir o peso da coluna.
 *
 * <p>O sensor nao mede peso: mede a pressao hidraulica que a tracao da linha morta produz no
 * mecanismo do sargento. Chegar ao peso exige percorrer a cadeia
 * <em>pressao -> forca -> torque -> tracao da deadline -> carga suspensa -> desconto da Catarina</em>,
 * e cada etapa depende de um parametro fisico do equipamento.
 *
 * <p>Todos os comprimentos em polegadas, forcas em lbf — as mesmas unidades em que os catalogos de
 * sonda publicam essa geometria, evitando conversao na leitura da folha tecnica.
 */
public class PesoColunaConfig {

    /**
     * Zero do sistema hidraulico, em psi.
     *
     * <p><b>Apenas o offset do sensor</b> — nao serve para descontar a Catarina. O peso do conjunto
     * movel entra em {@link #pesoCatarinaLbf}, no fim da cadeia. Misturar os dois faria a tara
     * escalar junto com o numero de linhas, e o erro cresceria proporcionalmente a carga.
     */
    private double pressaoZeroPsi = 0.0;

    /** Area efetiva da celula hidraulica do sensor, em pol². Converte psi em lbf. */
    private double areaEfetivaSensorPol2 = 0.0;

    /**
     * Braco mecanico do sensor, em pol.
     *
     * <p>Distancia entre o eixo de rotacao do tambor do sargento e a linha de atuacao da forca
     * hidraulica.
     */
    private double bracoSensorPol = 0.0;

    /** Diametro do tambor do sargento, em pol. */
    private double diametroTamborPol = 0.0;

    /**
     * Diametro do cabo, em pol.
     *
     * <p>Entra no <b>braco</b>, nao na area: a tracao age na linha de centro do cabo, entao o raio
     * efetivo e o do tambor mais meio cabo. Nao ha area transversal envolvida nesta conversao.
     */
    private double diametroCaboPol = 0.0;

    /** Numero de linhas que sustentam a Catarina (tipicamente 4, 6, 8, 10 ou 12). */
    private int numeroLinhas = 0;

    /** Tara do conjunto movel, em lbf. Descontada da carga suspensa no fim da cadeia. */
    private double pesoCatarinaLbf = 0.0;

    /**
     * Ajuste contra carga conhecida.
     *
     * <p>Existe para acertar o modelo depois que a geometria esta correta — nao para substituir um
     * parametro fisico mal informado. Um fator muito distante de 1,0 indica geometria errada, nao
     * calibracao.
     */
    private double fatorCalibracao = 1.0;

    /**
     * A configuracao permite calcular?
     *
     * <p>Sem area, braco, raio efetivo ou numero de linhas a cadeia nao fecha — e o raio efetivo
     * ainda apareceria como divisor zero.
     */
    public boolean isConfigurado() {
        return areaEfetivaSensorPol2 > 0
                && bracoSensorPol > 0
                && raioEfetivoPol() > 0
                && numeroLinhas > 0;
    }

    /** Raio de aplicacao da tracao: superficie do tambor mais meio diametro de cabo. */
    public double raioEfetivoPol() {
        return (diametroTamborPol + diametroCaboPol) / 2.0;
    }

    public double getPressaoZeroPsi()                 { return pressaoZeroPsi; }
    public void   setPressaoZeroPsi(double v)         { this.pressaoZeroPsi = v; }

    public double getAreaEfetivaSensorPol2()          { return areaEfetivaSensorPol2; }
    public void   setAreaEfetivaSensorPol2(double v)  { this.areaEfetivaSensorPol2 = v; }

    public double getBracoSensorPol()                 { return bracoSensorPol; }
    public void   setBracoSensorPol(double v)         { this.bracoSensorPol = v; }

    public double getDiametroTamborPol()              { return diametroTamborPol; }
    public void   setDiametroTamborPol(double v)      { this.diametroTamborPol = v; }

    public double getDiametroCaboPol()                { return diametroCaboPol; }
    public void   setDiametroCaboPol(double v)        { this.diametroCaboPol = v; }

    public int    getNumeroLinhas()                   { return numeroLinhas; }
    public void   setNumeroLinhas(int v)              { this.numeroLinhas = v; }

    public double getPesoCatarinaLbf()                { return pesoCatarinaLbf; }
    public void   setPesoCatarinaLbf(double v)        { this.pesoCatarinaLbf = v; }

    public double getFatorCalibracao()                { return fatorCalibracao; }
    public void   setFatorCalibracao(double v)        { this.fatorCalibracao = v; }
}
