import type { PrimaryConfiguration, PrimaryFluid, PrimaryOuterBoundary,
  PrimaryPumpStep, PrimaryTubularAssembly } from '../models/primary-cementing.model';
import type { WellGeometry } from '../models/well-geometry.model';

/**
 * Coluna de trabalho de extremidade aberta no motor da primária (tampão e squeeze):
 * desce pela coluna, sai na extremidade e volta pelo anular coluna × parede.
 */
export interface WorkStringSection { topMD: number; bottomMD: number; idIn: number; odIn: number }
export interface WorkStringInput {
  openEndMD: number;
  /** Da superfície à extremidade; várias seções = coluna combinada ou stinger. */
  sections: WorkStringSection[];
  fluids: PrimaryFluid[];
  initialFluidId: string;
  steps: PrimaryPumpStep[];
  headCondition: PrimaryConfiguration['headCondition'];
  returnPressurePsi: number;
  friction: NonNullable<PrimaryConfiguration['frictionSettings']>;
  pressureWindow: PrimaryConfiguration['pressureWindow'];
  equipmentLimits: PrimaryConfiguration['equipmentLimits'];
}

export const WORK_STRING_ASSEMBLY_ID = 'work-string';
export const WORK_STRING_DEVICE_ID = 'open-end';
export const WORK_STRING_STAGE_ID = 'stage-1';
const EPS = 1e-9;

/**
 * Parede externa a cada profundidade, do cadastro das fases: o revestimento mais
 * interno que cobre o ponto; sem revestimento, o poço aberto com o diâmetro da fase,
 * sem excesso e sem caliper.
 */
export function workStringOuterWall(geometry: WellGeometry, bottomMD: number): {
  assemblies: PrimaryTubularAssembly[]; outerBoundaries: PrimaryOuterBoundary[];
} {
  const casings = geometry.phases.filter(phase => phase.casing && phase.casing.idIn > 0 && phase.casing.bottomMD > 0)
    .map(phase => ({ phase, topMD: phase.casing!.topMD ?? 0, bottomMD: phase.casing!.bottomMD,
      idIn: phase.casing!.idIn, odIn: phase.casing!.odIn }));
  const cuts = new Set<number>([0, bottomMD]);
  for (const md of [...casings.flatMap(c => [c.topMD, c.bottomMD]),
    ...geometry.phases.flatMap(phase => [phase.topMD, phase.bottomMD])])
    if (md > 0 && md < bottomMD) cuts.add(md);
  const bounds = [...cuts].sort((a, b) => a - b);
  const used = new Map<string, PrimaryTubularAssembly>();
  const outerBoundaries: PrimaryOuterBoundary[] = [];
  for (let i = 1; i < bounds.length; i++) {
    const topMD = bounds[i - 1]; const segmentBottom = bounds[i]; const mid = (topMD + segmentBottom) / 2;
    const casing = casings.filter(c => c.topMD <= mid && c.bottomMD > mid).sort((a, b) => a.idIn - b.idIn)[0];
    const last = outerBoundaries.at(-1);
    if (casing) {
      const assemblyId = `casing-${casing.phase.id}`;
      if (!used.has(assemblyId))
        used.set(assemblyId, { id: assemblyId, name: `Revestimento ${casing.phase.name}`, role: 'previous-casing',
          sections: [{ id: `${assemblyId}-section`, topMD: casing.topMD, bottomMD: casing.bottomMD,
            idIn: casing.idIn, odIn: casing.odIn }] });
      if (last?.kind === 'previous-casing' && last.assemblyId === assemblyId && Math.abs(last.bottomMD - topMD) < EPS)
        last.bottomMD = segmentBottom;
      else outerBoundaries.push({ id: `wall-${outerBoundaries.length + 1}`, kind: 'previous-casing',
        topMD, bottomMD: segmentBottom, assemblyId });
      continue;
    }
    const phase = geometry.phases.find(p => p.topMD <= mid && p.bottomMD > mid);
    if (!phase) continue; // A geometria acusa o buraco no circuito.
    if (last?.kind === 'open-hole' && last.phaseId === phase.id && Math.abs(last.bottomMD - topMD) < EPS)
      last.bottomMD = segmentBottom;
    else outerBoundaries.push({ id: `wall-${outerBoundaries.length + 1}`, kind: 'open-hole', topMD,
      bottomMD: segmentBottom, phaseId: phase.id, diameter: { source: 'nominal', excessFraction: 0 } });
  }
  return { assemblies: [...used.values()], outerBoundaries };
}

/** Parede do poço por profundidade: o diâmetro que o fluido vê sem a coluna. */
export interface WallSection { topMD: number; bottomMD: number; diameterIn: number }

/**
 * A parede de `workStringOuterWall` em diâmetros: ID do revestimento mais interno ou o
 * diâmetro da fase no poço aberto. É a mesma parede dos segmentos do motor, e vale também
 * abaixo da extremidade da coluna (o revestimento abaixo de um retentor).
 */
export function wellWallSections(geometry: WellGeometry, bottomMD: number): WallSection[] {
  const wall = workStringOuterWall(geometry, bottomMD);
  const casingId = new Map(wall.assemblies.map(assembly => [assembly.id, assembly.sections[0].idIn]));
  return wall.outerBoundaries.map(boundary => ({ topMD: boundary.topMD, bottomMD: boundary.bottomMD,
    diameterIn: boundary.kind === 'previous-casing' ? casingId.get(boundary.assemblyId) ?? 0
      : geometry.phases.find(phase => phase.id === boundary.phaseId)?.holeDiameterIn ?? 0 }));
}

/**
 * n e k da pasta pelas leituras Fann 300/200/100 (Petroguia F-41), a mesma conversão
 * da simulação antiga do squeeze e do tampão. Leitura ausente usa a da pasta de
 * referência (75/60/42); resultado inválido cai em n = 0,52 e k = 0,029.
 */
export function fannPowerLaw(theta300?: number | null, theta200?: number | null,
  theta100?: number | null): { n: number; kLbfSnFt2: number } {
  const reading = (value: number | null | undefined, fallback: number) =>
    Number.isFinite(value) && (value as number) > 0 ? value as number : fallback;
  const t300 = reading(theta300, 75); const t200 = reading(theta200, 60); const t100 = reading(theta100, 42);
  const n = 0.81 * Math.log(t300) + 0.15 * Math.log(t200) - 0.96 * Math.log(t100);
  const k = 1.066 * t100 ** 5.84 * t200 ** -0.53 * t300 ** -4.32 / 100;
  if (!Number.isFinite(n) || !Number.isFinite(k) || n <= 0 || k <= 0) return { n: 0.52, kLbfSnFt2: 0.029 };
  return { n: Math.max(0.1, Math.min(1.6, n)), kLbfSnFt2: k };
}

export function buildWorkStringConfiguration(geometry: WellGeometry, input: WorkStringInput): PrimaryConfiguration {
  const openEnd = input.openEndMD;
  const wall = workStringOuterWall(geometry, openEnd);
  const pathId = `path-${WORK_STRING_STAGE_ID}`;
  return {
    target: { kind: 'work-string', casingAssemblyId: WORK_STRING_ASSEMBLY_ID, floatCollarMD: openEnd, shoeMD: openEnd },
    assemblies: [
      { id: WORK_STRING_ASSEMBLY_ID, name: 'Coluna de trabalho', role: 'work-string',
        sections: input.sections.map((section, index) => ({ id: `${WORK_STRING_ASSEMBLY_ID}-${index + 1}`, ...section })) },
      ...wall.assemblies,
    ],
    outerBoundaries: wall.outerBoundaries,
    paths: [{ id: pathId, name: 'Circulação pela extremidade', legs: [
      { id: `${pathId}-in`, zone: 'internal', assemblyId: WORK_STRING_ASSEMBLY_ID, topMD: 0, bottomMD: openEnd, direction: 'down' },
      { id: `${pathId}-out`, zone: 'casing-annulus', assemblyId: WORK_STRING_ASSEMBLY_ID, topMD: 0, bottomMD: openEnd, direction: 'up' },
    ] }],
    devices: [{ id: WORK_STRING_DEVICE_ID, name: 'Extremidade da coluna', kind: 'open-end',
      assemblyId: WORK_STRING_ASSEMBLY_ID, outletMD: openEnd, seatMD: openEnd, launchMD: 0, initialState: 'open' }],
    retainedVolumes: [],
    stages: [{ id: WORK_STRING_STAGE_ID, name: 'Posicionamento', deviceId: WORK_STRING_DEVICE_ID,
      outletMD: openEnd, seatMD: openEnd, targetTocMD: 0, activePathId: pathId, placements: [], steps: input.steps }],
    fluids: input.fluids,
    initialFluidId: input.initialFluidId,
    headCondition: input.headCondition,
    returnPressurePsi: input.returnPressurePsi,
    frictionSettings: { ...input.friction },
    pressureWindow: input.pressureWindow.map(row => ({ ...row })),
    equipmentLimits: { ...input.equipmentLimits },
  };
}
