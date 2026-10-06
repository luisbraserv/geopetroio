import { OperationPhaseSelectorComponent } from '../../components/well/operation-phase-selector.component';
import { Well3dComponent } from '../../components/well/well-3d.component';
import { WorkString3d, workString3d } from '../../components/well/well-3d-layers';
import { PocoApi } from '../../models/poco.model';
import { PocoSelectorComponent } from '../../components/well/poco-selector.component';
﻿import { Component, OnInit, OnDestroy, signal, computed, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormArray, FormGroup } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { TuiAccordion } from '@taiga-ui/kit';
import { TuiExpand } from '@taiga-ui/core/components/expand';

import { SqtTemperatureResult } from '../../services/core-calculo.service';
import { TestsCalculoService } from '../../services/tests-calculo.service';
import { TampaoCalculoService } from '../../services/tampao-calculo.service';
import { ReverseCirculationCalculoService, ReverseCirculationResult } from '../../services/reverse-circulation-calculo.service';
import { RelatorioViewerComponent } from '../../components/relatorio/relatorio-viewer.component';
import { RelatorioCapaModalComponent, RelatorioCapaData, GraficoOperacionalTipo } from '../../components/relatorio/relatorio-capa-modal.component';
import { RelatorioBuilderService } from '../../components/relatorio/relatorio-builder.service';
import { RetiradaTubosReportService } from '../../services/retirada-tubos-report.service';
import { ConformidadeOperacionalReportService, FatorConformidade, VarreduraOverride } from '../../services/conformidade-operacional-report.service';
import { SimuladorBaseComponent } from '../simulador-base.component';
import { OperationChartsComponent } from '../../components/charts/operation-charts.component';
import { PrimaryWell2dComponent, type PrimaryWellVisualView } from '../../components/charts/primary-well-2d.component';
import { SchematicTampaoComponent } from '../../components/charts/schematic-tampao.component';
import { AditivoModalComponent } from '../../components/aditivos/aditivo-modal.component';
import { SimuladorStateModalComponent } from '../../components/state-modal/simulador-state-modal.component';

import { RheologyAdjustmentService, BASE_SLURRY_RHEOLOGY } from '../../services/rheology-adjustment.service';

import { PlugGeometry, TampaoInputs } from '../../models/tampao.model';
import { WellStructureFormComponent } from '../../components/well/well-structure-form.component';
import { DepthInputDirective } from '../../components/well/depth-input.directive';
import { WellTrajectoryFormComponent } from '../../components/well/well-trajectory-form.component';
import { createTrajectoryForm, trajectoryFromForm } from '../../models/well-trajectory.form';
import { WellSchematicComponent, WellSchematicState } from '../../components/well/well-schematic.component';
import { IntervalDescription, WellGeometryService } from '../../services/well-geometry.service';
import { OperationInterval, WellGeometry, WellGeometryIssue, WellOverlay } from '../../models/well-geometry.model';
import { WellPhaseFormValue, buildWellGeometry, emptyPhaseForm, exampleWellPhaseForms, geometryNumber, wellGeometryToForms } from '../../models/well-geometry.form';
import { SqueezeHydraulicSimulation } from '../../models/squeeze.model';
import type { PrimaryDiagnostic, PrimaryFrictionLevel } from '../../models/primary-cementing.model';
import { PrimaryProgramService } from '../../services/primary-program.service';
import { operationReportVisuals, type OperationCharts } from '../../services/operation-charts';
import { expandReportChartSelection, reportChartId, TAMPAO_REPORT_CHARTS } from '../../services/report-chart-selection';
import { PressureWindowInputsComponent, PRESSURE_WINDOW_FORM_DEFAULTS, setPressurePoints } from '../../components/pressure-window/pressure-window-inputs.component';
import { PressureWindowPanelComponent } from '../../components/pressure-window/pressure-window-panel.component';
import { buildCriticalPoints, criticalPointsTableSvg, wellElementOf, type OperationCriticalPoints } from '../../services/operation-critical-points';
import { gradientsAt } from '../../services/pressure-profile';
import { buildCronograma, svgDataUrl, tableReportSvg, ucaMilestones,
  type CronogramaRow, type CronogramaStep, type UcaMilestones } from '../../services/operation-tables';
import { buildWellVisualModel, primaryReportVisuals, type WellVisualOptions } from '../../services/primary-well-visuals';
import { buildTampaoOperationCharts, runTampaoEngine, tampaoLegacyHydraulics,
  TAMPAO_STEP_LABELS, type TampaoEngineInput, type TampaoEngineOverrides, type TampaoEngineResult } from '../../services/tampao-engine';
import { PRIMARY_REFERENCE_RHEOLOGY_SOURCE, primaryDefaultRheology } from '../../models/primary-default-rheology';
import { Diagnostic } from '../../models/pasta.model';
import { ThickeningResult, UCAResult } from '../../models/reologia.model';
import { ADITIVOS_CATALOGO, AditivoCatalogo, Aditivo, hydrateAditivosFromCatalog } from '../../models/aditivo.model';
import { CEMENT_CLASSES } from '../../models/constantes';
import { API_CASING_SIZES, API_TUBING_SIZES, ApiTubular } from '../../models/api-tubulares';

type TabId = 'recipe' | 'manualRecipe' | 'pressure' | 'schematic' | 'wellView';

/** O que o motor faz e o que ele não modela, para o relatório (SPEC squeeze-tampao §7). */
const TAMPAO_PREMISSAS: string[][] = [
  ['Motor', 'Cimentação primária com coluna de trabalho de extremidade aberta'],
  ['Transporte', 'Parcelas 1D com conservação de volume por fluido'],
  ['Queda livre', 'Vazão de saída pelo balanço do tubo em U, com vazio no topo da coluna'],
  ['Atrito', 'R3 §4-6 por fluido (n, k), como na primária: multiplicadores de interior e anular, sem standoff'],
  ['Reologia', 'Pasta com a referência da primária (R3 §12-7, pasta tail); fluidos aquosos pela viscosidade'],
  ['Equilíbrio', 'Drena depois do bombeio até a vazão cair abaixo de 0,001 bpm'],
  ['Retirada', 'Estática, até a extremidade do relatório de retirada de tubos'],
  ['Não modela', 'Mistura e contaminação nas interfaces'],
  ['Não modela', 'Gel e limite de escoamento: o fluido real para antes'],
  ['Não modela', 'Retorno pela coluna com o anular mais pesado (só avisa)'],
  ['Não modela', 'Circulação reversa depois da retirada'],
];

@Component({
  selector: 'app-simulador-tampao',
  standalone: true,
  imports: [Well3dComponent, PocoSelectorComponent, 
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RelatorioViewerComponent,
    RelatorioCapaModalComponent,
    OperationChartsComponent,
    PressureWindowInputsComponent,
    PressureWindowPanelComponent,
    PrimaryWell2dComponent,
    SchematicTampaoComponent,
    WellStructureFormComponent, OperationPhaseSelectorComponent,
    DepthInputDirective,
    WellTrajectoryFormComponent,
    WellSchematicComponent,
    AditivoModalComponent,
    SimuladorStateModalComponent,
    TuiButton,
    TuiIcon,
    ...TuiAccordion,
    TuiExpand,
  ],
  templateUrl: './simulador-tampao.component.html',
  styleUrl: './simulador-tampao.component.css',
})
export class SimuladorTampaoComponent extends SimuladorBaseComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  form!: FormGroup;
  activeTab: TabId = 'recipe';
  readonly tabs: { id: TabId; label: string }[] = [
    { id: 'recipe', label: '1. Receita da Simulação' },
    { id: 'manualRecipe', label: '2. Receita por Volume' },
    { id: 'pressure', label: '3. Simulação' },
    { id: 'schematic', label: '4. Esquemático' },
    { id: 'wellView', label: '5. Visualização do poço' },
  ];

  readonly cimentoClasses = Object.entries(CEMENT_CLASSES).map(([k, v]) => ({ value: k, label: v.label }));
  readonly catalogoAditivos: AditivoCatalogo[] = ADITIVOS_CATALOGO;
  readonly casingOptions: ApiTubular[] = API_CASING_SIZES;
  readonly tubingOptions: ApiTubular[] = API_TUBING_SIZES;
  readonly roughnessOptions = [
    { value: 'low', label: 'Tubo novo (liso)' },
    { value: 'medium', label: 'Tubo médio (uso típico) — fricção +15%' },
    { value: 'high', label: 'Fim de vida (corrosão/incrustação) — fricção +35%' },
  ];

  // Resultados da simulação
  plug: PlugGeometry | null = null;
  // Geometria que o esquemático (e o relatório) usam — segue o seletor de volume,
  // sem afetar "1. Receita da Simulação" (que sempre usa `plug` do simulador).
  schematicPlug: PlugGeometry | null = null;
  tampaoInputsSnapshot: TampaoInputs | null = null;
  tt: ThickeningResult | null = null;
  uca: UCAResult | null = null;
  ucaMarcos: UcaMilestones = ucaMilestones(null);
  /** Tampão no motor da primária (SPEC squeeze-tampao S4). */
  tampaoResult: TampaoEngineResult | null = null;
  /** O resultado do motor no formato que as métricas e o relatório de conformidade leem. */
  hydraulicSim: SqueezeHydraulicSimulation | null = null;
  operationCharts: OperationCharts | null = null;
  /** Janela operacional: o ponto crítico por etapa (SPEC janela-operacional §3.3). */
  criticalPoints: OperationCriticalPoints | null = null;
  engineDiagnostics: PrimaryDiagnostic[] = [];
  well2dViews: PrimaryWellVisualView[] = [];
  rheoDiags: Diagnostic[] = [];
  recipeDiags: Diagnostic[] = [];
  reverseCirculation: ReverseCirculationResult | null = null;
  freeWater = 0;
  geoFormula = '';

  // ── Estrutura do poço (fonte da verdade da geometria) ──
  wellGeometry: WellGeometry | null = null;
  wellIssues: WellGeometryIssue[] = [];
  operationIssues: WellGeometryIssue[] = [];
  intervalDescription: IntervalDescription | null = null;
  /** Overlays do tampão — posições JÁ calculadas pelos services, só para desenho. */
  wellOverlays: WellOverlay[] = [];
  /** Coluna do 3D nos diâmetros reais; objeto novo só quando a simulação refaz o desenho. */
  wellWorkString: WorkString3d | null = null;
  wellSchematicState: 'comTubing' | 'semTubing' = 'comTubing';
  readonly wellSchematicStates: WellSchematicState[] = [
    { id: 'comTubing', label: 'Com coluna' },
    { id: 'semTubing', label: 'Sem coluna' },
  ];

  // Cronograma (tabela, como na primária)
  cronograma: CronogramaRow[] = [];
  manualCronograma: CronogramaRow[] = [];

  // Sidebar toggle
  sidebarOpen = true;

  // Accordion sidebar
  sec1Open = false;
  sec2Open = false;
  sec3Open = false;
  sec4Open = false;
  sec5Open = false;
  sec6Open = false;
  sec8Open = false;
  sec10Open = false;
  secPocoOpen = false;
  secEstruturaOpen = true;
  secTampaoOpen = false;
  secSimuladorOpen = false;

  // Padrões capturados após buildForm() — usados ao carregar cenários antigos
  private formDefaults: Record<string, unknown> = {};
  private defaultManualVolumeBbl = 10;
  secDadosOpen = true;
  secCondOpen = false;
  secPesosOpen = false;
  secVazoesOpen = false;
  secGradOpen = false;
  secPausasOpen = false;
  secAlturaOpen = false;

  // Relatório
  relatorioVisivel = false;
  relatorioTitulo = '';
  relatorioConteudo = '';
  capaModalOpen = false;
  relatorioPrefill: Partial<RelatorioCapaData> | Record<string, any> = {};
  stateModalOpen = false;

  @ViewChild('stateModal') stateModal!: SimuladorStateModalComponent;
  @ViewChild('reportSchematics') reportSchematics?: SchematicTampaoComponent;

  protected readonly operacaoKey = 'tampao' as const;

  constructor(
    private testsCalc: TestsCalculoService,
    private tampaoCalc: TampaoCalculoService,
    private reverseCirculationCalc: ReverseCirculationCalculoService,
    private rheologyAdj: RheologyAdjustmentService,
    private relatorioBuilder: RelatorioBuilderService,
    private retiradaReport: RetiradaTubosReportService,
    private conformidadeReport: ConformidadeOperacionalReportService,
    private primaryProgram: PrimaryProgramService,
    private wellGeo: WellGeometryService,
    private cdr: ChangeDetectorRef,
  ) { super(); }

  ngOnInit(): void {
    this.dadosRelatorio = this.stateStore.loadDadosRelatorio('tampao');
    this.ensureSequenciaDefaults();
    this.buildForm();
    // Snapshot dos padrões do formulário: ao carregar um cenário salvo antes de
    // novos campos existirem, os ausentes voltam ao padrão (reprodução exata).
    const { additivos: _a, fases: _f, gradPoints: _g, ...defaults } = this.form.getRawValue();
    this.formDefaults = defaults;
    this.defaultManualVolumeBbl = this.manualVolumeBbl;
    this.restoreAditivos();
    this.simulate();
    this.form.valueChanges
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe({ next: () => { try { this.simulate(); } catch (e) { console.error('[tampao] simulate error:', e); } } });
    this.additivos.valueChanges
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => this.aditivosStore.save('tampao', this.additivos.getRawValue()));
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  // ── Estrutura do poço: fases ──────────────────────────────────────────

  get fases(): FormArray { return this.form.get('fases') as FormArray; }
  get trajectoryForm(): FormGroup { return this.form.get('trajectory') as FormGroup; }

  private phaseGroup(row: WellPhaseFormValue): FormGroup {
    return this.fb.group({
      id: [row.id], name: [row.name], type: [row.type],
      topMD: [row.topMD], bottomMD: [row.bottomMD],
      topTVD: [row.topTVD], bottomTVD: [row.bottomTVD],
      holeDiameterIn: [row.holeDiameterIn],
      casingOD: [row.casingOD], casingID: [row.casingID],
      shoeMD: [row.shoeMD], shoeTVD: [row.shoeTVD],
    });
  }

  /** Exemplo inicial da superfície até o poço aberto; dimensões editáveis por fase. */
  private defaultPhaseRows(): WellPhaseFormValue[] {
    return exampleWellPhaseForms('tampao');
  }

  addFase(): void {
    const previous = this.fases.length ? this.fases.at(this.fases.length - 1).value as WellPhaseFormValue : undefined;
    this.fases.push(this.phaseGroup(emptyPhaseForm(this.fases.length, previous)));
  }

  removeFase(index: number): void {
    if (this.fases.length > 1) this.fases.removeAt(index);
  }

  private setFases(rows: WellPhaseFormValue[]): void {
    while (this.fases.length) this.fases.removeAt(0);
    (rows.length ? rows : this.defaultPhaseRows()).forEach(row => this.fases.push(this.phaseGroup(row)));
  }

  onWellSchematicState(id: string): void {
    this.wellSchematicState = id === 'semTubing' ? 'semTubing' : 'comTubing';
    this.wellOverlays = this.buildWellOverlays(this.schematicPlug);
    this.cdr.markForCheck();
  }

  private buildForm(): void {
    this.form = this.fb.group({
      selectedPhaseId: [null as string | null],
      operacaoTopoMD: [1400], operacaoBaseMD: [1500],
      fases: this.fb.array(this.defaultPhaseRows().map(row => this.phaseGroup(row))),
      trajectory: createTrajectoryForm(this.fb),
      sectionStartMD: [1400], sectionEndMD: [1500],
      sectionStartTVD: [1400], sectionEndTVD: [1500],
      wellFinalMD: [1500], wellFinalTVD: [1500],
      holeID: [8.535], pipeOD: [3.500], pipeID: [2.764],
      backSpacerHeight: [100],
      hydroBalanceReference: ['stinger'],
      hydroBalanceManualMD: [1500],
      hydroBalanceTolerancePsi: [10],
      surfaceTemp: [80.6], geoGradient: [1.50],
      bhst: [{ value: null, disabled: true }],
      bhct: [{ value: null, disabled: true }],
      completionWeight: [8.4], displacementWeight: [8.4], mudWeightBack: [8.4], mudWeightFront: [8.4],
      fracGrad: [16.0], poreGrad: [9.0], gradUnit: [PRESSURE_WINDOW_FORM_DEFAULTS.gradUnit], gradMode: [PRESSURE_WINDOW_FORM_DEFAULTS.gradMode],
      margemAtencaoPpg: [PRESSURE_WINDOW_FORM_DEFAULTS.margemAtencaoPpg], margemAlertaPpg: [PRESSURE_WINDOW_FORM_DEFAULTS.margemAlertaPpg],
      margemCriticoPpg: [PRESSURE_WINDOW_FORM_DEFAULTS.margemCriticoPpg], gradPoints: this.fb.array([]),
      pumpRate: [3.0], pressaoOperacao: [2000],
      pause1: [0], pause2: [0], pause3: [0],
      density: [15.8], cementClass: ['G'],
      waterSplitFresh: [100], waterSplitSea: [0],
      silica: [35], nacl: [0],
      internalFrictionLevel: ['medium'], annularFrictionLevel: ['medium'],
      viscosidadeAguaCp: [1.0],
      // Não entra mais no cálculo (queda livre conservativa); fica para os cenários antigos.
      freeFallMaxFactor: [3.5],
      headCondition: ['vented-free-surface'],
      motorHP: [1000], pumpEff: [90],
      maxSurfacePressure: [5000], maxPumpRate: [8.0],
      additivos: this.fb.array([]),
    });
  }

  /**
   * Projeta a estrutura cadastrada nos campos legados de seção. Enquanto a
   * matemática antiga ainda lê `sectionStart/EndMD`, esses campos passam a ser
   * DERIVADOS da geometria + intervalo da operação — nunca mais digitados.
   */
  private syncWellGeometry(): { geometry: WellGeometry; interval: OperationInterval } | null {
    const raw = this.form.getRawValue();
    const fullGeometry = this.wellGeo.deriveTrajectoryTvd({
      ...buildWellGeometry(raw.wellFinalMD, raw.wellFinalTVD, (raw.fases ?? []) as WellPhaseFormValue[]),
      trajectory: trajectoryFromForm(raw.trajectory),
    });
    const context = this.operationContext.resolve(fullGeometry, raw.selectedPhaseId ?? null, 'tampao');
    const geometry = context.geometry;
    const interval: OperationInterval = {
      topMD: geometryNumber(raw.operacaoTopoMD),
      bottomMD: geometryNumber(raw.operacaoBaseMD),
    };

    this.wellGeometry = geometry;
    this.wellIssues = context.issues;
    this.operationIssues = [...this.wellGeo.validateInterval(geometry, interval, 'Tampão'),
      ...this.operationContext.validateInterval(context, interval, 'Tampão')];
    if (!this.wellGeo.hasErrors(this.wellIssues)) this.operationIssues.push(...this.wellGeo.validateWorkString(
      geometry, interval.bottomMD, geometryNumber(raw.pipeOD), geometryNumber(raw.pipeID),
    ));
    this.intervalDescription = null;

    if (this.wellGeo.hasErrors(this.wellIssues) || this.wellGeo.hasErrors(this.operationIssues)) return null;
    this.intervalDescription = this.wellGeo.describeInterval(geometry, interval);

    const baseSegment = this.intervalDescription.segments.at(-1);
    this.form.patchValue({
      sectionStartMD: interval.topMD,
      sectionEndMD: interval.bottomMD,
      sectionStartTVD: this.wellGeo.tryMdToTvd(geometry, interval.topMD) ?? interval.topMD,
      sectionEndTVD: this.wellGeo.tryMdToTvd(geometry, interval.bottomMD) ?? interval.bottomMD,
      // diâmetro interno na base do tampão — é o que a hidráulica legada consome
      ...(baseSegment ? { holeID: baseSegment.innerDiameterIn } : {}),
    }, { emitEvent: false });

    return { geometry, interval };
  }

  /**
   * Converte o resultado do cálculo em overlays. O desenho não recalcula nada:
   * só representa os topos que o TampaoCalculoService produziu.
   */
  private buildWellOverlays(plug: PlugGeometry | null): WellOverlay[] {
    if (!plug) return [];
    const semColuna = this.wellSchematicState === 'semTubing';
    const overlays: WellOverlay[] = semColuna
      ? [{ type: 'CEMENT', topMD: plug.topCementWithoutTubing, bottomMD: plug.pBase, label: 'Pasta de cimento', zone: 'full' }]
      : [
        { type: 'TUBING', topMD: 0, bottomMD: plug.pBase, label: 'Coluna de trabalho', zone: 'tubing' },
        { type: 'DISPLACEMENT', topMD: 0, bottomMD: plug.topBackSpacer, label: 'Fluido de deslocamento', zone: 'tubing' },
        { type: 'SPACER', topMD: plug.topBackSpacer, bottomMD: plug.topCementWithTubing, label: 'Espaçador de trás', zone: 'tubing' },
        { type: 'SPACER', topMD: plug.topFrontSpacer, bottomMD: plug.topCementWithTubing, label: 'Espaçador de frente', zone: 'annulus' },
        { type: 'CEMENT', topMD: plug.topCementWithTubing, bottomMD: plug.pBase, label: 'Pasta de cimento', zone: 'full' },
      ];
    return overlays.filter(o => o.bottomMD > o.topMD);
  }

  private invalidateSimulation(): void {
    this.clearCalculatedResults();
    this.plug = null;
    this.schematicPlug = null;
    this.tampaoInputsSnapshot = null;
    this.hydraulicSim = null;
    this.tampaoResult = null;
    this.operationCharts = null;
    this.criticalPoints = null;
    this.engineDiagnostics = [];
    this.well2dViews = [];
    this.reverseCirculation = null;
    this.wellOverlays = [];
    this.wellWorkString = null;
    this.tt = null;
    this.uca = null;
    this.ucaMarcos = ucaMilestones(null);
    this.freeWater = 0;
    this.geoFormula = '';
    this.cronograma = [];
    this.manualCronograma = [];
    this.recipeDiags = [];
    this.rheoDiags = [];
    this.relatorioVisivel = false;
    this.relatorioConteudo = '';
    this.capaModalOpen = false;
    this.form.patchValue({ bhst: null, bhct: null }, { emitEvent: false });
    this.cdr.markForCheck();
  }

  simulate(): void {
    this.engineeringIssues = [];
    const well = this.syncWellGeometry();
    if (!well) {
      this.invalidateSimulation();
      return;
    }
    const v = this.form.getRawValue();
    const inputs: TampaoInputs = v as TampaoInputs;

    // BHT
    const autoBht = this.coreCalc.calcBHT(v.surfaceTemp, v.geoGradient, v.sectionEndTVD);
    this.temperatureResult = this.resolveTemperatureResult(v, autoBht.bhst);
    this.form.patchValue({
      bhst: this.temperatureResult.bhstF,
      bhct: this.temperatureResult.sqtF,
    }, { emitEvent: false });
    this.geoFormula = `${autoBht.formula}\n${this.temperatureResult.formula}`;

    const vWithBHT = {
      ...v,
      geoGradient: this.temperatureResult.geoGradientFPer100Ft,
      bhct: this.temperatureResult.sqtF,
      bhst: this.temperatureResult.bhstF,
    };

    const aditivosRaw = hydrateAditivosFromCatalog((v.additivos || []) as Aditivo[]);

    this.tampaoInputsSnapshot = inputs;
    // Geometria base (volume do simulador) — referência exibida no seletor
    this.plug = this.tampaoCalc.calcPlug(inputs, null, well);
    this.simuladorVolumeBbl = this.plug.volCementTotal;
    // Geometria SÓ do esquemático/relatório: segue a escolha do seletor, de forma independente
    this.schematicPlug = (this.cementVolumeSource === 'receita' && this.manualVolumeBbl > 0)
      ? this.tampaoCalc.calcPlug(inputs, this.manualVolumeBbl, well)
      : this.plug;
    this.wellOverlays = this.buildWellOverlays(this.schematicPlug);
    this.wellWorkString = workString3d(v.pipeOD, v.pipeID);
    this.reverseCirculation = this.buildReverseCirculationResult(v);
    this.slurry = this.slurryCalc.calculateSlurryDesign({ ...vWithBHT, additivos: aditivosRaw } as any);
    this.recipe = this.slurryCalc.buildSlurryRecipe(this.plug.volCementTotal, this.slurry);
    this.computeManualRecipe();

    // Sem leituras Fann na tela: a reologia é a da pasta base com o efeito dos aditivos, e é
    // ela que alimenta o tempo de espessamento e o atrito do motor.
    this.rheologyResult = this.rheologyAdj.applyAdditiveRheologyEffects(BASE_SLURRY_RHEOLOGY, aditivosRaw);
    this.tt = this.testsCalc.simulateThickening(this.slurry, v.sectionEndTVD, this.estimatedThetaReadings());
    this.uca = this.testsCalc.simulateUCA(this.slurry, this.tt);
    this.ucaMarcos = ucaMilestones(this.uca);
    this.freeWater = this.testsCalc.estimateFreeWater(this.slurry);
    this.rheoDiags = this.testsCalc.rheoDiagnostics(this.slurry, this.tt, this.freeWater);


    this.runEngine(v);
    this.well2dViews = this.buildWell2dViews();

    this.updateEngineeringIssues();
    this.buildOpsPhases();
    this.buildManualRecipeOpsPhases();
    this.buildRecipeDiags();
    // App zoneless: simulate() roda em callback assíncrono (debounce do valueChanges).
    // markForCheck() agenda a detecção de mudança (e o ngOnChanges dos filhos, como o
    // esquemático) sem forçar CD síncrona — evitando reentrância no fluxo do modal.
    this.cdr.markForCheck();
  }

  /**
   * Tampão no motor da cimentação primária (SPEC squeeze-tampao §6): o dimensionamento
   * de hoje vira o programa da coluna de trabalho; o motor transporta, drena o tubo em U
   * até o equilíbrio e retira a coluna até a extremidade do relatório de retirada.
   */
  private tampaoEngineInput(v: any): TampaoEngineInput | null {
    if (!this.plug || !this.slurry || !this.wellGeometry) return null;
    const num = (value: unknown, fallback: number) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    // A mesma sequência do relatório de retirada: a extremidade do motor é a do relatório.
    const retirada = this.retiradaReport.buildCalculation(v, this.plug.topCementWithoutTubing,
      this.dadosRelatorio.sequenciaOperacional as unknown as RelatorioCapaData['sequenciaOperacional']);
    const levels: PrimaryFrictionLevel[] = ['low', 'medium', 'high'];
    return {
      geometry: this.wellGeometry, plug: this.plug,
      pipeODIn: num(v.pipeOD, 3.5), pipeIDIn: num(v.pipeID, 2.764),
      densities: {
        completion: num(v.completionWeight, 8.4), front: num(v.mudWeightFront, 8.4), back: num(v.mudWeightBack, 8.4),
        displacement: num(v.displacementWeight ?? v.completionWeight, 8.4), slurry: num(this.slurry.density ?? v.density, 15.8),
      },
      waterViscosityCp: num(v.viscosidadeAguaCp, 1),
      // Como na primária: a pasta entra com a reologia de referência (R3 §12-7, pasta tail).
      slurryRheology: { ...primaryDefaultRheology('cement'), origin: 'base', reference: PRIMARY_REFERENCE_RHEOLOGY_SOURCE },
      rates: { front: this.vazaoFluido('fluidoFrenteBpm'), slurry: this.vazaoFluido('pastaBpm'),
        back: this.vazaoFluido('fluidoAtrasBpm'), displacement: this.vazaoFluido('deslocamentoBpm') },
      pausesMin: [Math.max(0, num(v.pause1, 0)), Math.max(0, num(v.pause2, 0)), Math.max(0, num(v.pause3, 0))],
      friction: { internal: levels.includes(v.internalFrictionLevel) ? v.internalFrictionLevel : 'medium',
        annular: levels.includes(v.annularFrictionLevel) ? v.annularFrictionLevel : 'medium' },
      headCondition: v.headCondition === 'vented-free-surface' ? 'vented-free-surface' : 'closed-head',
      // Poro e fratura do perfil do cenário; os valores únicos são os da base do tampão.
      ...this.engineGradients(v, this.tampaoTvdOf()(this.plug.pBase)),
      equipment: { maxSurfacePressurePsi: num(v.maxSurfacePressure, 0) || null, maxPumpRateBpm: num(v.maxPumpRate, 0) || null,
        motorHp: num(v.motorHP, 0) || null, pumpEffPct: num(v.pumpEff, 0) || null },
      retirada: { tubeLengthM: retirada.tubeLengthM, sectionsAboveTop: retirada.sectionsAboveTop,
        tubesPerSection: retirada.tubesPerSection },
    };
  }

  private tampaoTvdOf(): (md: number) => number {
    return this.wellGeometry ? this.wellGeo.mdToTvdResolver(this.wellGeometry) : (md: number) => md;
  }

  private runTampao(v: any, override: TampaoEngineOverrides = {}): { input: TampaoEngineInput; result: TampaoEngineResult } | null {
    const input = this.tampaoEngineInput(v);
    if (!input) return null;
    try {
      return { input, result: runTampaoEngine(this.primaryProgram, input, this.tampaoTvdOf(), override) };
    } catch (e) {
      console.error('[tampao] engine error:', e);
      return null;
    }
  }

  private runEngine(v: any): void {
    const run = this.runTampao(v);
    const tvdOf = this.tampaoTvdOf();
    this.tampaoResult = run?.result ?? null;
    this.hydraulicSim = run ? tampaoLegacyHydraulics(run.result, run.input, tvdOf) : null;
    const phases = (this.wellGeometry?.phases ?? []).map(phase =>
      ({ id: phase.id, name: phase.name, topMD: phase.topMD, bottomMD: phase.bottomMD }));
    this.operationCharts = run ? buildTampaoOperationCharts(run.result, phases, v.selectedPhaseId ?? null, tvdOf) : null;
    this.criticalPoints = run ? buildCriticalPoints({ hydraulics: run.result.resolution.hydraulics, stepLabels: TAMPAO_STEP_LABELS,
      gradientsAt: tvd => gradientsAt(run.input, tvd), tvdOf, elementOf: wellElementOf(this.wellGeometry, []),
      classes: this.marginClasses(v) }) : null;
    const resolution = run?.result.resolution;
    this.engineDiagnostics = [
      ...(resolution?.geometry.issues ?? []).filter(issue => issue.level === 'error')
        .map(issue => ({ code: issue.code, message: issue.message, severity: 'error' as const, category: 'configuration' as const })),
      ...(resolution?.volumes.diagnostics ?? []), ...(resolution?.transport?.diagnostics ?? []),
      ...(resolution?.hydraulics?.diagnostics ?? []),
    ].filter(d => d.severity !== 'info' && d.code !== 'PRIMARY_RHEOLOGY_ESTIMATED');
  }

  /** n e k da pasta que o motor usa: a referência da primária (R3 §12-7). */
  slurryN(): number | null {
    return this.tampaoResult?.primary.fluids.find(fluid => fluid.id === 'slurry')?.rheology.n ?? null;
  }
  slurryK(): number | null {
    return this.tampaoResult?.primary.fluids.find(fluid => fluid.id === 'slurry')?.rheology.kLbfSnFt2 ?? null;
  }

  /** Re-simula o tampão no motor com sobreposições (varredura de risco/sensibilidade). */
  private reSimulateHidraulica(o: VarreduraOverride): SqueezeHydraulicSimulation | null {
    const run = this.runTampao(this.form.getRawValue(), o);
    return run ? tampaoLegacyHydraulics(run.result, run.input, this.tampaoTvdOf()) : null;
  }

  /** Perfil e planta da primária, sem caliper, com o tampão depois da retirada (SPEC §5.4). */
  private buildWell2dViews(): PrimaryWellVisualView[] {
    const geometry = this.wellGeometry;
    const plug = this.schematicPlug ?? this.plug;
    if (!geometry || !plug) return [];
    const options = (interval?: WellVisualOptions['interval']): WellVisualOptions => ({
      caliper: null, showCaliper: false, interval, tubulars: [],
      cement: [{ topMD: plug.topCementWithoutTubing, bottomMD: plug.pBase, location: 'wellbore' }],
      markers: [{ md: plug.topCementWithoutTubing, label: 'Topo do tampão' }, { md: plug.pBase, label: 'Base do tampão' }],
    });
    const views: PrimaryWellVisualView[] = [];
    try {
      views.push({ id: 'all', name: 'Todas as fases', model: buildWellVisualModel(geometry, options()) });
    } catch { return []; }
    for (const phase of geometry.phases) {
      try {
        views.push({ id: phase.id, name: phase.name, model: buildWellVisualModel(geometry,
          options({ phaseId: phase.id, topMD: phase.topMD, bottomMD: phase.bottomMD })) });
      } catch { /* A vista completa continua disponível se apenas uma fase for inválida. */ }
    }
    return views;
  }

  private buildReverseCirculationResult(v: any): ReverseCirculationResult | null {
    try {
      return this.reverseCirculationCalc.calculateReverseCirculation({
        tubingIdIn: Number(v.pipeID),
        openEndDepthM: Number(v.sectionEndMD),
      });
    } catch {
      return null;
    }
  }

  private buildReverseCirculationAfterPullingResult(
    v: any,
    topoCimentoRetiradaM: number | string,
    sequencia?: RelatorioCapaData['sequenciaOperacional'],
  ): ReverseCirculationResult | null {
    const openEndDepthM = this.calculateOpenEndDepthAfterPulling(v, topoCimentoRetiradaM, sequencia);
    try {
      return this.reverseCirculationCalc.calculateReverseCirculation({
        tubingIdIn: Number(v.pipeID),
        openEndDepthM,
      });
    } catch {
      return this.reverseCirculation;
    }
  }

  private calculateOpenEndDepthAfterPulling(
    v: any,
    topoCimentoRetiradaM: number | string,
    sequencia?: RelatorioCapaData['sequenciaOperacional'],
  ): number {
    return this.retiradaReport.buildCalculation(v, topoCimentoRetiradaM, sequencia).openEndDepthM;
  }

  private getReportTemperature(v: any): SqtTemperatureResult {
    const depthTVD = Number(v.sectionEndTVD);
    const automaticBhst = this.coreCalc.calcBHT(v.surfaceTemp, v.geoGradient, depthTVD).bhst;
    const manualOk = this.manualBhstValue != null && Number.isFinite(this.manualBhstValue) && this.manualBhstValue > 0;
    // A fonte da temperatura no relatório segue o seletor da sidebar:
    // 'manual' usa a BHST informada (cai no automático se não houver).
    return this.reportTemperatureMode === 'manual' && manualOk
      ? this.coreCalc.calcSqtFromBhst(this.manualBhstValue!, this.manualBhstUnit, depthTVD, 'manual')
      : this.coreCalc.calcSqtFromBhst(automaticBhst, 'F', depthTVD, 'automatica');
  }

  pastaBombeioVolumeBbl(): number {
    const plug = this.schematicPlug ?? this.plug;
    return Number(plug?.workVolumeBbl ?? plug?.volCementTotal) || 0;
  }

  /** Passos de bombeio do tampão com o volume de pasta dado; o equilíbrio do tubo em U vem do motor. */
  private cronogramaSteps(slurryBbl: number): CronogramaStep[] {
    if (!this.plug) return [];
    const v = this.form.getRawValue();
    const plug = this.plug;
    const pump = (label: string, fluid: string, volumeBbl: number, rateBpm: number): CronogramaStep =>
      ({ label, fluid, volumeBbl: Math.max(0, volumeBbl || 0), rateBpm,
        durationMin: rateBpm > 0 ? Math.max(0, volumeBbl || 0) / rateBpm : 0 });
    const pause = (label: string, minutes: unknown): CronogramaStep =>
      ({ label, fluid: null, volumeBbl: null, rateBpm: null, durationMin: Math.max(0, Number(minutes) || 0) });
    const slurryDensity = Number(this.slurry?.density ?? v.density);
    const settleMin = this.tampaoResult?.summary.settleMin ?? 0;
    return [
      pump('Água à frente', `Água ${this.fmt(v.mudWeightFront, 1)} ppg`, plug.frontPhysicalVolumeBbl, this.vazaoFluido('fluidoFrenteBpm')),
      pause('Pausa 1', v.pause1),
      pump('Pasta', Number.isFinite(slurryDensity) ? `Pasta ${this.fmt(slurryDensity, 1)} ppg` : 'Pasta', slurryBbl, this.vazaoFluido('pastaBpm')),
      pause('Pausa 2', v.pause2),
      pump('Água atrás', `Água ${this.fmt(v.mudWeightBack, 1)} ppg`, plug.backPhysicalVolumeBbl, this.vazaoFluido('fluidoAtrasBpm')),
      pause('Pausa 3', v.pause3),
      pump('Deslocamento', `Deslocamento ${this.fmt(v.displacementWeight ?? v.completionWeight, 1)} ppg`, plug.volDisplacement, this.vazaoFluido('deslocamentoBpm')),
      { label: 'Equilíbrio do tubo em U', fluid: null, volumeBbl: null, rateBpm: null, durationMin: settleMin },
    ];
  }

  private buildOpsPhases(): void {
    if (!this.plug || !this.slurry || !this.tt) return;
    this.cronograma = buildCronograma(this.cronogramaSteps(this.pastaBombeioVolumeBbl()));
  }

  protected buildManualRecipeOpsPhases(): void {
    if (!this.plug || !this.manualRecipeResult) {
      this.manualCronograma = [];
      return;
    }
    const manualSlurryBbl = Number(this.manualRecipeResult.targetSlurryVolumeBbl) || this.manualVolumeBbl || this.plug.volCementTotal;
    this.manualCronograma = buildCronograma(this.cronogramaSteps(manualSlurryBbl));
  }

  /** Tempo total do cronograma, que as tabelas comparam ao TT 50 Bc. */
  cronogramaTotalMin(rows: CronogramaRow[]): number {
    return rows.at(-1)?.accumulatedMin ?? 0;
  }

  private buildRecipeDiags(): void {
    if (!this.plug || !this.slurry || !this.tt) return;
    const v = this.form.getRawValue();
    const diags: Diagnostic[] = [];
    const pumpTime = this.cronogramaTotalMin(this.cronograma);
    const tt50min = this.tt.t50 * 60;
    if (pumpTime > tt50min * 0.85) diags.push({ text: 'Tempo de bombeio próximo do TT 50 Bc', cls: 'danger' });
    else if (pumpTime > tt50min * 0.70) diags.push({ text: 'Margem de TT moderada', cls: 'warn' });
    else diags.push({ text: 'Margem de TT confortável', cls: 'ok' });
    if (this.plug.volCementTotal < 0.5) diags.push({ text: 'Volume de pasta muito pequeno', cls: 'warn' });
    this.recipeDiags = diags;
  }

  setTab(tab: TabId): void { this.activeTab = tab; }

  gerarCalculoRetiradaTubos(): void {
    this.simulate();
    if (!this.plug) return;
    if (!this.plug) this.simulate();
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.plug?.topCementWithoutTubing ?? v.sectionStartMD;
    this.retiradaReport.abrirRetirada({ operacao: 'TAMPÃO', v, dadosRelatorio: this.dadosRelatorio, faseOperacao: this.phaseReportLabel, topoCimentoRetiradaM });
  }

  gerarCalculoCirculacaoReversa(): void {
    this.simulate();
    if (!this.plug) return;
    if (!this.plug) this.simulate();
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.plug?.topCementWithoutTubing ?? v.sectionStartMD;
    this.retiradaReport.abrirCirculacaoReversa({ operacao: 'TAMPÃO', v, dadosRelatorio: this.dadosRelatorio, faseOperacao: this.phaseReportLabel, topoCimentoRetiradaM, tubingIdIn: Number(v.pipeID) });
  }

  gerarRelatorioConformidade(fator: FatorConformidade): void {
    this.simulate();
    if (!this.plug) return;
    if (!this.hydraulicSim || !this.plug) return;
    const plug = this.plug;
    this.conformidadeReport.abrir({
      operacao: 'TAMPÃO',
      fator,
      sim: this.hydraulicSim,
      dadosRelatorio: this.dadosRelatorio,
      v: this.formInPpg(this.form.getRawValue(), this.tampaoTvdOf()(plug.pBase)),
      placement: {
        cementTopMD: plug.topCementWithoutTubing,
        cementBaseMD: plug.pBase,
        capBblM: plug.cementPhysicalCapacityBblM,
        displacementBbl: plug.volDisplacement,
        targetTopMD: plug.topCementWithoutTubing,
        predictedTopMD: this.tampaoResult?.summary.cementTopAfterPullMD ?? undefined,
      },
      reSimulate: (o) => this.reSimulateHidraulica(o),
      motor: 'primaria',
      predictTopMD: factor => this.runTampao(this.form.getRawValue(), { displacementFactor: factor })
        ?.result.summary.cementTopAfterPullMD ?? null,
    });
  }

  openStateModal(): void {
    this.stateModal?.setCurrentForm({
      _poco: this.poco,
      ...this.form.getRawValue(),
      _dadosRelatorio: this.dadosRelatorio,
      _manualVolumeBbl: this.manualVolumeBbl,
      _manualYieldFt3: this.manualYieldFt3,
      _manualFacGpc: this.manualFacGpc,
      _manualFamGpc: this.manualFamGpc,
      _pastaParametrosSource: this.pastaParametrosSource,
      _manualBhstValue: this.manualBhstValue,
      _manualBhstUnit: this.manualBhstUnit,
      _cementVolumeSource: this.cementVolumeSource,
      _reportTemperatureMode: this.reportTemperatureMode,
    });
    this.stateModalOpen = true;
  }

  closeStateModal(): void { this.stateModalOpen = false; }

  onCarregarEstado(formValue: Record<string, unknown>): void {
    this.poco = (formValue['_poco'] as PocoApi | null) ?? null;
    // Mantém holeID/pipeOD/pipeID em `rest` para que a geometria (poço/coluna) também
    // seja restaurada ao carregar o cenário.
    const { additivos, fases, gradPoints,
            _dadosRelatorio, _manualVolumeBbl, _manualYieldFt3, _manualFacGpc, _manualFamGpc,
            _pastaParametrosSource, _manualBhstValue, _manualBhstUnit, _cementVolumeSource, _reportTemperatureMode,
            ...rest } = formValue as any;
    // Padrões primeiro: campos que não existiam quando o cenário foi salvo
    // não herdam o valor da tela — voltam ao padrão do simulador.
    // Cenários antigos usavam completionWeight também como fluido de deslocamento.
    if (rest.displacementWeight == null && rest.completionWeight != null) rest.displacementWeight = rest.completionWeight;
    // Cenário salvo antes: o estado do tubo vale para o interior e para o anular.
    if (rest.roughness != null && rest.internalFrictionLevel == null) {
      rest.internalFrictionLevel = rest.roughness; rest.annularFrictionLevel = rest.roughness;
    }
    this.form.patchValue(this.formDefaults, { emitEvent: false });
    this.form.patchValue({ ...rest, selectedPhaseId: rest.selectedPhaseId ?? null }, { emitEvent: false });
    this.form.setControl('trajectory', createTrajectoryForm(this.fb, rest.trajectory), { emitEvent: false });
    setPressurePoints(this.form, this.fb, gradPoints);
    // Cenário salvo antes das fases: a estrutura é migrada dos campos legados
    // de seção (adapter), e o intervalo da operação herda o antigo tampão.
    this.setFases(Array.isArray(fases) && fases.length
      ? fases as WellPhaseFormValue[]
      : wellGeometryToForms(this.wellGeo.legacySectionToWellGeometry({
        sectionStartMD: this.toNumber(rest.sectionStartMD),
        sectionEndMD: this.toNumber(rest.sectionEndMD),
        sectionStartTVD: this.toNumber(rest.sectionStartTVD),
        sectionEndTVD: this.toNumber(rest.sectionEndTVD),
        wellFinalMD: this.toNumber(rest.wellFinalMD),
        wellFinalTVD: this.toNumber(rest.wellFinalTVD),
        holeDiameterIn: this.toNumber(rest.holeID),
      })));
    if (rest.operacaoTopoMD == null || rest.operacaoBaseMD == null) {
      this.form.patchValue({
        operacaoTopoMD: this.toNumber(rest.sectionStartMD),
        operacaoBaseMD: this.toNumber(rest.sectionEndMD),
      }, { emitEvent: false });
    }
    if (_dadosRelatorio) {
      this.dadosRelatorio = _dadosRelatorio;
      this.ensureSequenciaDefaults();
      this.saveDadosRelatorio();
    }
    this.manualVolumeBbl = _manualVolumeBbl != null ? +_manualVolumeBbl : this.defaultManualVolumeBbl;
    this.manualYieldFt3 = _manualYieldFt3 != null ? +_manualYieldFt3 : null;
    this.manualFacGpc = _manualFacGpc != null ? +_manualFacGpc : null;
    this.manualFamGpc = _manualFamGpc != null ? +_manualFamGpc : null;
    this.pastaParametrosSource = _pastaParametrosSource === 'manual' ? 'manual' : 'simulador';
    this.manualBhstValue = _manualBhstValue != null ? +_manualBhstValue : null;
    this.manualBhstUnit = _manualBhstUnit === 'C' ? 'C' : 'F';
    this.cementVolumeSource = _cementVolumeSource === 'receita' ? 'receita' : 'simulador';
    this.reportTemperatureMode = _reportTemperatureMode === 'automatica' ? 'automatica' : 'manual';
    while (this.additivos.length) this.additivos.removeAt(0);
    if (Array.isArray(additivos)) {
      additivos.forEach((d: any) => this.additivos.push(this.createAditivoGroup(d)));
    }
    if (this.poco) this.dadosRelatorio.poco = this.poco.nome;
    this.simulate();
  }

  onTubingSelect(idx: string): void {
    if (idx === '') return;
    const t = this.tubingOptions[+idx];
    if (!t) return;
    this.form.patchValue({ pipeOD: t.odIn, pipeID: t.idIn });
  }

  openCapaModal(): void {
    this.simulate();
    if (!this.plug) return;
    const v = this.form.getRawValue();
    const tipoReceita = this.dadosRelatorio.tipoReceitaRelatorio ?? 'volume';
    const vazoesBombeio = this.mergeVazoesBombeio(this.dadosRelatorio.vazoesBombeio as RelatorioCapaData['vazoesBombeio']);
    const reportTemperature = this.getReportTemperature(v);
    const reportPlug = this.schematicPlug ?? this.plug;
    this.relatorioPrefill = {
      ...this.dadosRelatorio,
      faseOperacao: this.phaseReportLabel,
      tipoReceitaRelatorio: tipoReceita,
      vazoesBombeio,
      calculoTampaoPor: this.cementVolumeSource === 'receita' ? 'volume' : 'altura',
      inicioTampao: String(v.sectionStartMD ?? ''),
      fimTampao: String(v.sectionEndMD ?? ''),
      topoCimento: String(reportPlug?.topCementWithoutTubing ?? v.sectionStartMD ?? ''),
      baseTampao: String(reportPlug?.pBase ?? v.sectionEndMD ?? ''),
      geoGradient: v.geoGradient,
      bhst: reportTemperature.bhstF,
      bhct: reportTemperature.sqtF,
      bombeioRows: this.buildRelatorioBombeioRows(v, tipoReceita, vazoesBombeio),
      receitaRows: this.buildRelatorioReceitaRows(),
      pastaResumo: this.buildRelatorioPastaResumo(tipoReceita),
    };
    this.capaModalOpen = true;
  }

  onCapaGerada(data: RelatorioCapaData): void {
    data = { ...data, faseOperacao: this.phaseReportLabel };
    this.simulate();
    if (!this.plug) return;
    const v = this.form.getRawValue();
    const tipoReceita = data.tipoReceitaRelatorio ?? 'volume';
    const reportTemperature = this.getReportTemperature(v);
    const vazoesBombeio = this.mergeVazoesBombeio(data.vazoesBombeio);
    const pipeODFormatted = v.pipeOD ? this.fmtInches(v.pipeOD) : '';
    const topoCimentoRetiradaM = this.plug?.topCementWithoutTubing ?? v.sectionStartMD;
    const reverseCircBbl = this.buildReverseCirculationAfterPullingResult(
      v,
      topoCimentoRetiradaM,
      data.sequenciaOperacional,
    )?.reverseCirculationVolumeBbl ?? this.reverseCirculation?.reverseCirculationVolumeBbl ?? 0;
    const sequenciaOperacional = {
      ...data.sequenciaOperacional,
      colunaTrabalho: pipeODFormatted || data.sequenciaOperacional?.colunaTrabalho || '',
      colunaProfundidadeM: v.sectionEndMD ?? data.sequenciaOperacional?.colunaProfundidadeM ?? '',
      topoCimentoRetiradaM,
      testeInjetividadeDefinidoPor: data.cliente || data.origem || 'ORIGEM',
      pressaoTesteLinhasPsi: (Number(v.pressaoOperacao) || 2000) + 1000,
      volumeCirculacaoReversaBbl: reverseCircBbl,
    };
    this.persistDadosRelatorioFromCapa(data, vazoesBombeio, sequenciaOperacional);
    this.saveDadosRelatorio();
    const reportFormSnapshot = JSON.stringify(this.form.getRawValue());
    this.captureGraficosImages(data.graficosOperacionaisSelecionados ?? []).then(graficosImages => {
      // A captura é assíncrona; mudanças no formulário invalidam este relatório.
      if (!this.plug || JSON.stringify(this.form.getRawValue()) !== reportFormSnapshot) return;
      const reportPlug = this.schematicPlug ?? this.plug;
      const reportHtml = this.relatorioBuilder.buildCapa({
        ...data,
        vazoesBombeio,
        zonaIsolarNome: data.zonaIsolarNome || this.dadosRelatorio.zonaIsolarNome,
        zonaIsolarTopo: String(v.sectionStartTVD ?? ''),
        zonaIsolarBase: String(v.sectionEndTVD ?? ''),
        calculoTampaoPor: this.cementVolumeSource === 'receita' ? 'volume' : 'altura',
        inicioTampao: String(v.sectionStartMD ?? ''),
        fimTampao: String(v.sectionEndMD ?? ''),
        topoCimento: String(reportPlug?.topCementWithoutTubing ?? v.sectionStartMD ?? ''),
        baseTampao: String(reportPlug?.pBase ?? v.sectionEndMD ?? ''),
        revestimento: this.formatCasing(v.holeID),
        geoGradient: v.geoGradient,
        bhst: reportTemperature.bhstF,
        bhct: reportTemperature.sqtF,
        bombeioRows: this.buildRelatorioBombeioRows(v, tipoReceita, vazoesBombeio),
        receitaRows: this.buildRelatorioReceitaRows(),
        pastaResumo: this.buildRelatorioPastaResumo(tipoReceita),
        esquematicoImages: this.reportSchematics?.getReportImages(data.esquematicosSelecionados),
        graficosOperacionaisImages: graficosImages,
        sequenciaOperacional,
      });
      this.relatorioBuilder.openInNewTab(reportHtml);
    });
  }

  private buildRelatorioReceitaRows(): RelatorioCapaData['receitaRows'] {
    return this.buildRelatorioReceitaRowsPorVolume(this.pastaBombeioVolumeBbl());
  }

  private buildRelatorioBombeioRows(
    v: any,
    _tipoReceita?: string,
    vazoes?: RelatorioCapaData['vazoesBombeio'],
  ): RelatorioCapaData['bombeioRows'] {
    const pumpRate = Number(v.pumpRate) || 0;
    const vazao = (valor: unknown): number => {
      const n = Number(String(valor ?? '').replace(',', '.'));
      return Number.isFinite(n) && n > 0 ? n : pumpRate;
    };
    const slurryDensity = Number(this.slurry?.density ?? v.density);
    const pastaLabel = Number.isFinite(slurryDensity) ? `Pasta ${this.fmt(slurryDensity, 1)} ppg` : 'Pasta';
    const plug = this.schematicPlug ?? this.plug;
    const slurryVolBbl = this.pastaBombeioVolumeBbl();
    return [
      { fluido: 'Água a frente', volumeBbl: plug?.volWashTotal ?? 0, vazaoBpm: vazao(vazoes?.fluidoFrenteBpm), densidadePpg: v.mudWeightFront },
      { fluido: pastaLabel, volumeBbl: slurryVolBbl, vazaoBpm: vazao(vazoes?.pastaBpm), densidadePpg: slurryDensity },
      { fluido: 'Água atrás', volumeBbl: plug?.volBackSpacer ?? 0, vazaoBpm: vazao(vazoes?.fluidoAtrasBpm), densidadePpg: v.mudWeightBack },
      { fluido: 'Deslocamento', volumeBbl: plug?.volDisplacement ?? 0, vazaoBpm: vazao(vazoes?.deslocamentoBpm), densidadePpg: v.displacementWeight ?? v.completionWeight },
    ];
  }

  /** Um checkbox por gráfico na capa do relatório. */
  readonly reportChartOptions = TAMPAO_REPORT_CHARTS;

  /**
   * Gráficos operacionais do relatório em SVG (SPEC squeeze-tampao §7), um a um, na ordem do
   * catálogo. As seleções antigas valem por grupo: `pressao` → premissas, os gráficos da
   * primária, perfil e planta; `cronograma` → as tabelas do cronograma e dos marcos de UCA.
   */
  private async captureGraficosImages(selecionados: GraficoOperacionalTipo[]): Promise<{ label: string; imagem: string }[]> {
    const chosen = new Set(expandReportChartSelection(selecionados, TAMPAO_REPORT_CHARTS));
    const result: { label: string; imagem: string }[] = [];
    if (chosen.has('cronograma') && this.cronograma.length) {
      const total = this.cronogramaTotalMin(this.cronograma);
      const tt50 = this.tt ? this.tt.t50 * 60 : null;
      result.push({ label: 'Cronograma operacional', imagem: svgDataUrl(tableReportSvg('Cronograma operacional',
        ['Passo', 'Fluido', 'Volume (bbl)', 'Vazão (bpm)', 'Duração (min)', 'Acumulado (min)'],
        this.cronograma.map(row => [row.label, row.fluid ?? '—', row.volumeBbl === null ? '—' : this.fmt(row.volumeBbl),
          row.rateBpm === null ? '—' : this.fmt(row.rateBpm, 1), this.fmt(row.durationMin, 1), this.fmt(row.accumulatedMin, 1)]),
        [`Tempo total ${this.fmt(total, 1)} min` + (tt50 !== null ? ` | TT 50 Bc ${this.fmt(tt50, 0)} min | margem ${this.fmt(tt50 - total, 0)} min` : ''),
          'Durações do motor: o equilíbrio do tubo em U é o tempo que a coluna drenou depois do bombeio.'])) });
    }
    if (chosen.has('uca') && this.cronograma.length)
      result.push({ label: 'Resistência à compressão (UCA)', imagem: svgDataUrl(tableReportSvg('Marcos de resistência (UCA)',
        ['Marco', 'Valor'], this.ucaRows(), ['Lidos da curva de UCA estimada da pasta.'])) });
    if (!this.operationCharts) return result;
    if (chosen.has('premissas'))
      result.push({ label: 'Premissas da simulação', imagem: svgDataUrl(tableReportSvg('Premissas da simulação hidráulica',
        ['Item', 'Tratamento'], TAMPAO_PREMISSAS)) });
    if (chosen.has('janela-operacional') && this.criticalPoints)
      result.push({ label: 'Janela operacional - ponto crítico', imagem: svgDataUrl(criticalPointsTableSvg(this.criticalPoints)) });
    const phaseId = this.form.getRawValue().selectedPhaseId ?? 'all';
    for (const visual of operationReportVisuals(this.operationCharts, phaseId))
      if (chosen.has(reportChartId(visual.id))) result.push({ label: visual.title, imagem: svgDataUrl(visual.svg) });
    // Perfil e planta da fase da operação, sem caliper (SPEC §5.4).
    const view = this.well2dViews.find(entry => entry.id === phaseId) ?? this.well2dViews[0];
    if (view)
      for (const visual of primaryReportVisuals(view.model, view.id === 'all' ? undefined : { id: view.id, name: view.name }))
        if (chosen.has(reportChartId(visual.id))) result.push({ label: visual.title, imagem: svgDataUrl(visual.svg) });
    return result;
  }

  /** Marcos de UCA para a tela e o relatório. */
  ucaRows(): string[][] {
    const hours = (value: number | null) => value === null ? 'não alcançado em 72 h' : this.fmtTime(value);
    const psi = (value: number | null) => value === null ? '—' : `${this.fmt(value, 0)} psi`;
    return [
      ['Tempo até 50 psi', hours(this.ucaMarcos.t50PsiH)],
      ['Tempo até 500 psi', hours(this.ucaMarcos.t500PsiH)],
      ['Resistência em 12 h', psi(this.ucaMarcos.strength12hPsi)],
      ['Resistência em 24 h', psi(this.ucaMarcos.strength24hPsi)],
    ];
  }

  private formatCasing(id: unknown): string {
    const n = Number(id);
    if (!Number.isFinite(n)) return '';
    const casing = this.findCasingOption(id);
    const odText = casing ? `OD ${this.fmtInches(casing.odIn, ' in')}` : '';
    const weightText = casing ? `Peso ${this.fmt(casing.weightLbFt, 2)} lb/pé` : '';
    return [odText, weightText, `ID ${this.fmt(n, 3)} in`].filter(Boolean).join(' | ');
  }

  private findCasingOption(id: unknown): ApiTubular | undefined {
    const idNum = Number(id);
    if (!Number.isFinite(idNum)) return undefined;
    return this.casingOptions.find(c => Math.abs(c.idIn - idNum) < 0.0005);
  }

  abrirRelatorioReceita(): void {
    this.simulate();
    if (!this.plug) return;
    if (!this.plug || !this.slurry || !this.recipe) return;
    const html = this.buildRelatorioReceita();
    this.relatorioTitulo = 'Cálculo da Receita — Tampão Balanceado';
    this.relatorioConteudo = html;
    this.relatorioVisivel = true;
  }

  private buildRelatorioReceita(): string {
    const p = this.plug!, sl = this.slurry!, rec = this.recipe!;
    const rows = rec.recipeItems.map(i => `<tr><td>${i.name}</td><td>${i.conc}</td><td>${this.fmt(i.per, 4)}</td><td>${this.fmt(i.total, 2)}</td><td>${i.unit}</td></tr>`).join('');
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Receita</title>
    <style>body{font-family:Arial,sans-serif;padding:24px;font-size:13px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background:#f1f5f9}h2{color:#1e293b}</style></head>
    <body><h2>Tampão Balanceado — Cálculo da Receita</h2>
    <p><b>Volume total de pasta:</b> ${this.fmt(p.volCementTotal)} bbl | <b>Sacos:</b> ${rec.sacks} sk | <b>Densidade:</b> ${this.fmt(sl.density)} ppg | <b>Rendimento:</b> ${this.fmt(sl.yieldLPerSk)} L/sk</p>
    <p><b>Nota de reologia/aditivos:</b> efeitos baixo/medio/alto sao estimativas operacionais por familia quimica e concentracao. Nao substituem ensaio de laboratorio/API.</p>
    <table><thead><tr><th>Item</th><th>Concentração</th><th>Por kg cem.</th><th>Total</th><th>Unidade</th></tr></thead><tbody>${rows}</tbody></table>
    </body></html>`;
  }

  resetForm(): void {
    this.form.patchValue({
      sectionStartMD: 1400, sectionEndMD: 1500, sectionStartTVD: 1400, sectionEndTVD: 1500,
      wellFinalMD: 1500, wellFinalTVD: 1500, holeID: 8.535, pipeOD: 3.500, pipeID: 2.764,
      backSpacerHeight: 100, surfaceTemp: 80.6, geoGradient: 1.50,
      completionWeight: 8.4, displacementWeight: 8.4, mudWeightBack: 8.4, mudWeightFront: 8.4,
      fracGrad: 16.0, poreGrad: 9.0, pumpRate: 3.0, density: 15.8, cementClass: 'G',
      waterSplitFresh: 100, waterSplitSea: 0, silica: 35, nacl: 0,
      internalFrictionLevel: 'medium', annularFrictionLevel: 'medium',
      viscosidadeAguaCp: 1.0, freeFallMaxFactor: 3.5, headCondition: 'vented-free-surface',
      motorHP: 1000, pumpEff: 90, maxSurfacePressure: 5000, maxPumpRate: 8.0,
    });
    while (this.additivos.length) this.additivos.removeAt(0);
  }
}
