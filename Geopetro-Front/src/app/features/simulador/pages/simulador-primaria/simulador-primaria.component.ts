import { CdkTrapFocus } from '@angular/cdk/a11y';
import { PrimaryReportModalComponent } from '../../components/relatorio/primary-report-modal.component';
import { createPrimaryReportData, parsePrimaryReportData, type PrimaryReportData } from '../../models/primary-report-data.model';
import { primarySequenceText } from '../../services/primary-report-content';
import { primaryRecipeCode, primaryRecipeQuantity } from '../../services/primary-recipe-presentation';
import type { CementSlurryRecipeRow } from '../../models/pasta.model';
import { CEMENT_CLASSES } from '../../models/constantes';
import { OperationPhaseSelectorComponent } from '../../components/well/operation-phase-selector.component';
import { OperationContextService } from '../../services/operation-context.service';
import { createTrajectoryForm } from '../../models/well-trajectory.form';
import { PhaseSurveyEditorComponent } from '../../components/well/phase-survey-editor.component';
import { CaliperLasImportComponent } from '../../components/well/caliper-las-import.component';
import { formatDepthNumber, depthFromMetres, depthToMetres } from '../../models/depth-unit';
import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, FormsModule, Validators } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { TuiExpand } from '@taiga-ui/core/components/expand';
import { TuiAccordion } from '@taiga-ui/kit';
import { PocoSelectorComponent } from '../../components/well/poco-selector.component';
import { Well3dComponent } from '../../components/well/well-3d.component';
import { WellStructureFormComponent } from '../../components/well/well-structure-form.component';
import { SchematicPrimariaComponent } from '../../components/charts/schematic-primaria.component';
import { PrimaryWell2dComponent } from '../../components/charts/primary-well-2d.component';
import { OperationChartsComponent } from '../../components/charts/operation-charts.component';
import { AditivoModalComponent } from '../../components/aditivos/aditivo-modal.component';
import { PrimaryScenarioModalComponent } from '../../components/state-modal/primary-scenario-modal.component';
import type { DepthUnit } from '../../models/depth-unit';
import type { WellCaliperProfile } from '../../models/caliper.model';
import type { PrimaryFluid, PrimaryPathZone, PrimaryPropertySource, PrimaryPumpStep,
  PrimaryFrictionLevel, PrimaryHydraulicPoint, PrimaryReference, PrimaryVolumeAxis } from '../../models/primary-cementing.model';
import { defaultPreflushQuantity } from '../../models/primary-cementing.model';
import type { PrimaryPreflushBasis } from '../../models/primary-volumes.model';
import type { PrimaryMeasuredDataset, PrimaryMeasurementChannel } from '../../models/primary-measurements.model';
import { ADITIVOS_CATALOGO, ADITIVO_UNIDADES_DOSAGEM, unidadePadraoAditivo,
  type Aditivo, type AditivoCatalogo } from '../../models/aditivo.model';
import { buildPrimaryConfiguration, defaultStageSteps, moveStep,
  primaryFormFromConfiguration, repeatStep,
  type PrimaryOperationFormValue, type PrimaryStageForm } from '../../models/primary-operation.form';
import { createPrimaryDraft, PRIMARY_SCENARIO_SCHEMA_VERSION, type PrimaryScenario } from '../../models/primary-scenario.model';
import { primaryOverlays } from '../../models/primary-overlays';
import { buildWellGeometry, emptyPhaseForm, wellGeometryToForms,
  type WellPhaseFormValue } from '../../models/well-geometry.form';
import { pocoGeometryFromForm, type PocoApi, type PocoGeometry } from '../../models/poco.model';
import { PrimaryProgramService, unavailablePrimaryProgram } from '../../services/primary-program.service';
import { buildPrimaryReport } from '../../services/primary-report';
import { renderPrimaryReportHtml } from '../../services/primary-report-html';
import { RelatorioBuilderService } from '../../components/relatorio/relatorio-builder.service';
import { exportPrimaryScenario, importPrimaryScenario,
  type PrimaryImportSummary } from '../../services/primary-scenario-portable';
import { PrimaryScenarioStoreService } from '../../services/primary-scenario-store.service';
import type { CenarioApi } from '../../services/simulador-state-api.service';
import { comparePrimaryMeasurements, primaryResidualSummary } from '../../services/primary-comparison';
import { parseCsv, type CsvDecimal, type CsvTable } from '../../services/primary-csv';
import { hasOutOfOrderSamples, importPrimaryMeasurements, unitsForQuantity,
  type MeasurementUnit, type PrimaryChannelMapping, type TimeUnit } from '../../services/primary-measurements-import';
import { advancePrimaryTime, nextPrimaryEventTime, previousPrimaryEventTime,
  primaryEventLabel, selectPrimaryInstant } from '../../services/primary-playback';
import { SlurryCalculoService } from '../../services/slurry-calculo.service';
import { WellGeometryService } from '../../services/well-geometry.service';
import { buildPrimaryTrajectory, redistributePhaseSurveys, validatePhaseSurveys } from '../../services/phase-survey';
import { buildPrimaryWellVisualModel, primaryReportVisuals } from '../../services/primary-well-visuals';
import { buildPrimaryOperationCharts } from '../../services/primary-operation-charts';
import { operationReportVisuals } from '../../services/operation-charts';
import { PRIMARY_REFERENCE_RHEOLOGY_SOURCE, primaryDefaultRheology } from '../../models/primary-default-rheology';

type Tab = 'volumes' | 'receita' | 'simulador' | 'esquematico' | 'medicoes';

/** Canais oferecidos na importação; o CSV mapeia colunas para estes. */
const IMPORT_CHANNELS: PrimaryMeasurementChannel[] = [
  { id: 'pump-rate', name: 'Vazão bombeada', location: 'Cabeça', quantity: 'pump-rate', unit: 'bpm' },
  { id: 'return-rate', name: 'Vazão de retorno', location: 'Saída anular', quantity: 'return-rate', unit: 'bpm' },
  { id: 'pressure', name: 'Pressão de bombeio', location: 'Cabeça', quantity: 'pressure', unit: 'psi' },
  { id: 'inlet-density', name: 'Densidade na entrada', location: 'Cabeça', quantity: 'inlet-density', unit: 'ppg' },
  { id: 'total-pumped-volume', name: 'Volume bombeado', location: 'Cabeça',
    quantity: 'total-pumped-volume', unit: 'bbl', volumeSource: 'measured-counter' },
];

const FRAME_MS = 200;

/**
 * Resumo da queda livre calculada: primeiro e último instante, tempo somado nos
 * trechos em queda livre, maior retorno e maior vazio. `null` quando não houve.
 */
function freeFallSummary(points: PrimaryHydraulicPoint[]): { startMin: number; endMin: number;
  durationMin: number; maxOutletBpm: number; maxVoidBbl: number; headPsi: number } | null {
  const falling = points.filter(point => point.state === 'free-fall');
  if (!falling.length) return null;
  let durationMin = 0;
  for (let i = 1; i < points.length; i++)
    if (points[i - 1].state === 'free-fall') durationMin += points[i].timeMin - points[i - 1].timeMin;
  return { startMin: falling[0].timeMin, endMin: falling.at(-1)!.timeMin, durationMin,
    maxOutletBpm: Math.max(...falling.map(point => point.outletRateBpm ?? 0)),
    maxVoidBbl: Math.max(...falling.map(point => point.voidVolumeBbl ?? 0)),
    headPsi: falling[0].pumpPressurePsi ?? 0 };
}

/**
 * Fluido de um programa novo. n e k partem da reologia de referência da primária
 * (R3 §12-7, cenário MINA-28BD) conforme o tipo, marcados como estimativa com a
 * referência: servem de partida e não substituem o ensaio do fluido do poço.
 */
function fluid(id: string, kind: PrimaryFluid['kind'], name: string, densityPpg: number,
  source: PrimaryPropertySource['source'] = 'estimated'): PrimaryFluid {
  const reference = PRIMARY_REFERENCE_RHEOLOGY_SOURCE;
  return { id, kind, name, densityPpg,
    rheology: { model: 'power-law', ...primaryDefaultRheology(kind) },
    propertySources: { densityPpg: { source }, n: { source: 'estimated', reference },
      kLbfSnFt2: { source: 'estimated', reference } } };
}

/**
 * P7: primeira tela da cimentação primária. Reproduz resultados já calculados;
 * o motor roda quando as entradas mudam, nunca a cada quadro da reprodução.
 */
@Component({
  selector: 'app-simulador-primaria',
  standalone: true,
  providers: [PrimaryScenarioStoreService],
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon, TuiAccordion, TuiExpand,
    SchematicPrimariaComponent, PrimaryWell2dComponent, OperationChartsComponent,
    PrimaryScenarioModalComponent, AditivoModalComponent,
    PocoSelectorComponent, WellStructureFormComponent, Well3dComponent,
    OperationPhaseSelectorComponent, PhaseSurveyEditorComponent, CaliperLasImportComponent,
    CdkTrapFocus, PrimaryReportModalComponent],
  templateUrl: './simulador-primaria.component.html',
  styleUrl: './simulador-primaria.component.css',
})
export class SimuladorPrimariaComponent implements OnDestroy {
  private readonly program = inject(PrimaryProgramService);
  private readonly operationContext = inject(OperationContextService);
  private readonly wellGeometry = inject(WellGeometryService);
  private readonly slurry = inject(SlurryCalculoService);
  private readonly fb = inject(FormBuilder);
  private readonly store = inject(PrimaryScenarioStoreService);
  private readonly relatorio = inject(RelatorioBuilderService);


  readonly tabs: { id: Tab; label: string }[] = [
    { id: 'volumes', label: '1. Volumes e programa' },
    { id: 'receita', label: '2. Receita da pasta' },
    { id: 'simulador', label: '3. Simulador' },
    { id: 'esquematico', label: '4. Esquemático' },
    { id: 'medicoes', label: '5. Dados medidos' },
  ];
  readonly tab = signal<Tab>('volumes');
  /** Sidebar retrátil pelo dock, como no squeeze. */
  readonly sidebarOpen = signal(true);
  readonly cenariosOpen = signal(false);
  // Acordeões da sidebar; só entradas moram aqui.
  secOperationOpen = false;
  secSequenceOpen = false;
  secPumpingOpen = false;
  secPasteOpen = false;
  secPresentationOpen = false;
  secReportOpen = false;
  secWellOpen = false;
  secTargetOpen = false;
  secAnnulusOpen = false;
  secFluidsOpen = false;
  secStagesOpen = false;
  secProgramOpen = false;
  secLimitsOpen = false;
  secAditivosOpen = false;
  secRefsOpen = false;
  secMeasureOpen = false;

  /** O dock abre o modal e já busca a lista; falha de rede vira mensagem. */
  abrirCenarios(): void {
    this.cenariosOpen.set(true);
    void this.listarSalvos();
  }
  setDepthUnit(unit: DepthUnit): void { this.depthUnit.set(unit); this.store.markDirty(); }
  setVolumeAxis(axis: PrimaryVolumeAxis): void { this.volumeAxis.set(axis); this.store.markDirty(); }
  readonly depthUnit = signal<DepthUnit>('m');

  poco: PocoApi | null = null;
  /** Cadastro de exemplo; o cálculo aguarda a seleção explícita da fase. */
  readonly phases = signal<WellPhaseFormValue[]>([
    { id: 'surface', name: 'Superfície', type: 'SURFACE', topMD: 0, bottomMD: 300, topTVD: 0,
      bottomTVD: 300, holeDiameterIn: 12.25, casingOD: 9.625, casingID: 8.535, shoeMD: 300, shoeTVD: 300 },
    { id: 'open', name: 'Produção', type: 'PRODUCTION', topMD: 300, bottomMD: 1500, topTVD: 300,
      bottomTVD: 1500, holeDiameterIn: 8.5, casingOD: 7, casingID: 6.276, shoeMD: 1500, shoeTVD: 1500 },
  ]);

  readonly form = signal<PrimaryOperationFormValue>({
    targetKind: 'conventional', shoeMD: 1500, floatCollarMD: 1480, linerTopMD: null,
    casingIdIn: 6.276, casingOdIn: 7, settingIdIn: 4, settingOdIn: 5,
    excessPct: 0, measuredHoleIn: null,
    headCondition: 'closed-head', returnPressurePsi: 0,
    internalFrictionLevel: 'medium', annularFrictionLevel: 'medium',
    poreTopPpg: 8.5, fractureTopPpg: 13.4, porePpg: 9, fracturePpg: 15,
    maxPressurePsi: 5000, maxRateBpm: 8, motorHp: 600, efficiency: 0.85,
    initialFluidId: 'mud',
    fluids: [fluid('mud', 'mud', 'Lama', 10), fluid('spacer', 'spacer', 'Espaçador', 11),
      { ...fluid('cement', 'cement', 'Pasta', 15.8), recipe: { density: 15.8, cementClass: 'G', waterSplitFresh: 100, waterSplitSea: 0, silica: 0, nacl: 0, bhct: null, bhst: null, surfaceTemp: 25, additivos: [] } }, fluid('displacement', 'displacement', 'Deslocamento', 9)],
    stages: [{ id: 'stage-1', name: 'Estágio 1', targetTocMD: 500, outletMD: 1500, seatMD: 1480,
      placements: [{ id: 'cement-1', fluidId: 'cement', topMD: 500, bottomMD: 1500, mixingReserveBbl: 0 }],
      steps: defaultStageSteps('stage-1', 'collar', 'cement-1', 5, false) }],
  });

  /** Mesma edição de fases do squeeze; o sinal acima segue o formulário. */
  readonly phaseForms = this.fb.array(this.phases().map(row => this.createPhaseGroup(row)));

  get phasesArray(): FormArray { return this.phaseForms; }
  readonly selectedPhaseId = signal<string | null>(null);
  readonly caliper = signal<WellCaliperProfile | null>(null);
  readonly fullWell = computed(() => {
    const rows = this.phases();
    const last = [...rows].sort((a, b) => (b.bottomMD ?? 0) - (a.bottomMD ?? 0))[0];
    return this.wellGeometry.deriveTrajectoryTvd({
      ...buildWellGeometry(last?.bottomMD ?? 0, last?.bottomTVD ?? 0, rows),
      trajectory: buildPrimaryTrajectory(rows), caliper: this.caliper(),
    });
  });
  readonly context = computed(() => this.operationContext.resolve(this.fullWell(), this.selectedPhaseId(), 'primaria'));
  readonly phaseLabel = computed(() => {
    const p = this.context().phase;
    return p ? p.name + ' · MD ' + this.fmtDepth(p.topMD) + '–' + this.fmtDepth(p.bottomMD)
      + ' ' + this.depthUnit() + ' · TVD ' + this.fmtDepth(p.topTVD) + '–' + this.fmtDepth(p.bottomTVD)
      + ' ' + this.depthUnit() + (p.casing ? ' · OD ' + p.casing.odIn + ' / ID ' + p.casing.idIn + ' pol' : '') : 'Selecione a fase da operação';
  });
  depthValue(value: number | null | undefined): number | null { return value == null ? null : depthFromMetres(value, this.depthUnit()); }
  depthRaw(value: string): string { return value === '' ? '' : String(depthToMetres(Number(value), this.depthUnit())); }
  setStageDepth(index: number, key: 'outletMD' | 'seatMD', value: string): void { this.setStage(index, { [key]: Number(this.depthRaw(value)) }); }
  setPlacement(stageIndex: number, index: number, key: 'fluidId' | 'topMD' | 'bottomMD', value: string): void {
    const stage = this.form().stages[stageIndex]; const placement = stage.placements[index];
    this.setStage(stageIndex, { placements: stage.placements.map((p, i) => i === index ? { ...p, [key]: key === 'fluidId' ? value : Number(this.depthRaw(value)) } : p),
      steps: key !== 'fluidId' ? stage.steps : stage.steps.map(step => step.kind === 'pump' && (step.quantity.source === 'placement' || step.quantity.source === 'reserve-extra') && step.quantity.placementId === placement.id ? { ...step, fluidId: value } : step) });
  }
  addPlacement(stageIndex: number): void {
    const stage = this.form().stages[stageIndex]; const last = stage.placements.at(-1); if (!last) return;
    const split = (last.topMD + last.bottomMD) / 2; const id = 'placement-' + crypto.randomUUID();
    const fluidId = this.selectedSlurryId(); if (!this.cementFluids().some(f => f.id === fluidId)) return;
    const after = stage.steps.reduce((lastIndex, step, i) => step.kind === 'pump' && step.quantity.source === 'placement' ? i : lastIndex, -1);
    const steps = [...stage.steps]; steps.splice(after + 1, 0, { id: 'pump-' + crypto.randomUUID(), kind: 'pump', fluidId, rateBpm: 5, quantity: { source: 'placement', placementId: id, fraction: 1 } });
    this.setStage(stageIndex, { placements: [...stage.placements.map(p => p.id === last.id ? { ...p, bottomMD: split } : p), { id, fluidId, topMD: split, bottomMD: last.bottomMD, mixingReserveBbl: 0 }], steps });
  }
  removePlacement(stageIndex: number, index: number): void {
    const stage = this.form().stages[stageIndex]; if (stage.placements.length <= 1) return;
    const id = stage.placements[index].id;
    const steps = stage.steps.filter(step => !(step.kind === 'pump' && (step.quantity.source === 'placement' || step.quantity.source === 'reserve-extra') && step.quantity.placementId === id));
    this.setStage(stageIndex, { placements: stage.placements.filter(p => p.id !== id), steps }); this.pruneSequenceNotes();
  }
  setStepQuantity(stageIndex: number, id: string, value: string): void {
    const quantity = Number(value); if (!Number.isFinite(quantity)) return;
    this.updateSteps(stageIndex, steps => steps.map(step => {
      if (step.id !== id || step.kind !== 'pump') return step;
      const q = step.quantity;
      if (q.source === 'preflush') return quantity >= 0 ? { ...step, quantity: { ...q, overrideBbl: quantity } } : step;
      return { ...step, quantity: q.source === 'entered' || q.source === 'reserve-extra' ? { ...q, volumeBbl: quantity } : { ...q, fraction: quantity / 100 } };
    }));
  }
  /** Volta o passo do colchão ao volume calculado pelo simulador. */
  resetStepQuantity(stageIndex: number, id: string): void {
    this.updateSteps(stageIndex, steps => steps.map(step => {
      if (step.id !== id || step.kind !== 'pump' || !this.isPreflushFluid(step.fluidId)) return step;
      return { ...step, quantity: step.quantity.source === 'preflush' ? { ...step.quantity, overrideBbl: null }
        : defaultPreflushQuantity(this.fluidKind(step.fluidId)!) };
    }));
  }
  quantityLabel(step: PrimaryPumpStep): string {
    if (step.kind !== 'pump') return '';
    const q = step.quantity;
    if (q.source === 'preflush') return q.overrideBbl === null ? 'Volume (bbl) · calculado' : 'Volume (bbl) · informado';
    return q.source === 'entered' || q.source === 'reserve-extra' ? 'Volume (bbl)' : 'Fração (%)';
  }
  quantityValue(step: PrimaryPumpStep): number | null {
    if (step.kind !== 'pump') return null;
    const q = step.quantity;
    if (q.source === 'preflush') return Number(this.stepVolumeById(step.id)?.volumeBbl.toFixed(2) ?? NaN);
    return q.source === 'entered' || q.source === 'reserve-extra' ? q.volumeBbl : q.fraction * 100;
  }
  /** Colchão com volume digitado no lugar do calculado. */
  stepOverridden(step: PrimaryPumpStep): boolean {
    return step.kind === 'pump' && this.isPreflushFluid(step.fluidId)
      && (step.quantity.source === 'entered' || (step.quantity.source === 'preflush' && step.quantity.overrideBbl !== null));
  }
  private stepVolumeById(id: string) {
    return this.volumes().stages.flatMap(stage => stage.steps).find(step => step.stepId === id);
  }
  private pruneSequenceNotes(): void {
    const ids = new Set(this.form().stages.flatMap(stage => stage.steps.map(step => step.id)));
    this.reportData.update(data => ({ ...data, sequence: { ...data.sequence, stepNotes: Object.fromEntries(Object.entries(data.sequence.stepNotes).filter(([id]) => ids.has(id))) } }));
  }
  fmtDepth(value: number | null | undefined): string { return formatDepthNumber(value, this.depthUnit(), 1); }
  selectOperationPhase(id: string | null): void {
    this.pause(); this.selectedTimeMin.set(0); this.selectedPhaseId.set(id);
    this.syncTargetFromPhase(); this.store.markDirty();
  }
  private syncTargetFromPhase(): void {
    const phase = this.context().phase;
    if (phase?.casing) this.form.update(value => ({ ...value,
      shoeMD: phase.casing!.bottomMD, casingIdIn: phase.casing!.idIn, casingOdIn: phase.casing!.odIn }));
  }
  private createPhaseGroup(row: WellPhaseFormValue): FormGroup {
    const { survey, ...fields } = row;
    return this.fb.group({ ...fields, survey: createTrajectoryForm(this.fb, survey) });
  }

  private syncPhases(): void {
    this.pause();
    this.selectedTimeMin.set(0);
    this.store.markDirty();
    this.phases.set(this.phaseForms.getRawValue() as WellPhaseFormValue[]);
    this.syncTargetFromPhase();
  }

  addPhase(): void {
    this.phaseForms.push(this.createPhaseGroup(emptyPhaseForm(this.phaseForms.length, this.phases().at(-1))));
    this.syncPhases();
  }
  removePhase(index: number): void {
    this.phaseForms.removeAt(index);
    this.syncPhases();
  }
  onPhaseEdit(): void {
    const rows = redistributePhaseSurveys(this.phaseForms.getRawValue() as WellPhaseFormValue[]);
    this.phaseForms.clear();
    rows.forEach(row => this.phaseForms.push(this.createPhaseGroup(row)));
    this.syncPhases();
  }
  onSurveyEdit(): void { this.syncPhases(); }
  importCaliper(profile: WellCaliperProfile): void {
    this.caliper.set(profile); this.pause(); this.selectedTimeMin.set(0); this.store.markDirty();
  }
  removeCaliper(): void {
    this.caliper.set(null); this.pause(); this.selectedTimeMin.set(0); this.store.markDirty();
  }

  get pocoGeometry(): PocoGeometry {
    return pocoGeometryFromForm({ wellFinalMD: this.fullWell().finalMD, wellFinalTVD: this.fullWell().finalTVD,
      fases: this.phaseForms.getRawValue(),
      trajectory: { enabled: !!this.fullWell().trajectory, stations: this.fullWell().trajectory?.stations ?? [] },
      caliper: this.caliper() });
  }

  /** Poço cadastrado substitui as fases; nada do poço é sobrescrito aqui. */
  applyPoco(poco: PocoApi | null): void {
    if (this.poco?.id !== poco?.id) this.selectedPhaseId.set(null);
    this.poco = poco;
    this.store.markDirty();
    if (!poco) return;
    this.caliper.set(poco.geometria.caliper ?? null);
    const rows = wellGeometryToForms(buildWellGeometry(poco.geometria.wellFinalMD,
      poco.geometria.wellFinalTVD, poco.geometria.fases as WellPhaseFormValue[]));
    this.phaseForms.clear();
    for (const row of rows) this.phaseForms.push(this.createPhaseGroup(row));
    this.syncPhases();
  }

  readonly selectedTimeMin = signal(0);
  readonly playing = signal(false);
  readonly speed = signal(3);
  private timer: ReturnType<typeof setInterval> | null = null;

  /** Recalcula só quando as entradas mudam; a reprodução lê daqui. */
  readonly result = computed(() => {
    const value = this.form();
    const context = this.context();
    const well = context.geometry;
    const primary = buildPrimaryConfiguration(value, well);
    const surveyIssues = validatePhaseSurveys(this.phases());
    // As referências de ECD saem daqui para o motor; G2 só lê o que foi calculado.
    const references: PrimaryReference[] = [
      { id: 'sapata', name: 'Sapata', md: value.shoeMD, zone: 'casing-annulus', assemblyId: 'target' },
      ...value.stages.slice(1).map(stage => ({ id: `saida-${stage.id}`, name: `Saída do ${stage.name}`,
        md: stage.outletMD, zone: 'casing-annulus' as const, assemblyId: 'target' })),
      ...this.extraReferences(),
    ];
    const issues = [...context.issues, ...surveyIssues];
    return { well, primary, resolution: issues.some(issue => issue.level === 'error')
      ? unavailablePrimaryProgram(issues) : this.program.resolve(well, primary, references) };
  });

  readonly geometryIssues = computed(() => this.result().resolution.geometry.issues);
  readonly volumes = computed(() => this.result().resolution.volumes);
  readonly recipes = computed(() => this.result().resolution.recipes);
  readonly transport = computed(() => this.result().resolution.transport);
  readonly hydraulics = computed(() => this.result().resolution.hydraulics);
  readonly operationCharts = computed(() => {
    const hydraulics = this.hydraulics();
    return hydraulics ? buildPrimaryOperationCharts(hydraulics, this.volumes(), this.form().fluids,
      this.fullWell().phases.map(phase => ({ id: phase.id, name: phase.name,
        topMD: phase.topMD, bottomMD: phase.bottomMD })), this.selectedPhaseId(),
      md => this.wellGeometry.mdToTvd(this.result().well, md), this.form().returnPressurePsi) : null;
  });

  readonly diagnostics = computed(() => [
    ...this.volumes().diagnostics,
    ...this.recipes().diagnostics,
    ...(this.transport()?.diagnostics ?? []),
    ...(this.hydraulics()?.diagnostics ?? []),
  ]);
  readonly hasBlockingError = computed(() =>
    this.geometryIssues().some(i => i.level === 'error') || this.diagnostics().some(d => d.severity === 'error'));

  readonly totalTimeMin = computed(() => this.transport()?.totalTimeMin ?? 0);
  readonly events = computed(() => this.transport()?.events ?? []);
  readonly snapshots = computed(() => this.hydraulics()?.snapshots ?? []);

  readonly selection = computed(() => selectPrimaryInstant(this.snapshots(),
    this.hydraulics()?.points ?? [], this.events(), this.selectedTimeMin()));

  /** Pasta selecionada para espessamento/UCA, com a origem preservada. */
  readonly selectedSlurryId = signal('cement');
  readonly cementFluids = computed(() => this.form().fluids.filter(f => f.kind === 'cement'));
  readonly slurryOrigin = computed(() => {
    const selected = this.form().fluids.find(f => f.id === this.selectedSlurryId());
    const measured = selected?.labCurves?.length ? 'measured' : null;
    return { measured, density: selected?.propertySources.densityPpg?.source ?? 'estimated' };
  });
  /** Espessamento e UCA só existem com composição cadastrada; sem ela, nada é inventado. */
  readonly slurryDesign = computed(() => {
    const selected = this.form().fluids.find(f => f.id === this.selectedSlurryId());
    return selected?.recipe ? this.slurry.calculateSlurryDesign(selected.recipe) : null;
  });
  /** Overlays do desenho, com os limites radiais do trecho anular. */
  readonly overlays = computed(() => primaryOverlays(this.selection().snapshot,
    this.form().fluids, this.result().resolution.geometry.fullGeometry.segments));

  /** Resumo da hidráulica; `null` onde o motor não resolveu, nunca zero. */
  readonly hydraulicSummary = computed(() => {
    const points = this.hydraulics()?.points ?? [];
    const finite = (values: (number | null)[]) => values.filter((v): v is number => v !== null);
    const bhp = finite(points.map(point => point.bhpPsi));
    const ecd = finite(points.map(point => point.ecdPpg));
    const required = finite(points.map(point => point.requiredPumpPressurePsi));
    return {
      maxBhpPsi: bhp.length ? Math.max(...bhp) : null,
      maxEcdPpg: ecd.length ? Math.max(...ecd) : null,
      maxPumpPressurePsi: required.length ? Math.max(...required) : null,
      narrowest: this.hydraulics()?.narrowestFractureMargin ?? null,
      powerUsagePct: this.hydraulics()?.hydraulicPowerUsagePct ?? null,
      outsideModel: points.filter(point => point.state === 'outside-model').length,
      freeFall: freeFallSummary(points),
    };
  });

  /** Referências de ECD no instante selecionado. */
  readonly selectedReferences = computed(() => this.selection().point?.references ?? []);

  /** TOC ideal do estágio, para a tabela que compara ideal e real. */
  fluidName(id: string): string { return this.form().fluids.find(f => f.id === id)?.name ?? id; }
  readonly selectedPhysicalSlurry = computed(() => this.form().fluids.find(f => f.id === this.selectedSlurryId()));
  idealTocOf(stageId: string): string {
    const stage = this.volumes().stages.find(entry => entry.stageId === stageId);
    return stage?.idealToc ? this.fmtDepth(stage.idealToc.tocMD) : 'indisponível';
  }

  /** Nome do estágio para as tabelas de leitura. */
  stageName(stageId: string): string {
    return this.form().stages.find(stage => stage.id === stageId)?.name ?? stageId;
  }

  readonly schematicState = computed(() => ({
    snapshot: this.selection().snapshot,
    point: this.selection().point,
    stepLabel: this.selection().point?.stepId
      ? this.stepLabelById(this.selection().point!.stepId!) : 'Estado inicial',
    target: this.result().primary.target,
    fluids: this.form().fluids,
    tocMD: this.transport()?.placements[0]?.actualTocMD
      ?? this.volumes().stages[0]?.idealToc?.tocMD ?? null,
  }));
  readonly well2dModel = computed(() => {
    try {
      return buildPrimaryWellVisualModel(this.fullWell(), this.caliper(),
        this.schematicState().tocMD, this.form().shoeMD);
    } catch { return null; }
  });
  readonly well2dViews = computed(() => {
    const well = this.fullWell();
    const all = this.well2dModel();
    if (!all) return [];
    const views = [{ id: 'all', name: 'Todas as fases', model: all }];
    for (const phase of well.phases) {
      try {
        views.push({ id: phase.id, name: phase.name, model: buildPrimaryWellVisualModel(well, this.caliper(),
          this.schematicState().tocMD, this.form().shoeMD,
          { phaseId: phase.id, topMD: phase.topMD, bottomMD: phase.bottomMD }) });
      } catch { /* A vista completa continua disponivel se apenas uma fase for invalida. */ }
    }
    return views;
  });

  // ── Relatório ──────────────────────────────────────────────────────
  readonly cliente = signal('');
  readonly reportData = signal<PrimaryReportData>(createPrimaryReportData());
  readonly reportModalOpen = signal(false);
  readonly reportVisualSelection = signal<Record<string, boolean>>({ profile: true, plan: true, caliper: true });
  readonly reportVisualPhaseId = signal('all');
  readonly reportVisualPhaseOptions = computed(() => this.well2dViews().map(view => ({ id: view.id, name: view.name })));
  readonly reportVisualCatalog = computed(() => {
    const view = this.well2dViews().find(entry => entry.id === this.reportVisualPhaseId()) ?? this.well2dViews()[0];
    if (!view) return [];
    const phase = view.id === 'all' ? undefined : { id: view.id, name: view.name };
    return [...primaryReportVisuals(view.model, phase),
      ...(this.operationCharts() ? operationReportVisuals(this.operationCharts()!, view.id) : [])];
  });
  readonly currentFolderId = signal<number | null>(null);
  readonly replacementAction = signal<(() => void | Promise<void>) | null>(null);
  readonly cimentoClasses = Object.entries(CEMENT_CLASSES).map(([value, entry]) => ({ value, label: entry.label }));
  readonly reportFields: { key: keyof PrimaryReportData; label: string; type?: string }[] = [
    { key: 'preparadoPara', label: 'Preparado para' }, { key: 'preparadoPor', label: 'Preparado por' },
    { key: 'revisadoPor', label: 'Revisado por' }, { key: 'documento', label: 'Título do documento' },
    { key: 'data', label: 'Data', type: 'date' }, { key: 'versao', label: 'Revisão' },
    { key: 'origem', label: 'Origem / operador' }, { key: 'campo', label: 'Campo' },
    { key: 'sonda', label: 'Sonda' }, { key: 'jobNum', label: 'Job #' }, { key: 'pais', label: 'País' },
    { key: 'objetivo', label: 'Objetivo / zona a isolar' },
  ];
  setReportField(key: keyof PrimaryReportData, value: string): void {
    this.reportData.update(data => ({ ...data, [key]: value })); this.store.markDirty();
  }
  setCliente(value: string): void { this.cliente.set(value); this.store.markDirty(); }
  setScenarioName(value: string): void { this.scenarioName.set(value); this.store.markDirty(); }
  setSequenceField(key: 'preparation' | 'closing' | 'lineTestReference' | 'lineTestPressurePsi' | 'lineTestDurationMin', value: string): void {
    const numeric = key === 'lineTestPressurePsi' || key === 'lineTestDurationMin';
    this.reportData.update(data => ({ ...data, sequence: { ...data.sequence, [key]: numeric ? (value === '' ? null : Number(value)) : value } }));
    this.store.markDirty();
  }
  setSequenceNote(kind: 'stepNotes' | 'laboratoryNotes', id: string, value: string): void {
    this.reportData.update(data => ({ ...data, sequence: { ...data.sequence, [kind]: { ...data.sequence[kind], [id]: value } } }));
    this.store.markDirty();
  }
  async selectClientLogo(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      this.scenarioMessage.set('Use um logo PNG, JPEG ou WebP de até 2 MB.'); return;
    }
    try {
    const data = await new Promise<string>((resolve, reject) => { const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result)); reader.onerror = () => reject(new Error('Falha ao ler o logo.')); reader.readAsDataURL(file); });
    this.reportData.update(value => ({ ...value, clienteLogoNome: file.name, clienteLogoImagem: data })); this.store.markDirty();
    } catch { this.scenarioMessage.set('Não foi possível ler o logo. Escolha o arquivo novamente.'); }
  }
  clearClientLogo(): void { this.reportData.update(value => ({ ...value, clienteLogoNome: '', clienteLogoImagem: '' })); this.store.markDirty(); }
  private reportPayload(): PrimaryReportData {
    return { ...this.reportData(), cliente: this.cliente(), poco: this.poco?.nome ?? this.reportData().poco };
  }
  setReportVisual(event: { id: string; checked: boolean }): void {
    this.reportVisualSelection.update(current => ({ ...current, [event.id]: event.checked }));
  }
  setReportVisualPhase(id: string): void { this.reportVisualPhaseId.set(id); }
  requestOpenScenario(id: number): void { this.requestReplacement(() => this.abrirSalvo(id)); }
  requestImportScenario(): void { this.requestReplacement(() => this.confirmarImportacao()); }
  addExtraSection(): void { this.reportData.update(d => ({ ...d, extraSections: [...d.extraSections, { title: '', text: '' }] })); this.store.markDirty(); }
  removeExtraSection(index: number): void { this.reportData.update(d => ({ ...d, extraSections: d.extraSections.filter((_, i) => i !== index) })); this.store.markDirty(); }
  setExtraSection(index: number, key: 'title' | 'text', text: string): void { this.reportData.update(d => ({ ...d, extraSections: d.extraSections.map((section, i) => i === index ? { ...section, [key]: text } : section) })); this.store.markDirty(); }
  requestReplacement(action: () => void | Promise<void>): void {
    if (this.saveState().status === 'saving') return;
    if (!this.store.isSaved()) this.replacementAction.set(action); else void action();
  }
  async resolveReplacement(save: boolean): Promise<void> {
    if (save) { await this.salvarCenario(); if (!this.store.isSaved()) return; }
    const action = this.replacementAction(); this.replacementAction.set(null); await action?.();
  }
  deleteCurrentScenario(id: number): void {
    if (id === this.saveState().scenarioId) { this.store.reset(); this.currentFolderId.set(null); }
  }
  deleteCurrentFolder(id: number): void {
    if (id === this.currentFolderId()) { this.store.reset(); this.currentFolderId.set(null); }
  }
  setRecipeParameters(key: 'source' | 'yieldFt3' | 'facGpc' | 'famGpc', raw: string): void {
    const id = this.selectedSlurryId();
    this.patch({ fluids: this.form().fluids.map(fluid => fluid.id !== id ? fluid : { ...fluid,
      recipeParameters: { source: 'calculated', yieldFt3: null, facGpc: null, famGpc: null,
        ...fluid.recipeParameters, [key]: key === 'source' ? raw : raw === '' ? null : Number(raw) } as NonNullable<PrimaryFluid['recipeParameters']> }) });
  }
  readonly selectedRecipeParameters = computed(() => this.form().fluids.find(fluid => fluid.id === this.selectedSlurryId())?.recipeParameters);
  renameSlurry(name: string): void { const id = this.selectedSlurryId(); this.patch({ fluids: this.form().fluids.map(fluid => fluid.id === id ? { ...fluid, name } : fluid) }); }
  readonly selectedSlurryName = computed(() => this.form().fluids.find(fluid => fluid.id === this.selectedSlurryId())?.name ?? 'Nenhuma pasta selecionada');
  readonly extraSnapshots = signal<number[]>([]);

  /** Marca o instante atual para entrar no relatório além dos fins de estágio. */
  marcarSnapshot(): void {
    this.store.markDirty();
    const timeMin = this.selectedTimeMin();
    this.extraSnapshots.update(current => current.includes(timeMin) ? current : [...current, timeMin]);
  }
  limparSnapshots(): void { this.extraSnapshots.set([]); this.store.markDirty(); }

  readonly report = computed(() => buildPrimaryReport({
    scenarioName: this.scenarioName(), scenarioId: this.saveState().scenarioId,
    savedAt: this.saveState().savedAt, schemaVersion: PRIMARY_SCENARIO_SCHEMA_VERSION,
    phaseLabel: this.phaseLabel(),
    generatedAt: new Date().toISOString(),
    cliente: this.cliente(), poco: this.poco?.nome ?? this.reportData().poco, reportData: this.reportPayload(),
    primary: this.result().primary, volumes: this.volumes(), recipes: this.recipes(),
    transport: this.transport(), hydraulics: this.hydraulics(),
    measurements: this.datasets(), volumeAxis: this.volumeAxis(), depthUnit: this.depthUnit(),
    hasSlurryCurves: !!this.slurryDesign(),
    well: this.fullWell(),
    visuals: this.reportVisualCatalog().filter(visual => this.reportVisualSelection()[visual.id] !== false),
    extraSnapshotTimesMin: this.extraSnapshots(),
  }));

  readonly sequencePreview = computed(() => this.report().sections.find(section => section.id === 'sequencia-operacional')?.sequence?.map(primarySequenceText) ?? []);
  readonly otherFluids = computed(() => this.form().fluids.filter(fluid => fluid.kind !== 'cement'));
  reportHtml(): string { return renderPrimaryReportHtml(this.report()); }

  abrirRelatorio(): void { this.reportModalOpen.set(true); }
  visualizarRelatorio(): void { this.relatorio.openInNewTab(this.reportHtml()); }
  imprimirRelatorio(): void {
    if (!this.report().canIssue) return;
    const win = window.open('', '_blank'); if (!win) return;
    win.onload = () => win.print();
    win.document.open(); win.document.write(this.reportHtml()); win.document.close();
  }
  baixarRelatorio(): void {
    if (!this.report().canIssue) return;
    this.relatorio.downloadAsWord(this.reportHtml(), this.scenarioName() || 'primaria', true);
  }

  // ── Cenário: banco e arquivo portátil ────────────────────────────────────
  readonly scenarioName = signal('Cimentação primária');
  readonly saveState = this.store.saveState;
  readonly savedList = signal<CenarioApi[]>([]);
  readonly importSummary = signal<PrimaryImportSummary | null>(null);
  readonly scenarioMessage = signal('');

  /** Estado da tela como cenário versão 2, pronto para validar e persistir. */
  readonly scenario = computed<PrimaryScenario>(() => {
    const draft = createPrimaryDraft();
    const value = this.form();
    return {
      ...draft,
      ...this.pocoGeometry, selectedPhaseId: this.selectedPhaseId(),
      fases: this.phases(),
      primary: this.result().primary,
      measurements: this.datasets(),
      presentation: { depthUnit: this.depthUnit(), volumeAxis: this.volumeAxis(),
        references: this.extraReferences(), visibleSeries: [],
        selectedTimeMin: this.selectedTimeMin(),
        snapshotTimesMin: this.extraSnapshots() },
    };
  });

  /** Aplica um cenário inteiro à tela; o motor recalcula a partir das entradas. */
  applyScenario(scenario: PrimaryScenario): void {
    this.pause();
    this.selectedTimeMin.set(scenario.presentation.selectedTimeMin ?? 0);
    this.phaseForms.clear();
    for (const row of scenario.fases) this.phaseForms.push(this.createPhaseGroup(row));
    this.phases.set(this.phaseForms.getRawValue() as WellPhaseFormValue[]);
    this.caliper.set(scenario.caliper ?? null);
    this.selectedPhaseId.set(scenario.selectedPhaseId);
    this.form.set(primaryFormFromConfiguration(scenario.primary, this.form()));
    if (!this.cementFluids().some(fluid => fluid.id === this.selectedSlurryId()))
      this.selectedSlurryId.set(this.cementFluids()[0]?.id ?? '');
    this.syncTargetFromPhase();
    this.datasets.set(scenario.measurements);
    this.extraSnapshots.set(scenario.presentation.snapshotTimesMin);
    this.depthUnit.set(scenario.presentation.depthUnit);
    this.volumeAxis.set(scenario.presentation.volumeAxis);
    this.extraReferences.set(scenario.presentation.references);
    this.rebuildAdditiveForms();
  }

  async listarSalvos(): Promise<void> {
    this.scenarioMessage.set('');
    try { this.savedList.set(await this.store.listar()); }
    catch { this.scenarioMessage.set('Não foi possível listar os cenários salvos.'); }
  }

  async abrirSalvo(id: number): Promise<void> {
    this.scenarioMessage.set('');
    try {
      const opened = await this.store.abrir(id);
      this.poco = opened.cenario.poco ?? null;
      this.currentFolderId.set(opened.cenario.pastaId);
      this.reportData.set(opened.reportData); this.cliente.set(opened.reportData.cliente);
      this.applyScenario(opened.scenario);
      this.scenarioName.set(opened.cenario.nome);
    } catch (error) {
      // Cenário inválido não substitui o que está aberto.
      this.scenarioMessage.set(error instanceof Error ? error.message : 'Cenário incompatível.');
    }
  }

  async salvarCenario(options?: { nome: string; pastaId: number | null; asNew: boolean }): Promise<void> {
    this.scenarioMessage.set('');
    let report: PrimaryReportData;
    try { report = parsePrimaryReportData(this.reportPayload()); }
    catch (error) { this.scenarioMessage.set(error instanceof Error ? error.message : 'Relatório inválido.'); return; }
    const nameAtStart = this.scenarioName();
    const saved = await this.store.salvar(this.scenario(), { nome: options?.nome ?? this.scenarioName(), poco: this.poco,
      pastaId: options ? options.pastaId : this.currentFolderId(), asNew: options?.asNew,
      dadosRelatorio: JSON.stringify(report) });
    if (saved) { if (this.scenarioName() === nameAtStart) this.scenarioName.set(saved.nome); this.currentFolderId.set(saved.pastaId); }
  }

  /** Arquivo portátil: geometria completa, medições e configurações. */
  exportarArquivo(): string | null {
    try {
      const json = exportPrimaryScenario(this.scenario(), {
        scenarioId: this.saveState().scenarioId, scenarioName: this.scenarioName(),
        pocoId: this.poco?.id ?? null, pocoVersion: this.poco?.version ?? null, pastaId: this.currentFolderId() },
        new Date().toISOString(), this.reportPayload());
      this.scenarioMessage.set('');
      return json;
    } catch (error) {
      this.scenarioMessage.set(error instanceof Error ? error.message : 'Cenário inválido.');
      return null;
    }
  }

  baixarArquivo(): void {
    const json = this.exportarArquivo();
    if (!json) return;
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `${this.scenarioName() || 'primaria'}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  /** Lê o arquivo e mostra o resumo; nada é adotado nem salvo antes de confirmar. */
  lerArquivo(json: string): void {
    try {
      const result = importPrimaryScenario(json);
      this.pendingImport = result.scenario;
      this.pendingReportData = result.dadosRelatorio;
      this.importSummary.set(result.summary);
      this.scenarioMessage.set('');
    } catch (error) {
      this.pendingImport = null;
      this.importSummary.set(null);
      this.scenarioMessage.set(error instanceof Error ? error.message : 'Arquivo inválido.');
    }
  }

  async onScenarioFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.lerArquivo(await file.text());
  }

  private pendingImport: PrimaryScenario | null = null;
  private pendingReportData = createPrimaryReportData();

  confirmarImportacao(): void {
    if (!this.pendingImport) return;
    this.applyScenario(this.pendingImport);
    this.reportData.set(this.pendingReportData); this.cliente.set(this.pendingReportData.cliente);
    this.currentFolderId.set(null); this.scenarioName.set(this.importSummary()?.name || 'Cimentação primária');
    // Importar não salva no banco nem herda o vínculo do arquivo de origem.
    this.store.adopt(this.importSummary()?.name ?? null);
    this.poco = null;
    this.pendingImport = null;
    this.importSummary.set(null);
    this.cenariosOpen.set(false);
  }

  cancelarImportacao(): void {
    this.pendingImport = null;
    this.importSummary.set(null);
  }

  // ── Aditivos da pasta ─────────────────────────────────────────────
  /**
   * Mesmo catálogo e mesmo modal do squeeze. Os aditivos mudam o **rendimento**
   * da pasta; o volume bombeado continua vindo do TOC e da geometria.
   */
  readonly catalogoAditivos: AditivoCatalogo[] = ADITIVOS_CATALOGO;
  readonly additiveUnits = ADITIVO_UNIDADES_DOSAGEM;
  readonly aditivosModalOpen = signal(false);
  readonly additiveForms: FormArray<FormGroup> = this.fb.array<FormGroup>([]);

  get aditivosArray(): FormArray { return this.additiveForms; }

  private createAditivoGroup(data: Partial<AditivoCatalogo & Aditivo> = {}): FormGroup {
    const cat = ADITIVOS_CATALOGO.find(entry => entry.catalogId === data.catalogId);
    const source = { ...cat, ...data } as Partial<Aditivo>;
    return this.fb.group({
      catalogId: [data.catalogId ?? ''],
      name: [data.name ?? cat?.name ?? '', Validators.required],
      category: [data.category ?? cat?.category ?? 'retarder'],
      type: [data.type ?? cat?.type ?? 'liquid'],
      conc: [data.conc ?? cat?.defaultConc ?? 0, [Validators.required, Validators.min(0)]],
      unidadeDosagem: [data.unidadeDosagem ?? unidadePadraoAditivo(source)],
      misturadoEm: [data.misturadoEm ?? cat?.misturadoEm ?? 'aguaMistura'],
      ativo: [data.ativo ?? true],
    });
  }

  /** Recria as linhas a partir da pasta selecionada, sem disparar escrita de volta. */
  private rebuildAdditiveForms(): void {
    this.additiveForms.clear({ emitEvent: false });
    const recipe = this.form().fluids.find(f => f.id === this.selectedSlurryId())?.recipe;
    for (const entry of recipe?.additivos ?? [])
      this.additiveForms.push(this.createAditivoGroup(entry as Partial<AditivoCatalogo & Aditivo>),
        { emitEvent: false });
  }

  /** Escreve as linhas na composição da pasta selecionada e recalcula. */
  private syncAdditives(): void {
    const id = this.selectedSlurryId();
    const current = this.form().fluids.find(f => f.id === id)?.recipe;
    if (!current) return;
    // O contrato da receita guarda dosagem e procedência do catálogo.
    const additivos = this.additiveForms.getRawValue() as typeof current.additivos;
    this.patch({ fluids: this.form().fluids.map(fluid =>
      fluid.id === id ? { ...fluid, recipe: { ...current, additivos } } : fluid) });
  }

  selectSlurry(id: string): void {
    this.selectedSlurryId.set(id);
    this.rebuildAdditiveForms();
  }

  addAditivoCatalogo(entry: AditivoCatalogo): void {
    this.additiveForms.push(this.createAditivoGroup(entry));
    this.syncAdditives();
  }

  addAditivo(): void {
    this.additiveForms.push(this.createAditivoGroup(
      { name: 'Novo aditivo', category: 'retarder', type: 'liquid', conc: 0.03 }));
    this.syncAdditives();
  }

  removeAditivo(index: number): void {
    this.additiveForms.removeAt(index);
    this.syncAdditives();
  }

  onAditivoEdit(): void { this.syncAdditives(); }

  aditivoUnit(index: number): string {
    const unit = this.additiveForms.at(index)?.get('unidadeDosagem')?.value;
    return this.additiveUnits.find(item => item.value === unit)?.label ?? unit ?? 'GPC';
  }

  /** Exporta e importa o conjunto de aditivos, como no squeeze. */
  exportarAditivos(): void {
    const json = JSON.stringify(this.additiveForms.getRawValue(), null, 2);
    const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `aditivos-${this.selectedSlurryId()}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  importarAditivos(rows: unknown[]): void {
    this.additiveForms.clear({ emitEvent: false });
    for (const row of rows ?? [])
      this.additiveForms.push(this.createAditivoGroup(row as Partial<AditivoCatalogo & Aditivo>),
        { emitEvent: false });
    this.syncAdditives();
  }

  // ── Apresentação e referências de ECD ─────────────────────────────
  /** Modo de volume do cenário. Sem gráfico na tela, por ora só persiste. */
  readonly volumeAxis = signal<PrimaryVolumeAxis>('total-pumped');
  /** 3D sob demanda: WebGL é caro e nem toda revisão precisa dele. */
  readonly show3d = signal(false);

  readonly extraReferences = signal<PrimaryReference[]>([]);

  readonly references = computed<PrimaryReference[]>(() => [
    { id: 'sapata', name: 'Sapata', md: this.form().shoeMD,
      zone: 'casing-annulus', assemblyId: 'target' },
    // Cada saída de estágio também é referência legítima de ECD.
    ...this.form().stages.slice(1).map((stage, index) => ({
      id: `saida-${stage.id}`, name: `Saída do ${stage.name}`, md: stage.outletMD,
      zone: 'casing-annulus' as const, assemblyId: 'target', index })),
    ...this.extraReferences(),
  ]);

  addReference(mdRaw: string, name: string): void {
    const md = Number(mdRaw);
    if (!Number.isFinite(md) || md <= 0) return;
    const id = `ref-${crypto.randomUUID()}`;
    this.store.markDirty();
    this.extraReferences.update(current => [...current,
      { id, name: name.trim() || `Referência ${md} m`, md, zone: 'casing-annulus', assemblyId: 'target' }]);
  }
  removeReference(id: string): void {
    this.store.markDirty();
    this.extraReferences.update(current => current.filter(reference => reference.id !== id));
  }

  // ── Dados medidos ────────────────────────────────────────────────
  readonly datasets = signal<PrimaryMeasuredDataset[]>([]);
  readonly csv = signal<CsvTable | null>(null);
  readonly csvFileName = signal('');
  readonly csvDecimal = signal<CsvDecimal>('.');
  readonly timeColumn = signal('');
  readonly timeUnit = signal<TimeUnit>('min');
  readonly timezone = signal('');
  readonly originTimestamp = signal('');
  readonly importOffsetMin = signal(0);
  readonly sortByTime = signal(false);
  readonly importErrors = signal<string[]>([]);
  readonly channelColumn = signal<Record<string, string>>({});
  readonly channelUnit = signal<Record<string, MeasurementUnit>>({});
  readonly importChannels = IMPORT_CHANNELS;

  unitsFor(quantity: string): MeasurementUnit[] { return unitsForQuantity(quantity); }

  async onCsvFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) return;
    this.csvFileName.set(file.name);
    this.loadCsvText(await file.text());
  }

  /** Separado do input para que a prévia seja testável sem um File real. */
  loadCsvText(text: string): void {
    const table = parseCsv(text, { decimal: this.csvDecimal() });
    this.csv.set(table);
    this.importErrors.set([]);
    this.timeColumn.set(table.headers[0] ?? '');
    this.channelColumn.set({});
    this.channelUnit.set(Object.fromEntries(
      IMPORT_CHANNELS.map(channel => [channel.id, this.unitsFor(channel.quantity)[0]])) as Record<string, MeasurementUnit>);
  }

  setCsvDecimal(value: string): void {
    this.csvDecimal.set(value === ',' ? ',' : '.');
    const table = this.csv();
    // Trocar o decimal muda até o separador sugerido: reler o arquivo já lido.
    if (table) this.csv.set(parseCsv([table.headers.join(table.delimiter),
      ...table.rows.map(row => row.join(table.delimiter))].join('\n'), { decimal: this.csvDecimal() }));
  }

  setChannelColumn(channelId: string, column: string): void {
    this.channelColumn.update(current => ({ ...current, [channelId]: column }));
  }
  setChannelUnit(channelId: string, unit: string): void {
    this.channelUnit.update(current => ({ ...current, [channelId]: unit as MeasurementUnit }));
  }

  readonly previewRows = computed(() => this.csv()?.rows.slice(0, 5) ?? []);
  readonly previewOutOfOrder = computed(() => {
    const table = this.csv();
    const index = table ? table.headers.indexOf(this.timeColumn()) : -1;
    if (!table || index < 0) return false;
    const times = table.rows.map(row => Number((row[index] ?? '').replace(',', '.')))
      .filter(Number.isFinite);
    return hasOutOfOrderSamples(times.map(timeMin => ({ timeMin })));
  });

  /** Incorpora o dataset. Falhar mantém os datasets anteriores intactos. */
  importDataset(): void {
    const table = this.csv();
    if (!table) return;
    const mappings: PrimaryChannelMapping[] = IMPORT_CHANNELS
      .filter(channel => this.channelColumn()[channel.id])
      .map(channel => ({ channel, column: this.channelColumn()[channel.id],
        originalUnit: this.channelUnit()[channel.id] }));
    const result = importPrimaryMeasurements(table, {
      name: this.csvFileName() || 'Medições', sourceFileName: this.csvFileName() || 'medicoes.csv',
      importedAt: new Date().toISOString(), timeColumn: this.timeColumn(), timeUnit: this.timeUnit(),
      timezone: this.timezone() || undefined, originTimestamp: this.originTimestamp() || undefined,
      offsetMin: this.importOffsetMin(), maxInterpolationGapMin: null,
      mappings, sortByTime: this.sortByTime(),
    });
    if (!result.dataset) { this.importErrors.set(result.blocking); return; }
    this.importErrors.set([]);
    this.datasets.update(current => [...current, result.dataset!]);
    this.csv.set(null);
  }

  /** Remover um dataset não muda o programa nem o resultado calculado. */
  removeDataset(id: string): void {
    this.datasets.update(current => current.filter(dataset => dataset.id !== id));
  }

  setDatasetOffset(id: string, raw: string): void {
    const offsetMin = Number(raw);
    if (!Number.isFinite(offsetMin)) return;
    this.datasets.update(current => current.map(dataset => dataset.id === id
      ? { ...dataset, alignment: { ...dataset.alignment, offsetMin } } : dataset));
  }

  readonly comparisons = computed(() => {
    const points = this.hydraulics()?.points ?? [];
    return this.datasets().map(dataset => ({
      dataset,
      series: comparePrimaryMeasurements(dataset, points)
        .map(series => ({ series, summary: primaryResidualSummary(series) })),
    }));
  });

  // ── Reprodução ───────────────────────────────────────────────────────────
  eventLabel = primaryEventLabel;

  togglePlay(): void {
    if (this.playing()) return this.pause();
    if (this.totalTimeMin() <= 0) return;
    if (this.selectedTimeMin() >= this.totalTimeMin()) this.selectedTimeMin.set(0);
    this.playing.set(true);
    this.timer = setInterval(() => {
      const next = advancePrimaryTime(this.events(), this.selectedTimeMin(),
        FRAME_MS / 1000, this.speed(), this.totalTimeMin());
      this.selectedTimeMin.set(next);
      if (next >= this.totalTimeMin()) this.pause();
    }, FRAME_MS);
  }

  pause(): void {
    this.playing.set(false);
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
  }

  restart(): void { this.pause(); this.selectedTimeMin.set(0); }
  toEnd(): void { this.pause(); this.selectedTimeMin.set(this.totalTimeMin()); }
  nextEvent(): void {
    const next = nextPrimaryEventTime(this.events(), this.selectedTimeMin());
    if (next !== null) { this.pause(); this.selectedTimeMin.set(next); }
  }
  previousEvent(): void {
    const previous = previousPrimaryEventTime(this.events(), this.selectedTimeMin());
    if (previous !== null) { this.pause(); this.selectedTimeMin.set(previous); }
  }
  onCursor(value: string): void { this.pause(); this.selectedTimeMin.set(Number(value)); }

  // ── Edição ───────────────────────────────────────────────────────────────
  /** Qualquer alteração de entrada invalida o resultado e pausa a reprodução. */
  private patch(update: Partial<PrimaryOperationFormValue>): void {
    this.pause();
    this.selectedTimeMin.set(0);
    this.store.markDirty();
    this.form.update(current => ({ ...current, ...update }));
  }

  setField<K extends keyof PrimaryOperationFormValue>(key: K, raw: string): void {
    if (['shoeMD', 'casingIdIn', 'casingOdIn'].includes(key)) return;
    const numeric = raw === '' ? null : Number(raw);
    // Editar a janela única substitui a janela por trechos, em vez de conviver com ela.
    const windowField = ['poreTopPpg', 'porePpg', 'fractureTopPpg', 'fracturePpg'].includes(key);
    this.patch({ [key]: (numeric !== null && Number.isNaN(numeric) ? null : numeric),
      ...(windowField ? { pressureWindowRows: undefined } : {}) } as Partial<PrimaryOperationFormValue>);
  }
  setText<K extends keyof PrimaryOperationFormValue>(key: K, raw: string): void {
    this.patch({ [key]: raw } as Partial<PrimaryOperationFormValue>);
  }

  setFluidDensity(id: string, raw: string): void {
    const densityPpg = Number(raw);
    if (!Number.isFinite(densityPpg)) return;
    this.patch({ fluids: this.form().fluids.map(f => f.id === id
      // Valor digitado passa a ser a origem do campo; estimativa não é apagada em silêncio.
      ? { ...f, densityPpg, propertySources: { ...f.propertySources, densityPpg: { source: 'entered' } } }
      : f) });
  }

  /** Volume que efetivamente entra no programa; o fluido inicial ocupa a capacidade calculada do circuito. */
  fluidProgrammedVolume(id: string): number {
    const pumped = this.volumes().stages.flatMap(stage => stage.steps)
      .filter(step => step.kind === 'pump' && step.fluidId === id)
      .reduce((sum, step) => sum + step.volumeBbl, 0);
    if (pumped > 0 || this.form().initialFluidId !== id) return pumped;
    return this.transport()?.snapshots[0]?.inventory.find(entry => entry.fluidId === id)?.initialBbl ?? 0;
  }

  fluidVolumeEditable(id: string): boolean {
    return this.form().fluids.find(entry => entry.id === id)?.kind !== 'mud';
  }
  private fluidKind(id: string): PrimaryFluid['kind'] | undefined {
    return this.form().fluids.find(entry => entry.id === id)?.kind;
  }
  /** Lavador e espaçador: volume calculado pelo simulador, com campo para informar outro. */
  isPreflushFluid(id: string): boolean {
    const kind = this.fluidKind(id);
    return kind === 'wash' || kind === 'spacer';
  }
  /**
   * O que o simulador calcula para o colchão, passo a passo, e o critério em uso. Sem
   * passo calculado (só volume digitado), não há base: o volume é do usuário.
   */
  preflushSummary(id: string): { calculatedBbl: number; bases: PrimaryPreflushBasis[]; overridden: boolean;
    criteria: { contactTimeMin: number; annularLengthM: number } | null; text: string } | null {
    const steps = this.form().stages.flatMap(stage => stage.steps)
      .filter(step => step.kind === 'pump' && step.fluidId === id) as Extract<PrimaryPumpStep, { kind: 'pump' }>[];
    if (!steps.length) return null;
    const bases = this.volumes().stages.flatMap(stage => stage.steps)
      .filter(step => step.fluidId === id && step.preflush).map(step => step.preflush!);
    const preflush = steps.map(step => step.quantity).filter(q => q.source === 'preflush');
    const criteria = preflush.length ? {
      contactTimeMin: preflush.reduce((sum, q) => sum + q.contactTimeMin, 0),
      annularLengthM: preflush.reduce((sum, q) => sum + q.annularLengthM, 0) } : null;
    const calculatedBbl = bases.reduce((sum, b) => sum + b.calculatedBbl, 0);
    const describe = (b: PrimaryPreflushBasis) => {
      const contact = `${this.fmt(b.contactTimeMin, 1)} min × ${this.fmt(b.rateBpm, 2)} bpm = ${this.fmt(b.contactBbl)} bbl de contato`;
      if (b.annularLengthM <= 0) return contact;
      const annular = b.capacityBblM === null ? `sem intervalo de pasta para os ${this.fmt(b.annularLengthM, 1)} m de anular`
        : `${this.fmt(b.annularLengthM, 1)} m × ${this.fmt(b.capacityBblM, 4)} bbl/m = ${this.fmt(b.annularBbl)} bbl de anular (pasta de fundo, ${b.placementId})`;
      return `o maior entre ${contact} e ${annular}`;
    };
    const text = !bases.length ? 'Volume informado; o simulador não calcula este colchão.'
      : `Calculado pelo simulador: ${this.fmt(calculatedBbl)} bbl — ${bases.length === 1 ? describe(bases[0])
        : bases.map((b, i) => `passo ${i + 1}: ${describe(b)}`).join('; ')}.`;
    return { calculatedBbl, bases, criteria, text,
      overridden: steps.some(step => step.quantity.source === 'entered'
        || (step.quantity.source === 'preflush' && step.quantity.overrideBbl !== null)) };
  }
  /** Todos os passos do colchão voltam ao volume calculado (os digitados passam a ter critério). */
  useCalculated(id: string): void {
    const kind = this.fluidKind(id);
    if (kind !== 'wash' && kind !== 'spacer') return;
    this.patch({ stages: this.form().stages.map(stage => ({ ...stage, steps: stage.steps.map(step =>
      step.kind !== 'pump' || step.fluidId !== id ? step : { ...step,
        quantity: step.quantity.source === 'preflush' ? { ...step.quantity, overrideBbl: null } : defaultPreflushQuantity(kind) }) })) });
  }
  /** Critério do colchão; em passos repetidos, repartido na proporção atual. */
  setPreflushCriterion(id: string, field: 'contactTimeMin' | 'annularLengthM', raw: string): void {
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    const quantities = this.form().stages.flatMap(stage => stage.steps)
      .flatMap(step => step.kind === 'pump' && step.fluidId === id && step.quantity.source === 'preflush' ? [step.quantity] : []);
    const total = quantities.reduce((sum, q) => sum + q[field], 0);
    this.patch({ stages: this.form().stages.map(stage => ({ ...stage, steps: stage.steps.map(step => {
      if (step.kind !== 'pump' || step.fluidId !== id || step.quantity.source !== 'preflush') return step;
      const share = total > 0 ? step.quantity[field] / total : 1 / quantities.length;
      return { ...step, quantity: { ...step.quantity, [field]: value * share } };
    }) })) });
  }

  /** Atualiza os passos desse fluido; no deslocamento, converte bbl para a fracao geometrica. */
  setFluidVolume(id: string, raw: string): void {
    const requested = Number(raw);
    if (!Number.isFinite(requested) || requested < 0 || !this.fluidVolumeEditable(id)) return;
    const stages = this.form().stages;
    const matches = stages.flatMap(stage => stage.steps.flatMap(step =>
      step.kind === 'pump' && step.fluidId === id
        ? [{ stepId: step.id, current: this.volumes().stages.find(row => row.stageId === stage.id)?.steps
            .find(row => row.stepId === step.id)?.volumeBbl ?? 0 }]
        : []));
    if (!matches.length) {
      if (requested <= 0 || !stages.length) return;
      const first = stages[0];
      const found = first.steps.findIndex(step => step.kind === 'pump');
      const insertAt = found < 0 ? 0 : found;
      const next = [...first.steps];
      const kind = this.fluidKind(id);
      next.splice(insertAt, 0, { id: `fluid-${crypto.randomUUID()}`, kind: 'pump', fluidId: id, rateBpm: 5,
        quantity: kind === 'wash' || kind === 'spacer' ? { ...defaultPreflushQuantity(kind), overrideBbl: requested }
          : { source: 'entered', volumeBbl: requested } });
      this.patch({ stages: stages.map((stage, index) => index === 0 ? { ...stage, steps: next } : stage) });
      return;
    }
    const currentTotal = matches.reduce((sum, match) => sum + match.current, 0);
    const weights = new Map(matches.map(match => [match.stepId,
      currentTotal > 0 ? match.current / currentTotal : 1 / matches.length]));
    this.patch({ stages: stages.map(stage => ({ ...stage, steps: stage.steps.map(step => {
      if (step.kind !== 'pump' || step.fluidId !== id) return step;
      const desired = requested * (weights.get(step.id) ?? 0);
      if (step.quantity.source === 'entered') return { ...step,
        quantity: { ...step.quantity, volumeBbl: desired } };
      if (step.quantity.source === 'preflush') return { ...step,
        quantity: { ...step.quantity, overrideBbl: desired } };
      if (step.quantity.source === 'displacement') {
        const target = this.volumes().stages.find(row => row.stageId === stage.id)?.displacementTargetBbl ?? 0;
        return target > 0 && desired > 0 ? { ...step,
          quantity: { ...step.quantity, fraction: desired / target } } : step;
      }
      return step;
    }) })) });
  }

  setFluidRheology(id: string, field: 'n' | 'kLbfSnFt2', raw: string): void {
    const value = Number(raw);
    if (!Number.isFinite(value) || value <= 0) return;
    this.patch({ fluids: this.form().fluids.map(fluid => fluid.id === id ? { ...fluid,
      rheology: { ...fluid.rheology, [field]: value },
      propertySources: { ...fluid.propertySources, [field]: { source: 'entered' } } } : fluid) });
  }

  fluidRheologySourceLabel(fluid: PrimaryFluid, field: 'n' | 'kLbfSnFt2'): string {
    const source = fluid.propertySources[field]?.source ?? 'estimated';
    return source === 'entered' ? 'informada' : source === 'measured' ? 'medida' : 'estimada';
  }

  usesSimplifiedWaterRheology(fluid: PrimaryFluid): boolean {
    const nSource = fluid.propertySources.n?.source ?? 'estimated';
    const kSource = fluid.propertySources.kLbfSnFt2?.source ?? 'estimated';
    return nSource === 'estimated' && kSource === 'estimated'
      && Math.abs(fluid.rheology.n - 1) < 1e-12
      && Math.abs(fluid.rheology.kLbfSnFt2 - 0.000020885) < 1e-12;
  }

  /** n e k ainda são os de referência de um programa novo, não informados nem medidos. */
  usesReferenceRheology(fluid: PrimaryFluid): boolean {
    return (['n', 'kLbfSnFt2'] as const).every(field =>
      fluid.propertySources[field]?.source === 'estimated'
      && fluid.propertySources[field]?.reference === PRIMARY_REFERENCE_RHEOLOGY_SOURCE);
  }

  frictionLevelLabel(level: PrimaryFrictionLevel): string {
    return level === 'low' ? 'Baixo (1,00×)'
      : level === 'high' ? 'Alto (1,35×)' : 'Médio (1,15×)';
  }

  setStage(index: number, update: Partial<PrimaryStageForm>): void {
    this.patch({ stages: this.form().stages.map((stage, i) => i === index ? { ...stage, ...update } : stage) });
  }

  setTargetToc(index: number, raw: string): void {
    const targetTocMD = Number(raw);
    if (!Number.isFinite(targetTocMD)) return;
    const stage = this.form().stages[index];
    // O intervalo dimensionado acompanha o TOC: sem isso sobra lacuna no estágio.
    this.setStage(index, { targetTocMD,
      placements: stage.placements.map((placement, i) => i === 0
        ? { ...placement, topMD: targetTocMD } : placement) });
  }

  setMixingReserve(stageIndex: number, placementIndex: number, raw: string): void {
    const mixingReserveBbl = Number(raw);
    if (!Number.isFinite(mixingReserveBbl) || mixingReserveBbl < 0) return;
    const stage = this.form().stages[stageIndex];
    this.setStage(stageIndex, { placements: stage.placements.map((placement, i) =>
      i === placementIndex ? { ...placement, mixingReserveBbl } : placement) });
  }

  setStepRate(stageIndex: number, stepId: string, raw: string): void {
    const rateBpm = Number(raw);
    if (!Number.isFinite(rateBpm)) return;
    this.updateSteps(stageIndex, steps => steps.map(step =>
      step.id === stepId && step.kind === 'pump' ? { ...step, rateBpm } : step));
  }

  moveStepBy(stageIndex: number, index: number, delta: number): void {
    this.updateSteps(stageIndex, steps => moveStep(steps, index, index + delta));
  }
  repeatStepAt(stageIndex: number, index: number): void {
    this.updateSteps(stageIndex, steps => repeatStep(steps, index, `${steps[index]?.id}-r${crypto.randomUUID()}`));
  }
  removeStepAt(stageIndex: number, index: number): void {
    this.updateSteps(stageIndex, steps => steps.filter((_, i) => i !== index));
    this.pruneSequenceNotes();
  }
  addPause(stageIndex: number): void {
    this.updateSteps(stageIndex, steps => [...steps,
      { id: `pause-${crypto.randomUUID()}`, kind: 'pause', durationMin: 10 }]);
  }
  addSpacer(stageIndex: number): void {
    // Volume calculado pelo simulador (PREFLUSH_DEFAULTS); o campo do passo aceita outro.
    this.updateSteps(stageIndex, steps => [{ id: `spacer-${crypto.randomUUID()}`, kind: 'pump',
      fluidId: 'spacer', rateBpm: 5, quantity: defaultPreflushQuantity('spacer') }, ...steps]);
  }
  setPauseDuration(stageIndex: number, stepId: string, raw: string): void {
    const durationMin = Number(raw);
    if (!Number.isFinite(durationMin) || durationMin < 0) return;
    this.updateSteps(stageIndex, steps => steps.map(step =>
      step.id === stepId && step.kind === 'pause' ? { ...step, durationMin } : step));
  }

  /** Composicao da pasta selecionada; aditivos seguem no catalogo compartilhado. */
  setRecipeField(field: 'density' | 'cementClass' | 'waterSplitFresh' | 'silica' | 'nacl' | 'surfaceTemp' | 'bhct' | 'bhst',
    raw: string): void {
    const id = this.selectedSlurryId();
    const current = this.form().fluids.find(f => f.id === id)?.recipe;
    if (!current) return;
    const numeric = Number(raw);
    if (field !== 'cementClass' && !Number.isFinite(numeric)) return;
    const recipe = field === 'cementClass'
      ? { ...current, cementClass: raw }
      : field === 'waterSplitFresh'
        ? { ...current, waterSplitFresh: numeric, waterSplitSea: Math.max(0, 100 - numeric) }
        : { ...current, [field]: raw === '' && ['bhct', 'bhst'].includes(field) ? null : numeric };
    this.patch({ fluids: this.form().fluids.map(f => f.id === id ? { ...f, recipe, ...(field === 'density' && f.propertySources.densityPpg?.source === 'estimated' ? { densityPpg: numeric } : {}) } : f) });
  }

  readonly selectedRecipe = computed(() =>
    this.form().fluids.find(f => f.id === this.selectedSlurryId())?.recipe ?? null);

  readonly baseRecipes = computed(() => {
    if (!this.context().phase || this.context().issues.some(issue => issue.level === 'error')) return [];
    return this.cementFluids().map(fluid => ({
      fluid,
      base: fluid.recipe ? this.slurry.calculateSlurryDesign(fluid.recipe).slurryRecipeResult?.baseRecipe : undefined,
    }));
  });

  recipeCode(row: CementSlurryRecipeRow, fluidId: string): string {
    return primaryRecipeCode(row, this.form().fluids.find(fluid => fluid.id === fluidId)?.recipe);
  }

  recipeQuantityText(row: CementSlurryRecipeRow, scaled = false): string {
    const quantity = primaryRecipeQuantity(row, scaled);
    return `${this.fmt(quantity.value, scaled ? 2 : 3)} ${quantity.unit}`;
  }

  recipeConcentrationText(row: CementSlurryRecipeRow): string {
    return row.concentration === 'base' ? row.concentrationUnit
      : `${typeof row.concentration === 'number' ? this.fmt(row.concentration, 4) : row.concentration} ${row.concentrationUnit}`;
  }

  addStage(): void {
    const stages = this.form().stages;
    const last = stages.at(-1)!;
    const id = `stage-${crypto.randomUUID()}`;
    // Nova porta acima da saída anterior; o motor recusa se não for.
    const outletMD = Math.round(last.outletMD / 2);
    const placementId = `placement-${crypto.randomUUID()}`;
    this.patch({ stages: [...stages, { id, name: `Estágio ${stages.length + 1}`,
      targetTocMD: 0, outletMD, seatMD: Math.max(1, outletMD - 30),
      placements: [{ id: placementId, fluidId: 'cement', topMD: 0, bottomMD: outletMD, mixingReserveBbl: 0 }],
      steps: [{ id: `${id}-open`, kind: 'tool-event', deviceId: `port-${id}`, action: 'open-stage' },
        ...defaultStageSteps(id, `port-${id}`, placementId, 5, this.form().targetKind === 'liner')] }] });
  }

  removeStage(index: number): void {
    if (index === 0 || this.form().stages.length <= 1) return;
    this.patch({ stages: this.form().stages.filter((_, i) => i !== index) });
    this.pruneSequenceNotes();
  }

  addSlurry(): void {
    const id = `cement-fluid-${crypto.randomUUID()}`;
    this.patch({ fluids: [...this.form().fluids, { ...fluid(id, 'cement', `Pasta ${this.cementFluids().length + 1}`, 15.8),
      recipe: { density: 15.8, cementClass: 'G', waterSplitFresh: 100, waterSplitSea: 0, silica: 0,
        nacl: 0, bhct: null, bhst: null, surfaceTemp: 25, additivos: [] } }] });
    this.selectSlurry(id);
  }

  removeFluid(id: string): void {
    const used = this.form().stages.some(stage => stage.placements.some(p => p.fluidId === id)
      || stage.steps.some(step => step.kind === 'pump' && step.fluidId === id));
    // Remover um fluido em uso deixaria o programa sem referência; o motor recusaria.
    if (used || this.form().initialFluidId === id) return;
    this.patch({ fluids: this.form().fluids.filter(f => f.id !== id) });
    if (this.selectedSlurryId() === id) this.selectSlurry(this.cementFluids()[0]?.id ?? '');
  }

  fluidInUse(id: string): boolean {
    return this.form().initialFluidId === id
      || this.form().stages.some(stage => stage.placements.some(p => p.fluidId === id)
        || stage.steps.some(step => step.kind === 'pump' && step.fluidId === id));
  }

  private updateSteps(stageIndex: number, update: (steps: PrimaryPumpStep[]) => PrimaryPumpStep[]): void {
    const stage = this.form().stages[stageIndex];
    if (stage) this.setStage(stageIndex, { steps: update(stage.steps) });
  }

  stepLabel(step: PrimaryPumpStep): string {
    if (step.kind === 'pause') return `Pausa de ${step.durationMin} min`;
    if (step.kind === 'tool-event') return `Evento: ${step.action}`;
    const name = this.form().fluids.find(f => f.id === step.fluidId)?.name ?? step.fluidId;
    const quantity = step.quantity;
    const computed = () => this.fmt(this.stepVolumeById(step.id)?.volumeBbl ?? null);
    const detail = quantity.source === 'entered' ? `${quantity.volumeBbl} bbl`
      : quantity.source === 'preflush' ? quantity.overrideBbl === null ? `${computed()} bbl calculados pelo simulador`
        : `${quantity.overrideBbl} bbl informados`
      : quantity.source === 'reserve-extra' ? `reserva extra de ${quantity.volumeBbl} bbl`
        : `${(quantity.fraction * 100).toFixed(0)}% do ${quantity.source === 'placement' ? 'intervalo' : 'deslocamento'}`;
    return `${name} — ${detail}`;
  }

  stepLabelById(id: string): string {
    const step = this.form().stages.flatMap(stage => stage.steps).find(entry => entry.id === id);
    return step ? this.stepLabel(step) : id;
  }

  fmt(value: number | null | undefined, digits = 2): string {
    return value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toFixed(digits);
  }

  ngOnDestroy(): void { this.pause(); }
}
