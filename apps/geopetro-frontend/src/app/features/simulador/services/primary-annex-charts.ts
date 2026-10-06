import type { PrimaryHydraulicPoint, PrimaryPathZone, PrimaryVolumeAxis } from '../models/primary-cementing.model';
import type { PrimaryFullSnapshot } from '../models/primary-hydraulics.model';
import type { PrimaryComparisonSeries } from './primary-comparison';

/**
 * G1–G5 do documento complementar. Este módulo **seleciona e organiza** o que o
 * motor já calculou; não recalcula hidráulica nem inventa ponto. `null` é lacuna,
 * nunca zero, e nenhuma série medida é preenchida copiando a calculada.
 */
export interface AnnexPoint {
  x: number;
  y: number | null;
  timeMin: number;
  stageId: string;
  stepId: string | null;
  /** Os dois acumulados sempre acompanham o ponto, para o tooltip. */
  totalPumpedBbl: number;
  cementPumpedBbl: number;
}

export interface AnnexSeries {
  id: string;
  label: string;
  unit: string;
  origin: 'calculated' | 'measured';
  points: AnnexPoint[];
}

export interface AnnexProfilePoint {
  md: number;
  tvd: number;
  value: number | null;
  fluidId: string | null;
  zone: PrimaryPathZone;
}

export interface AnnexProfileSeries {
  id: string;
  label: string;
  unit: string;
  points: AnnexProfilePoint[];
}

export interface AnnexReferenceLine {
  label: string;
  value: number;
  /** A correlação é dona do limite; ele não é universal. */
  correlationId: string;
}

export const VOLUME_AXIS_LABEL: Record<PrimaryVolumeAxis, string> = {
  'total-pumped': 'Volume total bombeado (bbl)',
  'cement-pumped': 'Volume de pasta bombeada (bbl)',
};

export function primaryVolumeOf(point: PrimaryHydraulicPoint, axis: PrimaryVolumeAxis): number {
  return axis === 'cement-pumped' ? point.cementPumpedVolumeBbl : point.pumpedVolumeBbl;
}

function base(point: PrimaryHydraulicPoint, x: number, y: number | null): AnnexPoint {
  return { x, y, timeMin: point.timeMin, stageId: point.stageId, stepId: point.stepId,
    totalPumpedBbl: point.pumpedVolumeBbl, cementPumpedBbl: point.cementPumpedVolumeBbl };
}

function measuredSeries(comparisons: PrimaryComparisonSeries[], quantity: string,
  id: string, label: string, unit: string): AnnexSeries[] {
  return comparisons.filter(series => series.quantity === quantity).map(series => ({
    id: `${id}-medido-${series.channelId}`, label: `${label} (medido)`, unit, origin: 'measured' as const,
    points: series.points.map(point => ({ x: point.timeMin, y: point.measured, timeMin: point.timeMin,
      stageId: '', stepId: null, totalPumpedBbl: Number.NaN, cementPumpedBbl: Number.NaN })),
  }));
}

/** G1: retorno, volume acumulado e pressão no tempo. */
export function buildAnnexG1(points: PrimaryHydraulicPoint[], axis: PrimaryVolumeAxis,
  comparisons: PrimaryComparisonSeries[] = []): AnnexSeries[] {
  return [
    // Retorno é `returnRateBpm`; usar a vazão de bomba aqui esconderia queda livre.
    { id: 'g1-retorno', label: 'Retorno calculado', unit: 'bpm', origin: 'calculated',
      points: points.map(point => base(point, point.timeMin, point.returnRateBpm)) },
    { id: 'g1-volume', label: VOLUME_AXIS_LABEL[axis], unit: 'bbl', origin: 'calculated',
      points: points.map(point => base(point, point.timeMin, primaryVolumeOf(point, axis))) },
    { id: 'g1-pressao', label: 'Pressão de bombeio', unit: 'psi', origin: 'calculated',
      points: points.map(point => base(point, point.timeMin, point.pumpPressurePsi)) },
    ...measuredSeries(comparisons, 'return-rate', 'g1-retorno', 'Retorno', 'bpm'),
    ...measuredSeries(comparisons, 'pressure', 'g1-pressao', 'Pressão', 'psi'),
    ...measuredSeries(comparisons, axis === 'cement-pumped' ? 'cement-pumped-volume' : 'total-pumped-volume',
      'g1-volume', 'Volume', 'bbl'),
  ];
}

/**
 * G2: ECD por volume nas referências escolhidas. O X é volume, que não é função
 * unívoca do tempo: pontos repetidos são preservados na ordem temporal.
 */
export function buildAnnexG2(points: PrimaryHydraulicPoint[], axis: PrimaryVolumeAxis,
  referenceIds: string[]): AnnexSeries[] {
  return referenceIds.map(id => ({
    id: `g2-${id}`, label: `ECD em ${id}`, unit: 'ppg', origin: 'calculated' as const,
    points: points.map(point => base(point, primaryVolumeOf(point, axis),
      point.references.find(reference => reference.id === id)?.ecdPpg ?? null)),
  }));
}

/**
 * Instantes de um volume de patamar. Volume→tempo não é função: devolver todos e
 * deixar a seleção com o usuário, começando pelo mais próximo do cursor.
 */
export function instantsForVolume(points: PrimaryHydraulicPoint[], axis: PrimaryVolumeAxis,
  volumeBbl: number, cursorTimeMin: number, toleranceBbl = 1e-6): number[] {
  const matches = points
    .filter(point => Math.abs(primaryVolumeOf(point, axis) - volumeBbl) <= toleranceBbl)
    .map(point => point.timeMin);
  return matches.sort((a, b) => Math.abs(a - cursorTimeMin) - Math.abs(b - cursorTimeMin) || a - b);
}

/** G3: Reynolds nominal por profundidade no instante selecionado. */
export function buildAnnexG3(snapshot: PrimaryFullSnapshot | null, point: PrimaryHydraulicPoint | null,
  zone: PrimaryPathZone): { series: AnnexProfileSeries; limits: AnnexReferenceLine[] } {
  const profiles = (snapshot?.profiles ?? []).filter(profile => profile.zone === zone);
  // Em repouso a convenção é Re=0, sem avaliar a expressão num ponto singular.
  const atRest = !point || point.pumpRateBpm <= 0 || point.state === 'plug-landed';
  const first = profiles[0];
  return {
    series: {
      id: `g3-${zone}`, unit: 'adimensional',
      label: zone === 'internal' ? 'Reynolds nominal — interior' : 'Reynolds nominal — anular',
      points: profiles.map(profile => ({ md: profile.md, tvd: profile.tvd,
        value: atRest ? 0 : profile.reynolds, fluidId: profile.fluidId, zone })),
    },
    limits: first?.maxLaminarRe !== null && first?.maxLaminarRe !== undefined
      ? [{ label: `Limite laminar (${first.maxLaminarRe})`, value: first.maxLaminarRe,
          correlationId: first.correlationId ?? 'correlação' },
        ...(first.minTurbulentRe !== null && first.minTurbulentRe !== undefined
          ? [{ label: `Início do turbulento (${first.minTurbulentRe})`, value: first.minTurbulentRe,
              correlationId: first.correlationId ?? 'correlação' }] : [])]
      : [],
  };
}

/** G4: pressão, densidade de entrada e vazões no tempo. */
export function buildAnnexG4(points: PrimaryHydraulicPoint[],
  comparisons: PrimaryComparisonSeries[] = []): AnnexSeries[] {
  return [
    { id: 'g4-pressao', label: 'Pressão de bombeio', unit: 'psi', origin: 'calculated',
      points: points.map(point => base(point, point.timeMin, point.pumpPressurePsi)) },
    // Densidade do fluido que entra, qualquer que seja ele; em pausa é lacuna.
    { id: 'g4-densidade', label: 'Densidade na entrada', unit: 'ppg', origin: 'calculated',
      points: points.map(point => base(point, point.timeMin, point.inletDensityPpg)) },
    { id: 'g4-bombeio', label: 'Vazão programada', unit: 'bpm', origin: 'calculated',
      points: points.map(point => base(point, point.timeMin, point.pumpRateBpm)) },
    { id: 'g4-retorno', label: 'Retorno calculado', unit: 'bpm', origin: 'calculated',
      points: points.map(point => base(point, point.timeMin, point.returnRateBpm)) },
    ...measuredSeries(comparisons, 'pressure', 'g4-pressao', 'Pressão', 'psi'),
    ...measuredSeries(comparisons, 'inlet-density', 'g4-densidade', 'Densidade', 'ppg'),
    ...measuredSeries(comparisons, 'pump-rate', 'g4-bombeio', 'Vazão bombeada', 'bpm'),
    ...measuredSeries(comparisons, 'return-rate', 'g4-retorno', 'Retorno', 'bpm'),
  ];
}

/**
 * G5: densidade local, ECD e janela por profundidade no anular.
 * Densidade local **não** é a densidade equivalente integrada que o ECD carrega.
 */
export function buildAnnexG5(snapshot: PrimaryFullSnapshot | null): AnnexProfileSeries[] {
  const profiles = (snapshot?.profiles ?? []).filter(profile => profile.zone === 'casing-annulus');
  const map = (id: string, label: string, unit: string,
    read: (profile: typeof profiles[number]) => number | null): AnnexProfileSeries => ({
    id, label, unit,
    points: profiles.map(profile => ({ md: profile.md, tvd: profile.tvd, value: read(profile),
      fluidId: profile.fluidId, zone: 'casing-annulus' as const })),
  });
  return [
    map('g5-densidade', 'Densidade local do fluido', 'ppg', profile => profile.densityPpg),
    map('g5-ecd', 'ECD no anular', 'ppg', profile => profile.ecdPpg),
    // A janela já vem em ppg equivalentes: usar direto, sem integrar de novo.
    map('g5-poro', 'Gradiente de poro', 'ppg', profile => profile.porePpg),
    map('g5-fratura', 'Gradiente de fratura', 'ppg', profile => profile.fracturePpg),
  ];
}

/** Trechos que excedem a janela; colorir sem remover nem alterar o valor real. */
export function annexWindowBreaches(series: AnnexProfileSeries[]): { md: number; kind: 'pore' | 'fracture' }[] {
  const ecd = series.find(entry => entry.id === 'g5-ecd')?.points ?? [];
  const pore = new Map((series.find(entry => entry.id === 'g5-poro')?.points ?? [])
    .map(point => [point.md, point.value]));
  const fracture = new Map((series.find(entry => entry.id === 'g5-fratura')?.points ?? [])
    .map(point => [point.md, point.value]));
  const breaches: { md: number; kind: 'pore' | 'fracture' }[] = [];
  for (const point of ecd) {
    if (point.value === null) continue;
    const poreValue = pore.get(point.md);
    const fractureValue = fracture.get(point.md);
    if (fractureValue !== null && fractureValue !== undefined && point.value > fractureValue)
      breaches.push({ md: point.md, kind: 'fracture' });
    if (poreValue !== null && poreValue !== undefined && point.value < poreValue)
      breaches.push({ md: point.md, kind: 'pore' });
  }
  return breaches;
}
