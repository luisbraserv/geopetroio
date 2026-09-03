export interface VisualSegmentInput {
  key: string;
  top: number;
  bottom: number;
  label?: string;
  sub?: string;
  color?: string;
  volumeBbl?: number;
}

export interface VisualSegment<T extends VisualSegmentInput = VisualSegmentInput> extends VisualSegmentInput {
  realHeight: number;
  visualHeight: number;
  visualTop: number;
  visualBottom: number;
  original: T;
}

export interface VisualSegmentOptions {
  cementKey?: string;
  totalVisualHeight: number;
  cementVisualRatio?: number;
  minVisualHeightPx?: number;
  minWaterFrontPx?: number;
  minWaterBackPx?: number;
  minOtherSegmentPx?: number;
}

export const ADJUSTED_SCHEMATIC_NOTE = 'Representação visual ajustada; o cimento foi ampliado visualmente para melhor leitura. Os valores exibidos são reais.';

export interface DepthAnnotationInput {
  id: string;
  label: string;
  depthReal: number;
  yReal: number;
}

export interface DepthAnnotationLayout extends DepthAnnotationInput {
  yLabel: number;
}

export interface DepthAnnotationLayoutOptions {
  minGapPx?: number;
  topPadding: number;
  bottomPadding: number;
}

export interface SchematicInfoSection {
  title: string;
  rows: Array<{ label: string; value: string | null | undefined }>;
}

export function computeVisualSegmentHeights<T extends VisualSegmentInput>(
  segments: T[],
  options: VisualSegmentOptions,
): VisualSegment<T>[] {
  const total = Math.max(0, options.totalVisualHeight);
  const cementKey = options.cementKey ?? 'cement';
  const cementRatio = options.cementVisualRatio ?? 0.4;
  const defaultMinPx = Math.max(0, options.minVisualHeightPx ?? options.minOtherSegmentPx ?? 30);
  const waterFrontMinPx = Math.max(0, options.minWaterFrontPx ?? 42);
  const waterBackMinPx = Math.max(0, options.minWaterBackPx ?? 42);
  const minForSegment = (segment: VisualSegmentInput) => {
    if (segment.key === 'frontWater') return waterFrontMinPx;
    if (segment.key === 'backWater') return waterBackMinPx;
    return defaultMinPx;
  };
  const visible = segments.filter(segment => segment.bottom > segment.top);
  const cementIndex = visible.findIndex(segment => segment.key === cementKey);

  if (!visible.length || total <= 0) return [];
  if (cementIndex < 0) return distributeStack(visible, total, visible.map(minForSegment));

  const cementHeight = total * cementRatio;
  const remainingTotal = Math.max(0, total - cementHeight);
  const others = visible.filter((_, index) => index !== cementIndex);
  const distributedOthers = distributeHeights(others, remainingTotal, others.map(minForSegment));

  let otherPointer = 0;
  let cursor = 0;
  return visible.map((segment, index) => {
    const visualHeight = index === cementIndex ? cementHeight : distributedOthers[otherPointer++];
    const out = toVisualSegment(segment, visualHeight, cursor);
    cursor += visualHeight;
    return out;
  });
}

function distributeStack<T extends VisualSegmentInput>(segments: T[], total: number, minPxBySegment: number[]): VisualSegment<T>[] {
  const heights = distributeHeights(segments, total, minPxBySegment);
  let cursor = 0;
  return segments.map((segment, index) => {
    const out = toVisualSegment(segment, heights[index], cursor);
    cursor += heights[index];
    return out;
  });
}

function distributeHeights<T extends VisualSegmentInput>(segments: T[], total: number, minPxBySegment: number[]): number[] {
  if (!segments.length) return [];
  if (total <= 0) return segments.map(() => 0);

  const minima = segments.map((_, index) => Math.max(0, minPxBySegment[index] ?? 0));
  const minimaTotal = minima.reduce((sum, value) => sum + value, 0);
  if (minimaTotal >= total) {
    return minimaTotal > 0 ? minima.map(value => total * value / minimaTotal) : segments.map(() => total / segments.length);
  }

  const realHeights = segments.map(segment => Math.max(0, segment.bottom - segment.top));
  const unresolved = new Set(segments.map((_, index) => index));
  const output = new Array(segments.length).fill(0);
  let remainingTotal = total;
  let remainingReal = realHeights.reduce((sum, value) => sum + value, 0);

  while (unresolved.size) {
    let changed = false;
    for (const index of Array.from(unresolved)) {
      const share = remainingReal > 0 ? remainingTotal * realHeights[index] / remainingReal : remainingTotal / unresolved.size;
      if (share < minima[index]) {
        output[index] = minima[index];
        unresolved.delete(index);
        remainingTotal -= minima[index];
        remainingReal -= realHeights[index];
        changed = true;
      }
    }
    if (!changed) break;
  }

  if (unresolved.size) {
    for (const index of unresolved) {
      output[index] = remainingReal > 0 ? remainingTotal * realHeights[index] / remainingReal : remainingTotal / unresolved.size;
    }
  }

  const sum = output.reduce((acc, value) => acc + value, 0);
  if (sum > 0 && Math.abs(sum - total) > 0.001) {
    const factor = total / sum;
    return output.map(value => value * factor);
  }
  return output;
}

function toVisualSegment<T extends VisualSegmentInput>(segment: T, visualHeight: number, visualTop: number): VisualSegment<T> {
  return {
    ...segment,
    realHeight: segment.bottom - segment.top,
    visualHeight,
    visualTop,
    visualBottom: visualTop + visualHeight,
    original: segment,
  };
}

export function layoutDepthAnnotations(
  annotations: DepthAnnotationInput[],
  options: DepthAnnotationLayoutOptions,
): DepthAnnotationLayout[] {
  const minGap = Math.max(0, options.minGapPx ?? 24);
  const top = options.topPadding;
  const bottom = Math.max(top, options.bottomPadding);
  const ordered = annotations
    .map(annotation => ({ ...annotation, yLabel: clamp(annotation.yReal, top, bottom) }))
    .sort((a, b) => a.yLabel - b.yLabel);

  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].yLabel - ordered[i - 1].yLabel < minGap) {
      ordered[i].yLabel = ordered[i - 1].yLabel + minGap;
    }
  }

  for (let i = ordered.length - 1; i >= 0; i -= 1) {
    if (ordered[i].yLabel > bottom) ordered[i].yLabel = bottom;
    if (i > 0 && ordered[i].yLabel - ordered[i - 1].yLabel < minGap) {
      ordered[i - 1].yLabel = ordered[i].yLabel - minGap;
    }
  }

  for (let i = 0; i < ordered.length; i += 1) {
    ordered[i].yLabel = clamp(ordered[i].yLabel, top, bottom);
  }

  return ordered.sort((a, b) => annotations.findIndex(item => item.id === a.id) - annotations.findIndex(item => item.id === b.id));
}

export function shouldShowSegmentSubtitle(visualHeight: number): boolean {
  return visualHeight >= 42;
}

export function shouldShowSegmentLabel(visualHeight: number): boolean {
  return visualHeight >= 18;
}

export function displaySubtitleForSegment(segment: { key: string; sub?: string; visualHeight: number }): string | undefined {
  if (!segment.sub) return undefined;
  if (shouldShowSegmentSubtitle(segment.visualHeight)) return segment.sub;
  if ((segment.key === 'frontWater' || segment.key === 'backWater') && segment.visualHeight >= 30) {
    return segment.sub.split('|')[0]?.trim() || segment.sub;
  }
  return undefined;
}

export function formatM(value: number | null | undefined, digits = 1): string | null {
  return formatUnit(value, 'm', digits);
}

export function formatBbl(value: number | null | undefined): string | null {
  return formatUnit(value, 'bbl', 2);
}

export function formatPpg(value: number | null | undefined): string | null {
  return formatUnit(value, 'ppg', 2);
}

export function formatPsi(value: number | null | undefined): string | null {
  return formatUnit(value, 'psi', 0);
}

export function joinInfoParts(...parts: Array<string | null | undefined>): string | null {
  const clean = parts.filter((part): part is string => !!part);
  return clean.length ? clean.join(' | ') : null;
}

export function visibleInfoRows(section: SchematicInfoSection): SchematicInfoSection {
  return {
    ...section,
    rows: section.rows.filter(row => !!row.value && !/(NaN|Infinity|undefined|null)/i.test(row.value)),
  };
}

export function visualYForSegmentBoundary(
  segments: VisualSegment[],
  key: string,
  boundary: 'top' | 'bottom',
  yTop = 0,
): number | null {
  const segment = segments.find(item => item.key === key || item.original.key === key);
  if (!segment) return null;
  return yTop + (boundary === 'top' ? segment.visualTop : segment.visualBottom);
}

export function visualYForDepth(segments: VisualSegment[], depth: number, yTop = 0): number {
  if (!segments.length) return yTop;
  const ordered = [...segments].sort((a, b) => a.top - b.top);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  if (depth <= first.top) return yTop + first.visualTop;
  if (depth >= last.bottom) return yTop + last.visualBottom;

  const segment = ordered.find(item => depth >= item.top && depth <= item.bottom) ?? last;
  if (segment.realHeight <= 0) return yTop + segment.visualTop;
  const ratio = (depth - segment.top) / segment.realHeight;
  return yTop + segment.visualTop + segment.visualHeight * clamp(ratio, 0, 1);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatUnit(value: number | null | undefined, unit: string, digits: number): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${unit}`;
}
