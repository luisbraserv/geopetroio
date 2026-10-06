import type { PrimaryFluid, PrimarySnapshot } from './primary-cementing.model';
import type { PrimaryGeometrySegment } from './primary-geometry.model';
import type { WellOverlay, WellOverlayType } from './well-geometry.model';

const TYPE_BY_KIND: Partial<Record<PrimaryFluid['kind'], WellOverlayType>> = {
  cement: 'CEMENT', spacer: 'SPACER', wash: 'SPACER', displacement: 'DISPLACEMENT',
};

/**
 * Parcelas transportadas viram overlays do desenho. A lama não vira overlay: ela
 * é o fundo do poço e pintá-la esconderia o que interessa. O anular carrega os
 * limites radiais do trecho, para que a bainha fique fora do OD do revestimento.
 */
export function primaryOverlays(snapshot: PrimarySnapshot | null, fluids: PrimaryFluid[],
  segments: PrimaryGeometrySegment[]): WellOverlay[] {
  if (!snapshot) return [];
  const byId = new Map(fluids.map(f => [f.id, f]));
  const segmentAt = (md: number): PrimaryGeometrySegment | undefined =>
    segments.find(s => md >= s.topMD && md <= s.bottomMD);
  const overlays: WellOverlay[] = [];
  for (const parcel of [...snapshot.parcels].sort((a, b) => a.topMD - b.topMD)) {
    const fluid = byId.get(parcel.fluidId);
    const type = fluid ? TYPE_BY_KIND[fluid.kind] : undefined;
    if (!fluid || !type || parcel.bottomMD <= parcel.topMD) continue;
    const annular = parcel.zone === 'casing-annulus';
    const segment = segmentAt((parcel.topMD + parcel.bottomMD) / 2);
    const previous = overlays.at(-1);
    // Parcelas vizinhas do mesmo fluido e da mesma zona formam um trecho só.
    if (previous && previous.label === fluid.name && previous.sub === zoneLabel(annular)
      && Math.abs(previous.bottomMD - parcel.topMD) <= 1e-6) {
      previous.bottomMD = parcel.bottomMD;
      continue;
    }
    overlays.push({
      type, topMD: parcel.topMD, bottomMD: parcel.bottomMD,
      label: fluid.name, sub: zoneLabel(annular),
      zone: annular ? 'casing-annulus' : 'tubing',
      ...(annular && segment
        ? { outerDiameterIn: segment.outerDiameterIn, innerDiameterIn: segment.casingODIn }
        : {}),
    });
  }
  return overlays;
}

function zoneLabel(annular: boolean): string {
  return annular ? 'anular' : 'interior do revestimento';
}
