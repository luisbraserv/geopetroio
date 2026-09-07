package com.geopetro.simulador.domain;

import java.util.List;

/** Contrato canônico em metros; diâmetros em polegadas. */
public record PocoGeometry(Double wellFinalMD, Double wellFinalTVD,
        List<Phase> fases, Trajectory trajectory) {
    public record Phase(String id, String name, String type, Double topMD, Double bottomMD,
            Double topTVD, Double bottomTVD, Double holeDiameterIn,
            Double casingOD, Double casingID, Double shoeMD, Double shoeTVD) {}
    public record Trajectory(boolean enabled, List<Station> stations) {}
    public record Station(Double md, Double inclinationDeg, Double azimuthDeg) {}
}
