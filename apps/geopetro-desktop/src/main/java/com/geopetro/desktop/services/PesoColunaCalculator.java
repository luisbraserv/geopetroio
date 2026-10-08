package com.geopetro.desktop.services;

import com.geopetro.desktop.models.PesoColunaCalculo;
import com.geopetro.desktop.models.PesoColunaConfig;

/**
 * Deduz o peso da coluna a partir da pressao no sargento (deadline anchor).
 *
 * <h2>Por que nao basta pressao × area</h2>
 * O sensor esta no sargento, nao no gancho. A pressao que ele le e a reacao da <b>linha morta</b>
 * sobre o mecanismo — uma unica linha, num braco de alavanca. {@code pressao × area} devolve so a
 * forca hidraulica na celula: nem considera a alavanca do sargento, nem o raio do tambor, nem
 * quantas linhas sustentam a Catarina, nem a tara do conjunto movel. O numero resultante nao tem
 * relacao dimensional com o peso da coluna.
 *
 * <h2>A cadeia</h2>
 * <pre>
 *   P_corrigida  = P - P0
 *   F_sensor     = P_corrigida × A                    (psi × pol² = lbf)
 *   Torque       = F_sensor × L                       (τ = F × braço)
 *   R_efetivo    = (D_tambor + D_cabo) / 2            (a tração age na linha de centro do cabo)
 *   T_deadline   = Torque / R_efetivo
 *   T_corrigida  = T_deadline × K
 *   HookLoad     = T_corrigida × N                    (N = número de linhas)
 *   PesoColuna   = HookLoad - W_catarina
 * </pre>
 *
 * <h2>Limite desta versao</h2>
 * Modelo <b>estatico</b>: {@code HookLoad ≈ T_deadline × N} vale com a Catarina parada ou em
 * movimento quase-estatico. Subindo ou descendo, atrito das polias, eficiencia das sheaves, flexao
 * do cabo e aceleracao criam diferenca de tensao entre as linhas. Um fator de eficiencia unico nao
 * modela isso — depende ate do sentido do movimento —, entao fica para um modelo dinamico proprio.
 * Calibre com a Catarina parada.
 */
public final class PesoColunaCalculator {

    private PesoColunaCalculator() {
    }

    /**
     * Percorre a cadeia inteira, preservando os passos.
     *
     * @param pressaoPsi pressao lida no canal do sargento
     * @param config     geometria do equipamento; {@code null} ou incompleta devolve resultado nao
     *                   configurado, nunca um numero inventado
     */
    public static PesoColunaCalculo calcular(double pressaoPsi, PesoColunaConfig config) {
        if (config == null || !config.isConfigurado()) {
            return PesoColunaCalculo.naoConfigurado(pressaoPsi);
        }

        double raioEfetivoPol = config.raioEfetivoPol();
        if (raioEfetivoPol <= 0) {
            // isConfigurado() ja cobre, mas o divisor merece guarda propria: um zero aqui
            // produziria infinito e o card exibiria um peso absurdo como se fosse leitura.
            return PesoColunaCalculo.naoConfigurado(pressaoPsi);
        }

        double pressaoCorrigidaPsi = Math.max(0, pressaoPsi - config.getPressaoZeroPsi());
        double forcaSensorLbf = pressaoCorrigidaPsi * config.getAreaEfetivaSensorPol2();
        double torqueSargentoLbPol = forcaSensorLbf * config.getBracoSensorPol();

        double tracaoDeadlineLbf = (torqueSargentoLbPol / raioEfetivoPol) * config.getFatorCalibracao();
        double cargaSuspensaLbf = tracaoDeadlineLbf * config.getNumeroLinhas();

        // A coluna nao pode pesar menos que nada: abaixo da tara significa gancho vazio.
        double pesoColunaLbf = Math.max(0, cargaSuspensaLbf - config.getPesoCatarinaLbf());

        return new PesoColunaCalculo(
                pressaoPsi,
                pressaoCorrigidaPsi,
                forcaSensorLbf,
                torqueSargentoLbPol,
                raioEfetivoPol,
                tracaoDeadlineLbf,
                cargaSuspensaLbf,
                config.getPesoCatarinaLbf(),
                pesoColunaLbf,
                true);
    }

    /**
     * Fator de calibracao que faz o modelo bater com uma carga conhecida.
     *
     * <p>Use depois de conferir a geometria: o fator corrige o residuo, nao um parametro errado.
     *
     * @param cargaSuspensaRealLbf carga real no gancho — se a referencia for o peso liquido, some a
     *                             Catarina antes de passar aqui
     * @param calculoSemCalibracao resultado obtido com {@code fatorCalibracao = 1,0}
     * @return o fator, ou {@code 1,0} quando nao ha base para calcular
     */
    public static double calcularFatorCalibracao(
            double cargaSuspensaRealLbf, PesoColunaCalculo calculoSemCalibracao) {

        if (calculoSemCalibracao == null
                || !calculoSemCalibracao.configurado()
                || calculoSemCalibracao.cargaSuspensaLbf() <= 0) {
            return 1.0;
        }
        return cargaSuspensaRealLbf / calculoSemCalibracao.cargaSuspensaLbf();
    }
}
