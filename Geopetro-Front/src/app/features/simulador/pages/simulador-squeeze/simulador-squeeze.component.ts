import { OperationPhaseSelectorComponent } from '../../components/well/operation-phase-selector.component';
import { Well3dComponent } from '../../components/well/well-3d.component';
import { WorkString3d, workString3d } from '../../components/well/well-3d-layers';
import { PocoApi } from '../../models/poco.model';
import { PocoSelectorComponent } from '../../components/well/poco-selector.component';
﻿import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup, FormArray } from '@angular/forms';
import { Subject } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { TuiAccordion } from '@taiga-ui/kit';
import { TuiExpand } from '@taiga-ui/core/components/expand';

import { SqtTemperatureResult } from '../../services/core-calculo.service';
import { TestsCalculoService } from '../../services/tests-calculo.service';
import { SqueezeCalculoService } from '../../services/squeeze-calculo.service';
import { ReverseCirculationCalculoService, ReverseCirculationResult } from '../../services/reverse-circulation-calculo.service';
import { RelatorioViewerComponent } from '../../components/relatorio/relatorio-viewer.component';
import { RelatorioCapaModalComponent, RelatorioCapaData, GraficoOperacionalTipo } from '../../components/relatorio/relatorio-capa-modal.component';
import { RelatorioBuilderService } from '../../components/relatorio/relatorio-builder.service';
import { OperationChartsComponent } from '../../components/charts/operation-charts.component';
import { PrimaryWell2dComponent, type PrimaryWellVisualView } from '../../components/charts/primary-well-2d.component';
import { SqueezeSchematicsComponent } from '../../components/charts/squeeze-schematics.component';
import { AditivoModalComponent } from '../../components/aditivos/aditivo-modal.component';
import { SimuladorStateModalComponent } from '../../components/state-modal/simulador-state-modal.component';
import type { PrimaryDiagnostic, PrimaryFrictionLevel } from '../../models/primary-cementing.model';
import { PrimaryProgramService } from '../../services/primary-program.service';
import { operationReportVisuals, type OperationCharts } from '../../services/operation-charts';
import { expandReportChartSelection, reportChartId, SQUEEZE_REPORT_CHARTS } from '../../services/report-chart-selection';
import { PressureWindowInputsComponent, PRESSURE_WINDOW_FORM_DEFAULTS, setPressurePoints } from '../../components/pressure-window/pressure-window-inputs.component';
import { PressureWindowPanelComponent } from '../../components/pressure-window/pressure-window-panel.component';
import { buildCriticalPoints, criticalPointsTableSvg, wellElementOf, type OperationCriticalPoints } from '../../services/operation-critical-points';
import { gradientsAt } from '../../services/pressure-profile';
import { TAMPAO_STEP_LABELS } from '../../services/tampao-engine';
import { buildCronograma, svgDataUrl, tableReportSvg, ucaMilestones,
  type CronogramaRow, type CronogramaStep, type UcaMilestones } from '../../services/operation-tables';
import { buildWellVisualModel, primaryReportVisuals, type WellVisualOptions } from '../../services/primary-well-visuals';
import { balancedSqueezeDisplacement, buildSqueezeOperationCharts, legacySqueezeBlocks, runSqueezeEngine,
  squeezeInjectionFields, squeezeLegacyHydraulics, SQUEEZE_TECHNIQUE_LABELS,
  type SqueezeEngineInput, type SqueezeEngineResult, type SqueezeTechnique } from '../../services/squeeze-engine';
import { retainerSqueezeVolumes } from '../../services/squeeze-retainer';
import type { TampaoEngineOverrides } from '../../services/tampao-engine';
import type { CompressionBlock } from '../../services/work-string-compression';
import { PRIMARY_REFERENCE_RHEOLOGY_SOURCE, primaryDefaultRheology } from '../../models/primary-default-rheology';
import { RheologyAdjustmentService, BASE_SLURRY_RHEOLOGY } from '../../services/rheology-adjustment.service';
import { RetiradaTubosReportService } from '../../services/retirada-tubos-report.service';
import { ConformidadeOperacionalReportService, FatorConformidade, VarreduraOverride } from '../../services/conformidade-operacional-report.service';
import { SimuladorBaseComponent } from '../simulador-base.component';

import { SqueezeGeometry, SqueezeInputs, Perfuracao, SqueezeHydraulicSimulation } from '../../models/squeeze.model';
import { WellStructureFormComponent } from '../../components/well/well-structure-form.component';
import { DepthInputDirective } from '../../components/well/depth-input.directive';
import { WellTrajectoryFormComponent } from '../../components/well/well-trajectory-form.component';
import { createTrajectoryForm, trajectoryFromForm } from '../../models/well-trajectory.form';
import { WellSchematicComponent, WellSchematicState } from '../../components/well/well-schematic.component';
import { IntervalDescription, WellGeometryService } from '../../services/well-geometry.service';
import { OperationInterval, PerforationInterval, WellGeometry, WellGeometryIssue, WellOverlay } from '../../models/well-geometry.model';
import { WellPhaseFormValue, buildWellGeometry, emptyPhaseForm, exampleWellPhaseForms, geometryNumber, wellGeometryToForms } from '../../models/well-geometry.form';
import { Diagnostic } from '../../models/pasta.model';
import { ThickeningResult, UCAResult } from '../../models/reologia.model';
import { ADITIVOS_CATALOGO, AditivoCatalogo, Aditivo, hydrateAditivosFromCatalog } from '../../models/aditivo.model';
import { CEMENT_CLASSES } from '../../models/constantes';
import { API_CASING_SIZES, API_TUBING_SIZES, ApiTubular } from '../../models/api-tubulares';

type TabId = 'recipe' | 'manualRecipe' | 'simulations' | 'schematic' | 'wellView';

/** Volumes que o motor bombeia, pela técnica (a Bradenhead e o packer equilibram a pasta inteira). */
interface SqueezeProgramVolumes { front: number; slurry: number; back: number; displacement: number }

/** O que o motor faz e o que ele não modela, para o relatório (SPEC squeeze-tampao §7). */
const SQUEEZE_PREMISSAS: string[][] = [
  ['Motor', 'Cimentação primária com coluna de trabalho de extremidade aberta'],
  ['Posicionamento', 'Transporte 1D com conservação de volume e tubo em U; atrito R3 §4-6 como na primária'],
  ['Reologia', 'Pasta com a referência da primária (R3 §12-7, pasta tail); fluidos aquosos pela viscosidade'],
  ['Compressão', 'Retorno fechado (BOP, packer ou retentor); pressão de superfície e vazão por bloco'],
  ['Canhoneados', 'Saída pelo canhoneado de base; pressão pelo percurso coluna, extremidade e revestimento'],
  ['Limite de baixa pressão', 'Pressão de superfície que leva o canhoneado mais crítico à fratura'],
  ['Não modela', 'Desidratação da pasta, reboco e nodes: o volume injetado sai como pasta inteira'],
  ['Não modela', 'Aceitação da formação: não há teste de injetividade no cenário'],
  ['Não modela', 'Mistura nas interfaces e gel do fluido parado'],
  ['Não modela', 'Circulação reversa depois da retirada'],
];
const TECHNIQUES: SqueezeTechnique[] = ['bradenhead', 'packer', 'retainer'];

@Component({
  selector: 'app-simulador-squeeze',
  standalone: true,
  imports: [Well3dComponent, PocoSelectorComponent, 
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RelatorioViewerComponent,
    OperationChartsComponent,
    PressureWindowInputsComponent,
    PressureWindowPanelComponent,
    PrimaryWell2dComponent,
    SqueezeSchematicsComponent,
    WellStructureFormComponent, OperationPhaseSelectorComponent,
    DepthInputDirective,
    WellTrajectoryFormComponent,
    WellSchematicComponent,
    AditivoModalComponent,
    SimuladorStateModalComponent,
    RelatorioCapaModalComponent,
    TuiButton,
    TuiIcon,
    ...TuiAccordion,
    TuiExpand,
  ],
  templateUrl: './simulador-squeeze.component.html',
  styleUrl: './simulador-squeeze.component.css',
})
export class SimuladorSqueezeComponent extends SimuladorBaseComponent implements OnInit, OnDestroy {
  private destroy$ = new Subject<void>();

  form!: FormGroup;
  activeTab: TabId = 'recipe';
  readonly tabs: { id: TabId; label: string }[] = [
    { id: 'recipe', label: '1. Receita da Simulação' },
    { id: 'manualRecipe', label: '2. Receita por Volume' },
    { id: 'simulations', label: '3. Simulações' },
    { id: 'schematic', label: '4. Esquemático' },
    { id: 'wellView', label: '5. Visualização do poço' },
  ];

  readonly cimentoClasses = Object.entries(CEMENT_CLASSES).map(([k, v]) => ({ value: k, label: v.label }));
  readonly catalogoAditivos: AditivoCatalogo[] = ADITIVOS_CATALOGO;

  geom: SqueezeGeometry | null = null;
  // Geometria que o esquemático (e o relatório) usam — segue o seletor de volume,
  // sem afetar "1. Receita da Simulação" (que sempre usa `geom` do simulador).
  schematicGeom: SqueezeGeometry | null = null;
  squeezeInputsSnapshot: SqueezeInputs | null = null;
  tt: ThickeningResult | null = null;
  uca: UCAResult | null = null;
  rheoDiags: Diagnostic[] = [];
  recipeDiags: Diagnostic[] = [];
  /** Squeeze no motor da primária (SPEC squeeze-tampao S7). */
  squeezeResult: SqueezeEngineResult | null = null;
  /** O resultado do motor no formato que as métricas e o relatório de conformidade leem. */
  hydraulicSim: SqueezeHydraulicSimulation | null = null;
  operationCharts: OperationCharts | null = null;
  engineDiagnostics: PrimaryDiagnostic[] = [];
  well2dViews: PrimaryWellVisualView[] = [];
  programVolumes: SqueezeProgramVolumes | null = null;
  /** Janela operacional: o ponto crítico por etapa (SPEC janela-operacional §3.3). */
  criticalPoints: OperationCriticalPoints | null = null;
  ucaMarcos: UcaMilestones = ucaMilestones(null);
  /** Cenário salvo antes das técnicas: a Bradenhead foi assumida (T-20). */
  legacyScenarioNotice: string | null = null;
  readonly techniqueOptions = TECHNIQUES.map(value => ({ value, label: SQUEEZE_TECHNIQUE_LABELS[value] }));
  /** Limiar de injetividade sugerido p/ o cenário (2 × Q ÷ janela poro→fratura). */
  limiarInjetividadeSugerido: number | null = null;
  reverseCirculation: ReverseCirculationResult | null = null;
  freeWater = 0;
  geoFormula = '';
  cronograma: CronogramaRow[] = [];
  manualCronograma: CronogramaRow[] = [];

  // ── Estrutura do poço (fonte da verdade da geometria) ──
  wellGeometry: WellGeometry | null = null;
  wellIssues: WellGeometryIssue[] = [];
  operationIssues: WellGeometryIssue[] = [];
  perforationIssues: WellGeometryIssue[] = [];
  intervalDescription: IntervalDescription | null = null;
  /** Overlays do squeeze — posições JÁ calculadas pelos services, só para desenho. */
  wellOverlays: WellOverlay[] = [];
  /** Coluna do 3D nos diâmetros reais; objeto novo só quando a simulação refaz o desenho. */
  wellWorkString: WorkString3d | null = null;
  wellSchematicState: 'antes' | 'depois' = 'antes';
  readonly wellSchematicStates: WellSchematicState[] = [
    { id: 'antes', label: 'Antes do squeeze' },
    { id: 'depois', label: 'Depois do squeeze' },
  ];

  relatorioVisivel = false;
  relatorioTitulo = '';
  relatorioConteudo = '';
  capaModalOpen = false;
  relatorioPrefill: Partial<RelatorioCapaData> | Record<string, any> = {};
  stateModalOpen = false;

  @ViewChild('stateModal') stateModal!: SimuladorStateModalComponent;
  @ViewChild('reportSchematics') reportSchematics?: SqueezeSchematicsComponent;

  // Sidebar toggle
  sidebarOpen = true;

  // Accordion sidebar
  sec1Open = false;
  sec2Open = false;
  sec3Open = false;
  sec4Open = false;
  sec5Open = false;
  sec6Open = false;
  sec7Open = false;
  sec8Open = false;
  sec10Open = false;
  secPocoOpen = false;
  secEstruturaOpen = true;
  secTampaoOpen = false;
  secSimuladorOpen = false;

  // Padrões capturados após buildForm() — usados ao carregar cenários antigos
  private formDefaults: Record<string, unknown> = {};
  private defaultManualVolumeBbl = 5;
  secDadosOpen = true;
  secCondOpen = false;
  secPesosOpen = false;
  secVazoesOpen = false;
  secGradOpen = false;
  secInjecaoOpen = false;
  secPausasOpen = false;
  secAlturaOpen = false;

  readonly casingOptions: ApiTubular[] = API_CASING_SIZES;
  readonly tubingOptions: ApiTubular[] = API_TUBING_SIZES;
  readonly roughnessOptions = [
    { value: 'low', label: 'Tubo novo (liso)' },
    { value: 'medium', label: 'Tubo médio (uso típico) — fricção +15%' },
    { value: 'high', label: 'Fim de vida (corrosão/incrustação) — fricção +35%' },
  ];

  // Volume padrão da receita por volume (squeeze usa 5 bbl; base define 10)
  override manualVolumeBbl = 5;

  protected readonly operacaoKey = 'squeeze' as const;

  constructor(
    private testsCalc: TestsCalculoService,
    private squeezeCalc: SqueezeCalculoService,
    private reverseCirculationCalc: ReverseCirculationCalculoService,
    private primaryProgram: PrimaryProgramService,
    private rheologyAdj: RheologyAdjustmentService,
    private relatorioBuilder: RelatorioBuilderService,
    private retiradaReport: RetiradaTubosReportService,
    private conformidadeReport: ConformidadeOperacionalReportService,
    private wellGeo: WellGeometryService,
    private cdr: ChangeDetectorRef,
  ) { super(); }

  ngOnInit(): void {
    this.dadosRelatorio = this.stateStore.loadDadosRelatorio('squeeze');
    this.ensureSequenciaDefaults();
    this.buildForm();
    // Snapshot dos padrões do formulário: ao carregar um cenário salvo antes de
    // novos campos existirem, os ausentes voltam ao padrão (reprodução exata).
    const { additivos: _a, perforacoes: _p, fases: _f, blocosCompressao: _b, gradPoints: _g, ...defaults } = this.form.getRawValue();
    this.formDefaults = defaults;
    this.defaultManualVolumeBbl = this.manualVolumeBbl;
    this.restoreAditivos();
    this.simulate();
    this.form.valueChanges
      .pipe(debounceTime(350), takeUntil(this.destroy$))
      .subscribe({ next: () => { try { this.simulate(); } catch (e) { console.error('[squeeze] simulate error:', e); } } });
    this.additivos.valueChanges
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => this.aditivosStore.save('squeeze', this.additivos.getRawValue()));
  }

  ngOnDestroy(): void { this.destroy$.next(); this.destroy$.complete(); }

  get perforacoes(): FormArray { return this.form.get('perforacoes') as FormArray; }
  get blocosCompressao(): FormArray { return this.form.get('blocosCompressao') as FormArray; }

  private blockGroup(block: CompressionBlock): FormGroup {
    return this.fb.group({
      tipo: [block.kind],
      volumeBbl: [block.kind === 'inject' ? block.volumeBbl : 0],
      vazaoBpm: [block.kind === 'inject' ? block.rateBpm : 0],
      duracaoMin: [block.kind === 'pressurize' ? block.durationMin : 0],
      pressaoPsi: [block.surfacePressurePsi],
    });
  }

  private setBlocks(blocks: CompressionBlock[]): void {
    while (this.blocosCompressao.length) this.blocosCompressao.removeAt(0, { emitEvent: false });
    for (const block of blocks) this.blocosCompressao.push(this.blockGroup(block), { emitEvent: false });
  }

  /** Blocos de compressão do formulário (hesitação: injeções e pressurizações alternadas). */
  compressionBlocks(): CompressionBlock[] {
    return (this.blocosCompressao.getRawValue() as { tipo: string; volumeBbl: unknown; vazaoBpm: unknown;
      duracaoMin: unknown; pressaoPsi: unknown }[]).map(row => row.tipo === 'pressurize'
      ? { kind: 'pressurize' as const, durationMin: Math.max(0, Number(row.duracaoMin) || 0), surfacePressurePsi: Math.max(0, Number(row.pressaoPsi) || 0) }
      : { kind: 'inject' as const, volumeBbl: Math.max(0, Number(row.volumeBbl) || 0), rateBpm: Math.max(0, Number(row.vazaoBpm) || 0),
        surfacePressurePsi: Math.max(0, Number(row.pressaoPsi) || 0) });
  }

  addBloco(tipo: CompressionBlock['kind']): void {
    const last = this.compressionBlocks().at(-1);
    const pressure = last?.surfacePressurePsi ?? 1000;
    this.blocosCompressao.push(this.blockGroup(tipo === 'inject'
      ? { kind: 'inject', volumeBbl: 0.5, rateBpm: 0.25, surfacePressurePsi: pressure }
      : { kind: 'pressurize', durationMin: 15, surfacePressurePsi: pressure }));
  }

  removeBloco(index: number): void {
    if (this.blocosCompressao.length > 1) this.blocosCompressao.removeAt(index);
  }

  /**
   * Maior pressão de superfície que mantém o canhoneado mais crítico abaixo da fratura,
   * calculada pelo motor com a coluna de fluidos da compressão (squeeze de baixa pressão).
   * A pressão dos blocos é do usuário; este é o teto que não fratura.
   */
  get pressaoMaxSemFraturarPsi(): number | null {
    const value = this.squeezeResult?.summary.lowPressureLimitPsi;
    return value != null && Number.isFinite(value) ? value : null;
  }

  /** A pressão máxima de injeção: a maior "P sup." dos blocos. */
  get pressaoMaxInjecaoPsi(): number {
    return Math.max(0, ...this.compressionBlocks().map(block => block.surfacePressurePsi));
  }

  /**
   * Muda a pressão máxima de injeção: os blocos que estavam no máximo vão para o valor novo e
   * um bloco acima dele é limitado; degraus menores (hesitação) ficam como estão.
   */
  setPressaoMaxInjecao(value: string | number): void {
    const target = Number(value);
    if (!Number.isFinite(target) || target < 0) return;
    const current = this.pressaoMaxInjecaoPsi;
    for (const control of this.blocosCompressao.controls) {
      const psi = Number(control.value.pressaoPsi) || 0;
      if (psi >= current - 1e-9 || psi > target) control.patchValue({ pressaoPsi: target });
    }
  }

  /** Leva a pressão de todos os blocos ao teto sem fraturar, arredondado para baixo de 50 em 50 psi. */
  aplicarPressaoSemFraturar(): void {
    const limit = this.pressaoMaxSemFraturarPsi;
    if (limit === null) return;
    const psi = Math.max(0, Math.floor(limit / 50) * 50);
    for (const control of this.blocosCompressao.controls) control.patchValue({ pressaoPsi: psi });
  }

  techniqueLabel(): string { return SQUEEZE_TECHNIQUE_LABELS[this.technique]; }

  get technique(): SqueezeTechnique {
    const value = this.form?.get('tecnicaSqueeze')?.value;
    return TECHNIQUES.includes(value) ? value : 'bradenhead';
  }

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

  /** Exemplo inicial da superfície até a produção; dimensões editáveis por fase. */
  private defaultPhaseRows(): WellPhaseFormValue[] {
    return exampleWellPhaseForms('squeeze');
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
    this.wellSchematicState = id === 'depois' ? 'depois' : 'antes';
    this.wellOverlays = this.buildWellOverlays(this.schematicGeom);
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
      caliper: [8.535],
      casingOD: [5.500], casingID: [4.778],
      tubingOD: [2.875], tubingID: [2.441],
      backSpacerHeight: [50],
      surfaceTemp: [80.6], geoGradient: [1.50],
      bhst: [{ value: null, disabled: true }],
      bhct: [{ value: null, disabled: true }],
      mudWeightFront: [8.4], mudWeightBack: [8.4], completionWeight: [8.4], displacementWeight: [8.4],
      fracGrad: [16.0], poreGrad: [9.0], gradUnit: [PRESSURE_WINDOW_FORM_DEFAULTS.gradUnit], gradMode: [PRESSURE_WINDOW_FORM_DEFAULTS.gradMode],
      margemAtencaoPpg: [PRESSURE_WINDOW_FORM_DEFAULTS.margemAtencaoPpg], margemAlertaPpg: [PRESSURE_WINDOW_FORM_DEFAULTS.margemAlertaPpg],
      margemCriticoPpg: [PRESSURE_WINDOW_FORM_DEFAULTS.margemCriticoPpg], gradPoints: this.fb.array([]),
      pumpRate: [2.0],
      // Derivados dos blocos de compressão (squeezeInjectionFields): o dimensionamento e o
      // relatório de injetividade continuam lendo estes três campos.
      pressaoOperacao: [2000],
      volMaxInjetadoBbl: [2.0],
      tempoPressurizacaoMin: [0],
      limiarInjetividadeBpmPsi: [0.001],
      tecnicaSqueeze: ['bradenhead'],
      retentorMD: [null as number | null],
      retentorFundoMD: [null as number | null],
      contrapressaoAnularPsi: [0],
      diferencialFerramentaPsi: [null as number | null],
      rupturaRevestimentoPsi: [null as number | null],
      blocosCompressao: this.fb.array([
        this.blockGroup({ kind: 'inject', volumeBbl: 2, rateBpm: 0.5, surfacePressurePsi: 2000 }),
        this.blockGroup({ kind: 'pressurize', durationMin: 15, surfacePressurePsi: 2000 }),
      ]),
      internalFrictionLevel: ['medium'], annularFrictionLevel: ['medium'],
      viscosidadeAguaCp: [1.0],
      // Não entra mais no cálculo (queda livre conservativa); fica para os cenários antigos.
      freeFallMaxFactor: [3.5],
      headCondition: ['vented-free-surface'],
      motorHP: [1000], pumpEff: [90],
      maxSurfacePressure: [5000], maxPumpRate: [8.0],
      pause1: [0], pause2: [0], pause3: [0],
      density: [15.8], cementClass: ['G'],
      waterSplitFresh: [100], waterSplitSea: [0],
      silica: [35], nacl: [0],
      additivos: this.fb.array([]),
      perforacoes: this.fb.array([
        this.fb.group({ top: [1420], base: [1440] }),
      ]),
    });
  }

  /**
   * Projeta a estrutura cadastrada nos campos legados de seção/diâmetro. A
   * geometria passou a ser a fonte da verdade: esses campos são DERIVADOS dela
   * e do intervalo da operação, nunca mais digitados.
   */
  private syncWellGeometry(perfs: Perfuracao[]): { geometry: WellGeometry; interval: OperationInterval } | null {
    const raw = this.form.getRawValue();
    const fullGeometry = this.wellGeo.deriveTrajectoryTvd({
      ...buildWellGeometry(raw.wellFinalMD, raw.wellFinalTVD, (raw.fases ?? []) as WellPhaseFormValue[]),
      trajectory: trajectoryFromForm(raw.trajectory),
    });
    const context = this.operationContext.resolve(fullGeometry, raw.selectedPhaseId ?? null, 'squeeze');
    const geometry = context.geometry;
    const interval: OperationInterval = {
      topMD: geometryNumber(raw.operacaoTopoMD),
      bottomMD: geometryNumber(raw.operacaoBaseMD),
    };
    const perforations: PerforationInterval[] = perfs.map((p, i) => ({
      id: `perf-${i + 1}`, topMD: p.top, bottomMD: p.base,
    }));

    this.wellGeometry = geometry;
    this.wellIssues = context.issues;
    this.operationIssues = [...this.wellGeo.validateInterval(geometry, interval, 'Squeeze'),
      ...this.operationContext.validateInterval(context, interval, 'Squeeze')];
    if (!this.wellGeo.hasErrors(this.wellIssues)) this.operationIssues.push(...this.wellGeo.validateWorkString(
      geometry, interval.bottomMD, geometryNumber(raw.tubingOD), geometryNumber(raw.tubingID),
    ));
    this.perforationIssues = [...this.wellGeo.validatePerforations(geometry, perforations),
      ...perforations.flatMap(perf => this.operationContext.validateInterval(context, perf, 'Canhoneado'))];
    this.intervalDescription = null;

    if (this.wellGeo.hasErrors(this.wellIssues) || this.wellGeo.hasErrors(this.operationIssues) || this.wellGeo.hasErrors(this.perforationIssues)) return null;
    this.intervalDescription = this.wellGeo.describeInterval(geometry, interval);

    const baseSegment = this.intervalDescription.segments.at(-1);
    this.form.patchValue({
      sectionStartMD: interval.topMD,
      sectionEndMD: interval.bottomMD,
      sectionStartTVD: this.wellGeo.tryMdToTvd(geometry, interval.topMD) ?? interval.topMD,
      sectionEndTVD: this.wellGeo.tryMdToTvd(geometry, interval.bottomMD) ?? interval.bottomMD,
      ...(baseSegment ? {
        caliper: baseSegment.holeDiameterIn,
        ...(baseSegment.cased ? { casingOD: baseSegment.casingOdIn, casingID: baseSegment.casingIdIn } : {}),
      } : {}),
    }, { emitEvent: false });

    return { geometry, interval };
  }

  /**
   * Converte o resultado do cálculo em overlays. O desenho não recalcula nada:
   * só representa os topos que o SqueezeCalculoService produziu.
   */
  private buildWellOverlays(geom: SqueezeGeometry | null): WellOverlay[] {
    if (!geom) return [];
    const depois = this.wellSchematicState === 'depois';
    const topCement = depois ? geom.topCementAfterInjectionMD : geom.topCementImmersedMD;
    const overlays: WellOverlay[] = [
      ...(depois ? [] : [{
        type: 'TUBING' as const, topMD: 0, bottomMD: geom.base,
        label: 'Coluna de trabalho', zone: 'tubing' as const,
      }]),
      { type: 'CEMENT', topMD: topCement, bottomMD: geom.base, label: depois ? 'Cimento após injeção' : 'Cimento no poço', zone: 'full' },
      ...(depois ? [{
        type: 'SQUEEZE' as const, topMD: geom.shallowestPerf, bottomMD: geom.deepestPerf,
        label: 'Intervalo squeezado', zone: 'full' as const,
      }] : []),
      ...geom.perfs.map((perf, i) => ({
        type: 'PERFORATION' as const,
        topMD: perf.top,
        bottomMD: perf.base,
        label: `Canhoneado ${i + 1}`,
        zone: 'full' as const,
      })),
    ];
    return overlays.filter(o => o.bottomMD > o.topMD);
  }

  private invalidateSimulation(): void {
    this.clearCalculatedResults();
    this.geom = null;
    this.schematicGeom = null;
    this.squeezeInputsSnapshot = null;
    this.hydraulicSim = null;
    this.squeezeResult = null;
    this.operationCharts = null;
    this.criticalPoints = null;
    this.engineDiagnostics = [];
    this.well2dViews = [];
    this.programVolumes = null;
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
    this.limiarInjetividadeSugerido = null;
    this.form.patchValue({ bhst: null, bhct: null }, { emitEvent: false });
    this.cdr.markForCheck();
  }

  simulate(): void {
    this.engineeringIssues = [];
    try {
      const raw = this.form.getRawValue();
      const perfs: Perfuracao[] = (raw.perforacoes || []).map((p: any) => ({ top: geometryNumber(p.top), base: geometryNumber(p.base) }));
      const well = this.syncWellGeometry(perfs);
      if (!well) {
        this.invalidateSimulation();
        return;
      }
      // Os campos de injeção de hoje saem dos blocos de compressão.
      this.form.patchValue(squeezeInjectionFields(this.compressionBlocks()), { emitEvent: false });
      const v = this.form.getRawValue();

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

      // "Vol. injetado p/ formação" é o volume squeezado (expectedLoss) da geometria:
      // soma ao volume bombeado e desconta dos topos pós-injeção.
      const inputs = {
        ...v,
        expectedLoss: Math.max(0, Number(v.volMaxInjetadoBbl) || 0),
        rugosidadeTubo: v.internalFrictionLevel,
      } as SqueezeInputs;
      this.squeezeInputsSnapshot = inputs;
      // Geometria base (volume do simulador) — sempre alimenta "1. Receita da Simulação" e a hidráulica
      this.geom = this.squeezeCalc.calcVolumes(inputs, perfs, null, well);
      // A opção "Altura do tampão" mostra a pasta bombeada: a do intervalo e a que vai para a formação.
      this.simuladorVolumeBbl = this.geom.slurryTotal;
      // Geometria SÓ do esquemático/relatório: segue a escolha do seletor, de forma independente
      this.schematicGeom = (this.cementVolumeSource === 'receita' && this.manualVolumeBbl > 0)
        ? this.squeezeCalc.calcVolumes(inputs, perfs, this.manualVolumeBbl, well)
        : this.geom;
      this.wellOverlays = this.buildWellOverlays(this.schematicGeom);
      this.wellWorkString = workString3d(v.tubingOD, v.tubingID);
      this.reverseCirculation = this.buildReverseCirculationResult(v);
      const aditivosRaw = hydrateAditivosFromCatalog((v.additivos || []) as Aditivo[]);

      this.slurry = this.slurryCalc.calculateSlurryDesign({ ...vWithBHT, additivos: aditivosRaw } as any);
      this.programVolumes = this.buildProgramVolumes(v, well.geometry, perfs);
      this.recipe = this.slurryCalc.buildSlurryRecipe(this.programVolumes.slurry, this.slurry);
      this.computeManualRecipe();

      // Sem leituras Fann na tela: a reologia é a da pasta base com o efeito dos aditivos, e é
      // ela que alimenta o tempo de espessamento e o atrito do motor.
      this.rheologyResult = this.rheologyAdj.applyAdditiveRheologyEffects(BASE_SLURRY_RHEOLOGY, aditivosRaw);
      this.tt = this.testsCalc.simulateThickening(this.slurry, v.sectionEndTVD, this.estimatedThetaReadings());
      this.uca = this.testsCalc.simulateUCA(this.slurry, this.tt);
      this.ucaMarcos = ucaMilestones(this.uca);
      this.freeWater = this.testsCalc.estimateFreeWater(this.slurry);
      this.rheoDiags = this.testsCalc.rheoDiagnostics(this.slurry, this.tt, this.freeWater);

      this.runEngine(v, perfs);
      this.well2dViews = this.buildWell2dViews(perfs);

      // Limiar de injetividade sugerido p/ o cenário (arredondado a 2 algarismos
      // significativos p/ exibição/aplicação); null quando faltam volume/tempo.
      const limiarRaw = this.hydraulicSim ? this.conformidadeReport.limiarInjetividadeSugerido(this.hydraulicSim, this.reportForm()) : null;
      this.limiarInjetividadeSugerido = limiarRaw != null ? +limiarRaw.toPrecision(2) : null;

      this.updateEngineeringIssues({ referenceMD: this.hydraulicSim?.summary.referenceMD, perforations: perfs });
      this.buildOpsPhases();
      this.buildManualRecipeOpsPhases();
      this.buildRecipeDiags();
      // App zoneless: simulate() roda em callback assíncrono (debounce do valueChanges).
      // markForCheck() agenda a detecção de mudança (e o ngOnChanges dos filhos, como o
      // esquemático) sem forçar CD síncrona — evitando reentrância no fluxo do modal.
      this.cdr.markForCheck();
    } catch (e) {
      this.operationIssues.push({ level: 'error', code: 'SIMULATION_ERROR',
        message: e instanceof Error ? e.message : 'Não foi possível calcular a simulação.' });
      this.invalidateSimulation();
      console.error('[squeeze] simulate error:', e);
    }
  }

  /** Volumes que o motor bombeia (Bradenhead e packer: a pasta inteira equilibrada; retentor: §6.6). */
  private buildProgramVolumes(v: any, geometry: WellGeometry, perfs: Perfuracao[]): SqueezeProgramVolumes {
    const geom = this.geom!;
    if (this.technique === 'retainer') {
      const retainer = this.retainerDepths(v, perfs);
      const volumes = retainerSqueezeVolumes(geometry, { retainerMD: retainer.md, bottomMD: retainer.bottomMD,
        perforations: { topMD: geom.shallowestPerf, baseMD: geom.deepestPerf }, pipeIDIn: Number(v.tubingID) || 2.441,
        volumes: { injectBbl: Number(v.volMaxInjetadoBbl) || 0, frontBbl: geom.frontPhysicalVolumeBbl, backBbl: geom.backPhysicalVolumeBbl } });
      return { front: geom.frontPhysicalVolumeBbl, slurry: volumes.slurryBbl, back: geom.backPhysicalVolumeBbl,
        displacement: volumes.totalDisplacementBbl };
    }
    return { front: geom.frontPhysicalVolumeBbl, slurry: geom.slurryTotal, back: geom.backPhysicalVolumeBbl,
      displacement: balancedSqueezeDisplacement(geometry, geom).displacementBbl };
  }

  /** Retentor: padrão 10 m acima do canhoneado de topo; o trecho isolado vai até a base da operação. */
  private retainerDepths(v: any, perfs: Perfuracao[]): { md: number; bottomMD: number } {
    const top = Math.min(...perfs.map(p => Math.min(p.top, p.base)));
    const md = Number(v.retentorMD);
    const bottom = Number(v.retentorFundoMD);
    return { md: Number.isFinite(md) && md > 0 ? md : Math.max(0, top - 10),
      bottomMD: Number.isFinite(bottom) && bottom > 0 ? bottom : Number(v.operacaoBaseMD) || Number(v.sectionEndMD) };
  }

  private squeezeEngineInput(v: any, perfs: Perfuracao[]): SqueezeEngineInput | null {
    if (!this.geom || !this.slurry || !this.wellGeometry) return null;
    const num = (value: unknown, fallback: number) => {
      const n = Number(value);
      return Number.isFinite(n) ? n : fallback;
    };
    const optional = (value: unknown) => {
      const n = Number(value);
      return value !== null && value !== '' && Number.isFinite(n) && n > 0 ? n : null;
    };
    const retirada = this.retiradaReport.buildCalculation(v, this.geom.topCementAfterPullMD,
      this.dadosRelatorio.sequenciaOperacional as unknown as RelatorioCapaData['sequenciaOperacional']);
    const levels: PrimaryFrictionLevel[] = ['low', 'medium', 'high'];
    const reference = Number(v.profundidadeReferenciaSqueezeMD);
    const referenceMD = Number.isFinite(reference) && reference > 0 ? reference : (this.geom.shallowestPerf + this.geom.deepestPerf) / 2;
    return {
      technique: this.technique, geom: this.geom, geometry: this.wellGeometry, perforations: perfs,
      referenceMD,
      blocks: this.compressionBlocks(),
      retainer: this.technique === 'retainer' ? this.retainerDepths(v, perfs) : undefined,
      annulusPressurePsi: Math.max(0, num(v.contrapressaoAnularPsi, 0)),
      toolDifferentialLimitPsi: optional(v.diferencialFerramentaPsi), casingBurstPsi: optional(v.rupturaRevestimentoPsi),
      pipeODIn: num(v.tubingOD, 2.875), pipeIDIn: num(v.tubingID, 2.441),
      densities: { completion: num(v.completionWeight, 8.4), front: num(v.mudWeightFront, 8.4), back: num(v.mudWeightBack, 8.4),
        displacement: num(v.displacementWeight ?? v.completionWeight, 8.4), slurry: num(this.slurry.density ?? v.density, 15.8) },
      waterViscosityCp: num(v.viscosidadeAguaCp, 1),
      // Como na primária: a pasta entra com a reologia de referência (R3 §12-7, pasta tail).
      slurryRheology: { ...primaryDefaultRheology('cement'), origin: 'base', reference: PRIMARY_REFERENCE_RHEOLOGY_SOURCE },
      rates: { front: this.vazaoFluido('fluidoFrenteBpm'), slurry: this.vazaoFluido('pastaBpm'),
        back: this.vazaoFluido('fluidoAtrasBpm'), displacement: this.vazaoFluido('deslocamentoBpm') },
      pausesMin: [Math.max(0, num(v.pause1, 0)), Math.max(0, num(v.pause2, 0)), Math.max(0, num(v.pause3, 0))],
      friction: { internal: levels.includes(v.internalFrictionLevel) ? v.internalFrictionLevel : 'medium',
        annular: levels.includes(v.annularFrictionLevel) ? v.annularFrictionLevel : 'medium' },
      headCondition: v.headCondition === 'vented-free-surface' ? 'vented-free-surface' : 'closed-head',
      // Poro e fratura do perfil do cenário; os valores únicos são os da referência dos canhoneados.
      ...this.engineGradients(v, this.squeezeTvdOf()(referenceMD)),
      equipment: { maxSurfacePressurePsi: num(v.maxSurfacePressure, 0) || null, maxPumpRateBpm: num(v.maxPumpRate, 0) || null,
        motorHp: num(v.motorHP, 0) || null, pumpEffPct: num(v.pumpEff, 0) || null },
      retirada: { tubeLengthM: retirada.tubeLengthM, sectionsAboveTop: retirada.sectionsAboveTop,
        tubesPerSection: retirada.tubesPerSection },
    };
  }

  private squeezeTvdOf(): (md: number) => number {
    return this.wellGeometry ? this.wellGeo.mdToTvdResolver(this.wellGeometry) : (md: number) => md;
  }

  private runSqueeze(v: any, perfs: Perfuracao[], override: TampaoEngineOverrides = {}): SqueezeEngineResult | null {
    const input = this.squeezeEngineInput(v, perfs);
    if (!input) return null;
    try {
      return runSqueezeEngine(this.primaryProgram, input, this.squeezeTvdOf(), override);
    } catch (e) {
      console.error('[squeeze] engine error:', e);
      return null;
    }
  }

  private runEngine(v: any, perfs: Perfuracao[]): void {
    const result = this.runSqueeze(v, perfs);
    const tvdOf = this.squeezeTvdOf();
    this.squeezeResult = result;
    this.hydraulicSim = result ? squeezeLegacyHydraulics(result, tvdOf) : null;
    const phases = (this.wellGeometry?.phases ?? []).map(phase =>
      ({ id: phase.id, name: phase.name, topMD: phase.topMD, bottomMD: phase.bottomMD }));
    this.operationCharts = result ? buildSqueezeOperationCharts(result, phases, v.selectedPhaseId ?? null, tvdOf) : null;
    this.criticalPoints = result ? buildCriticalPoints({ hydraulics: result.positioning.hydraulics, stepLabels: TAMPAO_STEP_LABELS,
      compression: result.compression, gradientsAt: tvd => gradientsAt(result.input, tvd), tvdOf,
      elementOf: wellElementOf(this.wellGeometry, perfs), classes: this.marginClasses(v),
      casingBurstPsi: result.input.casingBurstPsi }) : null;
    const positioning = result?.positioning;
    this.engineDiagnostics = [
      ...(positioning?.geometry.issues ?? []).filter(issue => issue.level === 'error')
        .map(issue => ({ code: issue.code, message: issue.message, severity: 'error' as const, category: 'configuration' as const })),
      ...(positioning?.volumes.diagnostics ?? []), ...(positioning?.transport?.diagnostics ?? []),
      ...(positioning?.hydraulics?.diagnostics ?? []), ...(result?.diagnostics ?? []),
    ].filter(d => d.severity !== 'info' && d.code !== 'PRIMARY_RHEOLOGY_ESTIMATED');
  }

  /** Perfil e planta da primária, sem caliper, com a pasta depois do squeeze (SPEC §5.4). */
  private buildWell2dViews(perfs: Perfuracao[]): PrimaryWellVisualView[] {
    const geometry = this.wellGeometry;
    const geom = this.schematicGeom ?? this.geom;
    if (!geometry || !geom) return [];
    const summary = this.squeezeResult?.summary;
    const cementTop = summary?.cementTopAfterSqueezeMD ?? geom.topCementAfterInjectionMD;
    const cementBase = this.technique === 'retainer' ? Math.max(...perfs.map(p => Math.max(p.top, p.base))) : geom.base;
    const options = (interval?: WellVisualOptions['interval']): WellVisualOptions => ({
      caliper: null, showCaliper: false, interval, tubulars: [],
      cement: cementBase > cementTop ? [{ topMD: cementTop, bottomMD: cementBase, location: 'wellbore' }] : [],
      markers: [
        ...perfs.map((p, i) => ({ md: Math.min(p.top, p.base), label: `Canhoneado ${i + 1}` })),
        ...(this.technique !== 'bradenhead' && summary?.toolMD != null
          ? [{ md: summary.toolMD, label: this.technique === 'packer' ? 'Packer' : 'Retentor' }] : []),
      ],
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

  /**
   * Topo da pasta que a regra da retirada usa, com o volume do seletor (como o esquemático
   * e o relatório): a pasta inteira em poço cheio, com a que ainda vai para a formação,
   * porque ela está no poço até a compressão (S7).
   */
  private cementTopForPull(): number {
    const g = this.schematicGeom ?? this.geom!;
    return this.technique !== 'retainer' && this.wellGeometry
      ? balancedSqueezeDisplacement(this.wellGeometry, g).topWithoutStringMD
      : g.topCementAfterPullMD;
  }

  private buildReverseCirculationResult(v: any): ReverseCirculationResult | null {
    try {
      return this.reverseCirculationCalc.calculateReverseCirculation({
        tubingIdIn: Number(v.tubingID),
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
        tubingIdIn: Number(v.tubingID),
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

  /**
   * Pasta bombeada, com a que vai para a formação, pelo volume do seletor. Com o volume do
   * simulador, a do programa: no retentor, a do trecho isolado (§6.6). Antes era a do
   * intervalo só, e a receita do relatório saía sem o volume a injetar.
   */
  pastaBombeioVolumeBbl(): number {
    if (this.cementVolumeSource !== 'receita' && this.programVolumes) return this.programVolumes.slurry;
    return Number((this.schematicGeom ?? this.geom)?.slurryTotal) || 0;
  }

  /** Passos do programa com o volume de pasta dado: posicionamento, equilíbrio e blocos de compressão. */
  private cronogramaSteps(slurryBbl: number): CronogramaStep[] {
    const volumes = this.programVolumes;
    if (!volumes) return [];
    const v = this.form.getRawValue();
    const pump = (label: string, fluid: string, volumeBbl: number, rateBpm: number): CronogramaStep =>
      ({ label, fluid, volumeBbl: Math.max(0, volumeBbl || 0), rateBpm,
        durationMin: rateBpm > 0 ? Math.max(0, volumeBbl || 0) / rateBpm : 0 });
    const pause = (label: string, minutes: unknown): CronogramaStep =>
      ({ label, fluid: null, volumeBbl: null, rateBpm: null, durationMin: Math.max(0, Number(minutes) || 0) });
    const slurryDensity = Number(this.slurry?.density ?? v.density);
    const settle = this.squeezeResult?.tampao?.summary.settleMin ?? 0;
    const spot = this.squeezeResult?.retainer?.spotDisplacementBbl;
    const displacement = this.technique === 'retainer' && spot != null ? spot : volumes.displacement;
    const blocks = this.squeezeResult?.compression?.blocks ?? [];
    return [
      pump('Água à frente', `Água ${this.fmt(v.mudWeightFront, 1)} ppg`, volumes.front, this.vazaoFluido('fluidoFrenteBpm')),
      pause('Pausa 1', v.pause1),
      pump('Pasta', Number.isFinite(slurryDensity) ? `Pasta ${this.fmt(slurryDensity, 1)} ppg` : 'Pasta', slurryBbl, this.vazaoFluido('pastaBpm')),
      pause('Pausa 2', v.pause2),
      pump('Água atrás', `Água ${this.fmt(v.mudWeightBack, 1)} ppg`, volumes.back, this.vazaoFluido('fluidoAtrasBpm')),
      pause('Pausa 3', v.pause3),
      pump(this.technique === 'retainer' ? 'Deslocamento até o retentor' : 'Deslocamento',
        `Deslocamento ${this.fmt(v.displacementWeight ?? v.completionWeight, 1)} ppg`, displacement, this.vazaoFluido('deslocamentoBpm')),
      ...(this.technique === 'retainer' ? [] : [{ label: 'Equilíbrio do tubo em U', fluid: null, volumeBbl: null,
        rateBpm: null, durationMin: settle }]),
      ...blocks.map(block => ({ label: `${block.kind === 'inject' ? 'Injeção' : 'Pressurização'} (bloco ${block.index + 1})`,
        fluid: block.kind === 'inject' ? 'Deslocamento' : null,
        volumeBbl: block.kind === 'inject' ? block.pumpedBbl : null,
        rateBpm: block.kind === 'inject' && block.endMin > block.startMin ? block.pumpedBbl / (block.endMin - block.startMin) : null,
        durationMin: block.endMin - block.startMin })),
    ];
  }

  private buildOpsPhases(): void {
    if (!this.geom || !this.tt || !this.programVolumes) return;
    this.cronograma = buildCronograma(this.cronogramaSteps(this.programVolumes.slurry));
  }

  protected buildManualRecipeOpsPhases(): void {
    if (!this.geom || !this.manualRecipeResult) {
      this.manualCronograma = [];
      return;
    }
    const manualSlurryBbl = Number(this.manualRecipeResult.targetSlurryVolumeBbl) || this.manualVolumeBbl || this.geom.slurryTotal;
    this.manualCronograma = buildCronograma(this.cronogramaSteps(manualSlurryBbl));
  }

  /** Tempo total do cronograma, que as tabelas comparam ao TT 50 Bc. */
  cronogramaTotalMin(rows: CronogramaRow[]): number {
    return rows.at(-1)?.accumulatedMin ?? 0;
  }

  private buildRecipeDiags(): void {
    if (!this.geom || !this.tt) return;
    const diags: Diagnostic[] = [];
    const pumpTime = this.cronogramaTotalMin(this.cronograma);
    const tt50min = this.tt.t50 * 60;
    if (pumpTime > tt50min * 0.85) diags.push({ text: 'Tempo de bombeio próximo do TT 50 Bc', cls: 'danger' });
    else if (pumpTime > tt50min * 0.70) diags.push({ text: 'Margem de TT moderada', cls: 'warn' });
    else diags.push({ text: 'Margem de TT confortável', cls: 'ok' });
    this.recipeDiags = diags;
  }

  setTab(tab: TabId): void { this.activeTab = tab; }

  gerarCalculoRetiradaTubos(): void {
    this.simulate();
    if (!this.geom) return;
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.cementTopForPull();
    this.retiradaReport.abrirRetirada({ operacao: 'SQUEEZE', v, dadosRelatorio: this.dadosRelatorio, faseOperacao: this.phaseReportLabel, topoCimentoRetiradaM });
  }

  gerarCalculoCirculacaoReversa(): void {
    this.simulate();
    if (!this.geom) return;
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.cementTopForPull();
    this.retiradaReport.abrirCirculacaoReversa({ operacao: 'SQUEEZE', v, dadosRelatorio: this.dadosRelatorio, faseOperacao: this.phaseReportLabel, topoCimentoRetiradaM, tubingIdIn: Number(v.tubingID) });
  }

  addPerfuracao(): void {
    const last = this.perforacoes.length > 0
      ? this.perforacoes.at(this.perforacoes.length - 1).value
      : { top: 1420, base: 1440 };
    this.perforacoes.push(this.fb.group({ top: [last.base + 10], base: [last.base + 30] }));
  }

  removePerfuracao(i: number): void {
    if (this.perforacoes.length > 1) this.perforacoes.removeAt(i);
  }

  /** Rótulo pt-BR do limiar sugerido (ex.: "0,000075"). */
  get limiarSugeridoLabel(): string {
    const s = this.limiarInjetividadeSugerido;
    return s == null ? '' : s.toLocaleString('pt-BR', { maximumFractionDigits: 6 });
  }

  aplicarLimiarSugerido(): void {
    if (this.limiarInjetividadeSugerido == null) return;
    this.form.patchValue({ limiarInjetividadeBpmPsi: this.limiarInjetividadeSugerido });
  }

  gerarRelatorioConformidade(fator: FatorConformidade): void {
    this.simulate();
    if (!this.geom) return;
    if (!this.hydraulicSim || !this.geom) return;
    const geom = this.geom;
    const summary = this.squeezeResult?.summary;
    const retainer = this.technique === 'retainer';
    const plannedTop = retainer ? summary?.toolMD ?? geom.topCementAfterPullMD : this.cementTopForPull();
    this.conformidadeReport.abrir({
      operacao: 'SQUEEZE',
      fator,
      sim: this.hydraulicSim,
      dadosRelatorio: this.dadosRelatorio,
      v: this.reportForm(),
      // Topo planejado da pasta antes da compressão, em poço cheio: a pasta inteira
      // (Bradenhead, packer) ou o retentor, que é o topo da pasta abaixo dele.
      placement: {
        cementTopMD: plannedTop,
        cementBaseMD: geom.base,
        capBblM: geom.cementPhysicalCapacityBblM,
        displacementBbl: this.programVolumes?.displacement ?? geom.operationalDisplacementVolumeBbl,
        targetTopMD: plannedTop,
        predictedTopMD: (retainer ? summary?.cementTopAfterSqueezeMD : summary?.cementTopBeforeSqueezeMD) ?? undefined,
      },
      reSimulate: (o) => this.reSimulateHidraulica(o),
      motor: 'primaria',
      ...(retainer ? {} : { predictTopMD: (factor: number) => this.runSqueeze(this.form.getRawValue(), this.currentPerfs(),
        { displacementFactor: factor })?.summary.cementTopBeforeSqueezeMD ?? null }),
    });
  }

  private currentPerfs(): Perfuracao[] {
    return (this.form.getRawValue().perforacoes || []).map((p: any) => ({ top: geometryNumber(p.top), base: geometryNumber(p.base) }));
  }

  /** Re-simula o squeeze no motor com sobreposições (varredura de risco/sensibilidade). */
  private reSimulateHidraulica(o: VarreduraOverride): SqueezeHydraulicSimulation | null {
    const result = this.runSqueeze(this.form.getRawValue(), this.currentPerfs(), o);
    return result ? squeezeLegacyHydraulics(result, this.squeezeTvdOf()) : null;
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
    // Mantém casingOD/casingID/tubingOD/tubingID/caliper em `rest` para que a geometria
    // (revestimento/tubing/caliper) também seja restaurada ao carregar o cenário.
    const { additivos, perforacoes, fases, blocosCompressao, gradPoints,
            _dadosRelatorio, _manualVolumeBbl, _manualYieldFt3, _manualFacGpc, _manualFamGpc,
            _pastaParametrosSource, _manualBhstValue, _manualBhstUnit, _cementVolumeSource, _reportTemperatureMode,
            ...rest } = formValue as any;
    // Cenário salvo antes das técnicas (SPEC §8, T-20): Bradenhead, com a injeção de hoje.
    // Nada é gravado até o usuário salvar.
    const legacy = !('tecnicaSqueeze' in (formValue as object));
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
    if (legacy) {
      this.form.patchValue({ tecnicaSqueeze: 'bradenhead' }, { emitEvent: false });
      this.setBlocks(legacySqueezeBlocks(rest));
      this.legacyScenarioNotice = 'Cenário salvo antes das técnicas de squeeze: foi assumida a Bradenhead, com a injeção '
        + 'de hoje (volume, pressão e tempo de pressurização) como um bloco de compressão. Nada foi gravado; salve para manter.';
    } else {
      const saved = Array.isArray(blocosCompressao) ? blocosCompressao as { tipo: string; volumeBbl: number; vazaoBpm: number;
        duracaoMin: number; pressaoPsi: number }[] : [];
      this.setBlocks(saved.length ? saved.map(row => row.tipo === 'pressurize'
        ? { kind: 'pressurize' as const, durationMin: +row.duracaoMin || 0, surfacePressurePsi: +row.pressaoPsi || 0 }
        : { kind: 'inject' as const, volumeBbl: +row.volumeBbl || 0, rateBpm: +row.vazaoBpm || 0, surfacePressurePsi: +row.pressaoPsi || 0 })
        : legacySqueezeBlocks(rest));
      this.legacyScenarioNotice = null;
    }
    while (this.perforacoes.length > 0) this.perforacoes.removeAt(0);
    if (Array.isArray(perforacoes) && perforacoes.length > 0) {
      perforacoes.forEach((p: any) => this.perforacoes.push(this.fb.group({ top: [p.top], base: [p.base] })));
    } else {
      this.perforacoes.push(this.fb.group({ top: [1420], base: [1440] }));
    }
    // Cenário salvo antes das fases: a estrutura é migrada dos campos legados
    // de seção (adapter), e o intervalo da operação herda o antigo squeeze.
    this.setFases(Array.isArray(fases) && fases.length
      ? fases as WellPhaseFormValue[]
      : wellGeometryToForms(this.wellGeo.legacySectionToWellGeometry({
        sectionStartMD: this.toNumber(rest.sectionStartMD),
        sectionEndMD: this.toNumber(rest.sectionEndMD),
        sectionStartTVD: this.toNumber(rest.sectionStartTVD),
        sectionEndTVD: this.toNumber(rest.sectionEndTVD),
        wellFinalMD: this.toNumber(rest.wellFinalMD),
        wellFinalTVD: this.toNumber(rest.wellFinalTVD),
        holeDiameterIn: this.toNumber(rest.caliper),
        casingOD: this.toNumber(rest.casingOD),
        casingID: this.toNumber(rest.casingID),
      })));
    if (rest.operacaoTopoMD == null || rest.operacaoBaseMD == null) {
      this.form.patchValue({
        operacaoTopoMD: this.toNumber(rest.sectionStartMD),
        operacaoBaseMD: this.toNumber(rest.sectionEndMD),
      }, { emitEvent: false });
    }
    if (this.poco) this.dadosRelatorio.poco = this.poco.nome;
    this.simulate();
  }

  onTubingSelect(idx: string): void {
    if (idx === '') return;
    const t = this.tubingOptions[+idx];
    if (!t) return;
    this.form.patchValue({ tubingOD: t.odIn, tubingID: t.idIn });
  }

  openCapaModal(): void {
    this.simulate();
    if (!this.geom) return;
    const v = this.form.getRawValue();
    const tipoReceita = this.dadosRelatorio.tipoReceitaRelatorio ?? 'volume';
    const vazoesBombeio = this.mergeVazoesBombeio(this.dadosRelatorio.vazoesBombeio as RelatorioCapaData['vazoesBombeio']);
    const reportTemperature = this.getReportTemperature(v);
    const reportGeom = this.schematicGeom ?? this.geom;
    this.relatorioPrefill = {
      ...this.dadosRelatorio,
      faseOperacao: this.phaseReportLabel,
      tipoReceitaRelatorio: tipoReceita,
      vazoesBombeio,
      calculoTampaoPor: this.cementVolumeSource === 'receita' ? 'volume' : 'altura',
      inicioTampao: String(v.sectionStartMD ?? ''),
      fimTampao: String(v.sectionEndMD ?? ''),
      topoCimento: String(this.squeezeResult?.summary.cementTopAfterSqueezeMD ?? reportGeom?.topCementAfterInjectionMD ?? v.sectionStartMD ?? ''),
      baseTampao: String(reportGeom?.base ?? v.sectionEndMD ?? ''),
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
    if (!this.geom) return;
    const v = this.form.getRawValue();
    const tipoReceita = data.tipoReceitaRelatorio ?? 'volume';
    const reportTemperature = this.getReportTemperature(v);
    const vazoesBombeio = this.mergeVazoesBombeio(data.vazoesBombeio);
    const tubingODFormatted = v.tubingOD ? this.fmtInches(v.tubingOD) : '';
    const topoCimentoRetiradaM = this.cementTopForPull();
    const reverseCircBbl = this.buildReverseCirculationAfterPullingResult(
      v,
      topoCimentoRetiradaM,
      data.sequenciaOperacional,
    )?.reverseCirculationVolumeBbl ?? this.reverseCirculation?.reverseCirculationVolumeBbl ?? 0;
    const sequenciaOperacional = {
      ...data.sequenciaOperacional,
      colunaTrabalho: tubingODFormatted || data.sequenciaOperacional?.colunaTrabalho || '',
      colunaProfundidadeM: v.sectionEndMD ?? data.sequenciaOperacional?.colunaProfundidadeM ?? '',
      topoCimentoRetiradaM,
      testeInjetividadeDefinidoPor: data.cliente || data.origem || 'ORIGEM',
      pressaoTesteLinhasPsi: (Number(v.pressaoOperacao) || 2000) + 1000,
      volumeCirculacaoReversaBbl: reverseCircBbl,
      pressaoMaxSqueezePsi: Number(v.pressaoOperacao) || 2000,
      volumeMaxInjetadoBbl: Number(v.volMaxInjetadoBbl) || 2,
    };
    this.persistDadosRelatorioFromCapa(data, vazoesBombeio, sequenciaOperacional);
    this.saveDadosRelatorio();
    const reportFormSnapshot = JSON.stringify(this.form.getRawValue());
    this.captureGraficosImages(data.graficosOperacionaisSelecionados ?? []).then(graficosImages => {
      // A captura é assíncrona; mudanças no formulário invalidam este relatório.
      if (!this.geom || JSON.stringify(this.form.getRawValue()) !== reportFormSnapshot) return;
      const reportGeom = this.schematicGeom ?? this.geom;
      const reportHtml = this.relatorioBuilder.buildCapa({
        ...data,
        vazoesBombeio,
        zonaIsolarNome: data.zonaIsolarNome || this.dadosRelatorio.zonaIsolarNome,
        zonaIsolarTopo: String(v.sectionStartTVD ?? ''),
        zonaIsolarBase: String(v.sectionEndTVD ?? ''),
        calculoTampaoPor: this.cementVolumeSource === 'receita' ? 'volume' : 'altura',
        inicioTampao: String(v.sectionStartMD ?? ''),
        fimTampao: String(v.sectionEndMD ?? ''),
        topoCimento: String(this.squeezeResult?.summary.cementTopAfterSqueezeMD ?? reportGeom?.topCementAfterInjectionMD ?? v.sectionStartMD ?? ''),
        baseTampao: String(reportGeom?.base ?? v.sectionEndMD ?? ''),
        revestimento: this.formatCasing(v.casingOD, v.casingID),
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
    // O que o motor bombeia: a pasta inteira (com a injetada) e o deslocamento da técnica.
    const volumes = this.programVolumes;
    return [
      { fluido: 'Água a frente', volumeBbl: volumes?.front ?? this.geom?.frontPhysicalVolumeBbl ?? 0, vazaoBpm: vazao(vazoes?.fluidoFrenteBpm), densidadePpg: v.mudWeightFront },
      { fluido: pastaLabel, volumeBbl: volumes?.slurry ?? this.pastaBombeioVolumeBbl(), vazaoBpm: vazao(vazoes?.pastaBpm), densidadePpg: slurryDensity },
      { fluido: 'Água atrás', volumeBbl: volumes?.back ?? this.geom?.volBackSpacer ?? 0, vazaoBpm: vazao(vazoes?.fluidoAtrasBpm), densidadePpg: v.mudWeightBack },
      { fluido: 'Deslocamento', volumeBbl: volumes?.displacement ?? this.geom?.operationalDisplacementVolumeBbl ?? 0, vazaoBpm: vazao(vazoes?.deslocamentoBpm), densidadePpg: v.displacementWeight ?? v.completionWeight },
    ];
  }

  /** Um checkbox por gráfico na capa do relatório. */
  readonly reportChartOptions = SQUEEZE_REPORT_CHARTS;

  /** O formulário em ppg na TVD dos canhoneados, para os relatórios que leem um gradiente só. */
  private reportForm(): any {
    const v = this.form.getRawValue();
    const md = this.squeezeResult?.input.referenceMD;
    return this.formInPpg(v, md != null ? this.squeezeTvdOf()(md) : Number(v.sectionEndTVD) || 0);
  }

  /**
   * Gráficos operacionais do relatório em SVG (SPEC squeeze-tampao §7), um a um, na ordem do
   * catálogo. As seleções antigas valem por grupo: `pressao` → premissas, compressão, os
   * gráficos, perfil e planta; `cronograma` → as tabelas do cronograma e dos marcos de UCA.
   */
  private async captureGraficosImages(selecionados: GraficoOperacionalTipo[]): Promise<{ label: string; imagem: string }[]> {
    const chosen = new Set(expandReportChartSelection(selecionados, SQUEEZE_REPORT_CHARTS));
    const result: { label: string; imagem: string }[] = [];
    if (chosen.has('cronograma') && this.cronograma.length) {
      const total = this.cronogramaTotalMin(this.cronograma);
      const tt50 = this.tt ? this.tt.t50 * 60 : null;
      result.push({ label: 'Cronograma operacional', imagem: svgDataUrl(tableReportSvg('Cronograma operacional',
        ['Passo', 'Fluido', 'Volume (bbl)', 'Vazão (bpm)', 'Duração (min)', 'Acumulado (min)'],
        this.cronograma.map(row => [row.label, row.fluid ?? '—', row.volumeBbl === null ? '—' : this.fmt(row.volumeBbl),
          row.rateBpm === null ? '—' : this.fmt(row.rateBpm, 2), this.fmt(row.durationMin, 1), this.fmt(row.accumulatedMin, 1)]),
        [`Tempo total ${this.fmt(total, 1)} min` + (tt50 !== null ? ` | TT 50 Bc ${this.fmt(tt50, 0)} min | margem ${this.fmt(tt50 - total, 0)} min` : ''),
          'Durações do motor, com a compressão bloco a bloco.'])) });
    }
    if (chosen.has('uca') && this.cronograma.length)
      result.push({ label: 'Resistência à compressão (UCA)', imagem: svgDataUrl(tableReportSvg('Marcos de resistência (UCA)',
        ['Marco', 'Valor'], this.ucaRows(), ['Lidos da curva de UCA estimada da pasta.'])) });
    if (!this.operationCharts) return result;
    if (chosen.has('premissas'))
      result.push({ label: 'Premissas da simulação', imagem: svgDataUrl(tableReportSvg('Premissas da simulação hidráulica',
        ['Item', 'Tratamento'], SQUEEZE_PREMISSAS)) });
    if (chosen.has('compressao'))
      result.push({ label: 'Técnica e compressão', imagem: svgDataUrl(tableReportSvg(
        `Compressão - ${SQUEEZE_TECHNIQUE_LABELS[this.technique]}`,
        ['Bloco', 'Volume (bbl)', 'Vazão (bpm)', 'Tempo (min)', 'P sup. (psi)', 'P canh. máx (psi)', 'Limite (psi)'],
        this.compressionRows(), this.compressionNotes())) });
    if (chosen.has('janela-operacional') && this.criticalPoints)
      result.push({ label: 'Janela operacional - ponto crítico', imagem: svgDataUrl(criticalPointsTableSvg(this.criticalPoints)) });
    const phaseId = this.form.getRawValue().selectedPhaseId ?? 'all';
    for (const visual of operationReportVisuals(this.operationCharts, phaseId))
      if (chosen.has(reportChartId(visual.id))) result.push({ label: visual.title, imagem: svgDataUrl(visual.svg) });
    const view = this.well2dViews.find(entry => entry.id === phaseId) ?? this.well2dViews[0];
    if (view)
      for (const visual of primaryReportVisuals(view.model, view.id === 'all' ? undefined : { id: view.id, name: view.name }))
        if (chosen.has(reportChartId(visual.id))) result.push({ label: visual.title, imagem: svgDataUrl(visual.svg) });
    return result;
  }

  /** Blocos da compressão para a tela e o relatório. */
  compressionRows(): string[][] {
    return (this.squeezeResult?.compression?.blocks ?? []).map(block => [
      `${block.index + 1}. ${block.kind === 'inject' ? 'Injeção' : 'Pressurização'}`,
      block.kind === 'inject' ? this.fmt(block.pumpedBbl) : '—',
      block.kind === 'inject' && block.endMin > block.startMin ? this.fmt(block.pumpedBbl / (block.endMin - block.startMin), 2) : '—',
      this.fmt(block.endMin - block.startMin, 1),
      this.fmt(block.surfacePressurePsi, 0),
      this.fmt(block.maxPerforationPressurePsi, 0),
      `${this.fmt(block.maxLowPressureSurfacePsi, 0)}${block.highPressure ? ' (acima)' : ''}`,
    ]);
  }

  private compressionNotes(): string[] {
    const s = this.squeezeResult?.summary;
    if (!s) return [];
    return [
      `Extremidade na compressão: ${this.fmt(s.toolMD, 1)} m MD | pasta injetada ${this.fmt(s.injectedSlurryBbl)} bbl | fluido antes da pasta ${this.fmt(s.fluidAheadBbl)} bbl`,
      `Topo da pasta depois do squeeze: ${this.fmt(s.cementTopAfterSqueezeMD, 1)} m MD | cabeça do revestimento máx. ${this.fmt(s.maxCasingHeadPsi, 0)} psi`
        + (s.maxToolDifferentialPsi !== null ? ` | diferencial na ferramenta máx. ${this.fmt(s.maxToolDifferentialPsi, 0)} psi` : ''),
      'Limite = maior pressão de superfície que mantém o canhoneado mais crítico abaixo da fratura (squeeze de baixa pressão).',
    ];
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

  private formatCasing(od: unknown, id: unknown): string {
    const odText = this.formatInches(od);
    const idText = this.formatInches(id);
    const casing = this.findCasingOption(od, id);
    const weightText = casing ? `Peso ${this.fmt(casing.weightLbFt, 2)} lb/pé` : '';
    return [odText ? `OD ${odText}` : '', weightText, idText ? `ID ${idText}` : ''].filter(Boolean).join(' | ');
  }

  private findCasingOption(od: unknown, id: unknown): ApiTubular | undefined {
    const odNum = Number(od);
    const idNum = Number(id);
    if (!Number.isFinite(odNum) || !Number.isFinite(idNum)) return undefined;
    return this.casingOptions.find(c =>
      Math.abs(c.odIn - odNum) < 0.0005 &&
      Math.abs(c.idIn - idNum) < 0.0005,
    );
  }

  private formatInches(value: unknown): string {
    const n = Number(value);
    if (!Number.isFinite(n)) return '';
    const frac = this.inchFraction(n);
    return frac != null ? `${frac} in` : `${this.fmt(n, 3)} in`;
  }

}
