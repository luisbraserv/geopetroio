package com.geopetro.desktop.services;

import com.geopetro.desktop.models.TipoMovimento;

public final class HydraulicTorqueCalculator {

    private static final double BAR_TO_PSI = 14.5038;

    private HydraulicTorqueCalculator() {}

    public static double calculateHydraulicArea(
            double pistonDiameterIn,
            double rodDiameterIn,
            TipoMovimento movementType) {
        validateCylinder(pistonDiameterIn, rodDiameterIn, movementType);

        double pistonAreaIn2 = Math.PI * Math.pow(pistonDiameterIn, 2) / 4.0;
        if (movementType == TipoMovimento.AVANCO) return pistonAreaIn2;

        double rodAreaIn2 = Math.PI * Math.pow(rodDiameterIn, 2) / 4.0;
        return pistonAreaIn2 - rodAreaIn2;
    }

    public static double calculateTorque(
            double effectivePressurePsi,
            double pistonDiameterIn,
            double rodDiameterIn,
            double leverArmFt,
            TipoMovimento movementType) {
        if (!Double.isFinite(effectivePressurePsi) || effectivePressurePsi <= 0
                || !Double.isFinite(pistonDiameterIn) || pistonDiameterIn <= 0
                || !Double.isFinite(leverArmFt) || leverArmFt <= 0) {
            return 0.0;
        }

        double areaIn2 = calculateHydraulicArea(pistonDiameterIn, rodDiameterIn, movementType);
        double forceLbf = effectivePressurePsi * areaIn2;
        return forceLbf * leverArmFt;
    }

    /**
     * Com um sensor, a pressão efetiva é a própria pressão de entrada. Uma futura
     * leitura de retorno poderá substituir este método por |P_entrada - P_retorno|.
     */
    public static double calculateEffectivePressurePsi(double sensorPressurePsi) {
        return Double.isFinite(sensorPressurePsi) ? Math.max(0.0, sensorPressurePsi) : 0.0;
    }

    /**
     * Estrutura preparada para uma futura instalação com sensores de entrada e retorno.
     */
    public static double calculateEffectivePressurePsi(double inletPressurePsi, double returnPressurePsi) {
        if (!Double.isFinite(inletPressurePsi) || !Double.isFinite(returnPressurePsi)) return 0.0;
        return Math.abs(inletPressurePsi - returnPressurePsi);
    }

    private static void validateCylinder(
            double pistonDiameterIn,
            double rodDiameterIn,
            TipoMovimento movementType) {
        if (movementType == null) {
            throw new IllegalArgumentException("O tipo de movimento não pode ser nulo.");
        }
        if (!Double.isFinite(pistonDiameterIn) || pistonDiameterIn <= 0) {
            throw new IllegalArgumentException("O diâmetro do pistão deve ser maior que zero.");
        }
        if (!Double.isFinite(rodDiameterIn) || rodDiameterIn < 0 || rodDiameterIn >= pistonDiameterIn) {
            throw new IllegalArgumentException(
                    "O diâmetro da haste deve ser maior ou igual a zero e menor que o diâmetro do pistão.");
        }
    }

    public static double barToPsi(double bar)  { return bar * BAR_TO_PSI; }
}
