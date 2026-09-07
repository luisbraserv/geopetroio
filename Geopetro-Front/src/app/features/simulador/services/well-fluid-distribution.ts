import { GeometrySegment } from '../models/well-geometry.model';

export interface HydraulicFluid {
  densityPpg: number;
  rheo: { n: number; k: number };
}

export interface FluidParcel {
  volumeBbl: number;
  fluid: HydraulicFluid;
}

export interface FluidSlice {
  topMD: number;
  bottomMD: number;
  topTVD: number;
  bottomTVD: number;
  innerDiameterIn: number;
  fluid: HydraulicFluid;
}

/** Preenche trechos em MD; cada interface conserva volume e mantém seu TVD.
 * Os parcels chegam na ordem de preenchimento: mais recente primeiro.
 * Coluna preenche de cima para baixo; retorno anular, de baixo para cima.
 */
export function distributeFluids(
  segments: GeometrySegment[],
  capacity: (segment: GeometrySegment) => number,
  parcels: FluidParcel[],
  background: HydraulicFluid,
  direction: 'down' | 'up',
  tvdAt: (md: number) => number,
): FluidSlice[] {
  const queue = [...parcels.filter(p => p.volumeBbl > 0), { volumeBbl: Infinity, fluid: background }];
  let parcelIndex = 0;
  let remaining = queue[0].volumeBbl;
  const slices: FluidSlice[] = [];
  for (const segment of direction === 'down' ? segments : [...segments].reverse()) {
    const cap = capacity(segment);
    if (!Number.isFinite(cap) || cap <= 0) throw new Error('A coluna deve caber no diâmetro interno de todos os trechos.');
    let cursor = direction === 'down' ? segment.topMD : segment.bottomMD;
    let length = segment.lengthMD;
    while (length > 1e-9) {
      if (remaining <= 1e-12) remaining = queue[++parcelIndex].volumeBbl;
      const usedLength = Math.min(length, remaining / cap);
      const next = cursor + (direction === 'down' ? usedLength : -usedLength);
      const topMD = Math.min(cursor, next);
      const bottomMD = Math.max(cursor, next);
      slices.push({
        topMD, bottomMD, topTVD: tvdAt(topMD), bottomTVD: tvdAt(bottomMD),
        innerDiameterIn: segment.innerDiameterIn, fluid: queue[parcelIndex].fluid,
      });
      cursor = next;
      length -= usedLength;
      remaining -= usedLength * cap;
    }
  }
  return slices.sort((a, b) => a.topMD - b.topMD);
}

/** Parcela efetivamente bombeada de cada fluido, na ordem inversa de bombeio. */
export function pumpedParcels(sequence: Array<HydraulicFluid & { volumeBbl: number }>, total: number): FluidParcel[] {
  let before = 0;
  return sequence.map(fluid => {
    const volumeBbl = Math.min(fluid.volumeBbl, Math.max(0, total - before));
    before += fluid.volumeBbl;
    return { volumeBbl, fluid };
  }).reverse();
}
