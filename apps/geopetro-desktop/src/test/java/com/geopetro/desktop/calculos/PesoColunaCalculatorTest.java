package com.geopetro.desktop.calculos;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;


import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Cadeia pressao -> forca -> torque -> tracao da deadline -> carga suspensa -> peso da coluna.
 *
 * <p>E um calculo de carga suspensa: um erro aqui nao aparece como defeito, aparece como um numero
 * plausivel e errado na tela de quem esta manobrando a coluna.
 */
class PesoColunaCalculatorTest {

    /** Geometria do exemplo da especificação, que fecha em números redondos. */
    private static PesoColunaConfig geometria() {
        PesoColunaConfig cfg = new PesoColunaConfig();
        cfg.setPressaoZeroPsi(5.0);
        cfg.setAreaEfetivaSensorPol2(10.0);
        cfg.setBracoSensorPol(12.0);
        cfg.setDiametroTamborPol(30.0);
        cfg.setDiametroCaboPol(1.0);
        cfg.setNumeroLinhas(8);
        cfg.setPesoCatarinaLbf(12000.0);
        cfg.setFatorCalibracao(1.0);
        return cfg;
    }

    @Test
    @DisplayName("percorre a cadeia completa com os valores da especificação")
    void cadeiaCompleta() {
        PesoColunaCalculo c = PesoColunaCalculator.calcular(1250.0, geometria());

        assertTrue(c.configurado());
        assertEquals(1245.0, c.pressaoCorrigidaPsi(), 0.01);      // 1250 - 5
        assertEquals(12450.0, c.forcaSensorLbf(), 0.01);          // 1245 × 10 pol²
        assertEquals(149400.0, c.torqueSargentoLbPol(), 0.01);    // 12450 × 12 pol
        assertEquals(15.5, c.raioEfetivoPol(), 0.001);            // (30 + 1) / 2
        assertEquals(9638.7, c.tracaoDeadlineLbf(), 0.1);         // 149400 / 15,5
        assertEquals(77109.7, c.cargaSuspensaLbf(), 0.5);         // × 8 linhas
        assertEquals(65109.7, c.pesoColunaLbf(), 0.5);            // - 12000 da Catarina
    }

    @Test
    @DisplayName("o diâmetro do cabo entra no braço, não na área")
    void caboAlteraORaioEfetivo() {
        // Se alguém "corrigisse" isto para π·D²/4, o raio efetivo mudaria de 15,5 para outro valor
        // e a tração sairia errada em toda a faixa.
        PesoColunaConfig cfg = geometria();
        assertEquals(15.5, cfg.raioEfetivoPol(), 1e-9);

        cfg.setDiametroCaboPol(2.0);
        assertEquals(16.0, cfg.raioEfetivoPol(), 1e-9);
    }

    @Test
    @DisplayName("cabo mais grosso reduz a tração calculada para a mesma pressão")
    void caboMaisGrossoReduzTracao() {
        // Braço maior, mesmo torque: a tensão necessária é menor. Relação física, não convenção.
        PesoColunaCalculo fino = PesoColunaCalculator.calcular(1250.0, geometria());

        PesoColunaConfig grosso = geometria();
        grosso.setDiametroCaboPol(4.0);
        PesoColunaCalculo c = PesoColunaCalculator.calcular(1250.0, grosso);

        assertTrue(c.tracaoDeadlineLbf() < fino.tracaoDeadlineLbf());
    }

    @Test
    @DisplayName("carga suspensa escala com o número de linhas")
    void cargaEscalaComLinhas() {
        PesoColunaConfig oito = geometria();
        PesoColunaConfig doze = geometria();
        doze.setNumeroLinhas(12);

        double com8 = PesoColunaCalculator.calcular(1250.0, oito).cargaSuspensaLbf();
        double com12 = PesoColunaCalculator.calcular(1250.0, doze).cargaSuspensaLbf();

        assertEquals(com8 / 8 * 12, com12, 0.5);
    }

    @Test
    @DisplayName("a Catarina é descontada no fim, não pela pressão zero")
    void catarinaDescontadaNoFim() {
        // Descontar a tara via pressaoZero faria o erro escalar junto com o número de linhas.
        // Aqui a tara sai depois da multiplicação, então mexer nela desloca o resultado 1:1.
        PesoColunaConfig cfg = geometria();
        double antes = PesoColunaCalculator.calcular(1250.0, cfg).pesoColunaLbf();

        cfg.setPesoCatarinaLbf(cfg.getPesoCatarinaLbf() + 1000.0);
        double depois = PesoColunaCalculator.calcular(1250.0, cfg).pesoColunaLbf();

        assertEquals(1000.0, antes - depois, 0.01);
    }

    @Test
    @DisplayName("pressão zero desconta antes de multiplicar")
    void pressaoZeroAntesDaMultiplicacao() {
        // 1 psi a mais de offset tira 1 × área × braço / raio × linhas da carga — bem mais que 1 lbf.
        PesoColunaConfig cfg = geometria();
        double antes = PesoColunaCalculator.calcular(1250.0, cfg).cargaSuspensaLbf();

        cfg.setPressaoZeroPsi(cfg.getPressaoZeroPsi() + 1.0);
        double depois = PesoColunaCalculator.calcular(1250.0, cfg).cargaSuspensaLbf();

        double esperado = 1.0 * 10.0 * 12.0 / 15.5 * 8;
        assertEquals(esperado, antes - depois, 0.5);
    }

    @Test
    @DisplayName("fator de calibração escala a tração e tudo que vem depois")
    void fatorEscalaACadeia() {
        PesoColunaConfig cfg = geometria();
        PesoColunaCalculo base = PesoColunaCalculator.calcular(1250.0, cfg);

        cfg.setFatorCalibracao(1.1);
        PesoColunaCalculo ajustado = PesoColunaCalculator.calcular(1250.0, cfg);

        assertEquals(base.tracaoDeadlineLbf() * 1.1, ajustado.tracaoDeadlineLbf(), 0.5);
        assertEquals(base.cargaSuspensaLbf() * 1.1, ajustado.cargaSuspensaLbf(), 0.5);
        // O torque é anterior ao fator: não deve mudar.
        assertEquals(base.torqueSargentoLbPol(), ajustado.torqueSargentoLbPol(), 1e-9);
    }

    @Test
    @DisplayName("gancho vazio não produz peso negativo")
    void ganchoVazioNaoFicaNegativo() {
        // Carga suspensa abaixo da tara significa gancho vazio, não coluna com peso negativo.
        PesoColunaCalculo c = PesoColunaCalculator.calcular(50.0, geometria());

        assertTrue(c.cargaSuspensaLbf() < 12000.0);
        assertEquals(0.0, c.pesoColunaLbf(), 0.001);
    }

    @Test
    @DisplayName("pressão abaixo do zero do sensor não vira força negativa")
    void abaixoDoZero() {
        PesoColunaCalculo c = PesoColunaCalculator.calcular(2.0, geometria());

        assertEquals(0.0, c.pressaoCorrigidaPsi(), 0.001);
        assertEquals(0.0, c.forcaSensorLbf(), 0.001);
    }

    @Test
    @DisplayName("geometria incompleta não inventa número")
    void geometriaIncompleta() {
        assertFalse(PesoColunaCalculator.calcular(1250.0, null).configurado());
        assertFalse(PesoColunaCalculator.calcular(1250.0, new PesoColunaConfig()).configurado());

        PesoColunaConfig semLinhas = geometria();
        semLinhas.setNumeroLinhas(0);
        assertFalse(PesoColunaCalculator.calcular(1250.0, semLinhas).configurado());

        // Tambor e cabo zerados: raio efetivo zero seria divisão por zero na tração.
        PesoColunaConfig semTambor = geometria();
        semTambor.setDiametroTamborPol(0);
        semTambor.setDiametroCaboPol(0);
        PesoColunaCalculo c = PesoColunaCalculator.calcular(1250.0, semTambor);
        assertFalse(c.configurado());
        assertEquals(0.0, c.pesoColunaLbf(), 0.001);
    }

    @Test
    @DisplayName("converte para kgf e tf")
    void conversoes() {
        PesoColunaCalculo c = PesoColunaCalculator.calcular(1250.0, geometria());

        assertEquals(c.pesoColunaLbf() / 2.2046226218, c.pesoColunaKgf(), 0.01);
        assertEquals(c.pesoColunaLbf() / 2204.6226218, c.pesoColunaTf(), 0.001);
        // ~65.110 lbf ≈ 29,5 tf
        assertEquals(29.5, c.pesoColunaTf(), 0.1);
    }

    @Test
    @DisplayName("fator de calibração deduzido de uma carga conhecida")
    void deduzFatorDeCalibracao() {
        PesoColunaConfig cfg = geometria();
        PesoColunaCalculo semCalibracao = PesoColunaCalculator.calcular(1250.0, cfg);

        // Carga real 10% acima da calculada.
        double real = semCalibracao.cargaSuspensaLbf() * 1.10;
        double k = PesoColunaCalculator.calcularFatorCalibracao(real, semCalibracao);

        assertEquals(1.10, k, 0.001);

        // Aplicando o fator, o modelo passa a bater com a carga conhecida.
        cfg.setFatorCalibracao(k);
        assertEquals(real, PesoColunaCalculator.calcular(1250.0, cfg).cargaSuspensaLbf(), 1.0);
    }

    @Test
    @DisplayName("sem base de cálculo, o fator permanece neutro")
    void fatorNeutroSemBase() {
        assertEquals(1.0, PesoColunaCalculator.calcularFatorCalibracao(50000, null), 1e-9);
        assertEquals(1.0, PesoColunaCalculator.calcularFatorCalibracao(
                50000, PesoColunaCalculo.naoConfigurado(0)), 1e-9);
        // Gancho vazio: carga calculada zero não permite deduzir fator.
        assertEquals(1.0, PesoColunaCalculator.calcularFatorCalibracao(
                50000, PesoColunaCalculator.calcular(0, geometria())), 1e-9);
    }
}
