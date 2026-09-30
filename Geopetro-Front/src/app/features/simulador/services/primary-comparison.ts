import type { PrimaryHydraulicPoint } from '../models/primary-cementing.model';
import type { PrimaryMeasuredDataset, PrimaryMeasurementChannel } from '../models/primary-measurements.model';

/**
 * Compara medido e calculado sem tocar no cálculo. Amostrar o calculado no tempo
 * medido só vale dentro do domínio válido: nada é interpolado através de uma
 * parada, de um evento de ferramenta ou de um trecho `outside-model`.
 */
export interface PrimaryComparisonPoint {
  timeMin: number;
  measured: number | null;
  /** `null` quando o calculado não existe nesse instante — a curva corta aqui. */
  calculated: number | null;
  /** `measured - calculated`; ausente quando um dos lados falta. */
  difference: number | null;
  sourceRow: number;
}

export interface PrimaryComparisonSeries {
  channelId: string;
  channelName: string;
  quantity: string;
  unit: string;
  points: PrimaryComparisonPoint[];
  /** Sem sobreposição temporal a comparação é exibida com aviso. */
  overlaps: boolean;
  notes: string[];
}

type Quantity = PrimaryMeasurementChannel['quantity'];

/** Grandeza medida → série calculada equivalente. Só o que tem correspondência. */
const CALCULATED_BY_QUANTITY: Partial<Record<Quantity, (point: PrimaryHydraulicPoint) => number | null>> = {
  'pump-rate': point => point.pumpRateBpm,
  'return-rate': point => point.returnRateBpm,
  pressure: point => point.pumpPressurePsi,
  'inlet-density': point => point.inletDensityPpg,
  ecd: point => point.ecdPpg,
  'total-pumped-volume': point => point.pumpedVolumeBbl,
  'cement-pumped-volume': point => point.cementPumpedVolumeBbl,
};

/** Instantes em que a curva calculada se parte e não pode ser atravessada. */
function breakpoints(points: PrimaryHydraulicPoint[]): Set<number> {
  const breaks = new Set<number>();
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    // Queda livre é resultado calculado (§7.5); só o que está fora do modelo parte a curva.
    if (point.state === 'outside-model') breaks.add(point.timeMin);
    const previous = points[i - 1];
    // Troca de estágio ou de estado é descontinuidade: não se interpola por cima.
    if (previous && (previous.stageId !== point.stageId || previous.state !== point.state))
      breaks.add(point.timeMin);
  }
  return breaks;
}

function sampleCalculated(points: PrimaryHydraulicPoint[], breaks: Set<number>,
  read: (point: PrimaryHydraulicPoint) => number | null, timeMin: number,
  maxGapMin: number): number | null {
  if (!points.length) return null;
  if (timeMin < points[0].timeMin || timeMin > points.at(-1)!.timeMin) return null;
  let before: PrimaryHydraulicPoint | null = null;
  let after: PrimaryHydraulicPoint | null = null;
  for (const point of points) {
    if (point.timeMin <= timeMin) before = point;
    if (point.timeMin >= timeMin) { after = point; break; }
  }
  if (!before || !after) return null;
  const low = read(before);
  if (before === after) return low;
  const high = read(after);
  if (low === null || high === null) return null;
  const span = after.timeMin - before.timeMin;
  if (span <= 0) return low;
  // Lacuna maior que o limite declarado não é unida por reta.
  if (maxGapMin > 0 && span > maxGapMin) return null;
  if (breaks.has(after.timeMin) || breaks.has(before.timeMin)) return null;
  return low + (high - low) * (timeMin - before.timeMin) / span;
}

export function comparePrimaryMeasurements(dataset: PrimaryMeasuredDataset,
  points: PrimaryHydraulicPoint[]): PrimaryComparisonSeries[] {
  const breaks = breakpoints(points);
  const first = points[0]?.timeMin ?? 0;
  const last = points.at(-1)?.timeMin ?? 0;
  return dataset.channels.map(channel => {
    const read = CALCULATED_BY_QUANTITY[channel.quantity];
    const notes: string[] = [];
    if (!read) notes.push('Sem série calculada equivalente para esta grandeza.');
    let overlaps = false;
    const comparison = dataset.samples.map(sample => {
      // O offset é de apresentação e entra aqui, nunca gravado nas amostras.
      const timeMin = sample.timeMin + dataset.alignment.offsetMin;
      const measured = sample.values[channel.id] ?? null;
      if (timeMin >= first && timeMin <= last) overlaps = true;
      const calculated = read && points.length
        ? sampleCalculated(points, breaks, read, timeMin, dataset.maxInterpolationGapMin) : null;
      return { timeMin, measured, calculated, sourceRow: sample.sourceRow,
        // Diferença é detalhe; sem os dois lados não existe.
        difference: measured !== null && calculated !== null ? measured - calculated : null };
    });
    if (!overlaps) notes.push('As medições não se sobrepõem ao intervalo calculado.');
    return { channelId: channel.id, channelName: channel.name, quantity: channel.quantity,
      unit: channel.unit, points: comparison, overlaps, notes };
  });
}

/**
 * Resumo do resíduo, só onde os dois lados existem. Sem percentual quando a
 * referência é zero, e sem índice de qualidade: nenhum foi aprovado.
 */
export function primaryResidualSummary(series: PrimaryComparisonSeries): {
  pairs: number; meanDifference: number | null; maxAbsDifference: number | null;
} {
  const pairs = series.points.filter(p => p.difference !== null);
  if (!pairs.length) return { pairs: 0, meanDifference: null, maxAbsDifference: null };
  const differences = pairs.map(p => p.difference!);
  return {
    pairs: pairs.length,
    meanDifference: differences.reduce((sum, value) => sum + value, 0) / differences.length,
    maxAbsDifference: Math.max(...differences.map(Math.abs)),
  };
}
