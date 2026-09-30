import { SurveyStation, WellTrajectory } from '../models/well-geometry.model';

type Vector = [number, number, number]; // norte, leste, TVD positivo para baixo
export interface SurveyPosition { md: number; north: number; east: number; tvd: number }
const radians = Math.PI / 180;
const tangent = (s: SurveyStation): Vector => [
  Math.sin(s.inclinationDeg * radians) * Math.cos(s.azimuthDeg * radians),
  Math.sin(s.inclinationDeg * radians) * Math.sin(s.azimuthDeg * radians),
  Math.cos(s.inclinationDeg * radians),
];

/** Arco circular entre tangentes; integral analítica da tangente no arco.
 * Referência: Energistics RESQML 2.0.1, 7.3.5 Minimum-Curvature Splines.
 */
export class MinimumCurvature {
  private readonly arcs: Array<{ start: SurveyPosition; endMD: number; a: Vector; u: Vector; beta: number }> = [];
  readonly positions: SurveyPosition[] = [{ md: 0, north: 0, east: 0, tvd: 0 }];

  constructor(readonly trajectory: WellTrajectory) {
    const stations = trajectory.stations;
    if (stations.length < 2 || stations[0].md !== 0) throw new Error('Survey: cadastre ao menos duas estações, começando em MD zero.');
    stations.forEach((s, i) => {
      if (![s.md, s.inclinationDeg, s.azimuthDeg].every(Number.isFinite) || s.md < 0 ||
        s.inclinationDeg < 0 || s.inclinationDeg > 180 || s.azimuthDeg < 0 || s.azimuthDeg > 360) {
        throw new Error(`Survey: estação ${i + 1} exige MD válido, inclinação de 0 a 180° e azimute de 0 a 360°.`);
      }
      if (i === 0) return;
      const prev = stations[i - 1];
      if (s.md <= prev.md) throw new Error('Survey: os MDs devem ser estritamente crescentes, sem duplicatas.');
      const a = tangent(prev);
      const b = tangent(s);
      const dot = Math.max(-1, Math.min(1, a.reduce((sum, v, j) => sum + v * b[j], 0)));
      const cross: Vector = [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
      const sine = Math.hypot(...cross);
      const beta = Math.atan2(sine, dot);
      if (Math.PI - beta < 1e-7) throw new Error('Survey: tangentes opostas não definem um arco único; acrescente uma estação intermediária.');
      const u = a.map((v, j) => sine > 1e-12 ? (b[j] - dot * v) / sine : 0) as Vector;
      this.arcs.push({ start: this.positions[i - 1], endMD: s.md, a, u, beta });
      this.positions.push(this.onArc(this.arcs[i - 1], s.md));
    });
  }

  private onArc(arc: typeof this.arcs[number], md: number): SurveyPosition {
    const length = arc.endMD - arc.start.md;
    const t = (md - arc.start.md) / length;
    const angle = arc.beta * t;
    // 1-cos(x) = 2 sin²(x/2), estável quando o dogleg tende a zero.
    const along = arc.beta > 1e-12 ? Math.sin(angle) / arc.beta : t;
    const across = arc.beta > 1e-12 ? 2 * Math.sin(angle / 2) ** 2 / arc.beta : 0;
    const delta = arc.a.map((a, j) => length * (a * along + arc.u[j] * across));
    return { md, north: arc.start.north + delta[0], east: arc.start.east + delta[1], tvd: arc.start.tvd + delta[2] };
  }

  at(md: number): SurveyPosition {
    if (!Number.isFinite(md) || md < 0 || md > this.positions.at(-1)!.md) throw new Error('Survey: profundidade fora das estações cadastradas.');
    // Primeiro arco cujo fim alcança o MD, por busca binária: os fins são crescentes.
    let low = 0;
    let high = this.arcs.length - 1;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (md <= this.arcs[middle].endMD) high = middle; else low = middle + 1;
    }
    return this.onArc(this.arcs[low], md);
  }

  /** Menor MD para TVD em trajetória não decrescente; evita ambiguidade em retorno ascendente. */
  mdAtTvd(tvd: number): number {
    if (this.trajectory.stations.some(s => s.inclinationDeg > 90)) throw new Error('Survey: TVD→MD não é unívoco em trajetórias ascendentes; informe MD.');
    if (!Number.isFinite(tvd) || tvd < 0 || tvd > this.positions.at(-1)!.tvd + 1e-8) throw new Error('Survey: TVD fora das estações cadastradas.');
    const exact = this.positions.find(p => Math.abs(p.tvd - tvd) < 1e-8);
    if (exact) return exact.md;
    let lo = 0, hi = this.positions.at(-1)!.md;
    for (let i = 0; i < 60; i++) {
      const mid = (lo + hi) / 2;
      if (this.at(mid).tvd < tvd) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
}
