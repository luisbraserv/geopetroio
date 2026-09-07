export type DepthUnit = 'm' | 'ft';
export const METRES_PER_FOOT = 0.3048;

export function depthFromMetres(value: number, unit: DepthUnit): number {
  return unit === 'ft' ? value / METRES_PER_FOOT : value;
}

export function depthToMetres(value: number, unit: DepthUnit): number {
  return unit === 'ft' ? value * METRES_PER_FOOT : value;
}

export function formatDepthNumber(value: number | null | undefined, unit: DepthUnit, digits = 1): string {
  if (value == null || !Number.isFinite(value)) return '—';
  return depthFromMetres(value, unit).toLocaleString('pt-BR', {
    minimumFractionDigits: digits, maximumFractionDigits: digits,
  });
}

export function formatDepth(value: number | null | undefined, unit: DepthUnit = 'm', digits = 1): string {
  return `${formatDepthNumber(value, unit, digits)} ${unit}`;
}
