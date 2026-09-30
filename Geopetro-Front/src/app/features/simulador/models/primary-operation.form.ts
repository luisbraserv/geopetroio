import type { CementPlacement, PrimaryConfiguration, PrimaryDevice, PrimaryFlowPath, PrimaryFluid,
  PrimaryFrictionLevel, PrimaryOuterBoundary, PrimaryPumpStep, PrimaryRetainedVolume,
  PrimaryTubularAssembly } from './primary-cementing.model';
import type { WellGeometry, WellPhase } from './well-geometry.model';

/**
 * Formulário compacto da primária: o que o usuário edita na tela. A montagem
 * externa, os caminhos e os dispositivos são derivados daqui e da geometria do
 * poço, em vez de pedir que o usuário redigite o que já existe no cadastro.
 */
export interface PrimaryStageForm {
  id: string;
  name: string;
  targetTocMD: number;
  /** Saída ativa: sapata no primeiro estágio, porta da ferramenta nos demais. */
  outletMD: number;
  seatMD: number;
  placements: { id: string; fluidId: string; topMD: number; bottomMD: number; mixingReserveBbl: number }[];
  steps: PrimaryPumpStep[];
}

export interface PrimaryOperationFormValue {
  targetKind: 'conventional' | 'liner';
  shoeMD: number;
  floatCollarMD: number;
  linerTopMD: number | null;
  casingIdIn: number;
  casingOdIn: number;
  settingIdIn: number | null;
  settingOdIn: number | null;
  /** Excesso anular estimado em %, exclusivo com o diâmetro medido. */
  excessPct: number;
  measuredHoleIn: number | null;
  headCondition: 'closed-head' | 'vented-free-surface';
  returnPressurePsi: number;
  internalFrictionLevel: PrimaryFrictionLevel;
  annularFrictionLevel: PrimaryFrictionLevel;
  poreTopPpg?: number | null;
  fractureTopPpg?: number | null;
  porePpg: number | null;
  fracturePpg: number | null;
  /**
   * Janela por trechos, quando a formação não cabe num só intervalo linear
   * (ex.: fratura constante até 300 m e crescente abaixo). Presente e não vazia,
   * substitui os quatro campos acima; editar esses campos a descarta.
   */
  pressureWindowRows?: PrimaryConfiguration['pressureWindow'];
  maxPressurePsi: number | null;
  maxRateBpm: number | null;
  motorHp: number | null;
  efficiency: number | null;
  initialFluidId: string;
  fluids: PrimaryFluid[];
  stages: PrimaryStageForm[];
}

const TARGET = 'target';
const PREVIOUS = 'previous';
const SETTING = 'setting';
const TRACK = 'track';

/** Sapata do revestimento anterior: a mais profunda acima do alvo. */
export function previousShoeMD(geometry: WellGeometry, shoeMD: number): { md: number; idIn: number; odIn: number } | null {
  const cased = geometry.phases
    .filter(phase => phase.casing && phase.casing.bottomMD > 0 && phase.casing.bottomMD < shoeMD && phase.casing.idIn > 0)
    .sort((a, b) => b.casing!.bottomMD - a.casing!.bottomMD);
  const casing = cased[0]?.casing;
  return casing ? { md: casing.bottomMD, idIn: casing.idIn, odIn: casing.odIn } : null;
}

function openHolePhaseId(geometry: WellGeometry, md: number): string {
  return geometry.phases.find(p => md > p.topMD && md <= p.bottomMD)?.id
    ?? geometry.phases.at(-1)?.id ?? 'open';
}

/**
 * Converte o formulário em configuração completa. Não valida física: a geometria,
 * o dimensionamento e o transporte continuam recusando o que não fecha.
 */
export function buildPrimaryConfiguration(form: PrimaryOperationFormValue,
  geometry: WellGeometry): PrimaryConfiguration {
  const liner = form.targetKind === 'liner';
  const topMD = liner ? form.linerTopMD ?? 0 : 0;
  const previous = previousShoeMD(geometry, form.shoeMD);
  const assemblies: PrimaryTubularAssembly[] = [
    { id: TARGET, name: liner ? 'Liner' : 'Revestimento-alvo', role: 'target-casing',
      sections: [{ id: `${TARGET}-section`, topMD, bottomMD: form.shoeMD,
        idIn: form.casingIdIn, odIn: form.casingOdIn }] },
  ];
  if (previous)
    assemblies.push({ id: PREVIOUS, name: 'Revestimento anterior', role: 'previous-casing',
      sections: [{ id: `${PREVIOUS}-section`, topMD: 0, bottomMD: previous.md,
        idIn: previous.idIn, odIn: previous.odIn }] });
  if (liner)
    assemblies.push({ id: SETTING, name: 'Coluna de assentamento', role: 'setting-string',
      sections: [{ id: `${SETTING}-section`, topMD: 0, bottomMD: topMD,
        idIn: form.settingIdIn ?? 0, odIn: form.settingOdIn ?? 0 }] });

  // Parede externa: ID do revestimento anterior acima da sua sapata, furo abaixo.
  const outerBoundaries: PrimaryOuterBoundary[] = [];
  const openTop = previous?.md ?? 0;
  if (previous)
    outerBoundaries.push({ id: 'outer-previous', kind: 'previous-casing',
      topMD: 0, bottomMD: previous.md, assemblyId: PREVIOUS });
  if (openTop < form.shoeMD)
    outerBoundaries.push({ id: 'outer-hole', kind: 'open-hole', topMD: openTop, bottomMD: form.shoeMD,
      phaseId: openHolePhaseId(geometry, form.shoeMD),
      diameter: form.measuredHoleIn !== null && form.measuredHoleIn > 0
        ? { source: 'measured', diameterIn: form.measuredHoleIn }
        // O percentual é sobrecalibre do anular, não aumento do diâmetro.
        : { source: 'nominal', excessFraction: Math.max(0, form.excessPct) / 100 } });

  const devices: PrimaryDevice[] = [{ id: 'collar', name: 'Colar flutuante', kind: 'float-collar',
    assemblyId: TARGET, outletMD: form.shoeMD, seatMD: form.floatCollarMD, launchMD: 0,
    initialState: 'open' }];
  if (liner)
    devices.push({ id: 'hanger', name: 'Topo do liner', kind: 'liner-hanger', assemblyId: TARGET,
      outletMD: topMD, seatMD: topMD, launchMD: 0, initialState: 'open' });
  const paths: PrimaryFlowPath[] = [];
  const stages = form.stages.map((stage, index) => {
    const pathId = `path-${stage.id}`;
    if (index > 0)
      devices.push({ id: `port-${stage.id}`, name: `Ferramenta de estágio ${index + 1}`,
        kind: 'stage-tool', assemblyId: TARGET, outletMD: stage.outletMD, seatMD: stage.seatMD,
        launchMD: 0, initialState: 'closed' });
    paths.push({ id: pathId, name: `Circulação ${stage.name}`, legs: [
      ...(liner && topMD > 0 ? [{ id: `${pathId}-setting-in`, zone: 'internal' as const,
        assemblyId: SETTING, topMD: 0, bottomMD: Math.min(topMD, stage.outletMD), direction: 'down' as const }] : []),
      { id: `${pathId}-in`, zone: 'internal' as const, assemblyId: liner && stage.outletMD > topMD ? TARGET : liner ? SETTING : TARGET,
        topMD: liner ? Math.min(topMD, stage.outletMD) : 0, bottomMD: stage.outletMD, direction: 'down' as const },
      { id: `${pathId}-out`, zone: 'casing-annulus' as const,
        assemblyId: liner && stage.outletMD > topMD ? TARGET : liner ? SETTING : TARGET,
        topMD: liner ? Math.min(topMD, stage.outletMD) : 0, bottomMD: stage.outletMD, direction: 'up' as const },
      ...(liner && topMD > 0 ? [{ id: `${pathId}-setting-out`, zone: 'casing-annulus' as const,
        assemblyId: SETTING, topMD: 0, bottomMD: Math.min(topMD, stage.outletMD), direction: 'up' as const }] : []),
    ].filter(leg => leg.bottomMD > leg.topMD) });
    const placements: CementPlacement[] = stage.placements.map(placement => ({
      id: placement.id, fluidId: placement.fluidId, topMD: placement.topMD, bottomMD: placement.bottomMD,
      // O shoe track pertence ao primeiro circuito e só é atribuído uma vez.
      retainedVolumeIds: index === 0 && placement.bottomMD >= form.shoeMD ? [TRACK] : [],
      ...(placement.mixingReserveBbl > 0 ? { mixingReserveBbl: placement.mixingReserveBbl } : {}),
    }));
    return { id: stage.id, name: stage.name, deviceId: index === 0 ? 'collar' : `port-${stage.id}`,
      outletMD: stage.outletMD, seatMD: stage.seatMD, targetTocMD: stage.targetTocMD,
      activePathId: pathId, placements, steps: stage.steps };
  });

  const retainedVolumes: PrimaryRetainedVolume[] = [{ id: TRACK, kind: 'shoe-track',
    assemblyId: TARGET, zone: 'internal', topMD: form.floatCollarMD, bottomMD: form.shoeMD }];

  return {
    target: liner
      ? { kind: 'liner', casingAssemblyId: TARGET, floatCollarMD: form.floatCollarMD,
        shoeMD: form.shoeMD, linerTopMD: topMD, settingStringAssemblyId: SETTING }
      : { kind: 'conventional', casingAssemblyId: TARGET, floatCollarMD: form.floatCollarMD,
        shoeMD: form.shoeMD },
    assemblies, outerBoundaries, paths, devices, retainedVolumes, stages,
    fluids: form.fluids, initialFluidId: form.initialFluidId,
    headCondition: form.headCondition, returnPressurePsi: form.returnPressurePsi,
    frictionSettings: {
      internal: form.internalFrictionLevel,
      annular: form.annularFrictionLevel,
    },
    // Janela só faz sentido no trecho aberto; atrás do revestimento anterior fica null.
    pressureWindow: form.pressureWindowRows?.length
      ? form.pressureWindowRows.map(row => ({ ...row }))
      : openTop < form.shoeMD && (form.porePpg !== null || form.fracturePpg !== null)
        ? [{ topMD: openTop, bottomMD: form.shoeMD,
            topPorePpg: form.poreTopPpg ?? form.porePpg,
            topFracturePpg: form.fractureTopPpg ?? form.fracturePpg,
            porePpg: form.porePpg, fracturePpg: form.fracturePpg }]
        : [],
    equipmentLimits: { maxPressurePsi: form.maxPressurePsi, maxRateBpm: form.maxRateBpm,
      motorHp: form.motorHp, efficiency: form.efficiency },
  };
}

/** Programa padrão de um estágio: pasta, lançamento e deslocamento. */
export function defaultStageSteps(stageId: string, deviceId: string, placementId: string,
  rateBpm: number, liner: boolean): PrimaryPumpStep[] {
  return [
    { id: `${stageId}-cement`, kind: 'pump', fluidId: 'cement', rateBpm,
      quantity: { source: 'placement', placementId, fraction: 1 } },
    { id: `${stageId}-launch`, kind: 'tool-event', deviceId,
      action: liner ? 'launch-dart' : 'launch-top' },
    { id: `${stageId}-displace`, kind: 'pump', fluidId: 'displacement', rateBpm,
      quantity: { source: 'displacement', deviceId, fraction: 1 } },
  ];
}

/** Move um passo na lista sem alterar seus dados; ordem livre é requisito. */
export function moveStep(steps: PrimaryPumpStep[], from: number, to: number): PrimaryPumpStep[] {
  if (from === to || from < 0 || to < 0 || from >= steps.length || to >= steps.length) return steps;
  const next = [...steps];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

/** Repete um passo de bombeio dividindo a fração declarada entre os dois. */
export function repeatStep(steps: PrimaryPumpStep[], index: number, newId: string): PrimaryPumpStep[] {
  const step = steps[index];
  if (!step || step.kind !== 'pump') return steps;
  const quantity = step.quantity;
  if (quantity.source === 'placement' || quantity.source === 'displacement') {
    const half = quantity.fraction / 2;
    const first: PrimaryPumpStep = { ...step, quantity: { ...quantity, fraction: half } };
    const second: PrimaryPumpStep = { ...step, id: newId, quantity: { ...quantity, fraction: half } };
    return [...steps.slice(0, index), first, second, ...steps.slice(index + 1)];
  }
  // Colchão calculado: metade do critério em cada um, e a soma continua sendo o calculado.
  if (quantity.source === 'preflush') {
    const half = { ...quantity, contactTimeMin: quantity.contactTimeMin / 2, annularLengthM: quantity.annularLengthM / 2,
      overrideBbl: quantity.overrideBbl === null ? null : quantity.overrideBbl / 2 };
    return [...steps.slice(0, index), { ...step, quantity: half }, { ...step, id: newId, quantity: { ...half } },
      ...steps.slice(index + 1)];
  }
  if (quantity.source === 'entered') {
    const half = quantity.volumeBbl / 2;
    return [...steps.slice(0, index), { ...step, quantity: { ...quantity, volumeBbl: half } },
      { ...step, id: newId, quantity: { ...quantity, volumeBbl: half } }, ...steps.slice(index + 1)];
  }
  return steps;
}

/**
 * Caminho de volta: configuração salva vira o formulário da tela. Só o que a
 * tela edita é reconstruído; montagens, caminhos e dispositivos voltam a ser
 * derivados, para não guardar duas verdades sobre a mesma coisa.
 */
export function primaryFormFromConfiguration(primary: PrimaryConfiguration,
  fallback: PrimaryOperationFormValue): PrimaryOperationFormValue {
  const target = primary.target;
  if (!target) return fallback;
  const liner = target.kind === 'liner';
  const casing = primary.assemblies.find(a => a.id === TARGET)?.sections[0];
  const setting = primary.assemblies.find(a => a.id === SETTING)?.sections[0];
  const open = primary.outerBoundaries.find(b => b.kind === 'open-hole');
  const measured = open?.kind === 'open-hole' && open.diameter.source === 'measured'
    ? open.diameter.diameterIn : null;
  const excess = open?.kind === 'open-hole' && open.diameter.source === 'nominal'
    ? open.diameter.excessFraction * 100 : 0;
  const window = primary.pressureWindow[0];
  const lastWindow = primary.pressureWindow.at(-1);
  return {
    targetKind: liner ? 'liner' : 'conventional',
    shoeMD: target.shoeMD,
    floatCollarMD: target.floatCollarMD,
    linerTopMD: liner ? target.linerTopMD : null,
    casingIdIn: casing?.idIn ?? fallback.casingIdIn,
    casingOdIn: casing?.odIn ?? fallback.casingOdIn,
    settingIdIn: setting?.idIn ?? fallback.settingIdIn,
    settingOdIn: setting?.odIn ?? fallback.settingOdIn,
    excessPct: excess,
    measuredHoleIn: measured,
    headCondition: primary.headCondition,
    returnPressurePsi: primary.returnPressurePsi,
    internalFrictionLevel: primary.frictionSettings?.internal ?? fallback.internalFrictionLevel ?? 'medium',
    annularFrictionLevel: primary.frictionSettings?.annular ?? fallback.annularFrictionLevel ?? 'medium',
    poreTopPpg: window?.topPorePpg ?? window?.porePpg ?? null,
    fractureTopPpg: window?.topFracturePpg ?? window?.fracturePpg ?? null,
    porePpg: lastWindow?.porePpg ?? null,
    fracturePpg: lastWindow?.fracturePpg ?? null,
    // Mais de um trecho não cabe nos quatro campos: volta como janela por trechos.
    ...(primary.pressureWindow.length > 1
      ? { pressureWindowRows: primary.pressureWindow.map(row => ({ ...row })) } : {}),
    maxPressurePsi: primary.equipmentLimits.maxPressurePsi,
    maxRateBpm: primary.equipmentLimits.maxRateBpm,
    motorHp: primary.equipmentLimits.motorHp,
    efficiency: primary.equipmentLimits.efficiency,
    initialFluidId: primary.initialFluidId ?? fallback.initialFluidId,
    fluids: primary.fluids,
    stages: primary.stages.map(stage => ({
      id: stage.id, name: stage.name, targetTocMD: stage.targetTocMD,
      outletMD: stage.outletMD, seatMD: stage.seatMD,
      placements: stage.placements.map(placement => ({
        id: placement.id, fluidId: placement.fluidId,
        topMD: placement.topMD, bottomMD: placement.bottomMD,
        mixingReserveBbl: placement.mixingReserveBbl ?? 0 })),
      steps: stage.steps,
    })),
  };
}
