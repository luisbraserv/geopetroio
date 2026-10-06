package com.example.braservhorusdesktop.model;

/**
 * Unidade em que a pressao e <b>apresentada</b>.
 *
 * <p><b>PSI e a unidade de registro.</b> O CLP entrega PSI, o JSON grava PSI e o historico inteiro
 * esta em PSI. Esta enumeracao existe so para a camada de apresentacao: o card e os graficos podem
 * mostrar kgf/cm2, mas nada disso volta para o armazenamento.
 *
 * <p>Converter na leitura em vez de na gravacao e deliberado: se a unidade escolhida vazasse para o
 * arquivo, o mesmo campo passaria a significar coisas diferentes conforme a configuracao vigente no
 * dia, e series antigas ficariam impossiveis de interpretar sem saber que configuracao estava ativa
 * quando cada ponto foi gravado.
 */
public enum UnidadePressao {

    PSI("PSI", 1.0),

    /**
     * Quilograma-forca por centimetro quadrado.
     *
     * <p>1 kgf/cm2 = 14,223343307 PSI (definicao exata: 1 kgf/cm2 = 98.066,5 Pa e 1 PSI = 6.894,757 Pa).
     */
    KGF_CM2("kgf/cm²", 1.0 / 14.223343307);

    private final String rotulo;
    private final double fatorAPartirDePsi;

    UnidadePressao(String rotulo, double fatorAPartirDePsi) {
        this.rotulo = rotulo;
        this.fatorAPartirDePsi = fatorAPartirDePsi;
    }

    /** Texto exibido ao lado do valor e nos eixos dos graficos. */
    public String getRotulo() {
        return rotulo;
    }

    /** Converte um valor em PSI (como esta gravado) para esta unidade. */
    public double converterDePsi(double valorEmPsi) {
        return valorEmPsi * fatorAPartirDePsi;
    }

    /**
     * Casas decimais adequadas a grandeza.
     *
     * <p>kgf/cm2 tem numeros ~14x menores que PSI: com as mesmas duas casas, uma variacao visivel em
     * PSI desapareceria no arredondamento.
     */
    public int getCasasDecimais() {
        return this == KGF_CM2 ? 3 : 2;
    }

    /** Nome amigavel para listas de selecao. */
    @Override
    public String toString() {
        return rotulo;
    }

    /** Le o valor persistido, caindo em {@link #PSI} para nulo ou texto desconhecido. */
    public static UnidadePressao deNomeOuPadrao(String nome) {
        if (nome == null || nome.isBlank()) {
            return PSI;
        }
        try {
            return valueOf(nome.trim().toUpperCase());
        } catch (IllegalArgumentException e) {
            return PSI;
        }
    }
}
