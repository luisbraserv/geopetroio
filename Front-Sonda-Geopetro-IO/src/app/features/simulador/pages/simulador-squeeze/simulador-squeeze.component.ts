import { Component, OnInit, OnDestroy, ViewChild, ChangeDetectorRef } from '@angular/core';
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
import { ThickeningChartComponent } from '../../components/charts/thickening-chart.component';
import { UcaChartComponent } from '../../components/charts/uca-chart.component';
import { OpsChartComponent, OpsPhase } from '../../components/charts/ops-chart.component';
import { SqueezeSchematicsComponent } from '../../components/charts/squeeze-schematics.component';
import { SqueezeOperationChartsComponent } from '../../components/charts/squeeze-operation-charts.component';
import { AditivoModalComponent } from '../../components/aditivos/aditivo-modal.component';
import { SimuladorStateModalComponent } from '../../components/state-modal/simulador-state-modal.component';
import { SqueezeHydraulicSimulationService } from '../../services/squeeze-hydraulic-simulation.service';
import { RheologyAdjustmentService, BASE_SLURRY_RHEOLOGY } from '../../services/rheology-adjustment.service';
import { RetiradaTubosReportService } from '../../services/retirada-tubos-report.service';
import { ConformidadeOperacionalReportService, FatorConformidade, VarreduraOverride } from '../../services/conformidade-operacional-report.service';
import { SimuladorBaseComponent } from '../simulador-base.component';

import { SqueezeGeometry, SqueezeInputs, Perfuracao, SqueezeHydraulicSimulation } from '../../models/squeeze.model';
import { Diagnostic } from '../../models/pasta.model';
import { ThickeningResult, UCAResult } from '../../models/reologia.model';
import { ADITIVOS_CATALOGO, AditivoCatalogo, Aditivo, hydrateAditivosFromCatalog } from '../../models/aditivo.model';
import { CEMENT_CLASSES } from '../../models/constantes';
import { API_CASING_SIZES, API_TUBING_SIZES, ApiTubular } from '../../models/api-tubulares';

type TabId = 'recipe' | 'manualRecipe' | 'rheology' | 'simulations' | 'schematic';

@Component({
  selector: 'app-simulador-squeeze',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RelatorioViewerComponent,
    ThickeningChartComponent,
    UcaChartComponent,
    OpsChartComponent,
    SqueezeSchematicsComponent,
    SqueezeOperationChartsComponent,
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
    { id: 'rheology', label: '3. Reologia' },
    { id: 'simulations', label: '4. Simulações' },
    { id: 'schematic', label: '5. Esquemático' },
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
  fracResult: { fracPsi: number; porePsi: number; squeezePsi: number } | null = null;
  hydraulicSim: SqueezeHydraulicSimulation | null = null;
  /** Limiar de injetividade sugerido p/ o cenário (2 × Q ÷ janela poro→fratura). */
  limiarInjetividadeSugerido: number | null = null;
  reverseCirculation: ReverseCirculationResult | null = null;
  freeWater = 0;
  geoFormula = '';
  opsPhases: OpsPhase[] = [];

  relatorioVisivel = false;
  relatorioTitulo = '';
  relatorioConteudo = '';
  capaModalOpen = false;
  relatorioPrefill: Partial<RelatorioCapaData> | Record<string, any> = {};
  stateModalOpen = false;

  @ViewChild('stateModal') stateModal!: SimuladorStateModalComponent;
  @ViewChild('reportSchematics') reportSchematics?: SqueezeSchematicsComponent;
  @ViewChild('reportOpsChart') reportOpsChart?: OpsChartComponent;
  @ViewChild('reportPressureCharts') reportPressureCharts?: SqueezeOperationChartsComponent;

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
  secTampaoOpen = false;
  secSimuladorOpen = false;

  // Padrões capturados após buildForm() — usados ao carregar cenários antigos
  private formDefaults: Record<string, unknown> = {};
  private defaultManualVolumeBbl = 5;
  secDadosOpen = false;
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
    private squeezeHydraulics: SqueezeHydraulicSimulationService,
    private rheologyAdj: RheologyAdjustmentService,
    private relatorioBuilder: RelatorioBuilderService,
    private retiradaReport: RetiradaTubosReportService,
    private conformidadeReport: ConformidadeOperacionalReportService,
    private cdr: ChangeDetectorRef,
  ) { super(); }

  ngOnInit(): void {
    this.dadosRelatorio = this.stateStore.loadDadosRelatorio('squeeze');
    this.ensureSequenciaDefaults();
    this.buildForm();
    // Snapshot dos padrões do formulário: ao carregar um cenário salvo antes de
    // novos campos existirem, os ausentes voltam ao padrão (reprodução exata).
    const { additivos: _a, perforacoes: _p, ...defaults } = this.form.getRawValue();
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

  private buildForm(): void {
    this.form = this.fb.group({
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
      fracGrad: [16.0], poreGrad: [9.0], pumpRate: [2.0],
      pressaoOperacao: [2000],
      volMaxInjetadoBbl: [2.0],
      tempoPressurizacaoMin: [0],
      limiarInjetividadeBpmPsi: [0.001],
      roughness: ['low'],
      viscosidadeAguaCp: [1.0],
      freeFallMaxFactor: [3.5],
      standoffPct: [80],
      motorHP: [1000], pumpEff: [90],
      maxSurfacePressure: [5000], maxPumpRate: [8.0],
      pause1: [0], pause2: [0], pause3: [0],
      density: [15.8], cementClass: ['G'],
      waterSplitFresh: [100], waterSplitSea: [0],
      silica: [35], nacl: [0],
      theta300: [181], theta200: [132], theta100: [79],
      theta60: [53], theta30: [31], theta20: [23],
      theta10: [13], theta6: [9], theta3: [6],
      additivos: this.fb.array([]),
      perforacoes: this.fb.array([
        this.fb.group({ top: [1420], base: [1440] }),
      ]),
    });
  }

  simulate(): void {
    try {
      const v = this.form.getRawValue();
      const perfs: Perfuracao[] = (v.perforacoes || []).map((p: any) => ({ top: +p.top, base: +p.base }));

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
        rugosidadeTubo: v.roughness,
      } as SqueezeInputs;
      this.squeezeInputsSnapshot = inputs;
      // Geometria base (volume do simulador) — sempre alimenta "1. Receita da Simulação" e a hidráulica
      this.geom = this.squeezeCalc.calcVolumes(inputs, perfs);
      this.simuladorVolumeBbl = this.geom.slurryPhysicalVolumeBbl;
      // Geometria SÓ do esquemático/relatório: segue a escolha do seletor, de forma independente
      this.schematicGeom = (this.cementVolumeSource === 'receita' && this.manualVolumeBbl > 0)
        ? this.squeezeCalc.calcVolumes(inputs, perfs, this.manualVolumeBbl)
        : this.geom;
      this.reverseCirculation = this.buildReverseCirculationResult(v);
      const thetaReadings = this.buildThetaReadings(v);
      const aditivosRaw = hydrateAditivosFromCatalog((v.additivos || []) as Aditivo[]);

      this.slurry = this.slurryCalc.calculateSlurryDesign({ ...vWithBHT, additivos: aditivosRaw } as any);
      this.recipe = this.slurryCalc.buildSlurryRecipe(this.geom.slurryTotal, this.slurry);
      this.computeManualRecipe();

      this.tt = this.testsCalc.simulateThickening(this.slurry, v.sectionEndTVD, thetaReadings);
      this.uca = this.testsCalc.simulateUCA(this.slurry, this.tt);
      this.freeWater = this.testsCalc.estimateFreeWater(this.slurry);
      this.rheoDiags = this.testsCalc.rheoDiagnostics(this.slurry, this.tt, this.freeWater);
      this.fracResult = this.squeezeCalc.calcFractureGradient(this.geom, inputs);

      this.rheologyResult = this.rheologyAdj.applyAdditiveRheologyEffects(BASE_SLURRY_RHEOLOGY, aditivosRaw, { thetaReadings });
      // Cada fluido é bombeado com a vazão informada em "Dados do Relatório"
      this.hydraulicSim = this.squeezeHydraulics.simulate(this.geom, this.slurry, {
        ...inputs,
        vazaoAguaFrenteBpm: this.vazaoFluido('fluidoFrenteBpm'),
        vazaoPastaBpm: this.vazaoFluido('pastaBpm'),
        vazaoAguaAtrasBpm: this.vazaoFluido('fluidoAtrasBpm'),
        vazaoDeslocamentoBpm: this.vazaoFluido('deslocamentoBpm'),
      }, perfs, aditivosRaw, { thetaReadings });

      // Limiar de injetividade sugerido p/ o cenário (arredondado a 2 algarismos
      // significativos p/ exibição/aplicação); null quando faltam volume/tempo.
      const limiarRaw = this.conformidadeReport.limiarInjetividadeSugerido(this.hydraulicSim, v);
      this.limiarInjetividadeSugerido = limiarRaw != null ? +limiarRaw.toPrecision(2) : null;

      this.buildOpsPhases();
      this.buildManualRecipeOpsPhases();
      this.buildRecipeDiags();
      // App zoneless: simulate() roda em callback assíncrono (debounce do valueChanges).
      // markForCheck() agenda a detecção de mudança (e o ngOnChanges dos filhos, como o
      // esquemático) sem forçar CD síncrona — evitando reentrância no fluxo do modal.
      this.cdr.markForCheck();
    } catch (e) {
      console.error('[squeeze] simulate error:', e);
    }
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

  pastaBombeioVolumeBbl(): number {
    return this.resolvePastaBombeioVolumeBbl(this.schematicGeom ?? this.geom);
  }

  private resolvePastaBombeioVolumeBbl(geom?: SqueezeGeometry | null): number {
    if (!geom) return 0;
    const physical = Number(geom.slurryPhysicalVolumeBbl);
    if (Number.isFinite(physical) && physical > 0) return physical;
    const work = Number(geom.workVolumeBbl);
    if (Number.isFinite(work) && work > 0) return work;
    return Number(geom.slurryTotal) || 0;
  }

  private buildOpsPhases(): void {
    if (!this.geom || !this.tt) return;
    const v = this.form.getRawValue();
    // Cada fluido usa a vazão informada em "Dados do Relatório" (bpm)
    const bbl2min = (vol: number, rate: number) => rate > 0 ? Math.max(0, vol || 0) / rate : 0;
    const pause1 = Math.max(0, Number(v.pause1) || 0);
    const pause2 = Math.max(0, Number(v.pause2) || 0);
    const pause3 = Math.max(0, Number(v.pause3) || 0);
    const pressurizacao = Math.max(0, Number(v.tempoPressurizacaoMin) || 0);
    this.opsPhases = [
      { label: 'Água Frente', durationMin: bbl2min(this.geom.frontPhysicalVolumeBbl, this.vazaoFluido('fluidoFrenteBpm')), color: '#bae6fd' },
      ...(pause1 > 0 ? [{ label: 'Pausa 1', durationMin: pause1, color: '#cbd5e1' }] : []),
      { label: 'Pasta', durationMin: bbl2min(this.pastaBombeioVolumeBbl(), this.vazaoFluido('pastaBpm')), color: '#bbf7d0' },
      ...(pause2 > 0 ? [{ label: 'Pausa 2', durationMin: pause2, color: '#94a3b8' }] : []),
      { label: 'Água Atrás', durationMin: bbl2min(this.geom.volBackSpacer, this.vazaoFluido('fluidoAtrasBpm')), color: '#e9d5ff' },
      ...(pause3 > 0 ? [{ label: 'Pausa 3', durationMin: pause3, color: '#64748b' }] : []),
      { label: 'Deslocamento', durationMin: bbl2min(this.geom.operationalDisplacementVolumeBbl, this.vazaoFluido('deslocamentoBpm')), color: '#fed7aa' },
      ...(pressurizacao > 0 ? [{ label: 'Pressurização', durationMin: pressurizacao, color: '#fecaca' }] : []),
    ].filter(phase => phase.durationMin > 0);
  }

  protected buildManualRecipeOpsPhases(): void {
    if (!this.geom || !this.manualRecipeResult) {
      this.manualRecipeOpsPhases = [];
      return;
    }
    const v = this.form.getRawValue();
    const bbl2min = (vol: number, rate: number) => rate > 0 ? Math.max(0, vol || 0) / rate : 0;
    const pause1 = Math.max(0, Number(v.pause1) || 0);
    const pause2 = Math.max(0, Number(v.pause2) || 0);
    const pause3 = Math.max(0, Number(v.pause3) || 0);
    const pressurizacao = Math.max(0, Number(v.tempoPressurizacaoMin) || 0);
    const manualSlurryBbl = Number(this.manualRecipeResult.targetSlurryVolumeBbl) || this.manualVolumeBbl || this.geom.slurryTotal;
    this.manualRecipeOpsPhases = [
      { label: 'Água Frente', durationMin: bbl2min(this.geom.frontPhysicalVolumeBbl, this.vazaoFluido('fluidoFrenteBpm')), color: '#bae6fd' },
      ...(pause1 > 0 ? [{ label: 'Pausa 1', durationMin: pause1, color: '#cbd5e1' }] : []),
      { label: 'Pasta', durationMin: bbl2min(manualSlurryBbl, this.vazaoFluido('pastaBpm')), color: '#bbf7d0' },
      ...(pause2 > 0 ? [{ label: 'Pausa 2', durationMin: pause2, color: '#94a3b8' }] : []),
      { label: 'Água Atrás', durationMin: bbl2min(this.geom.volBackSpacer, this.vazaoFluido('fluidoAtrasBpm')), color: '#e9d5ff' },
      ...(pause3 > 0 ? [{ label: 'Pausa 3', durationMin: pause3, color: '#64748b' }] : []),
      { label: 'Deslocamento', durationMin: bbl2min(this.geom.operationalDisplacementVolumeBbl, this.vazaoFluido('deslocamentoBpm')), color: '#fed7aa' },
      ...(pressurizacao > 0 ? [{ label: 'Pressurização', durationMin: pressurizacao, color: '#fecaca' }] : []),
    ].filter(phase => phase.durationMin > 0);
  }

  private buildRecipeDiags(): void {
    if (!this.geom || !this.tt) return;
    const diags: Diagnostic[] = [];
    const pumpTime = this.opsPhases.reduce((s, p) => s + p.durationMin, 0);
    const tt50min = this.tt.t50 * 60;
    if (pumpTime > tt50min * 0.85) diags.push({ text: 'Tempo de bombeio próximo do TT 50 Bc', cls: 'danger' });
    else if (pumpTime > tt50min * 0.70) diags.push({ text: 'Margem de TT moderada', cls: 'warn' });
    else diags.push({ text: 'Margem de TT confortável', cls: 'ok' });
    this.recipeDiags = diags;
  }

  setTab(tab: TabId): void { this.activeTab = tab; }

  gerarCalculoRetiradaTubos(): void {
    if (!this.geom) this.simulate();
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.geom
      ? this.geom.deepestPerf - this.geom.cementHeightWithoutTubing
      : v.sectionStartMD;
    this.retiradaReport.abrirRetirada({ operacao: 'SQUEEZE', v, dadosRelatorio: this.dadosRelatorio, topoCimentoRetiradaM });
  }

  gerarCalculoCirculacaoReversa(): void {
    if (!this.geom) this.simulate();
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.geom
      ? this.geom.deepestPerf - this.geom.cementHeightWithoutTubing
      : v.sectionStartMD;
    this.retiradaReport.abrirCirculacaoReversa({ operacao: 'SQUEEZE', v, dadosRelatorio: this.dadosRelatorio, topoCimentoRetiradaM, tubingIdIn: Number(v.tubingID) });
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
    if (!this.hydraulicSim || !this.geom) return;
    const geom = this.geom;
    this.conformidadeReport.abrir({
      operacao: 'SQUEEZE',
      fator,
      sim: this.hydraulicSim,
      dadosRelatorio: this.dadosRelatorio,
      v: this.form.getRawValue(),
      // Topo planejado da pasta = topo sem coluna antes da injeção (redistribuída
      // no revestimento cheio) — cementPhysicalTopMD é o topo da seção, não da pasta.
      placement: {
        cementTopMD: geom.topCementAfterPullMD,
        cementBaseMD: geom.base,
        capBblM: geom.cementPhysicalCapacityBblM,
        displacementBbl: geom.operationalDisplacementVolumeBbl,
        targetTopMD: geom.topCementAfterPullMD,
      },
      reSimulate: (o) => this.reSimulateHidraulica(o),
    });
  }

  /** Re-simula a hidráulica com sobreposições (varredura de risco/sensibilidade). */
  private reSimulateHidraulica(o: VarreduraOverride): SqueezeHydraulicSimulation | null {
    if (!this.geom || !this.slurry || !this.squeezeInputsSnapshot) return null;
    const v = this.form.getRawValue();
    const perfs: Perfuracao[] = (v.perforacoes || []).map((pp: any) => ({ top: +pp.top, base: +pp.base }));
    const aditivosRaw = hydrateAditivosFromCatalog((v.additivos || []) as Aditivo[]);
    const thetaReadings = this.buildThetaReadings(v);
    const f = o.rateFactor ?? 1;
    const geom = (o.displacementFactor && o.displacementFactor !== 1)
      ? { ...this.geom, operationalDisplacementVolumeBbl: this.geom.operationalDisplacementVolumeBbl * o.displacementFactor }
      : this.geom;
    try {
      return this.squeezeHydraulics.simulate(geom, this.slurry, {
        ...this.squeezeInputsSnapshot,
        standoffPct: o.standoffPct ?? this.squeezeInputsSnapshot.standoffPct,
        densidadePastaPpg: o.density,
        vazaoAguaFrenteBpm: this.vazaoFluido('fluidoFrenteBpm') * f,
        vazaoPastaBpm: this.vazaoFluido('pastaBpm') * f,
        vazaoAguaAtrasBpm: this.vazaoFluido('fluidoAtrasBpm') * f,
        vazaoDeslocamentoBpm: this.vazaoFluido('deslocamentoBpm') * f,
      }, perfs, aditivosRaw, { thetaReadings });
    } catch (e) {
      console.error('[squeeze] reSimulate error:', e);
      return null;
    }
  }

  openStateModal(): void {
    this.stateModal?.setCurrentForm({
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
    // Mantém casingOD/casingID/tubingOD/tubingID/caliper em `rest` para que a geometria
    // (revestimento/tubing/caliper) também seja restaurada ao carregar o cenário.
    const { additivos, perforacoes,
            _dadosRelatorio, _manualVolumeBbl, _manualYieldFt3, _manualFacGpc, _manualFamGpc,
            _pastaParametrosSource, _manualBhstValue, _manualBhstUnit, _cementVolumeSource, _reportTemperatureMode,
            ...rest } = formValue as any;
    // Padrões primeiro: campos que não existiam quando o cenário foi salvo
    // não herdam o valor da tela — voltam ao padrão do simulador.
    // Cenários antigos usavam completionWeight também como fluido de deslocamento.
    if (rest.displacementWeight == null && rest.completionWeight != null) rest.displacementWeight = rest.completionWeight;
    this.form.patchValue(this.formDefaults, { emitEvent: false });
    this.form.patchValue(rest, { emitEvent: false });
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
    while (this.perforacoes.length > 0) this.perforacoes.removeAt(0);
    if (Array.isArray(perforacoes) && perforacoes.length > 0) {
      perforacoes.forEach((p: any) => this.perforacoes.push(this.fb.group({ top: [p.top], base: [p.base] })));
    } else {
      this.perforacoes.push(this.fb.group({ top: [1420], base: [1440] }));
    }
    this.simulate();
  }

  onCasingSelect(idx: string): void {
    if (idx === '') return;
    const c = this.casingOptions[+idx];
    if (!c) return;
    this.form.patchValue({ casingOD: c.odIn, casingID: c.idIn });
  }

  onTubingSelect(idx: string): void {
    if (idx === '') return;
    const t = this.tubingOptions[+idx];
    if (!t) return;
    this.form.patchValue({ tubingOD: t.odIn, tubingID: t.idIn });
  }

  openCapaModal(): void {
    const v = this.form.getRawValue();
    const tipoReceita = this.dadosRelatorio.tipoReceitaRelatorio ?? 'volume';
    const vazoesBombeio = this.mergeVazoesBombeio(this.dadosRelatorio.vazoesBombeio as RelatorioCapaData['vazoesBombeio']);
    const reportTemperature = this.getReportTemperature(v);
    const reportGeom = this.schematicGeom ?? this.geom;
    this.relatorioPrefill = {
      ...this.dadosRelatorio,
      tipoReceitaRelatorio: tipoReceita,
      vazoesBombeio,
      calculoTampaoPor: this.cementVolumeSource === 'receita' ? 'volume' : 'altura',
      inicioTampao: String(v.sectionStartMD ?? ''),
      fimTampao: String(v.sectionEndMD ?? ''),
      topoCimento: String(reportGeom?.topCementAfterInjectionMD ?? v.sectionStartMD ?? ''),
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
    const v = this.form.getRawValue();
    const tipoReceita = data.tipoReceitaRelatorio ?? 'volume';
    const reportTemperature = this.getReportTemperature(v);
    const vazoesBombeio = this.mergeVazoesBombeio(data.vazoesBombeio);
    const tubingODFormatted = v.tubingOD ? this.fmtInches(v.tubingOD) : '';
    const topoCimentoRetiradaM = this.geom
      ? this.geom.deepestPerf - this.geom.cementHeightWithoutTubing
      : v.sectionStartMD;
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
    this.captureGraficosImages(data.graficosOperacionaisSelecionados ?? []).then(graficosImages => {
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
        topoCimento: String(reportGeom?.topCementAfterInjectionMD ?? v.sectionStartMD ?? ''),
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
    const slurryVolBbl = this.pastaBombeioVolumeBbl();
    return [
      { fluido: 'Água a frente', volumeBbl: this.geom?.washVolFront ?? this.geom?.frontPhysicalVolumeBbl ?? 0, vazaoBpm: vazao(vazoes?.fluidoFrenteBpm), densidadePpg: v.mudWeightFront },
      { fluido: pastaLabel, volumeBbl: slurryVolBbl, vazaoBpm: vazao(vazoes?.pastaBpm), densidadePpg: slurryDensity },
      { fluido: 'Água atrás', volumeBbl: this.geom?.volBackSpacer ?? 0, vazaoBpm: vazao(vazoes?.fluidoAtrasBpm), densidadePpg: v.mudWeightBack },
      { fluido: 'Deslocamento', volumeBbl: this.geom?.operationalDisplacementVolumeBbl ?? this.geom?.displacementVolume ?? 0, vazaoBpm: vazao(vazoes?.deslocamentoBpm), densidadePpg: v.displacementWeight ?? v.completionWeight },
    ];
  }

  private async captureGraficosImages(selecionados: GraficoOperacionalTipo[]): Promise<{ label: string; imagem: string }[]> {
    const result: { label: string; imagem: string }[] = [];
    if (selecionados.includes('cronograma') && this.reportOpsChart) {
      const imgs = await this.reportOpsChart.renderForReport();
      result.push(...imgs);
    }
    if (selecionados.includes('pressao') && this.reportPressureCharts) {
      const imgs = await this.reportPressureCharts.renderForReport();
      result.push(...imgs);
    }
    return result;
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
