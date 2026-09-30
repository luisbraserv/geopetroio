import { WellGeometryIssue } from '../models/well-geometry.model';

export interface EngineeringValidationInput {
  fractureGradient?: unknown;
  poreGradient?: unknown;
  slurryDensity?: unknown;
  displacementDensity?: unknown;
  thetaReadings?: Record<string, unknown>;
  squeeze?: {
    referenceMD: unknown;
    perforations: { top: unknown; base: unknown }[];
  };
}

function finiteValue(value: unknown): number | null {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/** Relações de plausibilidade das specs: avisam sem modificar ou bloquear dados. */
export function validateEngineeringRelations(input: EngineeringValidationInput): WellGeometryIssue[] {
  const issues: WellGeometryIssue[] = [];
  const warn = (code: string, message: string) => issues.push({ level: 'warning', code, message });
  const fracture = finiteValue(input.fractureGradient);
  const pore = finiteValue(input.poreGradient);
  if (fracture !== null && pore !== null && fracture <= pore) {
    warn('FRACTURE_PORE_ORDER', 'Confira os gradientes: o gradiente de fratura deve ser maior que o de poro.');
  }

  const readings = [600, 300, 200, 100, 60, 30, 20, 10, 6, 3]
    .map(rpm => ({ rpm, value: finiteValue(input.thetaReadings?.[`theta${rpm}`]) }))
    .filter((reading): reading is { rpm: number; value: number } => reading.value !== null);
  const inversions = readings.slice(1).flatMap((reading, index) =>
    readings[index].value < reading.value ? [`θ${readings[index].rpm} < θ${reading.rpm}`] : []);
  if (inversions.length) {
    warn('FANN_READING_ORDER', `Confira as leituras Fann: ${inversions.join('; ')}. A leitura não deve aumentar quando a rotação diminui.`);
  }

  const slurry = finiteValue(input.slurryDensity);
  const displacement = finiteValue(input.displacementDensity);
  if (slurry !== null && displacement !== null && slurry <= displacement) {
    warn('SLURRY_DISPLACEMENT_DENSITY', 'Confira as densidades: a pasta deve ser mais densa que o fluido de deslocamento.');
  }

  if (input.squeeze) {
    const md = finiteValue(input.squeeze.referenceMD);
    const intervals = input.squeeze.perforations.map(p => ({ top: finiteValue(p.top), base: finiteValue(p.base) }));
    if (md !== null && intervals.length && intervals.every(p => p.top !== null && p.base !== null && p.base > p.top) &&
        !intervals.some(p => md >= p.top! && md <= p.base!)) {
      warn('SQUEEZE_REFERENCE_OUTSIDE_PERFORATIONS', 'A referência de pressão do squeeze não pertence a nenhum intervalo canhoneado. Confira os canhoneados e a referência utilizada.');
    }
  }
  return issues;
}
