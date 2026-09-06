package com.geopetro.simulador;

import com.geopetro.simulador.domain.*;
import com.geopetro.simulador.adapter.out.persistence.entity.PocoGeometryConverter;
import com.geopetro.core.exception.BusinessException;
import org.junit.jupiter.api.Test;
import java.util.List;
import static com.geopetro.simulador.domain.PocoGeometry.*;
import static org.assertj.core.api.Assertions.*;

class PocoGeometryTest {
    static PocoGeometry vertical(double depth) {
        return new PocoGeometry(depth, depth, List.of(phase("p1", 0, depth, 0, depth)), new Trajectory(false, List.of()));
    }
    static Phase phase(String id, double top, double bottom, double topTvd, double bottomTvd) {
        return new Phase(id, "Fase", "PRODUCTION", top, bottom, topTvd, bottomTvd, 8.5, 7.0, 6.0, bottom, bottomTvd);
    }
    @Test void preservesTypedGeometryAndSurveyInPersistence() {
        var converter = new PocoGeometryConverter();
        var g = vertical(1500);
        assertThat(converter.convertToEntityAttribute(converter.convertToDatabaseColumn(g))).isEqualTo(g);
        assertThatCode(() -> PocoGeometryValidator.validate(g)).doesNotThrowAnyException();
    }
    @Test void usesSurveyInsteadOfManualTvdIncludingInsideAnArc() {
        var p1 = phase("p1", 0, 500, 0, 500);
        var p2 = phase("p2", 500, 1500, 500, 1500);
        var g = new PocoGeometry(1500.0, null, List.of(p1, p2),
                new Trajectory(true, List.of(new Station(0.0, 0.0, 0.0), new Station(1500.0, 90.0, 0.0))));
        assertThatCode(() -> PocoGeometryValidator.validate(g)).doesNotThrowAnyException();
        assertThat(new PocoGeometryConverter().convertToEntityAttribute(
                new PocoGeometryConverter().convertToDatabaseColumn(g))).isEqualTo(g);
    }
    @Test void rejectsInvalidOrIncompleteSurvey() {
        for (var stations : List.of(
                List.of(new Station(0.0, 0.0, 0.0)),
                List.of(new Station(0.0, 0.0, 0.0), new Station(1000.0, 90.0, 0.0)),
                List.of(new Station(0.0, 0.0, 0.0), new Station(1500.0, 180.0, 0.0)),
                List.of(new Station(0.0, 0.0, 0.0), new Station(1500.0, null, 0.0)),
                List.of(new Station(0.0, 0.0, 0.0), new Station(0.0, 30.0, 0.0)))) {
            var g = new PocoGeometry(1500.0, 1500.0, vertical(1500).fases(), new Trajectory(true, stations));
            assertThatThrownBy(() -> PocoGeometryValidator.validate(g)).isInstanceOf(BusinessException.class);
        }
    }
    @Test void rejectsMissingDepthsAndIncompatibleCasingShoeOrContinuity() {
        var valid = vertical(1500);
        for (var phase : List.of(
                new Phase("p1", "Fase", "PRODUCTION", 0.0, 1500.0, 0.0, null, 8.5, 7.0, 6.0, null, null),
                new Phase("p1", "Fase", "PRODUCTION", 0.0, 1500.0, 0.0, 1500.0, 8.5, 7.0, null, null, null),
                new Phase("p1", "Fase", "PRODUCTION", 0.0, 1500.0, 0.0, 1500.0, 8.5, 9.0, 6.0, null, null),
                new Phase("p1", "Fase", "PRODUCTION", 0.0, 1500.0, 0.0, 1500.0, 8.5, 7.0, 6.0, 1600.0, 1500.0))) {
            assertThatThrownBy(() -> PocoGeometryValidator.validate(
                    new PocoGeometry(1500.0, 1500.0, List.of(phase), valid.trajectory())))
                    .isInstanceOf(BusinessException.class);
        }
        assertThatThrownBy(() -> PocoGeometryValidator.validate(new PocoGeometry(Double.NaN, 0.0, valid.fases(), null)))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> PocoGeometryValidator.validate(new PocoGeometry(1500.0, 1500.0,
                List.of(phase("p1", 0, 500, 0, 500), phase("p2", 600, 1500, 600, 1500)), null)))
                .isInstanceOf(BusinessException.class);
    }
}
