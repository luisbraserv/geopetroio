package com.example.braservhorusdesktop.model;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * A conversao entra no relatorio que o cliente le. Um fator errado nao quebra nada visivelmente —
 * so produz um numero plausivel e errado, que e o pior tipo de defeito num registro de operacao.
 */
class UnidadePressaoTest {

    /** Tolerancia para comparar pressoes: bem abaixo da resolucao do sensor. */
    private static final double TOLERANCIA = 1e-6;

    @Test
    @DisplayName("PSI nao altera o valor gravado")
    void psiEIdentidade() {
        assertEquals(1450.0, UnidadePressao.PSI.converterDePsi(1450.0), TOLERANCIA);
        assertEquals(0.0, UnidadePressao.PSI.converterDePsi(0.0), TOLERANCIA);
    }

    @Test
    @DisplayName("1 kgf/cm² equivale a 14,2233 PSI")
    void converteParaKgfCm2() {
        // Referencia da conversao: 1 kgf/cm2 = 98.066,5 Pa e 1 PSI = 6.894,757 Pa.
        assertEquals(1.0, UnidadePressao.KGF_CM2.converterDePsi(14.223343307), 1e-7);
    }

    @Test
    @DisplayName("pressão típica de operação converte corretamente")
    void converteValorDeOperacao() {
        // 3.000 PSI e uma pressao de squeeze comum; equivale a ~210,9 kgf/cm2.
        double kgf = UnidadePressao.KGF_CM2.converterDePsi(3000.0);
        assertEquals(210.92, kgf, 0.01);
    }

    @Test
    @DisplayName("converter e reconverter volta ao valor original")
    void conversaoEReversivel() {
        double original = 1234.56;
        double kgf = UnidadePressao.KGF_CM2.converterDePsi(original);
        double devolta = kgf * 14.223343307;
        assertEquals(original, devolta, 1e-6);
    }

    @Test
    @DisplayName("kgf/cm² usa mais casas decimais que PSI")
    void kgfPrecisaDeMaisCasas() {
        // Os numeros em kgf/cm2 sao ~14x menores: com duas casas, variacoes reais sumiriam.
        assertTrue(UnidadePressao.KGF_CM2.getCasasDecimais() > UnidadePressao.PSI.getCasasDecimais());
    }

    @Test
    @DisplayName("configuração antiga ou inválida cai em PSI")
    void valorDesconhecidoViraPsi() {
        // Arquivos gravados antes deste campo existir nao trazem unidade; PSI mantem o que o
        // usuario ja via, em vez de trocar a escala do card sem aviso.
        assertEquals(UnidadePressao.PSI, UnidadePressao.deNomeOuPadrao(null));
        assertEquals(UnidadePressao.PSI, UnidadePressao.deNomeOuPadrao(""));
        assertEquals(UnidadePressao.PSI, UnidadePressao.deNomeOuPadrao("BAR"));
        assertEquals(UnidadePressao.KGF_CM2, UnidadePressao.deNomeOuPadrao("kgf_cm2"));
    }

    @Test
    @DisplayName("rótulos são os usados nos eixos e cards")
    void rotulos() {
        assertEquals("PSI", UnidadePressao.PSI.getRotulo());
        assertEquals("kgf/cm²", UnidadePressao.KGF_CM2.getRotulo());
    }
}
