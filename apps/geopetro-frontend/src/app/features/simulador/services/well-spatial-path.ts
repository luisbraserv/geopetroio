import { WellGeometry } from '../models/well-geometry.model';
import { MinimumCurvature, SurveyPosition } from './minimum-curvature';
import { WellGeometryService } from './well-geometry.service';

/** Coordenadas locais em metros. Sem azimute, o desenho é vertical em MD. */
export class WellSpatialPath {
  readonly mode: 'survey' | 'schematic';
  private readonly curve?: MinimumCurvature;

  constructor(readonly geometry: WellGeometry) {
    const errors = new WellGeometryService().validate(geometry).filter(i => i.level === 'error');
    if (errors.length) throw new Error(errors.map(i => i.message).join(' '));
    this.mode = geometry.trajectory ? 'survey' : 'schematic';
    if (geometry.trajectory) this.curve = new MinimumCurvature(geometry.trajectory);
  }

  at(md: number): SurveyPosition {
    if (!Number.isFinite(md) || md < 0 || md > this.geometry.finalMD) throw new Error('MD fora do poço.');
    return this.curve?.at(md) ?? { md, north: 0, east: 0, tvd: md };
  }

  samples(): SurveyPosition[] {
    const depths = new Set<number>([0, this.geometry.finalMD]);
    for (let i = 1; i < 256; i++) depths.add(this.geometry.finalMD * i / 256);
    for (const s of this.geometry.trajectory?.stations ?? []) {
      if (s.md <= this.geometry.finalMD) depths.add(s.md);
    }
    for (const p of this.geometry.phases) {
      depths.add(p.topMD); depths.add(p.bottomMD);
      if (p.shoe) depths.add(p.shoe.md);
    }
    return [...depths].sort((a, b) => a - b).map(md => this.at(md));
  }
}
