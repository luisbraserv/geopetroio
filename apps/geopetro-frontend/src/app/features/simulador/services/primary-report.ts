import { formatDepth, formatDepthNumber, type DepthUnit } from '../models/depth-unit';
import { createPrimaryReportData, parsePrimaryReportData, type PrimaryReportData } from '../models/primary-report-data.model';
import { primaryRecipeSections, primaryOperationalSequenceItems, type PrimarySequenceItem } from './primary-report-content';
import type { PrimaryConfiguration, PrimaryDiagnostic, PrimaryVolumeAxis } from '../models/primary-cementing.model';
import type { PrimaryHydraulicsResult } from '../models/primary-hydraulics.model';
import type { PrimaryMeasuredDataset } from '../models/primary-measurements.model';
import type { PrimaryTransportResult } from '../models/primary-transport.model';
import type { PrimaryProgramVolumes, PrimaryRecipeResolution } from '../models/primary-volumes.model';
import type { PrimaryReportVisual } from './primary-well-visuals';
import type { WellGeometry } from '../models/well-geometry.model';

/**
 * Relatório da primária como documento estruturado. Montar assim, em vez de
 * gerar HTML direto, permite conferir por teste o que entra, o que falta e por
 * quê. Curva sem dado aparece com o motivo, nunca como espaço vazio.
 */
export interface PrimaryReportRow { label: string; value: string }

export interface PrimaryReportSection {
  id: string;
  title: string;
  rows?: PrimaryReportRow[];
  table?: { headers: string[]; rows: string[][] };
  /** Passos numerados da sequência operacional, com os valores em destaque. */
  sequence?: PrimarySequenceItem[];
  notes?: string[];
}

export interface PrimaryReportChart {
  id: string;
  title: string;
  /** Oito herdados do squeeze, cinco anexos G1-G5 e os complementos. */
  family: 'herdado' | 'anexo' | 'complemento';
  available: boolean;
  /** Obrigatório quando indisponível: o relatório diz por que falta. */
  unavailableReason?: string;
  axes: string;
}

export interface PrimaryReportSnapshot {
  id: string;
  label: string;
  timeMin: number;
  stageId: string;
  reason: 'fim-de-estagio' | 'escolhido';
}

export interface PrimaryReport {
  document: PrimaryReportData;
  canIssue: boolean;
  blockingReasons: string[];
  /** `partial` quando o resultado foi interrompido ou há erro; sem conclusão fictícia. */
  status: 'complete' | 'partial';
  revision: {
    scenarioName: string;
    scenarioId: number | null;
    savedAt: string | null;
    schemaVersion: number;
    engineVersion: string | null;
    generatedAt: string;
    /** Entradas e resultados vêm da mesma revisão; divergir invalida o relatório. */
    inputsMatchResults: boolean;
  };
  sections: PrimaryReportSection[];
  charts: PrimaryReportChart[];
  visuals: PrimaryReportVisual[];
  snapshots: PrimaryReportSnapshot[];
  alerts: PrimaryDiagnostic[];
  conclusion: string;
}

export interface PrimaryReportInput {
  reportData?: PrimaryReportData;
  phaseLabel?: string;
  scenarioName: string;
  scenarioId: number | null;
  savedAt: string | null;
  schemaVersion: number;
  generatedAt: string;
  cliente: string;
  poco: string;
  primary: PrimaryConfiguration;
  volumes: PrimaryProgramVolumes;
  recipes: PrimaryRecipeResolution;
  transport: PrimaryTransportResult | null;
  hydraulics: PrimaryHydraulicsResult | null;
  measurements: PrimaryMeasuredDataset[];
  volumeAxis: PrimaryVolumeAxis;
  depthUnit: DepthUnit;
  hasSlurryCurves: boolean;
  /** Instantes adicionais escolhidos pelo usuário, além do fim de cada estágio. */
  extraSnapshotTimesMin?: number[];
  visuals?: PrimaryReportVisual[];
  /** Geometria completa usada no cálculo, incluindo surveys por fase e caliper. */
  well?: WellGeometry;
}

const number = (value: number | null | undefined, digits = 2): string =>
  value === null || value === undefined || !Number.isFinite(value) ? 'indisponível' : value.toFixed(digits);

export function buildPrimaryReport(input: PrimaryReportInput): PrimaryReport {
  const { primary, volumes, recipes, transport, hydraulics } = input;
  const document = input.reportData ?? { ...createPrimaryReportData(), cliente: input.cliente, poco: input.poco };
  const blockingReasons: string[] = [];
  try { parsePrimaryReportData(document); } catch (error) { blockingReasons.push(error instanceof Error ? error.message : 'Dados do relatório inválidos.'); }
  const alerts: PrimaryDiagnostic[] = [
    ...volumes.diagnostics, ...recipes.diagnostics,
    ...(transport?.diagnostics ?? []), ...(hydraulics?.diagnostics ?? []),
  ];
  const interrupted = (hydraulics?.points ?? []).some(point => point.state === 'outside-model');
  const partial = !volumes.valid || !transport || transport.status !== 'complete'
    || hydraulics?.status !== 'complete' || interrupted;

  if (partial) blockingReasons.push('O cálculo está incompleto ou foi interrompido.');
  for (const alert of alerts.filter(a => a.severity === 'error')) blockingReasons.push(alert.message);
  for (const recipe of recipes.placements) if (recipe.error) blockingReasons.push(recipe.error);
  if (!recipes.placements.length) blockingReasons.push('Nenhuma receita dimensionada disponível.');
  for (const breach of hydraulics?.breaches ?? [])
    blockingReasons.push('Limite excedido: ' + breach.limit + ' (' + number(breach.peakValue) + ' > ' + number(breach.limitValue) + ').');
  const stepIds = new Set(primary.stages.flatMap(stage => stage.steps.map(step => step.id)));
  for (const [id, note] of Object.entries(document.sequence.stepNotes))
    if (note.trim() && !stepIds.has(id)) blockingReasons.push('Observação vinculada a um passo removido: ' + id + '. Revise a sequência.');
  const sections: PrimaryReportSection[] = [
    {
      id: 'identificacao', title: 'Identificação',
      rows: [
        ...(['preparadoPara', 'preparadoPor', 'revisadoPor', 'data', 'versao', 'origem', 'campo', 'sonda', 'jobNum', 'pais', 'objetivo'] as const)
          .map(key => ({ label: ({ preparadoPara: 'Preparado para', preparadoPor: 'Preparado por', revisadoPor: 'Revisado por',
            data: 'Data', versao: 'Revisão', origem: 'Operador', campo: 'Campo', sonda: 'Sonda', jobNum: 'Job #', pais: 'País', objetivo: 'Objetivo' })[key], value: document[key] || 'Não informado' })),
        { label: 'Fase da operação', value: input.phaseLabel || 'não selecionada' },
        { label: 'Cliente', value: input.cliente || 'não informado' },
        { label: 'Poço', value: input.poco || 'não informado' },
        { label: 'Cenário', value: input.scenarioName },
        { label: 'Revisão salva em', value: input.savedAt ?? 'não salvo' },
        { label: 'Gerado em', value: input.generatedAt },
        { label: 'Versão do formato', value: String(input.schemaVersion) },
        { label: 'Versão do motor', value: 'não versionado nesta etapa' },
      ],
    },
    geometrySection(primary, input.depthUnit),
    ...wellAcquisitionSections(input.well, input.depthUnit),
    devicesSection(primary, input.depthUnit),
    fluidsSection(primary, recipes),
    placementsSection(volumes, input.depthUnit),
    programSection(volumes),
    ...primaryRecipeSections(input),
    { id: 'sequencia-operacional', title: 'Sequência operacional', sequence: primaryOperationalSequenceItems(input, document) },
    resultsSection(volumes, transport, input.depthUnit),
    balanceSection(transport),
    hydraulicsSection(primary, hydraulics, input.depthUnit),
    measurementsSection(input.measurements),
    conventionsSection(input),
    { id: 'observacoes', title: 'Observações', notes: [document.observacoes || 'Nenhuma observação informada.'] },
    ...document.extraSections.map((section, i) => ({ id: 'complemento-' + i, title: section.title, notes: [section.text] })),
  ];

  return {
    document, canIssue: blockingReasons.length === 0, blockingReasons: [...new Set(blockingReasons)],
    status: partial ? 'partial' : 'complete',
    revision: {
      scenarioName: input.scenarioName, scenarioId: input.scenarioId, savedAt: input.savedAt,
      schemaVersion: input.schemaVersion, engineVersion: null, generatedAt: input.generatedAt,
      // O relatório sai do mesmo estado que gerou os resultados desta tela.
      inputsMatchResults: true,
    },
    sections,
    charts: chartCatalog(), visuals: input.visuals ?? [],
    snapshots: snapshotList(input),
    alerts,
    conclusion: partial
      ? 'Resultado parcial. Trechos interrompidos ou diagnósticos impeditivos estão listados; '
        + 'este relatório não conclui sobre a operação inteira.'
      : 'Resultado completo para as entradas desta revisão. Não é aprovação operacional.',
  };
}

function wellAcquisitionSections(well: WellGeometry | undefined, depthUnit: DepthUnit): PrimaryReportSection[] {
  if (!well) return [];
  const trajectoryRows = well.phases.map(phase => {
    const stations = phase.survey?.stations ?? [];
    return [phase.name, formatDepthNumber(phase.topMD, depthUnit), formatDepthNumber(phase.bottomMD, depthUnit),
      String(stations.length), formatDepthNumber(phase.topTVD, depthUnit), formatDepthNumber(phase.bottomTVD, depthUnit)];
  });
  const surveyCount = well.phases.reduce((sum, phase) => sum + (phase.survey?.stations.length ?? 0), 0);
  const sections: PrimaryReportSection[] = [{
    id: 'survey', title: 'Survey e trajetória',
    table: { headers: ['Fase', `Topo MD (${depthUnit})`, `Base MD (${depthUnit})`, 'Estações',
      `Topo TVD (${depthUnit})`, `Base TVD (${depthUnit})`], rows: trajectoryRows },
    notes: surveyCount
      ? [`${surveyCount} estações manuais; TVD calculado pelo método da curvatura mínima.`]
      : ['Survey não informado; foram usados os valores manuais de TVD das fases.'],
  }];
  const caliper = well.caliper;
  if (!caliper) {
    sections.push({ id: 'caliper', title: 'Caliper',
      notes: ['Caliper não importado; o volume usa o diâmetro medido manual ou o nominal com excesso.'] });
    return sections;
  }
  const coveredPhases = well.phases.filter(phase =>
    Math.max(phase.topMD, caliper.startMD) < Math.min(phase.bottomMD, caliper.stopMD));
  const difference = caliper.volumeDifferencePct;
  sections.push({
    id: 'caliper', title: 'Caliper importado',
    rows: [
      { label: 'Arquivo', value: caliper.fileName },
      { label: 'Curvas', value: `${caliper.depthMnemonic}; ${caliper.diameterMnemonics.join(' / ')}` },
      { label: 'Intervalo MD', value: `${formatDepth(caliper.startMD, depthUnit)} a ${formatDepth(caliper.stopMD, depthUnit)}` },
      { label: 'Amostras', value: String(caliper.sampleCount) },
      { label: 'Volume integrado do furo', value: `${number(caliper.calculatedHoleVolumeM3, 3)} m³` },
      { label: 'Volume IHV informado', value: caliper.reportedHoleVolumeM3 == null ? 'indisponível' : `${number(caliper.reportedHoleVolumeM3, 3)} m³` },
      { label: 'Diferença para IHV', value: difference == null ? 'indisponível' : `${number(difference, 2)}%` },
      { label: 'Fases cobertas', value: coveredPhases.map(phase => phase.name).join('; ') || 'nenhuma' },
    ],
    notes: Math.abs(difference ?? 0) > 5
      ? ['A diferença entre o volume integrado e o IHV do LAS supera 5%. Verifique as curvas antes da operação.']
      : ['Dentro da cobertura do LAS, EHD1/EHD2 substituem o diâmetro manual no cálculo do volume.'],
  });
  return sections;
}

function geometrySection(primary: PrimaryConfiguration, depthUnit: DepthUnit): PrimaryReportSection {
  const target = primary.target;
  return {
    id: 'geometria', title: 'Geometria e revestimento-alvo',
    rows: target ? [
      { label: 'Tipo', value: target.kind === 'liner' ? 'Liner' : 'Convencional' },
      { label: 'Sapata', value: `${formatDepth(target.shoeMD, depthUnit)}` },
      { label: 'Colar flutuante', value: `${formatDepth(target.floatCollarMD, depthUnit)}` },
      ...(target.kind === 'liner'
        ? [{ label: 'Topo do liner', value: `${formatDepth(target.linerTopMD, depthUnit)}` },
          { label: 'Coluna de assentamento', value: target.settingStringAssemblyId }] : []),
    ] : [],
    table: {
      headers: ['Trecho', `Topo (${depthUnit})`, `Base (${depthUnit})`, 'Parede externa', 'Origem do diâmetro'],
      rows: primary.outerBoundaries.map(boundary => [boundary.id,
        formatDepthNumber(boundary.topMD, depthUnit), formatDepthNumber(boundary.bottomMD, depthUnit),
        boundary.kind === 'open-hole' ? 'poço aberto' : 'revestimento anterior',
        boundary.kind === 'open-hole'
          ? boundary.diameter.source === 'measured'
            ? `medido ${number(boundary.diameter.diameterIn, 3)} in`
            : `nominal com excesso de ${number(boundary.diameter.excessFraction * 100, 1)}%`
          : 'ID do revestimento anterior']),
    },
    notes: target ? [] : ['Revestimento-alvo não configurado.'],
  };
}

function devicesSection(primary: PrimaryConfiguration, depthUnit: DepthUnit): PrimaryReportSection {
  return {
    id: 'dispositivos', title: 'Dispositivos e volumes retidos',
    table: {
      headers: ['Dispositivo', 'Tipo', `Assento (${depthUnit})`, `Saída (${depthUnit})`, 'Estado inicial'],
      rows: primary.devices.map(device => [device.name, device.kind,
        formatDepthNumber(device.seatMD, depthUnit), formatDepthNumber(device.outletMD, depthUnit), device.initialState]),
    },
    notes: primary.retainedVolumes.map(retained => retained.kind === 'shoe-track'
      ? `Shoe track entre ${formatDepthNumber(retained.topMD, depthUnit)} e ${formatDepthNumber(retained.bottomMD, depthUnit)} ${depthUnit}.`
      : `Acessório ${retained.id} a ${formatDepthNumber(retained.md, depthUnit)} ${depthUnit} com ${number(retained.volumeBbl)} bbl.`),
  };
}

function fluidsSection(primary: PrimaryConfiguration, recipes: PrimaryRecipeResolution): PrimaryReportSection {
  return {
    id: 'fluidos', title: 'Fluidos, pastas e origem das propriedades',
    table: {
      headers: ['Fluido', 'Tipo', 'Densidade (ppg)', 'Origem da densidade', 'n', 'k', 'Composição'],
      rows: primary.fluids.map(fluid => [fluid.name, fluid.kind, number(fluid.densityPpg),
        fluid.propertySources.densityPpg?.source ?? 'estimada',
        number(fluid.rheology.n, 3), number(fluid.rheology.kLbfSnFt2, 6),
        fluid.recipe ? 'cadastrada' : 'sem composição']),
    },
    notes: [
      ...recipes.placements.filter(recipe => recipe.overrides.length).map(recipe =>
        `${recipe.placementId}: propriedades substituídas pelo usuário em `
        + `${recipe.overrides.map(override => override.field).join(', ')}.`),
      'Curvas de espessamento e UCA são estimativas, não são ensaio de laboratório.',
    ],
  };
}

function placementsSection(volumes: PrimaryProgramVolumes, depthUnit: DepthUnit): PrimaryReportSection {
  return {
    id: 'volumes', title: 'Intervalos desejados, volumes calculados e preparados',
    table: {
      headers: ['Estágio', 'Colocação', `Topo (${depthUnit})`, `Base (${depthUnit})`, 'Anular (bbl)', 'Retidos (bbl)',
        'Dimensionado (bbl)', 'Reserva extra (bbl)', 'Reserva de mistura (bbl)', 'Preparado (bbl)'],
      rows: volumes.stages.flatMap(stage => stage.placements.map(placement => [
        stage.stageId, placement.placementId, formatDepthNumber(placement.topMD, depthUnit), formatDepthNumber(placement.bottomMD, depthUnit),
        number(placement.annularBbl), number(placement.retainedBbl), number(placement.plannedBbl),
        number(placement.reserveExtraBbl), number(placement.mixingReserveBbl), number(placement.preparedBbl)])),
    },
    notes: ['Reserva de mistura aumenta o material preparado e não entra no volume bombeado.'],
  };
}

function programSection(volumes: PrimaryProgramVolumes): PrimaryReportSection {
  return {
    id: 'programa', title: 'Programa por estágio',
    table: {
      headers: ['Estágio', 'Passo', 'Tipo', 'Fluido', 'Origem da quantidade', 'Volume (bbl)',
        'Vazão (bpm)', 'Duração (min)'],
      rows: volumes.stages.flatMap(stage => stage.steps.map(step => [
        stage.stageId, step.stepId, step.kind, step.fluidId ?? '—', step.source ?? '—',
        number(step.volumeBbl), step.rateBpm === null ? '—' : number(step.rateBpm, 2),
        number(step.durationMin, 2)])),
    },
  };
}

function resultsSection(volumes: PrimaryProgramVolumes,
  transport: PrimaryTransportResult | null, depthUnit: DepthUnit): PrimaryReportSection {
  return {
    id: 'resultados', title: 'TOC, retornos e colocação',
    table: {
      headers: ['Colocação', `TOC ideal (${depthUnit})`, `TOC real (${depthUnit})`, 'Intervalos', 'Pasta retornada (bbl)'],
      rows: (transport?.placements ?? []).map(placement => {
        const stage = volumes.stages.find(entry => entry.stageId === placement.stageId);
        return [placement.placementId,
          stage?.idealToc ? formatDepthNumber(stage.idealToc.tocMD, depthUnit) : 'indisponível',
          placement.actualTocMD === null ? 'não ficou no anular' : formatDepthNumber(placement.actualTocMD, depthUnit),
          placement.fragmented ? `${placement.actualIntervals.length} (bolsões)`
            : String(placement.actualIntervals.length),
          number(placement.returnedBbl)];
      }),
    },
    notes: transport ? [] : ['Transporte não executado: a colocação real é indisponível.'],
  };
}

function balanceSection(transport: PrimaryTransportResult | null): PrimaryReportSection {
  return {
    id: 'balanco', title: 'Balanço de volumes por fluido',
    table: {
      headers: ['Fluido', 'Inicial (bbl)', 'Bombeado (bbl)', 'Interior (bbl)',
        'Anular (bbl)', 'Retornado (bbl)', 'Residual (bbl)'],
      rows: (transport?.inventory ?? []).map(entry => [entry.fluidId,
        number(entry.initialBbl), number(entry.pumpedBbl), number(entry.internalBbl),
        number(entry.annularBbl), number(entry.returnedBbl), number(entry.balanceErrorBbl, 9)]),
    },
    notes: ['Retorno de lama, retorno de pasta e perda à formação são grandezas distintas; '
      + 'perda é zero nesta versão.'],
  };
}

function hydraulicsSection(primary: PrimaryConfiguration,
  hydraulics: PrimaryHydraulicsResult | null, depthUnit: DepthUnit): PrimaryReportSection {
  const narrowest = hydraulics?.narrowestFractureMargin;
  const frictionLabel = (level: 'low' | 'medium' | 'high' | undefined): string =>
    level === 'low' ? 'Baixo (1,00×)' : level === 'high' ? 'Alto (1,35×)' : 'Médio (1,15×)';
  return {
    id: 'hidraulica', title: 'Hidráulica, janela e limites',
    rows: [
      { label: 'Contrapressão no retorno', value: `${number(primary.returnPressurePsi, 1)} psi` },
      { label: 'Condição da cabeça', value: primary.headCondition },
      { label: 'Atrito no interior do tubo', value: frictionLabel(primary.frictionSettings?.internal) },
      { label: 'Atrito no retorno anular', value: frictionLabel(primary.frictionSettings?.annular) },
      { label: 'Menor margem até a fratura', value: narrowest
        ? `${number(narrowest.psi, 1)} psi a ${formatDepthNumber(narrowest.md, depthUnit)} ${depthUnit}, aos ${number(narrowest.timeMin, 2)} min`
        : 'indisponível' },
      { label: 'Uso da potência hidráulica', value: hydraulics?.hydraulicPowerUsagePct === null
        || hydraulics?.hydraulicPowerUsagePct === undefined
        ? 'indisponível' : `${number(hydraulics.hydraulicPowerUsagePct, 1)}%` },
    ],
    table: {
      headers: ['Limite', 'Início (min)', 'Fim (min)', 'Pico', 'Limite', `MD (${depthUnit})`],
      rows: (hydraulics?.breaches ?? []).map(breach => [breach.limit,
        number(breach.startTimeMin, 2), number(breach.endTimeMin, 2),
        number(breach.peakValue, 1), number(breach.limitValue, 1),
        breach.md === undefined ? '—' : formatDepthNumber(breach.md, depthUnit)]),
    },
    notes: ['Limite excedido é demanda calculada fora do limite, não garantia de execução.'],
  };
}

function measurementsSection(datasets: PrimaryMeasuredDataset[]): PrimaryReportSection {
  return {
    id: 'medicoes', title: 'Dados medidos comparados e alinhamento',
    table: {
      headers: ['Conjunto', 'Arquivo', 'Importado em', 'Amostras', 'Offset (min)',
        'Limite de lacuna (min)', 'Canais e unidades originais'],
      rows: datasets.map(dataset => [dataset.name, dataset.sourceFileName, dataset.importedAt,
        String(dataset.samples.length), number(dataset.alignment.offsetMin, 2),
        number(dataset.maxInterpolationGapMin, 2),
        dataset.channels.map(channel =>
          `${channel.name} (${dataset.mapping[channel.id]?.originalUnit ?? channel.unit} → ${channel.unit})`)
          .join('; ')]),
    },
    notes: datasets.length
      ? ['Diferença entre medido e calculado é discrepância, não diagnóstico de perda.']
      : ['Nenhum conjunto de medições importado; as séries medidas ficam indisponíveis.'],
  };
}

function conventionsSection(input: PrimaryReportInput): PrimaryReportSection {
  return {
    id: 'convencoes', title: 'Eixos, unidades e correlações',
    rows: [
      { label: 'Profundidade', value: `${input.depthUnit} (MD); TVD do cadastro ou derivado do survey quando habilitado` },
      { label: 'Volume', value: 'bbl' },
      { label: 'Vazão', value: 'bpm' },
      { label: 'Pressão', value: 'psi manométrico' },
      { label: 'Densidade e densidade equivalente', value: 'ppg' },
      { label: 'Modo de volume do relatório', value: input.volumeAxis === 'cement-pumped'
        ? 'volume de pasta bombeada' : 'volume total bombeado' },
      { label: 'Correlação de atrito', value: 'r3-guillot-4-6 (primaria-2): lei de potência com Reynolds '
        + 'generalizado de Metzner e Reed, laminar 16/Re no tubo e 24/Re no anular (fenda), turbulento de Dodge e Metzner; '
        + 'fim do laminar 3250 − 1150n e fim da transição 4150 − 1150n, limites desta correlação e não universais' },
      { label: 'Queda livre', value: 'transporte conservativo com vazio no topo do interno; vazão de saída pelo balanço '
        + 'F_int + F_an = P_vazio + H_int − H_an − P_retorno, com P_vazio = −14,7 psi (cabeça fechada, vácuo) ou 0 (ventilada)' },
    ],
  };
}

/**
 * Os oito tipos herdados do squeeze, os cinco anexos e os complementos. Todos
 * saíram da tela no redesenho e voltam um a um; o catálogo continua aqui para o
 * relatório dizer o que existirá, em vez de omitir.
 */
const NOT_REBUILT = 'Gráfico ainda não reconstruído na tela após o redesenho.';

function chartCatalog(): PrimaryReportChart[] {
  const chart = (id: string, title: string, family: PrimaryReportChart['family'],
    axes: string): PrimaryReportChart =>
    ({ id, title, family, axes, available: false, unavailableReason: NOT_REBUILT });
  return [
    chart('envelope', 'Envelope de pressão × profundidade', 'herdado', 'psi × MD'),
    chart('pressao-tempo', 'Pressão e deslocamento × tempo', 'herdado', 'bbl e psi × min'),
    chart('bhp-ecd', 'BHP e ECD × tempo', 'herdado', 'psi e ppg × min'),
    chart('free-fall', 'Queda livre / tubo em U', 'herdado', 'bpm e psi × min'),
    chart('hidrostatica-fratura', 'Hidrostática × fratura', 'herdado', 'psi × min'),
    chart('cronograma', 'Cronograma operacional', 'herdado', 'min'),
    chart('espessamento', 'Espessamento', 'herdado', 'Bc × min'),
    chart('uca', 'UCA', 'herdado', 'psi × min'),
    chart('g1', 'G1 — retorno, volume e pressão no tempo', 'anexo', 'bpm, bbl e psi × min'),
    chart('g2', 'G2 — ECD por volume nas referências', 'anexo', 'ppg × bbl'),
    chart('g3', 'G3 — Reynolds nominal por profundidade', 'anexo', 'adimensional × MD'),
    chart('g4', 'G4 — pressão, densidade e vazões no tempo', 'anexo', 'psi, ppg e bpm × min'),
    chart('g5', 'G5 — densidade, ECD e janela por profundidade', 'anexo', 'ppg × MD'),
    chart('comparacao', 'Comparação com dados medidos', 'complemento', 'conforme o canal'),
    chart('esquematico', 'Esquemático inicial e final', 'complemento', 'MD'),
  ];
}

/** Fim de cada estágio por padrão, mais os instantes escolhidos pelo usuário. */
function snapshotList(input: PrimaryReportInput): PrimaryReportSnapshot[] {
  const snapshots = input.transport?.snapshots ?? [];
  const list: PrimaryReportSnapshot[] = [];
  for (const stage of input.volumes.stages) {
    const last = [...snapshots].reverse().find(snapshot => snapshot.stageId === stage.stageId);
    if (last) list.push({ id: `fim-${stage.stageId}`, label: `Fim do ${stage.stageId}`,
      timeMin: last.timeMin, stageId: stage.stageId, reason: 'fim-de-estagio' });
  }
  for (const timeMin of input.extraSnapshotTimesMin ?? []) {
    if (list.some(entry => Math.abs(entry.timeMin - timeMin) <= 1e-9)) continue;
    const match = [...snapshots].reverse().find(snapshot => snapshot.timeMin <= timeMin + 1e-9);
    list.push({ id: `escolhido-${timeMin}`, label: `Instante ${timeMin.toFixed(2)} min`,
      timeMin, stageId: match?.stageId ?? '', reason: 'escolhido' });
  }
  return list.sort((a, b) => a.timeMin - b.timeMin);
}
