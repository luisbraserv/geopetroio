package com.geopetro.desktop.calculos;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class HydraulicTorqueCalculatorTest {

    private static final double PRESSURE_PSI = 2_900.75;

    @Test
    void calculatesAdvanceTorqueUsingFullPistonArea() {
        double torque = HydraulicTorqueCalculator.calculateTorque(
                PRESSURE_PSI, 2.0, 1.0, 2.0, TipoMovimento.AVANCO);

        assertEquals(18_226.0, torque, 1.0);
    }

    @Test
    void calculatesRetractionTorqueUsingAnnularArea() {
        double torque = HydraulicTorqueCalculator.calculateTorque(
                PRESSURE_PSI, 2.0, 1.0, 2.0, TipoMovimento.RECUO);

        assertEquals(13_669.0, torque, 1.0);
    }

    @Test
    void treatsNegativeEffectivePressureAsZero() {
        assertEquals(0.0, HydraulicTorqueCalculator.calculateEffectivePressurePsi(-100.0));
        assertEquals(0.0, HydraulicTorqueCalculator.calculateTorque(
                -100.0, 2.0, 1.0, 2.0, TipoMovimento.AVANCO));
    }

    @Test
    void supportsFutureDifferentialPressureWithoutChangingSingleSensorCalculation() {
        assertEquals(2_500.0,
                HydraulicTorqueCalculator.calculateEffectivePressurePsi(2_900.0, 400.0));
    }

    @Test
    void rejectsRodDiameterEqualToPistonDiameter() {
        assertThrows(IllegalArgumentException.class, () ->
                HydraulicTorqueCalculator.calculateTorque(
                        PRESSURE_PSI, 2.0, 2.0, 2.0, TipoMovimento.RECUO));
    }

    @Test
    void rejectsNullMovementType() {
        assertThrows(IllegalArgumentException.class, () ->
                HydraulicTorqueCalculator.calculateTorque(
                        PRESSURE_PSI, 2.0, 1.0, 2.0, null));
    }
}
