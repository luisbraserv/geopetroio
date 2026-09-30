import { gradientsAt } from './pressure-profile';
import { BBL_M } from '../models/constantes';
import type { PrimaryConfiguration, PrimaryDiagnostic, PrimaryPumpStep } from '../models/primary-cementing.model';
import type { WellGeometry } from '../models/well-geometry.model';
import type { PrimaryProgramResolution, PrimaryProgramService } from './primary-program.service';
import { workStringFluids, type TampaoEngineInput } from './tampao-engine';
import { resolveSqueezeCompression, type CompressionBlock, type CompressionStart,
  type SqueezeCompressionResult } from './work-string-compression';
import { buildWorkStringConfiguration, wellWallSections, type WallSection } from './work-string-config';
import type { WellboreLayer } from './work-string-pull';

/**
 * Squeeze com retentor perfurável (SPEC squeeze-tampao §6.6; R3 §14-9.6.2). O retentor
 * já está fixado acima dos canhoneados, e a coluna desce com o stinger até ele:
 *
 * 1. Posicionamento com o stinger **desencaixado**: o retentor fica fechado, e o
 *    circuito é o da coluna de trabalho com a extremidade no retentor e o retorno pelo
 *    anular acima dele. Bombeia água à frente, pasta, água atrás e o deslocamento até a
 *    frente da pasta chegar à ferramenta.
 * 2. `set-tool`: o stinger encaixa, o retentor abre para baixo e o anular fica isolado.
 * 3. Compressão: o que desce pela coluna passa pelo retentor; antes da pasta, só o fluido
 *    do revestimento abaixo do retentor entra na formação.
 *
 * Com a coluna mais pesada que o anular, a pasta cai livre durante o posicionamento e
 * chega à ferramenta antes do volume programado. O motor ajusta o deslocamento do
 * posicionamento até a frente da pasta ficar no retentor, e o resto do deslocamento vai
 * para a compressão.
 */
export interface RetainerSqueezeInput extends Pick<TampaoEngineInput, 'geometry' | 'pipeODIn' | 'pipeIDIn' | 'densities'
  | 'waterViscosityCp' | 'slurryRheology' | 'rates' | 'friction' | 'headCondition' | 'poreGradPpg'
  | 'fracGradPpg' | 'pressureProfile' | 'equipment'> {
  retainerMD: number;
  /** Fundo do trecho isolado abaixo do retentor: tampão, bridge plug ou fundo do poço. */
  bottomMD: number;
  perforations: { topMD: number; baseMD: number };
  referenceMD?: number;
  /** Volume a injetar na formação e águas à frente e atrás. */
  volumes: { injectBbl: number; frontBbl: number; backBbl: number };
  /**
   * Blocos com o stinger encaixado. Como função, recebe o plano: o deslocamento que falta
   * depois do ajuste pela queda livre e o vazio da coluna no momento de encaixar.
   */
  blocks: CompressionBlock[] | ((plan: { squeezeDisplacementBbl: number; voidBbl: number }) => CompressionBlock[]);
  annulusPressurePsi?: number;
  differentialLimitPsi?: number | null;
  casingBurstPsi?: number | null;
}

export interface RetainerVolumes {
  stringCapacityBbl: number;
  /** Revestimento entre o retentor e a base dos canhoneados: fica com pasta no fim. */
  belowRetainerBbl: number;
  slurryBbl: number;
  /** Deslocamento total: capacidade da coluna menos a água atrás, sem passar do retentor. */
  totalDisplacementBbl: number;
  /** Deslocamento que leva a frente da pasta ao retentor, sem queda livre. */
  spotDisplacementBbl: number;
}

export interface RetainerSqueezeResult {
  volumes: RetainerVolumes;
  primary: PrimaryConfiguration;
  resolution: PrimaryProgramResolution;
  /** Deslocamento bombeado antes de encaixar, depois do ajuste pela queda livre. */
  spotDisplacementBbl: number;
  /** O que falta do deslocamento total, bombeado com o stinger encaixado. */
  squeezeDisplacementBbl: number;
  /** Pasta que passou para o anular acima do retentor antes de encaixar. */
  slurryAboveRetainerBbl: number;
  /** Fluido entre a frente da pasta e o retentor no momento de encaixar. */
  gapBbl: number;
  iterations: number;
  start: CompressionStart;
  compression: SqueezeCompressionResult;
  diagnostics: PrimaryDiagnostic[];
}

const TOLERANCE_BBL = 0.01;
const MAX_ITERATIONS = 8;

const wallVolume = (wall: WallSection[], top: number, bottom: number) => wall.reduce((sum, w) => {
  const a = Math.max(w.topMD, top); const b = Math.min(w.bottomMD, bottom);
  return b > a ? sum + (b - a) * BBL_M * w.diameterIn ** 2 : sum;
}, 0);

/** Dimensionamento com retentor (§6.6), confirmado com o usuário em 2026-09-24. */
export function retainerSqueezeVolumes(geometry: WellGeometry, input: Pick<RetainerSqueezeInput,
  'retainerMD' | 'bottomMD' | 'perforations' | 'pipeIDIn' | 'volumes'>): RetainerVolumes {
  const wall = wellWallSections(geometry, input.bottomMD);
  const perfBase = Math.max(input.perforations.topMD, input.perforations.baseMD);
  const stringCapacityBbl = BBL_M * input.pipeIDIn ** 2 * input.retainerMD;
  const belowRetainerBbl = wallVolume(wall, input.retainerMD, perfBase);
  const slurryBbl = input.volumes.injectBbl + belowRetainerBbl;
  const totalDisplacementBbl = stringCapacityBbl - input.volumes.backBbl;
  return { stringCapacityBbl, belowRetainerBbl, slurryBbl, totalDisplacementBbl,
    spotDisplacementBbl: stringCapacityBbl - slurryBbl - input.volumes.backBbl };
}

export function runRetainerSqueeze(service: PrimaryProgramService, input: RetainerSqueezeInput,
  tvdOf: (md: number) => number): RetainerSqueezeResult {
  const volumes = retainerSqueezeVolumes(input.geometry, input);
  const diagnostics: PrimaryDiagnostic[] = [];
  if (volumes.spotDisplacementBbl < 0)
    diagnostics.push({ code: 'PRIMARY_RETAINER_SPOT', severity: 'error', category: 'configuration',
      value: volumes.slurryBbl + input.volumes.backBbl, limit: volumes.stringCapacityBbl,
      message: `Pasta e água atrás (${(volumes.slurryBbl + input.volumes.backBbl).toFixed(2)} bbl) não cabem na coluna até o retentor (${volumes.stringCapacityBbl.toFixed(2)} bbl): encaixar durante o bombeio da pasta não é modelado.` });
  const fluids = workStringFluids(input, input.densities.slurry);
  const pump = (id: string, fluidId: string, volumeBbl: number, rateBpm: number): PrimaryPumpStep[] =>
    volumeBbl > 1e-9 ? [{ id, kind: 'pump', fluidId, rateBpm, quantity: { source: 'entered', volumeBbl } }] : [];
  const configure = (spot: number): PrimaryConfiguration => buildWorkStringConfiguration(input.geometry, {
    openEndMD: input.retainerMD,
    sections: [{ topMD: 0, bottomMD: input.retainerMD, idIn: input.pipeIDIn, odIn: input.pipeODIn }],
    fluids, initialFluidId: 'completion',
    steps: [...pump('front', 'front', input.volumes.frontBbl, input.rates.front),
      ...pump('slurry', 'slurry', volumes.slurryBbl, input.rates.slurry),
      ...pump('back', 'back', input.volumes.backBbl, input.rates.back),
      ...pump('displace', 'displacement', spot, input.rates.displacement)],
    headCondition: input.headCondition, returnPressurePsi: 0,
    friction: { ...input.friction },
    // O retentor isola os canhoneados no posicionamento: não há formação exposta no circuito.
    pressureWindow: [],
    equipmentLimits: { maxPressurePsi: input.equipment.maxSurfacePressurePsi || null,
      maxRateBpm: input.equipment.maxPumpRateBpm || null, motorHp: input.equipment.motorHp || null,
      efficiency: input.equipment.pumpEffPct ? input.equipment.pumpEffPct / 100 : null },
  });
  const stringCap = BBL_M * input.pipeIDIn ** 2;
  /** Pasta além do retentor (no anular) menos o fluido entre a frente da pasta e o retentor. */
  const measure = (resolution: PrimaryProgramResolution) => {
    const parcels = resolution.transport?.snapshots.at(-1)?.parcels ?? [];
    const above = parcels.filter(p => p.zone === 'casing-annulus' && p.fluidId === 'slurry')
      .reduce((sum, p) => sum + p.volumeBbl, 0);
    const inside = parcels.filter(p => p.zone === 'internal' && p.fluidId === 'slurry');
    const front = inside.length ? Math.max(...inside.map(p => p.bottomMD)) : null;
    const gap = front === null ? 0 : Math.max(0, input.retainerMD - front) * stringCap;
    return { above, gap };
  };

  let spot = Math.max(0, volumes.spotDisplacementBbl);
  let primary = configure(spot);
  let resolution = service.resolve(input.geometry, primary);
  let measured = measure(resolution);
  let iterations = 1;
  // O volume deslocado move a frente da pasta quase na mesma medida: corrige pelo desvio.
  while (iterations < MAX_ITERATIONS && Math.abs(measured.above - measured.gap) > TOLERANCE_BBL) {
    const next = Math.max(0, spot - (measured.above - measured.gap));
    if (Math.abs(next - spot) < 1e-9) break;
    spot = next;
    primary = configure(spot);
    resolution = service.resolve(input.geometry, primary);
    measured = measure(resolution);
    iterations++;
  }
  if (measured.above > 0.05)
    diagnostics.push({ code: 'PRIMARY_RETAINER_SLURRY_ABOVE', severity: 'warning', category: 'placement',
      md: input.retainerMD, value: measured.above,
      message: `${measured.above.toFixed(2)} bbl de pasta passaram para o anular acima do retentor antes de encaixar o stinger: a queda livre levou a pasta além da ferramenta mesmo sem deslocamento.` });

  // Estado ao encaixar: coluna e anular do fim do posicionamento; abaixo do retentor, o fluido inicial.
  const last = resolution.transport?.snapshots.at(-1);
  const layers = (zone: string): WellboreLayer[] => (last?.parcels ?? []).filter(p => p.zone === zone)
    .map(p => ({ fluidId: p.fluidId, topMD: p.topMD, bottomMD: p.bottomMD, volumeBbl: p.volumeBbl }))
    .sort((a, b) => a.topMD - b.topMD);
  const wall = wellWallSections(input.geometry, input.bottomMD);
  const start: CompressionStart = {
    toMD: input.retainerMD, fromMD: input.bottomMD,
    internal: layers('internal'), annulus: layers('casing-annulus'),
    wellbore: [{ fluidId: 'completion', topMD: input.retainerMD, bottomMD: input.bottomMD,
      volumeBbl: wallVolume(wall, input.retainerMD, input.bottomMD) }],
    voidBbl: (last?.voids ?? []).reduce((sum, v) => sum + v.volumeBbl, 0),
  };
  const compression = resolveSqueezeCompression({
    segments: resolution.geometry.fullGeometry.segments, wall, start,
    isolation: { kind: 'tool', tool: 'retainer', annulusPressurePsi: input.annulusPressurePsi,
      differentialLimitPsi: input.differentialLimitPsi },
    fluids, defaultFluidId: 'displacement', perforations: input.perforations, referenceMD: input.referenceMD,
    blocks: typeof input.blocks === 'function'
      ? input.blocks({ squeezeDisplacementBbl: volumes.totalDisplacementBbl - spot, voidBbl: start.voidBbl })
      : input.blocks,
    friction: { ...input.friction },
    fracGradPpg: input.fracGradPpg, poreGradPpg: input.poreGradPpg, casingBurstPsi: input.casingBurstPsi, tvdOf,
    fracturePpgAt: md => gradientsAt(input, tvdOf(md)).fracturePpg,
    startTimeMin: resolution.transport?.totalTimeMin ?? 0, startPumpedBbl: resolution.transport?.totalPumpedBbl ?? 0,
  });
  // O deslocamento não passa do retentor (R3 §14-4.2.3).
  const behind = compression.wellbore.filter(l => l.fluidId === 'displacement' || l.fluidId === 'back')
    .reduce((sum, l) => sum + l.volumeBbl, 0) + ['displacement', 'back']
    .reduce((sum, id) => sum + (compression.injectedByFluid[id] ?? 0), 0);
  if (behind > 1e-6)
    diagnostics.push({ code: 'PRIMARY_RETAINER_OVERDISPLACED', severity: 'warning', category: 'placement',
      md: input.retainerMD, value: behind,
      message: `${behind.toFixed(2)} bbl de água atrás ou deslocamento passaram do retentor: o bombeio com o stinger encaixado foi além do deslocamento total.` });
  return { volumes, primary, resolution, spotDisplacementBbl: spot,
    squeezeDisplacementBbl: volumes.totalDisplacementBbl - spot, slurryAboveRetainerBbl: measured.above,
    gapBbl: measured.gap, iterations, start, compression,
    diagnostics: [...diagnostics, ...compression.diagnostics] };
}
