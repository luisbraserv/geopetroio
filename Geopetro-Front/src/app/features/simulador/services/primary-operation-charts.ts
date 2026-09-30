import type { PrimaryFluid, PrimaryHydraulicPoint } from '../models/primary-cementing.model';
import type { PrimaryHydraulicsResult } from '../models/primary-hydraulics.model';
import type { PrimaryProgramVolumes } from '../models/primary-volumes.model';
import { OPERATION_FLUID_COLORS, summarizeHydroEcd, withWellMinimumHydrostatic, type OperationChartPhase,
  type OperationCharts, type OperationHydroEcdPoint, type OperationVolumeSeries } from './operation-charts';
import { K } from './primary-hydraulics';

const eqPpg = (psi: number | null | undefined, tvd: number): number | null =>
  psi !== null && psi !== undefined && Number.isFinite(psi) && tvd > 0 ? psi / (K * tvd) : null;

export const PRIMARY_SIMPLIFIED_RHEOLOGY_WARNING = 'Foi detectada reologia simplificada equivalente a água de 1 cP em lama, '
  + 'espaçador ou pasta. Informe n e k de cada fluido para obter um ECD representativo.';

/** Aviso da primária: algum dos fluidos está com a água simplificada de 1 cP. */
export function primarySimplifiedRheologyWarning(fluids: PrimaryFluid[]): string | null {
  return fluids.some(fluid => fluid.rheology.n === 1 && Math.abs(fluid.rheology.kLbfSnFt2 - 0.000020885) <= 1e-12)
    ? PRIMARY_SIMPLIFIED_RHEOLOGY_WARNING : null;
}

/** Organiza apenas resultados ja calculados; nenhuma serie recalcula a hidraulica. */
export function buildPrimaryOperationCharts(hydraulics: PrimaryHydraulicsResult | null,
  volumes: PrimaryProgramVolumes, fluids: PrimaryFluid[], phases: OperationChartPhase[],
  operationPhaseId: string | null = null,
  tvdAtMD?: (md: number) => number,
  /** Contrapressão no retorno: pressão aplicada, fora do ΔECD de atrito. */
  returnPressurePsi = 0): OperationCharts {
  const points = hydraulics?.points ?? [];
  const rawEnvelope = hydraulics?.envelope ?? [];
  // Poro e fratura só onde o motor aplica a janela (formação exposta). A hidrostática mínima
  // vai em duas linhas: o perfil, profundidade a profundidade, e a mínima do poço inteiro.
  const envelope = withWellMinimumHydrostatic(rawEnvelope.map(entry => ({ md: entry.md, tvd: entry.tvd,
    porePpg: eqPpg(entry.porePsi, entry.tvd),
    minHydrostaticPpg: eqPpg(entry.minHydrostaticPsi, entry.tvd),
    minHydrostaticWellPpg: null,
    maxEcdPpg: eqPpg(entry.maxAnnularPsi, entry.tvd),
    fracturePpg: eqPpg(entry.fracturePsi, entry.tvd) })));
  const referenceTvdFor = (point: PrimaryHydraulicPoint): number | null => {
    const exact = point.references?.find(reference =>
      Math.abs(reference.md - point.activeOutletMD) <= 1e-6)?.tvd;
    if (exact !== undefined && Number.isFinite(exact) && exact > 0) return exact;
    if (tvdAtMD) {
      try {
        const value = tvdAtMD(point.activeOutletMD);
        if (Number.isFinite(value) && value > 0) return value;
      } catch { /* A indisponibilidade fica explicita no ponto. */ }
    }
    const envelopeTvd = rawEnvelope.find(entry => Math.abs(entry.md - point.activeOutletMD) <= 1e-6)?.tvd;
    return envelopeTvd !== undefined && Number.isFinite(envelopeTvd) && envelopeTvd > 0
      ? envelopeTvd : null;
  };
  const hydroEcd: OperationHydroEcdPoint[] = points.map(point => {
    const outletTVD = referenceTvdFor(point);
    const hydrostaticPpg = outletTVD && point.annularHydrostaticPsi !== null
      ? point.annularHydrostaticPsi / (K * outletTVD) : null;
    const circulating = point.phase === 'pump' && point.pumpRateBpm > 0;
    // Como no iCem, o ECD aparece em todo instante calculado: na pausa ele cai ao ESD
    // (sem atrito) e na queda livre acompanha a vazão real de saída.
    const ecdPpg = point.ecdPpg;
    const applied = Math.max(0, returnPressurePsi || 0);
    const dynamicPressurePsi = point.bhpPsi !== null
      && point.annularHydrostaticPsi !== null
      ? point.bhpPsi - point.annularHydrostaticPsi - applied : null;
    return {
      volumeBbl: point.pumpedVolumeBbl,
      timeMin: point.timeMin,
      hydrostaticPsi: point.annularHydrostaticPsi,
      hydrostaticPpg,
      ecdPpg,
      deltaEcdPpg: ecdPpg !== null && hydrostaticPpg !== null && outletTVD
        ? ecdPpg - hydrostaticPpg - applied / (K * outletTVD) : null,
      dynamicPressurePsi,
      appliedPressurePsi: applied,
      annularFrictionPsi: point.annularFrictionPsi,
      outletTVD,
      pumpRateBpm: point.pumpRateBpm,
      circulating,
      unavailable: point.state === 'outside-model' || (circulating && ecdPpg === null),
    };
  });
  const nonWaterLike = fluids.filter(fluid => fluid.kind !== 'wash' && fluid.kind !== 'displacement');
  const operationPhase = phases.find(phase => phase.id === operationPhaseId);
  return {
    operation: 'primaria',
    references: [{
      id: 'outlet', label: 'Saída ativa', title: 'ECD e pressão hidrostática na saída ativa',
      description: 'Hidrostática em psi à esquerda e ECD em ppg à direita, com as escalas amarradas pela TVD '
        + 'da saída: as duas curvas coincidem quando não há atrito. ESD e ΔP dinâmica no detalhe do ponto.',
      // Maior TVD do envelope: a saida ativa da primaria fica no fundo do circuito.
      tvd: Math.max(0, ...envelope.map(point => point.tvd)),
      points: hydroEcd,
      summary: summarizeHydroEcd(hydroEcd, (hydraulics?.diagnostics ?? []).some(diagnostic =>
        diagnostic.code === 'PRIMARY_FREE_FALL_UNRESOLVED')),
    }],
    envelope,
    envelopeMarker: operationPhase ? { label: 'Sapata anterior', md: operationPhase.topMD } : null,
    volumes: buildFluidVolumeSeries(volumes, fluids),
    phases,
    operationPhaseId,
    rheologyWarning: primarySimplifiedRheologyWarning(nonWaterLike),
  };
}

/** Acumulado total e por fluido, usando os volumes e duracoes resolvidos pelo programa. */
export function buildFluidVolumeSeries(program: PrimaryProgramVolumes,
  fluids: PrimaryFluid[]): OperationVolumeSeries[] {
  const usedIds = [...new Set(program.stages.flatMap(stage => stage.steps)
    .filter(step => step.kind === 'pump' && !!step.fluidId && step.volumeBbl > 0)
    .map(step => step.fluidId as string))];
  const accumulated = new Map(usedIds.map(id => [id, 0]));
  const rows: { timeMin: number; total: number; byFluid: Map<string, number> }[] = [
    { timeMin: 0, total: 0, byFluid: new Map(accumulated) },
  ];
  let timeMin = 0;
  let total = 0;
  for (const step of program.stages.flatMap(stage => stage.steps)) {
    timeMin += Math.max(0, step.durationMin);
    if (step.kind === 'pump' && step.fluidId && step.volumeBbl > 0) {
      accumulated.set(step.fluidId, (accumulated.get(step.fluidId) ?? 0) + step.volumeBbl);
      total += step.volumeBbl;
    }
    if (step.durationMin > 0 || step.volumeBbl > 0)
      rows.push({ timeMin, total, byFluid: new Map(accumulated) });
  }
  const byId = new Map(fluids.map(fluid => [fluid.id, fluid]));
  return [
    { id: 'total', label: 'Volume total injetado', color: '#051833', kind: 'total',
      points: rows.map(row => ({ timeMin: row.timeMin, volumeBbl: row.total })) },
    ...usedIds.map(id => {
      const fluid = byId.get(id);
      return { id, label: fluid?.name ?? id, color: OPERATION_FLUID_COLORS[fluid?.kind ?? 'mud'], kind: 'fluid' as const,
        points: rows.map(row => ({ timeMin: row.timeMin, volumeBbl: row.byFluid.get(id) ?? 0 })) };
    }),
  ];
}
