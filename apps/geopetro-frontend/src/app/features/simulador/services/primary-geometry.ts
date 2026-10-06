import { BBL_M } from '../models/constantes';
import type { PrimaryTubularSection } from '../models/primary-cementing.model';
import type { PrimaryAssemblyGeometryInput, PrimaryGeometryResolution, PrimaryGeometrySegment } from '../models/primary-geometry.model';
import type { WellGeometry, WellGeometryIssue } from '../models/well-geometry.model';
import { caliperAtMD } from './caliper-las';

const EPS = 1e-6;

/** Helper interno do WellGeometryService; usa a conversão MD→TVD do serviço. */
export function resolveAssemblyGeometry(well: WellGeometry, input: PrimaryAssemblyGeometryInput,
  mdToTvd: (md: number) => number): PrimaryGeometryResolution {
  const issues: WellGeometryIssue[] = [];
  const error = (code: string, message: string): void => { issues.push({ code, message, level: 'error' }); };
  const invalid = (): PrimaryGeometryResolution => ({ segments: [], capacities: null, issues });
  const { target, assemblies, outerBoundaries, splitMDs } = input;
  const shoe = target.shoeMD;
  const collar = target.floatCollarMD;
  const workString = target.kind === 'work-string';
  const linerTop = target.kind === 'liner' ? target.linerTopMD : 0;
  if (!Number.isFinite(linerTop) || linerTop < 0 || (target.kind === 'liner' && !(linerTop > 0 && linerTop < collar)))
    error('PRIMARY_LINER_TOP', 'O topo do liner deve ficar entre a superfície e o colar.');
  if (workString) {
    // Extremidade aberta: não há colar nem shoe track; os dois campos são a própria extremidade.
    if (!Number.isFinite(shoe) || !(shoe > 0 && shoe <= well.finalMD) || collar !== shoe)
      error('PRIMARY_TARGET_DEPTH', 'A extremidade da coluna deve ficar entre a superfície e o fundo do poço.');
  } else if (![shoe, collar].every(Number.isFinite) || !(collar > 0 && shoe > collar && shoe <= well.finalMD))
    error('PRIMARY_TARGET_DEPTH', 'Exija 0 < colar < sapata ≤ fundo do poço.');
  // Squeeze e tampão não usam caliper: o poço aberto é o diâmetro da fase.
  const caliperSamples = workString ? [] : well.caliper?.samples ?? [];

  const unique = (rows: { id: string }[], label: string): void => {
    const ids = new Set<string>();
    for (const row of rows) {
      if (!row.id.trim() || ids.has(row.id)) error('PRIMARY_DUPLICATE_ID', `${label}: identificador vazio ou duplicado (${row.id}).`);
      ids.add(row.id);
    }
  };
  const interval = (row: { topMD: number; bottomMD: number }, label: string): void => {
    if (![row.topMD, row.bottomMD].every(Number.isFinite) || row.topMD < 0 ||
      row.bottomMD <= row.topMD || row.bottomMD > well.finalMD)
      error('PRIMARY_INTERVAL', `${label}: intervalo MD inválido ou fora do poço.`);
  };
  const ordered = (rows: { topMD: number; bottomMD: number }[], label: string): void => {
    for (let i = 1; i < rows.length; i++) {
      if (rows[i].topMD < rows[i - 1].bottomMD)
        error('PRIMARY_ORDER_OVERLAP', `${label}: intervalos fora de ordem ou sobrepostos; corrija a estrutura.`);
    }
  };
  unique(assemblies, 'Montagens'); unique(outerBoundaries, 'Paredes externas'); unique(well.phases, 'Fases');
  ordered(well.phases, 'Fases'); ordered(outerBoundaries, 'Paredes externas');
  for (const assembly of assemblies) {
    unique(assembly.sections, assembly.name); ordered(assembly.sections, assembly.name);
    for (const section of assembly.sections) {
      interval(section, assembly.name);
      if (![section.idIn, section.odIn].every(Number.isFinite) || !(section.idIn > 0 && section.odIn > section.idIn))
        error('PRIMARY_TUBULAR_DIAMETERS', `${assembly.name}: exija 0 < ID < OD.`);
    }
  }
  const casing = assemblies.find(a => a.id === target.casingAssemblyId);
  if (!casing || casing.role !== (workString ? 'work-string' : 'target-casing'))
    error('PRIMARY_TARGET_MISSING', workString ? 'Informe a coluna de trabalho.' : 'Selecione a montagem do revestimento-alvo.');
  if (casing && (casing.sections[0]?.topMD !== linerTop || casing.sections.at(-1)?.bottomMD !== shoe))
    error('PRIMARY_TARGET_COVERAGE', workString ? 'A coluna de trabalho deve ir da superfície até a extremidade.'
      : 'O revestimento-alvo deve cobrir do topo declarado até sua sapata.');
  const setting = target.kind === 'liner' ? assemblies.find(a => a.id === target.settingStringAssemblyId) : undefined;
  if (target.kind === 'liner' && (!setting || setting.role !== 'setting-string' ||
    setting.sections[0]?.topMD !== 0 || setting.sections.at(-1)?.bottomMD !== linerTop))
    error('PRIMARY_SETTING_STRING', 'A coluna de assentamento deve cobrir da cabeça até o topo do liner.');
  for (const boundary of outerBoundaries) {
    interval(boundary, boundary.id);
    if (boundary.bottomMD > shoe) error('PRIMARY_BOUNDARY_BELOW_SHOE', 'A parede externa do circuito deve terminar na sapata do alvo.');
    if (boundary.kind === 'previous-casing') {
      const previous = assemblies.find(a => a.id === boundary.assemblyId);
      if (!previous || previous.role !== 'previous-casing' || previous.id === target.casingAssemblyId)
        error('PRIMARY_OUTER_CASING', `${boundary.id}: informe o revestimento anterior, distinto do alvo.`);
    } else {
      const phase = well.phases.find(p => p.id === boundary.phaseId);
      if (!phase || boundary.topMD < phase.topMD || boundary.bottomMD > phase.bottomMD)
        error('PRIMARY_OUTER_PHASE', `${boundary.id}: o trecho aberto deve pertencer à fase referenciada.`);
      const d = boundary.diameter;
      if (d.source === 'nominal') {
        if (!Number.isFinite(d.excessFraction) || d.excessFraction < 0)
          error('PRIMARY_EXCESS', `${boundary.id}: o excesso anular deve ser finito e não negativo.`);
      } else if (!Number.isFinite(d.diameterIn) || d.diameterIn <= 0 || Object.hasOwn(d, 'excessFraction')) {
        error('PRIMARY_MEASURED_DIAMETER', `${boundary.id}: use diâmetro medido positivo, sem excesso adicional.`);
      }
    }
  }
  if (splitMDs.some(md => !Number.isFinite(md) || md < 0 || md > shoe))
    error('PRIMARY_SPLIT_DEPTH', 'Os cortes adicionais devem estar entre a superfície e a sapata.');
  if (issues.length || !casing) return invalid();

  const cuts = new Set<number>([0, collar, shoe, ...splitMDs]);
  for (const row of [...well.phases, ...outerBoundaries, ...assemblies.flatMap(a => a.sections)])
    for (const md of [row.topMD, row.bottomMD]) if (md > 0 && md < shoe) cuts.add(md);
  for (const station of well.trajectory?.stations ?? []) if (station.md > 0 && station.md < shoe) cuts.add(station.md);
  for (const sample of caliperSamples) if (sample.md > 0 && sample.md < shoe) cuts.add(sample.md);
  const bounds = [...cuts].sort((a, b) => a - b);
  const segments: PrimaryGeometrySegment[] = [];
  const sectionAt = (sections: PrimaryTubularSection[], md: number) => sections.find(s => s.topMD <= md && s.bottomMD > md);
  for (let i = 1; i < bounds.length; i++) {
    const topMD = bounds[i - 1]; const bottomMD = bounds[i]; const mid = (topMD + bottomMD) / 2;
    const pipe = setting && mid < linerTop ? setting : casing;
    const section = sectionAt(pipe.sections, mid);
    const phase = well.phases.find(p => p.topMD <= mid && p.bottomMD > mid);
    const boundary = outerBoundaries.find(b => b.topMD <= mid && b.bottomMD > mid);
    if (!section || !phase || !boundary) {
      error('PRIMARY_CIRCUIT_GAP', `Geometria incompleta no intervalo ${topMD}–${bottomMD} m.`);
      continue;
    }
    let outerDiameterIn: number;
    let excessFraction = 0;
    let diameterSource: PrimaryGeometrySegment['diameterSource'];
    let caliperEhd1In: number | undefined;
    let caliperEhd2In: number | undefined;
    if (boundary.kind === 'previous-casing') {
      const previous = assemblies.find(a => a.id === boundary.assemblyId)!;
      const previousSection = sectionAt(previous.sections, mid);
      if (!previousSection) {
        error('PRIMARY_OUTER_CASING_GAP', `O revestimento anterior não cobre ${topMD}–${bottomMD} m.`);
        continue;
      }
      outerDiameterIn = previousSection.idIn;
      diameterSource = 'previous-casing';
    } else {
      const caliper = caliperSamples.length ? caliperAtMD(caliperSamples, mid) : null;
      if (caliper) {
        diameterSource = 'caliper';
        caliperEhd1In = caliper.ehd1In;
        caliperEhd2In = caliper.ehd2In;
        outerDiameterIn = Math.sqrt(caliper.ehd1In * caliper.ehd2In);
      } else {
        diameterSource = boundary.diameter.source;
        outerDiameterIn = boundary.diameter.source === 'measured' ? boundary.diameter.diameterIn : phase.holeDiameterIn;
        if (boundary.diameter.source === 'nominal') excessFraction = boundary.diameter.excessFraction;
      }
    }
    // Excesso não torna um revestimento incompatível com o furo nominal aceitável.
    if (!(outerDiameterIn > section.odIn)) {
      error('PRIMARY_ANNULAR_CLEARANCE', `Em ${topMD}–${bottomMD} m, o OD do alvo deve ser menor que a parede externa do anular.`);
      continue;
    }
    const holeDiameterSquared = caliperEhd1In !== undefined && caliperEhd2In !== undefined
      ? caliperEhd1In * caliperEhd2In : outerDiameterIn ** 2;
    const baseCapacity = BBL_M * (holeDiameterSquared - section.odIn ** 2);
    const annularCapacityBblM = baseCapacity * (1 + excessFraction);
    outerDiameterIn = Math.sqrt(section.odIn ** 2 + (1 + excessFraction) * (outerDiameterIn ** 2 - section.odIn ** 2));
    const pipeCapacityBblM = BBL_M * section.idIn ** 2;
    const topTVD = mdToTvd(topMD); const bottomTVD = mdToTvd(bottomMD);
    if (![annularCapacityBblM, pipeCapacityBblM, outerDiameterIn, topTVD, bottomTVD].every(Number.isFinite)) {
      error('PRIMARY_GEOMETRY_NONFINITE', 'A geometria resultou em valor não finito. Revise os dados.');
      continue;
    }
    segments.push({ id: `${pipe.id}:${topMD}:${bottomMD}`, equipmentId: pipe.id,
      phaseId: phase.id, topMD, bottomMD, topTVD, bottomTVD,
      casingIDIn: section.idIn, casingODIn: section.odIn,
      outerBoundary: boundary.kind, outerBoundaryId: boundary.id, outerDiameterIn,
      pipeCapacityBblM, annularCapacityBblM,
      nominalAnnularCapacityBblM: diameterSource === 'measured' || diameterSource === 'caliper' ? null : baseCapacity,
      diameterSource, excessFraction, caliperEhd1In, caliperEhd2In });
  }
  if (issues.length) return invalid();
  try {
    const internalBbl = primaryGeometryVolume(segments, 'internal', 0, shoe);
    const annularBbl = primaryGeometryVolume(segments, 'casing-annulus', 0, shoe);
    const shoeTrackBbl = primaryGeometryVolume(segments, 'internal', collar, shoe);
    const displacementToCollarBbl = primaryGeometryVolume(segments, 'internal', 0, collar);
    return { segments, issues, capacities: { internalBbl, annularBbl, shoeTrackBbl, displacementToCollarBbl } };
  } catch (cause) {
    error('PRIMARY_VOLUME_INVALID', cause instanceof Error ? cause.message : 'Capacidade primária inválida.');
    return invalid();
  }
}

/** Integra por comprimento MD, recusando gaps, sobreposição e intervalos invertidos. */
export function primaryGeometryVolume(segments: PrimaryGeometrySegment[], zone: 'internal' | 'casing-annulus',
  topMD: number, bottomMD: number): number {
  if (![topMD, bottomMD].every(Number.isFinite) || topMD < 0 || bottomMD < topMD ||
    !segments.length || topMD < segments[0].topMD || bottomMD > segments.at(-1)!.bottomMD)
    throw new Error('Intervalo de volume fora da geometria primária resolvida.');
  let cursor = topMD;
  let volume = 0;
  for (const s of segments) {
    const top = Math.max(s.topMD, topMD); const bottom = Math.min(s.bottomMD, bottomMD);
    if (bottom <= top) continue;
    if (Math.abs(top - cursor) > EPS) throw new Error('Geometria primária com gap ou sobreposição.');
    const capacity = zone === 'internal' ? s.pipeCapacityBblM : s.annularCapacityBblM;
    if (!Number.isFinite(capacity) || capacity <= 0) throw new Error('Capacidade primária inválida.');
    volume += (bottom - top) * capacity;
    cursor = bottom;
  }
  if (Math.abs(cursor - bottomMD) > EPS || !Number.isFinite(volume)) throw new Error('Intervalo sem capacidade primária válida.');
  return volume;
}
