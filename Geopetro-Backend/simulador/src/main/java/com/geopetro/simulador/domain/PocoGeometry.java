package com.geopetro.simulador.domain;

import java.util.List;

/** Contrato canônico em metros; diâmetros em polegadas. */
public record PocoGeometry(Double wellFinalMD, Double wellFinalTVD,
        List<Phase> fases, Trajectory trajectory, Caliper caliper) {
    public PocoGeometry(Double wellFinalMD, Double wellFinalTVD, List<Phase> fases, Trajectory trajectory) {
        this(wellFinalMD, wellFinalTVD, fases, trajectory, null);
    }
    public record Phase(String id, String name, String type, Double topMD, Double bottomMD,
            Double topTVD, Double bottomTVD, Double holeDiameterIn,
            Double casingOD, Double casingID, Double shoeMD, Double shoeTVD, Trajectory survey) {
        public Phase(String id, String name, String type, Double topMD, Double bottomMD,
                Double topTVD, Double bottomTVD, Double holeDiameterIn,
                Double casingOD, Double casingID, Double shoeMD, Double shoeTVD) {
            this(id, name, type, topMD, bottomMD, topTVD, bottomTVD, holeDiameterIn,
                    casingOD, casingID, shoeMD, shoeTVD, null);
        }
    }
    public record Trajectory(boolean enabled, List<Station> stations) {}
    public record Station(Double md, Double inclinationDeg, Double azimuthDeg) {}
    public record Caliper(String fileName, String importedAt, String depthMnemonic,
            List<String> diameterMnemonics, Double startMD, Double stopMD, Integer sampleCount,
            Double calculatedHoleVolumeM3, Double reportedHoleVolumeM3, Double volumeDifferencePct,
            List<CaliperSample> samples) {}
    public record CaliperSample(Double md, Double ehd1In, Double ehd2In, Double ihvM3) {}
}
