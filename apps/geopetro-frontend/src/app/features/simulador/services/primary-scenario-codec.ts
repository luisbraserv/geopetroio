import { PocoApi, scenarioForm, scenarioPayload } from '../models/poco.model';
import { PrimaryScenario, PRIMARY_SCENARIO_SCHEMA_VERSION } from '../models/primary-scenario.model';

export class PrimaryScenarioError extends Error {
  constructor(readonly code: 'json' | 'operation' | 'version' | 'structure' | 'reference',
    readonly path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'PrimaryScenarioError';
  }
}

// Validação de formato e referências, NÃO aprovação física. P2–P6 validam o motor.
type Check = (value: unknown, path: string) => void;
function fail(path: string, message: string): never {
  throw new PrimaryScenarioError('structure', path, message);
}
const number: Check = (v, p) => { if (typeof v !== 'number' || !Number.isFinite(v)) fail(p, 'Número finito obrigatório.'); };
const string: Check = (v, p) => { if (typeof v !== 'string') fail(p, 'Texto obrigatório.'); };
const id: Check = (v, p) => { string(v, p); if (!(v as string).trim()) fail(p, 'Identificador vazio.'); };
const boolean: Check = (v, p) => { if (typeof v !== 'boolean') fail(p, 'Booleano obrigatório.'); };
const oneOf = (...allowed: (string | number)[]): Check => (v, p) => {
  if (!allowed.includes(v as string | number)) fail(p, `Valor não suportado: ${String(v)}.`);
};
const nullable = (check: Check): Check => (v, p) => { if (v !== null) check(v, p); };
const array = (check: Check): Check => (v, p) => {
  if (!Array.isArray(v)) fail(p, 'Lista obrigatória.');
  v.forEach((entry, index) => check(entry, `${p}[${index}]`));
};
function record(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'Objeto obrigatório.');
  return value as Record<string, unknown>;
}
const dict = (check: Check): Check => (v, p) => {
  for (const [key, value] of Object.entries(record(v, p))) check(value, `${p}.${key}`);
};
const object = (required: Record<string, Check>, optional: Record<string, Check> = {}): Check => (v, p) => {
  const obj = record(v, p);
  for (const [key, check] of Object.entries(required)) check(obj[key], `${p}.${key}`);
  for (const [key, value] of Object.entries(obj)) {
    if (Object.hasOwn(required, key)) continue;
    if (!Object.hasOwn(optional, key)) fail(`${p}.${key}`, 'Campo desconhecido nesta versão.');
    optional[key](value, `${p}.${key}`);
  }
};
const variant = (key: string, choices: Record<string, Check>): Check => (v, p) => {
  const obj = record(v, p);
  const tag = obj[key];
  if (typeof tag !== 'string' || !Object.hasOwn(choices, tag)) fail(`${p}.${key}`, 'Tipo não suportado.');
  choices[tag](v, p);
};
const range = { topMD: number, bottomMD: number };
const zone = oneOf('internal', 'casing-annulus');
const source = object({ source: oneOf('measured', 'estimated', 'entered') }, {
  reference: string, measuredAt: string, originalValue: number, originalUnit: string,
  temperatureC: number, pressurePsi: number,
});
const recipe = object({
  density: number, cementClass: string, waterSplitFresh: number, waterSplitSea: number,
  silica: number, nacl: number, bhct: nullable(number), bhst: nullable(number), surfaceTemp: number,
  // Dosagem e procedência do catálogo viajam junto; sem elas o round-trip
  // mudaria as quantidades calculadas.
  additivos: array(object({ name: string, category: string, type: string, conc: number },
    { catalogId: string, unidadeDosagem: string, misturadoEm: string,
      ativo: boolean, funcaoPrincipal: string })),
}, { surfacePressure: number, mudWeightFront: number, mudWeightBack: number });
const fluid = object({
  id, kind: oneOf('mud', 'wash', 'spacer', 'cement', 'displacement'), name: string,
  densityPpg: number, rheology: object({ model: oneOf('power-law'), n: number, kLbfSnFt2: number }),
  propertySources: object({}, { densityPpg: source, n: source, kLbfSnFt2: source }),
}, { recipe, recipeParameters: object({ source: oneOf('calculated', 'manual'),
  yieldFt3: nullable(number), facGpc: nullable(number), famGpc: nullable(number) }), labCurves: array(object({ kind: oneOf('thickening', 'uca'), source,
  points: array(object({ timeMin: number, value: number })) })) });
const quantity = variant('source', {
  entered: object({ source: oneOf('entered'), volumeBbl: number }),
  placement: object({ source: oneOf('placement'), placementId: id, fraction: number }),
  displacement: object({ source: oneOf('displacement'), deviceId: id, fraction: number }),
  'reserve-extra': object({ source: oneOf('reserve-extra'), placementId: id, volumeBbl: number }),
  preflush: object({ source: oneOf('preflush'), contactTimeMin: number, annularLengthM: number,
    overrideBbl: nullable(number) }),
});
const step = variant('kind', {
  pump: object({ id, kind: oneOf('pump'), fluidId: id, rateBpm: number, quantity }),
  pause: object({ id, kind: oneOf('pause'), durationMin: number }),
  'tool-event': object({ id, kind: oneOf('tool-event'), deviceId: id,
    action: oneOf('launch-bottom', 'launch-top', 'launch-dart', 'open-stage', 'close-stage') }),
});
const targetFields = { casingAssemblyId: id, floatCollarMD: number, shoeMD: number };
const primary = object({
  target: nullable(variant('kind', {
    conventional: object({ ...targetFields, kind: oneOf('conventional') }),
    liner: object({ ...targetFields, kind: oneOf('liner'), linerTopMD: number, settingStringAssemblyId: id }),
  })),
  assemblies: array(object({ id, name: string, role: oneOf('target-casing', 'setting-string', 'previous-casing'),
    sections: array(object({ id, ...range, idIn: number, odIn: number })) })),
  outerBoundaries: array(variant('kind', {
    'previous-casing': object({ id, ...range, kind: oneOf('previous-casing'), assemblyId: id }),
    'open-hole': object({ id, ...range, kind: oneOf('open-hole'), phaseId: id,
      diameter: variant('source', {
        nominal: object({ source: oneOf('nominal'), excessFraction: number }),
        measured: object({ source: oneOf('measured'), diameterIn: number }),
      }) }),
  })),
  paths: array(object({ id, name: string, legs: array(object({ id, zone, assemblyId: id, ...range, direction: oneOf('down', 'up') })) })),
  devices: array(object({ id, name: string, kind: oneOf('float-collar', 'stage-tool', 'liner-hanger'),
    assemblyId: id, outletMD: number, seatMD: number, launchMD: number, initialState: oneOf('open', 'closed') })),
  retainedVolumes: array(variant('kind', {
    'shoe-track': object({ id, assemblyId: id, zone, kind: oneOf('shoe-track'), ...range }),
    accessory: object({ id, assemblyId: id, zone, kind: oneOf('accessory'), md: number, volumeBbl: number },
      { connectionSide: oneOf('shallower', 'deeper') }),
  })),
  stages: array(object({ id, name: string, deviceId: id, outletMD: number, seatMD: number,
    targetTocMD: number, activePathId: id,
    placements: array(object({ id, fluidId: id, ...range, retainedVolumeIds: array(id) },
      { mixingReserveBbl: number })), steps: array(step) })),
  fluids: array(fluid), initialFluidId: nullable(id),
  headCondition: oneOf('closed-head', 'vented-free-surface'), returnPressurePsi: number,
  pressureWindow: array(object({ ...range, porePpg: nullable(number), fracturePpg: nullable(number) },
    { topPorePpg: nullable(number), topFracturePpg: nullable(number) })),
  equipmentLimits: object({ maxPressurePsi: nullable(number), maxRateBpm: nullable(number), motorHp: nullable(number), efficiency: nullable(number) }),
}, {
  frictionSettings: object({ internal: oneOf('low', 'medium', 'high'),
    annular: oneOf('low', 'medium', 'high') }),
});
const channelFields = { id, name: string, location: string };
const channelOptional = { referenceMD: number, datum: string };
const channel: Check = (v, p) => {
  const q = record(v, p)['quantity'];
  const volume = q === 'total-pumped-volume' || q === 'cement-pumped-volume';
  const unit = q === 'pump-rate' || q === 'return-rate' ? 'bpm'
    : q === 'pressure' ? 'psi' : volume ? 'bbl' : 'ppg';
  object({ ...channelFields,
    quantity: oneOf('pump-rate', 'return-rate', 'pressure', 'inlet-density', 'local-density', 'ecd', 'total-pumped-volume', 'cement-pumped-volume'),
    unit: oneOf(unit), ...(volume ? { volumeSource: oneOf('measured-counter', 'integrated-measured-rate') } : {}),
  }, channelOptional)(v, p);
};
const measurement = object({
  id, schemaVersion: oneOf(1), name: string, importedAt: string, sourceFileName: string,
  mapping: dict(object({ column: string, originalUnit: string })),
  alignment: object({ offsetMin: number }, { originTimestamp: string, timezone: string }),
  maxInterpolationGapMin: number, channels: array(channel),
  samples: array(object({ sourceRow: number, timeMin: number, values: dict(nullable(number)) }, { md: number })),
  importDiagnostics: array(object({ sourceRow: number, field: string, rawValue: string, reason: string,
    resolution: oneOf('discarded-row', 'missing-value', 'corrected-mapping') })),
});
const surveyStation = object({ md: nullable(number), inclinationDeg: nullable(number), azimuthDeg: nullable(number) });
const trajectory = object({}, { enabled: boolean, stations: array(surveyStation) });
const caliper = object({
  fileName: string, importedAt: string, depthMnemonic: string, diameterMnemonics: array(string),
  startMD: number, stopMD: number, sampleCount: number, calculatedHoleVolumeM3: number,
  reportedHoleVolumeM3: nullable(number), volumeDifferencePct: nullable(number),
  samples: array(object({ md: number, ehd1In: number, ehd2In: number }, { ihvM3: nullable(number) })),
});
const scenario = object({
  operation: oneOf('primaria'), schemaVersion: oneOf(PRIMARY_SCENARIO_SCHEMA_VERSION),
  selectedPhaseId: nullable(id), engineVersion: nullable(string), status: oneOf('draft', 'validated'),
  wellFinalMD: nullable(number), wellFinalTVD: nullable(number),
  fases: array(object({ id, name: string, type: oneOf('CONDUCTOR', 'SURFACE', 'INTERMEDIATE', 'PRODUCTION', 'OPEN_HOLE'),
    topMD: nullable(number), bottomMD: nullable(number), topTVD: nullable(number), bottomTVD: nullable(number),
    holeDiameterIn: nullable(number), casingOD: nullable(number), casingID: nullable(number), shoeMD: nullable(number), shoeTVD: nullable(number) },
    { survey: trajectory })),
  trajectory,
  primary, measurements: array(measurement),
  presentation: object({ depthUnit: oneOf('m', 'ft'), volumeAxis: oneOf('total-pumped', 'cement-pumped'),
    references: array(object({ id, name: string, md: number, zone, assemblyId: id })),
    visibleSeries: array(string), selectedTimeMin: number, snapshotTimesMin: array(number) }),
}, { caliper: nullable(caliper) });

function references(s: PrimaryScenario): void {
  const p = s.primary;
  const ids = (rows: { id: string }[], path: string): Set<string> => {
    const result = new Set<string>();
    for (const row of rows) {
      if (result.has(row.id)) throw new PrimaryScenarioError('reference', path, `ID duplicado: ${row.id}.`);
      result.add(row.id);
    }
    return result;
  };
  const ref = (value: string, allowed: Set<string>, path: string): void => {
    if (!allowed.has(value)) throw new PrimaryScenarioError('reference', path, `Referência inexistente: ${value}.`);
  };
  const assemblies = ids(p.assemblies, 'primary.assemblies');
  const fluids = ids(p.fluids, 'primary.fluids');
  const devices = ids(p.devices, 'primary.devices');
  const paths = ids(p.paths, 'primary.paths');
  const retained = ids(p.retainedVolumes, 'primary.retainedVolumes');
  const phases = ids(s.fases, 'fases');
  ids(p.stages, 'primary.stages'); ids(p.outerBoundaries, 'primary.outerBoundaries');
  ids(p.stages.flatMap(st => st.steps), 'primary.stages.steps');
  ids(p.stages.flatMap(st => st.placements), 'primary.stages.placements');
  ids(s.measurements, 'measurements'); ids(s.presentation.references, 'presentation.references');
  if (p.initialFluidId !== null) ref(p.initialFluidId, fluids, 'primary.initialFluidId');
  if (p.target) {
    ref(p.target.casingAssemblyId, assemblies, 'primary.target.casingAssemblyId');
    if (p.target.kind === 'liner') ref(p.target.settingStringAssemblyId, assemblies, 'primary.target.settingStringAssemblyId');
  }
  for (const a of p.assemblies) ids(a.sections, `assembly.${a.id}.sections`);
  for (const b of p.outerBoundaries) {
    if (b.kind === 'open-hole') {
      if (b.phaseId !== s.selectedPhaseId) ref(b.phaseId, phases, `boundary.${b.id}.phaseId`);
    }
    else ref(b.assemblyId, assemblies, `boundary.${b.id}.assemblyId`);
  }
  for (const path of p.paths) {
    ids(path.legs, `path.${path.id}.legs`);
    for (const leg of path.legs) ref(leg.assemblyId, assemblies, `leg.${leg.id}.assemblyId`);
  }
  for (const row of [...p.devices, ...p.retainedVolumes, ...s.presentation.references]) ref(row.assemblyId, assemblies, `${row.id}.assemblyId`);
  for (const st of p.stages) {
    ref(st.deviceId, devices, `stage.${st.id}.deviceId`);
    ref(st.activePathId, paths, `stage.${st.id}.activePathId`);
    const placements = new Set(st.placements.map(v => v.id));
    for (const placement of st.placements) {
      ref(placement.fluidId, fluids, `placement.${placement.id}.fluidId`);
      if (p.fluids.find(f => f.id === placement.fluidId)!.kind !== 'cement')
        throw new PrimaryScenarioError('reference', `placement.${placement.id}`, 'Colocação deve referenciar uma pasta de cimento.');
      for (const retainedId of placement.retainedVolumeIds) ref(retainedId, retained, `placement.${placement.id}.retainedVolumeIds`);
    }
    for (const step of st.steps) {
      if (step.kind === 'tool-event') ref(step.deviceId, devices, `step.${step.id}.deviceId`);
      if (step.kind !== 'pump') continue;
      ref(step.fluidId, fluids, `step.${step.id}.fluidId`);
      const q = step.quantity;
      if (q.source === 'entered' && p.fluids.find(f => f.id === step.fluidId)!.kind === 'cement')
        throw new PrimaryScenarioError('reference', `step.${step.id}.quantity`, 'Pasta deve usar colocação ou reserva extra explícita.');
      if (q.source === 'preflush' && !['wash', 'spacer'].includes(p.fluids.find(f => f.id === step.fluidId)!.kind))
        throw new PrimaryScenarioError('reference', `step.${step.id}.quantity`, 'Só lavador e espaçador têm volume calculado pelo simulador.');
      if (q.source === 'displacement') ref(q.deviceId, devices, `step.${step.id}.quantity.deviceId`);
      if (q.source === 'placement' || q.source === 'reserve-extra') {
        ref(q.placementId, placements, `step.${step.id}.quantity.placementId`);
        if (st.placements.find(v => v.id === q.placementId)!.fluidId !== step.fluidId)
          throw new PrimaryScenarioError('reference', `step.${step.id}`, 'Fluido diferente da colocação referenciada.');
      }
    }
  }
  for (const dataset of s.measurements) {
    const channels = ids(dataset.channels, `dataset.${dataset.id}.channels`);
    for (const key of Object.keys(dataset.mapping)) ref(key, channels, `dataset.${dataset.id}.mapping`);
    for (const sample of dataset.samples) for (const key of Object.keys(sample.values))
      ref(key, channels, `dataset.${dataset.id}.row.${sample.sourceRow}`);
  }
}

export function validatePrimaryScenario(value: unknown): asserts value is PrimaryScenario {
  const root = record(value, 'scenario');
  if (root['operation'] !== 'primaria') throw new PrimaryScenarioError('operation', 'operation', 'O cenário não é de cimentação primária.');
  if (root['schemaVersion'] !== PRIMARY_SCENARIO_SCHEMA_VERSION)
    throw new PrimaryScenarioError('version', 'schemaVersion', 'Versão de cenário não suportada.');
  scenario(value, 'scenario');
  references(value as PrimaryScenario);
}

/** Migração explícita: v1 nunca escolhe uma fase em nome do usuário. */
export function migratePrimaryScenario(value: unknown): PrimaryScenario {
  const root = record(value, 'scenario');
  const migrated = root['schemaVersion'] === 1
    ? { ...root, schemaVersion: PRIMARY_SCENARIO_SCHEMA_VERSION, selectedPhaseId: null } : value;
  validatePrimaryScenario(migrated);
  return migrated;
}

export function parsePrimaryScenario(json: string): PrimaryScenario {
  let value: unknown;
  try { value = JSON.parse(json); }
  catch { throw new PrimaryScenarioError('json', 'scenario', 'JSON inválido.'); }
  return migratePrimaryScenario(value);
}

export function serializePrimaryScenario(value: PrimaryScenario): string {
  // Validar ANTES de stringify: NaN/Infinity não podem virar null silenciosamente.
  validatePrimaryScenario(value);
  return JSON.stringify(value);
}

/** Monta o payload existente, sem executar HTTP nem salvar automaticamente. */
export function primaryScenarioPayload(value: PrimaryScenario, poco: PocoApi | null = null) {
  validatePrimaryScenario(value);
  return { operacao: 'primaria' as const, ...scenarioPayload({ ...value, _poco: poco }) };
}

/** Hidrata pelo poço atual; referências removidas exigem reparo antes de calcular. */
export function primaryScenarioFromApi(value: { operacao: string; formValue: string; poco?: PocoApi | null }): PrimaryScenario {
  if (value.operacao !== 'primaria') throw new PrimaryScenarioError('operation', 'operacao', 'Operação incompatível.');
  const { _poco, ...hydrated } = scenarioForm(value);
  const migrated = migratePrimaryScenario(hydrated);
  return { ...migrated, status: 'draft' };
}
