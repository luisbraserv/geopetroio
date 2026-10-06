import { BBL_M } from '../models/constantes';
import type { PrimaryFluid } from '../models/primary-cementing.model';
import type { PrimaryGeometrySegment } from '../models/primary-geometry.model';
import type { PrimaryTransportSnapshot } from '../models/primary-transport.model';
import { K } from './primary-hydraulics';

/**
 * Estado estático depois de retirar a coluna de trabalho de `fromMD` até `toMD`
 * (SPEC squeeze-tampao §6.5; R3 §14-4.2.3, Fig. 14-22). Hipóteses, nesta ordem:
 *
 * 1. Abaixo da nova extremidade o poço fica cheio (sem tubo). O que estava dentro e
 *    fora da coluna nessa faixa se junta e é reempilhado em poço cheio pela ordem de
 *    profundidade: o mais fundo embaixo e, na mesma profundidade, o mais pesado embaixo.
 * 2. O aço retirado deixa um vão logo abaixo da extremidade. Ele é preenchido pelo
 *    fluido que estava logo acima dela, descendo a mesma altura por dentro e por fora
 *    da coluna, o que mantém o equilíbrio de um tampão balanceado.
 * 3. O poço é completado na superfície durante a manobra (trip tank): a altura que
 *    desce no topo recebe o fluido inicial do poço. Se a coluna já tinha vazio no
 *    topo, ela não é completada, e o vazio cresce.
 *
 * Não é transporte: nada é bombeado e não há atrito. Serve à posição final do
 * tampão e à hidrostática depois da retirada.
 */
export interface WellboreLayer { fluidId: string; topMD: number; bottomMD: number; volumeBbl: number }

export interface WorkStringPullResult {
  fromMD: number;
  toMD: number;
  /** Aço da coluna retirado de dentro do poço. */
  steelBbl: number;
  /** Altura que desceu, por dentro e por fora, para ocupar o vão do aço. */
  dropM: number;
  /** Fluido inicial acrescentado na superfície para manter o poço cheio. */
  fillUpBbl: number;
  internal: WellboreLayer[];
  annulus: WellboreLayer[];
  /** Poço cheio, da nova extremidade até a extremidade antiga. */
  wellbore: WellboreLayer[];
  voidBbl: number;
  /** Hidrostática do lado do poço: anular até a extremidade, poço cheio abaixo. */
  hydrostaticPsiAt: (md: number) => number;
  /** Topo de um fluido no trecho de poço cheio, ou null se não estiver lá. */
  wellboreTopOf: (fluidId: string) => number | null;
}

type Zone = 'internal' | 'annulus' | 'full';
interface Piece { fluidId: string; volumeBbl: number; bottomMD: number; densityPpg: number }
const EPS = 1e-9;

export function resolveWorkStringPull(segments: PrimaryGeometrySegment[], snapshot: Pick<PrimaryTransportSnapshot, 'parcels' | 'voids'>,
  fluids: PrimaryFluid[], initialFluidId: string, toMD: number, tvdOf: (md: number) => number): WorkStringPullResult {
  const fromMD = segments.at(-1)?.bottomMD ?? 0;
  const density = new Map(fluids.map(fluid => [fluid.id, fluid.densityPpg]));
  const capacity = (segment: PrimaryGeometrySegment, zone: Zone) => zone === 'internal' ? segment.pipeCapacityBblM
    : zone === 'annulus' ? segment.annularCapacityBblM : BBL_M * segment.outerDiameterIn ** 2;
  const volumeBetween = (zone: Zone, top: number, bottom: number): number => segments.reduce((sum, s) => {
    const a = Math.max(s.topMD, top); const b = Math.min(s.bottomMD, bottom);
    return b > a ? sum + (b - a) * capacity(s, zone) : sum;
  }, 0);
  /** Topo de um volume empilhado de `bottom` para cima; para na superfície. */
  const topFromVolume = (zone: Zone, bottom: number, volume: number): number => {
    let remaining = volume;
    for (const s of [...segments].reverse()) {
      if (s.topMD >= bottom) continue;
      const segmentBottom = Math.min(s.bottomMD, bottom);
      const room = (segmentBottom - s.topMD) * capacity(s, zone);
      if (remaining <= room + EPS) return segmentBottom - remaining / capacity(s, zone);
      remaining -= room;
    }
    return 0;
  };
  const stack = (zone: Zone, bottom: number, pieces: Piece[]): { layers: WellboreLayer[]; top: number } => {
    const layers: WellboreLayer[] = [];
    let cursor = bottom;
    const ordered = [...pieces].sort((a, b) => b.bottomMD - a.bottomMD || b.densityPpg - a.densityPpg);
    for (const piece of ordered) {
      if (piece.volumeBbl <= EPS) continue;
      const top = topFromVolume(zone, cursor, piece.volumeBbl);
      const last = layers.at(-1);
      if (last && last.fluidId === piece.fluidId) { last.topMD = top; last.volumeBbl += piece.volumeBbl; }
      else layers.push({ fluidId: piece.fluidId, topMD: top, bottomMD: cursor, volumeBbl: piece.volumeBbl });
      cursor = top;
    }
    return { layers, top: cursor };
  };

  const zoneOf = (zone: string): Zone => zone === 'internal' ? 'internal' : 'annulus';
  const parcels = snapshot.parcels.map(p => ({ ...p, zone: zoneOf(p.zone) }));
  /** Parte de cada parcela entre `top` e `bottom`, proporcional à capacidade. */
  const within = (zone: Zone, top: number, bottom: number): Piece[] => parcels
    .filter(p => p.zone === zone && p.bottomMD > top + EPS && p.topMD < bottom - EPS)
    .map(p => {
      const full = volumeBetween(zone, p.topMD, p.bottomMD);
      const part = volumeBetween(zone, Math.max(p.topMD, top), Math.min(p.bottomMD, bottom));
      return { fluidId: p.fluidId, volumeBbl: full > 0 ? p.volumeBbl * part / full : 0,
        bottomMD: Math.min(p.bottomMD, bottom), densityPpg: density.get(p.fluidId) ?? 0 };
    });
  const voidBefore = (snapshot.voids ?? []).reduce((sum, v) => sum + v.volumeBbl, 0);
  const liquidLayers = (zone: Zone): WellboreLayer[] => parcels.filter(p => p.zone === zone)
    .map(p => ({ fluidId: p.fluidId, topMD: p.topMD, bottomMD: p.bottomMD, volumeBbl: p.volumeBbl }))
    .sort((a, b) => a.topMD - b.topMD);

  if (!(toMD >= 0 && toMD < fromMD - EPS)) {
    // Nada a retirar: o estado é o do fim do bombeio.
    const annulus = liquidLayers('annulus');
    return { fromMD, toMD: fromMD, steelBbl: 0, dropM: 0, fillUpBbl: 0, internal: liquidLayers('internal'),
      annulus, wellbore: [], voidBbl: voidBefore,
      hydrostaticPsiAt: md => columnHydrostatic(annulus, md, density, tvdOf), wellboreTopOf: () => null };
  }

  // 1. Abaixo da nova extremidade: tudo junto, em poço cheio.
  const below = stack('full', fromMD, [...within('internal', toMD, fromMD), ...within('annulus', toMD, fromMD)]);
  const steelBbl = volumeBetween('full', toMD, fromMD) - volumeBetween('internal', toMD, fromMD) - volumeBetween('annulus', toMD, fromMD);

  // 2. O vão do aço, de `toMD` ao topo da pilha, recebe a mesma altura de dentro e de fora.
  const gapBbl = Math.max(0, volumeBetween('full', toMD, below.top));
  const liquidAbove = (h: number) => [...within('internal', toMD - h, toMD), ...within('annulus', toMD - h, toMD)]
    .reduce((sum, piece) => sum + piece.volumeBbl, 0);
  let low = 0; let high = toMD;
  const available = liquidAbove(toMD);
  let dropM = 0;
  if (gapBbl > EPS && available > EPS) {
    if (available <= gapBbl) dropM = toMD;
    else {
      for (let i = 0; i < 80; i++) {
        const mid = (low + high) / 2;
        if (liquidAbove(mid) < gapBbl) low = mid; else high = mid;
      }
      dropM = (low + high) / 2;
    }
  }
  const descended = [...within('internal', toMD - dropM, toMD), ...within('annulus', toMD - dropM, toMD)];
  const shortfall = gapBbl - descended.reduce((sum, piece) => sum + piece.volumeBbl, 0);
  // Sem líquido suficiente acima (coluna quase toda retirada), o trip tank completa o vão.
  const gapPieces = shortfall > EPS
    ? [...descended, { fluidId: initialFluidId, volumeBbl: shortfall, bottomMD: -Infinity, densityPpg: 0 }] : descended;
  const gap = stack('full', below.top, gapPieces.map(piece => ({ ...piece, bottomMD: piece.bottomMD === -Infinity ? -1 : piece.bottomMD })));
  const wellbore = mergeLayers([...below.layers, ...gap.layers]);

  // 3. Acima da extremidade: cada lado desce `dropM` e é completado na superfície.
  let fillUpBbl = Math.max(0, shortfall);
  const relayout = (zone: Zone, fill: boolean): { layers: WellboreLayer[]; voidBbl: number } => {
    const remaining = within(zone, 0, toMD - dropM);
    const placed = stack(zone, toMD, remaining);
    const vacancy = volumeBetween(zone, 0, placed.top);
    if (vacancy <= EPS) return { layers: placed.layers, voidBbl: 0 };
    if (!fill) return { layers: placed.layers, voidBbl: vacancy };
    fillUpBbl += vacancy;
    const top = stack(zone, placed.top, [{ fluidId: initialFluidId, volumeBbl: vacancy, bottomMD: placed.top, densityPpg: 0 }]);
    return { layers: [...placed.layers, ...top.layers], voidBbl: 0 };
  };
  const internal = relayout('internal', voidBefore <= EPS);
  const annulus = relayout('annulus', true);
  const annulusLayers = sortTopDown(annulus.layers);
  const wellboreLayers = sortTopDown(wellbore);
  const hydrostaticPsiAt = (md: number): number => md <= toMD
    ? columnHydrostatic(annulusLayers, md, density, tvdOf)
    : columnHydrostatic(annulusLayers, toMD, density, tvdOf) + columnHydrostatic(wellboreLayers, md, density, tvdOf);
  return { fromMD, toMD, steelBbl, dropM, fillUpBbl,
    internal: sortTopDown(internal.layers), annulus: annulusLayers, wellbore: wellboreLayers,
    voidBbl: voidBefore + internal.voidBbl, hydrostaticPsiAt,
    wellboreTopOf: fluidId => {
      const tops = wellboreLayers.filter(layer => layer.fluidId === fluidId).map(layer => layer.topMD);
      return tops.length ? Math.min(...tops) : null;
    } };
}

function mergeLayers(layers: WellboreLayer[]): WellboreLayer[] {
  const merged: WellboreLayer[] = [];
  for (const layer of layers) {
    const last = merged.at(-1);
    if (last && last.fluidId === layer.fluidId && Math.abs(last.topMD - layer.bottomMD) < 1e-6) {
      last.topMD = layer.topMD; last.volumeBbl += layer.volumeBbl;
    } else merged.push({ ...layer });
  }
  return merged;
}

const sortTopDown = (layers: WellboreLayer[]) => [...layers].sort((a, b) => a.topMD - b.topMD);

/** Soma ρ·g·ΔTVD das camadas acima de `md`. */
function columnHydrostatic(layers: WellboreLayer[], md: number, density: Map<string, number>,
  tvdOf: (md: number) => number): number {
  return layers.reduce((sum, layer) => {
    const top = layer.topMD; const bottom = Math.min(layer.bottomMD, md);
    if (bottom <= top) return sum;
    return sum + K * (density.get(layer.fluidId) ?? 0) * (tvdOf(bottom) - tvdOf(top));
  }, 0);
}
