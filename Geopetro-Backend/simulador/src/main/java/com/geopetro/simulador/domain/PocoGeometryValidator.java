package com.geopetro.simulador.domain;

import com.geopetro.core.exception.BusinessException;
import java.util.*;
import java.util.function.DoubleUnaryOperator;
import static com.geopetro.simulador.domain.PocoGeometry.*;

/** Valida a estrutura persistida, independentemente do cliente HTTP. */
public final class PocoGeometryValidator {
    private static final double EPS = 1e-6;
    private static final Set<String> TYPES = Set.of("CONDUCTOR", "SURFACE", "INTERMEDIATE", "PRODUCTION", "OPEN_HOLE");
    private PocoGeometryValidator() {}
    public static void validate(PocoGeometry g) {
        check(g != null, "Informe a geometria do poço.");
        check(positive(g.wellFinalMD()), "MD final deve ser positivo e finito, em metros.");
        check(g.fases() != null && !g.fases().isEmpty() && g.fases().size() <= 1000, "Informe de 1 a 1000 fases.");
        boolean survey = g.trajectory() != null && g.trajectory().enabled();
        DoubleUnaryOperator tvd = survey ? survey(g) : md -> Double.NaN;
        double finalTvd = survey ? tvd.applyAsDouble(g.wellFinalMD()) : depth(g.wellFinalTVD());
        check(finalTvd >= 0 && finalTvd <= g.wellFinalMD() + EPS, "TVD final inválida.");
        List<Phase> phases = new ArrayList<>(g.fases());
        for (Phase p : phases) {
            check(p != null && nonnegative(p.topMD()) && positive(p.bottomMD()), "Profundidades de fase inválidas.");
        }
        phases.sort(Comparator.comparingDouble(Phase::topMD));
        Phase previous = null;
        double previousTvd = 0;
        Set<String> ids = new HashSet<>();
        for (Phase p : phases) {
            check(p.id() != null && !p.id().isBlank() && ids.add(p.id()), "Cada fase deve ter um identificador único.");
            check(p.type() != null && TYPES.contains(p.type()), "Tipo de fase inválido.");
            check(p.bottomMD() > p.topMD() && p.bottomMD() <= g.wellFinalMD() + EPS, "Intervalo MD da fase inválido.");
            double top = survey ? tvd.applyAsDouble(p.topMD()) : depth(p.topTVD());
            double bottom = survey ? tvd.applyAsDouble(p.bottomMD()) : depth(p.bottomTVD());
            check(top >= 0 && bottom >= 0 && top <= p.topMD() + EPS && bottom <= p.bottomMD() + EPS,
                    "TVD da fase inválida.");
            check((survey || bottom >= top) && Math.abs(bottom - top) <= p.bottomMD() - p.topMD() + EPS,
                    "Variação de TVD incompatível com o MD.");
            if (previous != null) {
                check(Math.abs(p.topMD() - previous.bottomMD()) <= EPS, "As fases devem ser contínuas, sem sobreposição.");
                check(Math.abs(top - previousTvd) <= EPS, "Os TVDs devem ser contínuos entre fases.");
            }
            check(positive(p.holeDiameterIn()), "Diâmetro do poço deve ser positivo.");
            if (p.casingOD() != null || p.casingID() != null) {
                check(positive(p.casingOD()) && positive(p.casingID()) && p.casingID() < p.casingOD()
                        && p.casingOD() <= p.holeDiameterIn() + EPS, "Diâmetros do revestimento incompatíveis.");
            }
            if (p.shoeMD() != null || p.shoeTVD() != null) {
                check(nonnegative(p.shoeMD()) && p.shoeMD() >= p.topMD() - EPS
                        && p.shoeMD() <= p.bottomMD() + EPS, "Sapata fora da fase ou incompleta.");
                double shoeTvd = survey ? tvd.applyAsDouble(p.shoeMD()) : depth(p.shoeTVD());
                check(shoeTvd >= 0 && shoeTvd <= p.shoeMD() + EPS, "TVD da sapata inválida.");
            }
            previous = p;
            previousTvd = bottom;
        }
        if (Math.abs(previous.bottomMD() - g.wellFinalMD()) <= EPS)
            check(Math.abs(previousTvd - finalTvd) <= EPS, "TVD final deve coincidir com a última fase.");
    }

    /** Integra o arco de mínima curvatura; não usa o TVD manual quando o survey está ativo. */
    private static DoubleUnaryOperator survey(PocoGeometry g) {
        List<Station> stations = g.trajectory().stations();
        check(stations != null && stations.size() >= 2 && stations.size() <= 10000, "Survey exige de 2 a 10000 estações.");
        double[] cumulative = new double[stations.size()];
        double[] angle = new double[stations.size() - 1];
        for (int i = 0; i < stations.size(); i++) {
            Station s = stations.get(i);
            check(s != null && nonnegative(s.md()) && nonnegative(s.inclinationDeg())
                    && s.inclinationDeg() <= 180 && nonnegative(s.azimuthDeg()) && s.azimuthDeg() <= 360,
                    "Estação do survey inválida.");
            if (i == 0) check(s.md() == 0, "Survey deve começar em MD zero.");
            else {
                Station a = stations.get(i - 1);
                check(s.md() > a.md(), "MDs do survey devem ser estritamente crescentes.");
                double ai = Math.toRadians(a.inclinationDeg()), bi = Math.toRadians(s.inclinationDeg());
                double dot = Math.cos(ai) * Math.cos(bi) + Math.sin(ai) * Math.sin(bi)
                        * Math.cos(Math.toRadians(s.azimuthDeg() - a.azimuthDeg()));
                double theta = Math.acos(Math.clamp(dot, -1, 1));
                check(Math.PI - theta > 1e-8, "Estações opostas não definem arco único.");
                angle[i - 1] = theta;
                cumulative[i] = cumulative[i - 1] + integral(a, s, theta, 1);
            }
        }
        check(stations.getLast().md() >= g.wellFinalMD(), "Survey deve alcançar o fundo do poço.");
        return md -> {
            check(md >= 0 && md <= stations.getLast().md(), "MD fora do survey.");
            for (int i = 1; i < stations.size(); i++) {
                Station a = stations.get(i - 1), b = stations.get(i);
                if (md <= b.md()) return cumulative[i - 1] + integral(a, b, angle[i - 1], (md - a.md()) / (b.md() - a.md()));
            }
            return cumulative[cumulative.length - 1];
        };
    }
    private static double integral(Station a, Station b, double theta, double t) {
        double u = Math.cos(Math.toRadians(a.inclinationDeg()));
        double v = Math.cos(Math.toRadians(b.inclinationDeg()));
        double length = b.md() - a.md();
        if (theta < 1e-8) return length * (u * t + (v - u) * t * t / 2);
        double perpendicular = (v - u * Math.cos(theta)) / Math.sin(theta);
        double halfSin = Math.sin(theta * t / 2);
        return length / theta * (u * Math.sin(theta * t) + perpendicular * 2 * halfSin * halfSin);
    }
    private static double depth(Double value) {
        check(nonnegative(value), "Informe profundidades finitas e não negativas em metros.");
        return value;
    }
    private static boolean positive(Double v) { return v != null && Double.isFinite(v) && v > 0; }
    private static boolean nonnegative(Double v) { return v != null && Double.isFinite(v) && v >= 0; }
    private static void check(boolean valid, String message) { if (!valid) throw new BusinessException(message); }
}
