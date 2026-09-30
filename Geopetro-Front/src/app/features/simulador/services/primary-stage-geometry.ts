import type { PrimaryConfiguration } from '../models/primary-cementing.model';
import type { PrimaryAssemblyGeometryInput, PrimaryGeometryResolution, PrimaryStageGeometry, PrimaryStageGeometryResolution } from '../models/primary-geometry.model';
import type { WellGeometryIssue } from '../models/well-geometry.model';
import { primaryGeometryVolume } from './primary-geometry';
import { accessoryVolumeBetween, resolvePrimaryAccessories } from './primary-accessories';

/** Geometria dos caminhos; não abre ferramentas, transporta fluido ou calcula pressão. */
export function resolveStageGeometry(primary: PrimaryConfiguration,
  resolve: (input: PrimaryAssemblyGeometryInput) => PrimaryGeometryResolution): PrimaryStageGeometryResolution {
  const issues: WellGeometryIssue[] = [];
  const error = (code: string, message: string): void => { issues.push({ code, message, level: 'error' }); };
  if (!primary.target) {
    error('PRIMARY_TARGET_MISSING', 'Selecione o revestimento-alvo.');
    return { stages: [], fullGeometry: { segments: [], capacities: null, issues }, accessories: [], inventoryCapacities: null, issues };
  }
  const target = primary.target;
  const fullGeometry = resolve({ target, assemblies: primary.assemblies, outerBoundaries: primary.outerBoundaries,
    splitMDs: [...primary.devices.flatMap(d => [d.seatMD, d.outletMD, d.launchMD]),
      ...primary.retainedVolumes.flatMap(v => v.kind === 'accessory' ? [v.md] : [v.topMD, v.bottomMD]),
      ...primary.stages.flatMap(stage => [stage.outletMD, stage.seatMD, stage.targetTocMD,
      ...stage.placements.flatMap(p => [p.topMD, p.bottomMD]),
      ...(primary.paths.find(p => p.id === stage.activePathId)?.legs.flatMap(l => [l.topMD, l.bottomMD]) ?? [])])],
  });
  issues.push(...fullGeometry.issues);
  if (!fullGeometry.capacities) return { stages: [], fullGeometry, accessories: [], inventoryCapacities: null, issues };
  const accessoryResult = resolvePrimaryAccessories(primary, fullGeometry.segments);
  const accessories = accessoryResult.accessories;
  issues.push(...accessoryResult.issues);
  const extra = (zone: 'internal' | 'casing-annulus', top: number, bottom: number) =>
    accessoryVolumeBetween(accessories, fullGeometry.segments, zone, top, bottom);
  const inventoryCapacities = {
    internalBbl: fullGeometry.capacities.internalBbl + extra('internal', 0, target.shoeMD),
    annularBbl: fullGeometry.capacities.annularBbl + extra('casing-annulus', 0, target.shoeMD),
    shoeTrackBbl: fullGeometry.capacities.shoeTrackBbl + extra('internal', target.floatCollarMD, target.shoeMD),
    displacementToCollarBbl: fullGeometry.capacities.displacementToCollarBbl + extra('internal', 0, target.floatCollarMD),
  };
  if (!Object.values(inventoryCapacities).every(Number.isFinite)) error('PRIMARY_ACCESSORY_OVERFLOW', 'O inventário com acessórios não é finito.');
  if (!primary.stages.length) error('PRIMARY_NO_STAGES', 'Cadastre ao menos um estágio.');
  const ids = new Set<string>();
  const usedDevices = new Set<string>();
  const stages: PrimaryStageGeometry[] = [];
  for (let i = 0; i < primary.stages.length; i++) {
    const stage = primary.stages[i];
    if (ids.has(stage.id)) error('PRIMARY_STAGE_DUPLICATE', 'Os estágios precisam de identificadores distintos.');
    ids.add(stage.id);
    const path = primary.paths.find(p => p.id === stage.activePathId);
    const device = primary.devices.find(d => d.id === stage.deviceId);
    if (!path || !device) {
      error('PRIMARY_STAGE_REFERENCE', `${stage.name}: caminho ou dispositivo inexistente.`);
      continue;
    }
    if (primary.paths.filter(p => p.id === path.id).length !== 1 || primary.devices.filter(d => d.id === device.id).length !== 1)
      error('PRIMARY_STAGE_REFERENCE', `${stage.name}: caminho ou dispositivo ambíguo.`);
    if (usedDevices.has(device.id)) error('PRIMARY_STAGE_DEVICE_REUSED', `${stage.name}: dispositivo já usado em outro estágio.`);
    usedDevices.add(device.id);
    if (![stage.outletMD, stage.seatMD, stage.targetTocMD, device.launchMD].every(Number.isFinite) ||
      !(stage.outletMD > 0 && stage.outletMD <= target.shoeMD && stage.seatMD > device.launchMD &&
        device.launchMD >= 0 && stage.seatMD <= stage.outletMD && stage.targetTocMD >= 0 && stage.targetTocMD < stage.outletMD) ||
      device.outletMD !== stage.outletMD || device.seatMD !== stage.seatMD || device.assemblyId !== target.casingAssemblyId)
      error('PRIMARY_STAGE_DEVICE_DEPTH', `${stage.name}: saída, assento e lançamento incompatíveis com o dispositivo.`);
    const outletDevice = target.kind === 'work-string' ? 'open-end' : 'float-collar';
    if (i === 0 && (device.kind !== outletDevice || stage.outletMD !== target.shoeMD || stage.seatMD !== target.floatCollarMD))
      error('PRIMARY_FIRST_STAGE_SHOE', target.kind === 'work-string'
        ? 'O estágio da coluna de trabalho deve circular pela extremidade aberta.'
        : 'O primeiro estágio deve circular pela sapata e assentar no colar.');
    if (i > 0 && target.kind === 'work-string')
      error('PRIMARY_STAGE_ORDER', `${stage.name}: a coluna de trabalho tem um só estágio.`);
    if (i > 0 && (device.kind !== 'stage-tool' || stage.outletMD >= primary.stages[i - 1].outletMD))
      error('PRIMARY_STAGE_ORDER', `${stage.name}: a próxima porta deve estar acima da saída anterior.`);
    if (target.kind === 'liner' && (stage.seatMD < target.linerTopMD || device.launchMD > target.linerTopMD))
      error('PRIMARY_LINER_STAGE_DEPTH', `${stage.name}: o dardo deve percorrer a coluna e liberar o plugue no topo do liner.`);

    let cursor = 0;
    let returning = false;
    if (!path.legs.length) error('PRIMARY_PATH_EMPTY', `${stage.name}: informe o circuito completo.`);
    for (const leg of path.legs) {
      if (leg.zone === 'casing-annulus' && !returning) {
        if (cursor !== stage.outletMD) error('PRIMARY_PATH_OUTLET', `${stage.name}: descida não chega à saída ativa.`);
        returning = true;
      }
      const down = leg.zone === 'internal';
      if ((returning && down) || leg.direction !== (down ? 'down' : 'up') ||
        !(leg.bottomMD > leg.topMD && leg.topMD >= 0 && leg.bottomMD <= stage.outletMD) ||
        (down ? leg.topMD : leg.bottomMD) !== cursor)
        error('PRIMARY_PATH_CONTINUITY', `${stage.name}: caminho fora de ordem, invertido ou descontínuo.`);
      const slices = fullGeometry.segments.filter(s => s.topMD >= leg.topMD && s.bottomMD <= leg.bottomMD);
      if (!slices.length || slices.some(s => s.equipmentId !== leg.assemblyId))
        error('PRIMARY_PATH_ASSEMBLY', `${stage.name}: caminho usa uma montagem diferente da geometria nessa profundidade.`);
      cursor = down ? leg.bottomMD : leg.topMD;
    }
    if (!returning || cursor !== 0) error('PRIMARY_PATH_RETURN', `${stage.name}: o retorno deve alcançar a superfície.`);
    if (issues.some(issue => issue.level === 'error')) continue;

    const internal = (top: number, bottom: number) => primaryGeometryVolume(fullGeometry.segments, 'internal', top, bottom) + extra('internal', top, bottom);
    const displacementBbl = internal(device.launchMD, stage.seatMD);
    const dartTravelBbl = target.kind === 'liner' ? internal(device.launchMD, target.linerTopMD) : null;
    const wiperTravelBbl = target.kind === 'liner' ? internal(target.linerTopMD, stage.seatMD) : null;
    const segments = fullGeometry.segments.filter(s => s.bottomMD <= stage.outletMD);
    const activeOwners = new Set(segments.map(s => s.id));
    stages.push({ stageId: stage.id, pathId: path.id, outletMD: stage.outletMD, seatMD: stage.seatMD,
      segments,
      nonCirculatingSegments: fullGeometry.segments.filter(s => s.topMD >= stage.outletMD),
      displacementBbl, dartTravelBbl, wiperTravelBbl,
      internalToOutletBbl: internal(0, stage.outletMD),
      annularToReturnBbl: primaryGeometryVolume(fullGeometry.segments, 'casing-annulus', 0, stage.outletMD) + extra('casing-annulus', 0, stage.outletMD),
      accessoryIds: accessories.filter(a => activeOwners.has(a.ownerSegmentId)).map(a => a.id),
      nonCirculatingAccessoryIds: accessories.filter(a => !activeOwners.has(a.ownerSegmentId)).map(a => a.id) });
  }
  const failed = issues.some(issue => issue.level === 'error');
  return { stages: failed ? [] : stages, fullGeometry, accessories: failed ? [] : accessories,
    inventoryCapacities: failed ? null : inventoryCapacities, issues };
}
