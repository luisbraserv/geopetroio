package com.example.demo.models;

/**
 * Resultado do calculo do peso da coluna, com todos os passos intermediarios preservados.
 *
 * <p>Os intermediarios existem para a calibracao em campo. Quando o valor final nao bate com a
 * carga conhecida, e preciso saber <em>em qual etapa</em> a conta se afasta — se a forca do sensor
 * ja esta errada, o problema e a area; se so a carga suspensa destoa, e o numero de linhas. Um
 * numero final sozinho nao permite esse diagnostico.
 *
 * @param pressaoPsi           pressao lida, antes do desconto do zero
 * @param pressaoCorrigidaPsi  pressao menos o zero do sensor
 * @param forcaSensorLbf       forca hidraulica na celula do sargento
 * @param torqueSargentoLbPol  torque no tambor
 * @param raioEfetivoPol       raio do tambor mais meio diametro de cabo
 * @param tracaoDeadlineLbf    tracao da linha morta, ja com o fator de calibracao
 * @param cargaSuspensaLbf     carga total no gancho — ainda inclui a Catarina
 * @param pesoCatarinaLbf      tara do conjunto movel
 * @param pesoColunaLbf        peso liquido da coluna
 * @param configurado          {@code false} quando a geometria esta incompleta e nada foi calculado
 */
public record PesoColunaCalculo(
        double pressaoPsi,
        double pressaoCorrigidaPsi,
        double forcaSensorLbf,
        double torqueSargentoLbPol,
        double raioEfetivoPol,
        double tracaoDeadlineLbf,
        double cargaSuspensaLbf,
        double pesoCatarinaLbf,
        double pesoColunaLbf,
        boolean configurado) {

    private static final double LBF_POR_KGF = 2.2046226218;
    private static final double LBF_POR_TF = 2204.6226218;

    /** Resultado nulo — geometria incompleta ou invalida. */
    public static PesoColunaCalculo naoConfigurado(double pressaoPsi) {
        return new PesoColunaCalculo(pressaoPsi, 0, 0, 0, 0, 0, 0, 0, 0, false);
    }

    public double pesoColunaKgf() {
        return pesoColunaLbf / LBF_POR_KGF;
    }

    public double pesoColunaTf() {
        return pesoColunaLbf / LBF_POR_TF;
    }
}
