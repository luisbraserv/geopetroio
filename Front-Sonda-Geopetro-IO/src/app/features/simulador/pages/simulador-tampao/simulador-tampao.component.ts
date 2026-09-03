import { Component, OnInit, OnDestroy, signal, computed, ViewChild, ChangeDetectorRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormGroup } from '@angular/forms';
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
import { ThickeningChartComponent } from '../../components/charts/thickening-chart.component';
import { UcaChartComponent } from '../../components/charts/uca-chart.component';
import { PressureChartComponent } from '../../components/charts/pressure-chart.component';
import { OpsChartComponent, OpsPhase } from '../../components/charts/ops-chart.component';
import { SchematicTampaoComponent } from '../../components/charts/schematic-tampao.component';
import { AditivoModalComponent } from '../../components/aditivos/aditivo-modal.component';
import { SimuladorStateModalComponent } from '../../components/state-modal/simulador-state-modal.component';

import { RheologyAdjustmentService, BASE_SLURRY_RHEOLOGY } from '../../services/rheology-adjustment.service';

import { PlugGeometry, TampaoInputs, PressureProfile } from '../../models/tampao.model';
import { SqueezeGeometry, SqueezeHydraulicSimulation, SqueezeInputs } from '../../models/squeeze.model';
import { SqueezeHydraulicSimulationService } from '../../services/squeeze-hydraulic-simulation.service';
import { SqueezeOperationChartsComponent } from '../../components/charts/squeeze-operation-charts.component';
import { Diagnostic } from '../../models/pasta.model';
import { ThickeningResult, UCAResult } from '../../models/reologia.model';
import { ADITIVOS_CATALOGO, AditivoCatalogo, Aditivo, hydrateAditivosFromCatalog } from '../../models/aditivo.model';
import { CEMENT_CLASSES } from '../../models/constantes';
import { API_CASING_SIZES, API_TUBING_SIZES, ApiTubular } from '../../models/api-tubulares';

type TabId = 'recipe' | 'manualRecipe' | 'rheology' | 'pressure' | 'schematic';

@Component({
  selector: 'app-simulador-tampao',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ReactiveFormsModule,
    RelatorioViewerComponent,
    RelatorioCapaModalComponent,
    ThickeningChartComponent,
    UcaChartComponent,
    PressureChartComponent,
    OpsChartComponent,
    SqueezeOperationChartsComponent,
    SchematicTampaoComponent,
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
    { id: 'rheology', label: '3. Reologia' },
    { id: 'pressure', label: '4. Simulação' },
    { id: 'schematic', label: '5. Esquemático' },
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
  pressureProfile: PressureProfile | null = null;
  // Simulação hidráulica temporal (tubo em U) — mesma engine do squeeze, sem fase de injeção
  hydraulicSim: SqueezeHydraulicSimulation | null = null;
  rheoDiags: Diagnostic[] = [];
  recipeDiags: Diagnostic[] = [];
  reverseCirculation: ReverseCirculationResult | null = null;
  freeWater = 0;
  geoFormula = '';

  // Cronograma
  opsPhases: OpsPhase[] = [];

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
  secTampaoOpen = false;
  secSimuladorOpen = false;

  // Padrões capturados após buildForm() — usados ao carregar cenários antigos
  private formDefaults: Record<string, unknown> = {};
  private defaultManualVolumeBbl = 10;
  secDadosOpen = false;
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
  @ViewChild('reportOpsChart') reportOpsChart?: OpsChartComponent;
  @ViewChild('reportPressureChart') reportPressureChart?: PressureChartComponent;

  protected readonly operacaoKey = 'tampao' as const;

  constructor(
    private testsCalc: TestsCalculoService,
    private tampaoCalc: TampaoCalculoService,
    private reverseCirculationCalc: ReverseCirculationCalculoService,
    private rheologyAdj: RheologyAdjustmentService,
    private relatorioBuilder: RelatorioBuilderService,
    private retiradaReport: RetiradaTubosReportService,
    private conformidadeReport: ConformidadeOperacionalReportService,
    private plugHydraulics: SqueezeHydraulicSimulationService,
    private cdr: ChangeDetectorRef,
  ) { super(); }

  ngOnInit(): void {
    this.dadosRelatorio = this.stateStore.loadDadosRelatorio('tampao');
    this.ensureSequenciaDefaults();
    this.buildForm();
    // Snapshot dos padrões do formulário: ao carregar um cenário salvo antes de
    // novos campos existirem, os ausentes voltam ao padrão (reprodução exata).
    const { additivos: _a, ...defaults } = this.form.getRawValue();
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

  private buildForm(): void {
    this.form = this.fb.group({
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
      fracGrad: [16.0], poreGrad: [9.0], pumpRate: [3.0], pressaoOperacao: [2000],
      pause1: [0], pause2: [0], pause3: [0],
      density: [15.8], cementClass: ['G'],
      waterSplitFresh: [100], waterSplitSea: [0],
      silica: [35], nacl: [0],
      theta300: [181], theta200: [132], theta100: [79],
      theta60: [53], theta30: [31], theta20: [23],
      theta10: [13], theta6: [9], theta3: [6],
      roughness: ['medium'],
      viscosidadeAguaCp: [1.0],
      freeFallMaxFactor: [3.5],
      standoffPct: [80],
      motorHP: [1000], pumpEff: [90],
      maxSurfacePressure: [5000], maxPumpRate: [8.0],
      additivos: this.fb.array([]),
    });
  }

  simulate(): void {
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

    const thetaReadings = this.buildThetaReadings(v);
    const aditivosRaw = hydrateAditivosFromCatalog((v.additivos || []) as Aditivo[]);

    this.tampaoInputsSnapshot = inputs;
    // Geometria base (volume do simulador) — referência exibida no seletor
    this.plug = this.tampaoCalc.calcPlug(inputs);
    this.simuladorVolumeBbl = this.plug.volCementTotal;
    // Geometria SÓ do esquemático/relatório: segue a escolha do seletor, de forma independente
    this.schematicPlug = (this.cementVolumeSource === 'receita' && this.manualVolumeBbl > 0)
      ? this.tampaoCalc.calcPlug(inputs, this.manualVolumeBbl)
      : this.plug;
    this.reverseCirculation = this.buildReverseCirculationResult(v);
    this.slurry = this.slurryCalc.calculateSlurryDesign({ ...vWithBHT, additivos: aditivosRaw } as any);
    this.recipe = this.slurryCalc.buildSlurryRecipe(this.plug.volCementTotal, this.slurry);
    this.computeManualRecipe();

    this.tt = this.testsCalc.simulateThickening(this.slurry, v.sectionEndTVD, thetaReadings);
    this.uca = this.testsCalc.simulateUCA(this.slurry, this.tt);
    this.freeWater = this.testsCalc.estimateFreeWater(this.slurry);
    this.rheoDiags = this.testsCalc.rheoDiagnostics(this.slurry, this.tt, this.freeWater);

    this.rheologyResult = this.rheologyAdj.applyAdditiveRheologyEffects(BASE_SLURRY_RHEOLOGY, aditivosRaw, { thetaReadings });

    this.pressureProfile = this.tampaoCalc.calcPressureProfile(this.plug, this.slurry, inputs);
    this.hydraulicSim = this.buildHydraulicSimulation(v, aditivosRaw, thetaReadings);

    this.buildOpsPhases();
    this.buildManualRecipeOpsPhases();
    this.buildRecipeDiags();
    // App zoneless: simulate() roda em callback assíncrono (debounce do valueChanges).
    // markForCheck() agenda a detecção de mudança (e o ngOnChanges dos filhos, como o
    // esquemático) sem forçar CD síncrona — evitando reentrância no fluxo do modal.
    this.cdr.markForCheck();
  }

  /**
   * Reaproveita a simulação hidráulica do squeeze (tubo em U, fricção F-40)
   * para o tampão: mesmas fases de bombeio, sem a fase de injeção. A referência
   * de pressão é a base do tampão (ponto mais crítico do plug balanceado).
   */
  private buildHydraulicSimulation(v: any, aditivos: Aditivo[], thetaReadings: any, override: VarreduraOverride = {}): SqueezeHydraulicSimulation | null {
    if (!this.plug || !this.slurry) return null;
    const plug = this.plug;
    const dispFactor = override.displacementFactor && override.displacementFactor !== 1 ? override.displacementFactor : 1;
    const f = override.rateFactor ?? 1;
    const geom = {
      tubingID_m: plug.capPipe,
      annulusCasing_m: plug.capAnn,
      tID: Number(v.pipeID) || 2.764,
      // Geometria do anular para a fricção do retorno (F-40 c/ standoff)
      cID: Number(v.holeID) || 8.535,
      tOD: Number(v.pipeOD) || 3.5,
      frontPhysicalVolumeBbl: plug.frontPhysicalVolumeBbl,
      slurryTotal: plug.volCementTotal,
      volBackSpacer: plug.volBackSpacer,
      operationalDisplacementVolumeBbl: plug.volDisplacement * dispFactor,
      slurryInjectedVolumeBbl: 0,
    } as SqueezeGeometry;
    const inputs = {
      ...v,
      modoOperacao: 'tampao',
      rugosidadeTubo: v.roughness,
      standoffPct: override.standoffPct ?? v.standoffPct,
      densidadePastaPpg: override.density,
      topoCanhoneadoMD: plug.pTop,
      baseCanhoneadoMD: plug.pBase,
      topoCanhoneadoTVD: Number(v.sectionStartTVD) || plug.pTop,
      baseCanhoneadoTVD: Number(v.sectionEndTVD) || plug.pBase,
      profundidadeReferenciaSqueezeMD: plug.pBase,
      profundidadeReferenciaSqueezeTVD: Number(v.sectionEndTVD) || plug.pBase,
      vazaoAguaFrenteBpm: this.vazaoFluido('fluidoFrenteBpm') * f,
      vazaoPastaBpm: this.vazaoFluido('pastaBpm') * f,
      vazaoAguaAtrasBpm: this.vazaoFluido('fluidoAtrasBpm') * f,
      vazaoDeslocamentoBpm: this.vazaoFluido('deslocamentoBpm') * f,
    } as SqueezeInputs;
    try {
      return this.plugHydraulics.simulate(geom, this.slurry, inputs, [], aditivos, { thetaReadings });
    } catch (e) {
      console.error('[tampao] hydraulic sim error:', e);
      return null;
    }
  }

  /** Re-simula a hidráulica do tampão com sobreposições (varredura de risco/sensibilidade). */
  private reSimulateHidraulica(o: VarreduraOverride): SqueezeHydraulicSimulation | null {
    const v = this.form.getRawValue();
    const aditivosRaw = hydrateAditivosFromCatalog((v.additivos || []) as Aditivo[]);
    const thetaReadings = this.buildThetaReadings(v);
    return this.buildHydraulicSimulation(v, aditivosRaw, thetaReadings, o);
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

  private buildOpsPhases(): void {
    if (!this.plug || !this.slurry || !this.tt) return;
    const v = this.form.getRawValue();
    // Cada fluido usa a vazão informada em "Dados do Relatório" (bpm)
    const bbl2min = (vol: number, rate: number) => rate > 0 ? Math.max(0, vol || 0) / rate : 0;
    const pause1 = Math.max(0, Number(v.pause1) || 0);
    const pause2 = Math.max(0, Number(v.pause2) || 0);
    const pause3 = Math.max(0, Number(v.pause3) || 0);
    this.opsPhases = [
      { label: 'Água Frente', durationMin: bbl2min(this.plug.volWashTotal, this.vazaoFluido('fluidoFrenteBpm')), color: '#bae6fd' },
      ...(pause1 > 0 ? [{ label: 'Pausa 1', durationMin: pause1, color: '#cbd5e1' }] : []),
      { label: 'Pasta', durationMin: bbl2min(this.pastaBombeioVolumeBbl(), this.vazaoFluido('pastaBpm')), color: '#bbf7d0' },
      ...(pause2 > 0 ? [{ label: 'Pausa 2', durationMin: pause2, color: '#94a3b8' }] : []),
      { label: 'Água Atrás', durationMin: bbl2min(this.plug.volBackSpacer, this.vazaoFluido('fluidoAtrasBpm')), color: '#e9d5ff' },
      ...(pause3 > 0 ? [{ label: 'Pausa 3', durationMin: pause3, color: '#64748b' }] : []),
      { label: 'Deslocamento', durationMin: bbl2min(this.plug.volDisplacement, this.vazaoFluido('deslocamentoBpm')), color: '#fed7aa' },
    ].filter(phase => phase.durationMin > 0);
  }

  protected buildManualRecipeOpsPhases(): void {
    if (!this.plug || !this.manualRecipeResult) {
      this.manualRecipeOpsPhases = [];
      return;
    }
    const v = this.form.getRawValue();
    const bbl2min = (vol: number, rate: number) => rate > 0 ? Math.max(0, vol || 0) / rate : 0;
    const pause1 = Math.max(0, Number(v.pause1) || 0);
    const pause2 = Math.max(0, Number(v.pause2) || 0);
    const pause3 = Math.max(0, Number(v.pause3) || 0);
    const manualSlurryBbl = Number(this.manualRecipeResult.targetSlurryVolumeBbl) || this.manualVolumeBbl || this.plug.volCementTotal;
    this.manualRecipeOpsPhases = [
      { label: 'Água Frente', durationMin: bbl2min(this.plug.volWashTotal, this.vazaoFluido('fluidoFrenteBpm')), color: '#bae6fd' },
      ...(pause1 > 0 ? [{ label: 'Pausa 1', durationMin: pause1, color: '#cbd5e1' }] : []),
      { label: 'Pasta', durationMin: bbl2min(manualSlurryBbl, this.vazaoFluido('pastaBpm')), color: '#bbf7d0' },
      ...(pause2 > 0 ? [{ label: 'Pausa 2', durationMin: pause2, color: '#94a3b8' }] : []),
      { label: 'Água Atrás', durationMin: bbl2min(this.plug.volBackSpacer, this.vazaoFluido('fluidoAtrasBpm')), color: '#e9d5ff' },
      ...(pause3 > 0 ? [{ label: 'Pausa 3', durationMin: pause3, color: '#64748b' }] : []),
      { label: 'Deslocamento', durationMin: bbl2min(this.plug.volDisplacement, this.vazaoFluido('deslocamentoBpm')), color: '#fed7aa' },
    ].filter(phase => phase.durationMin > 0);
  }

  private buildRecipeDiags(): void {
    if (!this.plug || !this.slurry || !this.tt) return;
    const v = this.form.getRawValue();
    const diags: Diagnostic[] = [];
    const pumpTime = this.opsPhases.reduce((s, p) => s + p.durationMin, 0);
    const tt50min = this.tt.t50 * 60;
    if (pumpTime > tt50min * 0.85) diags.push({ text: 'Tempo de bombeio próximo do TT 50 Bc', cls: 'danger' });
    else if (pumpTime > tt50min * 0.70) diags.push({ text: 'Margem de TT moderada', cls: 'warn' });
    else diags.push({ text: 'Margem de TT confortável', cls: 'ok' });
    if (this.plug.volCementTotal < 0.5) diags.push({ text: 'Volume de pasta muito pequeno', cls: 'warn' });
    this.recipeDiags = diags;
  }

  setTab(tab: TabId): void { this.activeTab = tab; }

  gerarCalculoRetiradaTubos(): void {
    if (!this.plug) this.simulate();
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.plug?.topCementWithoutTubing ?? v.sectionStartMD;
    this.retiradaReport.abrirRetirada({ operacao: 'TAMPÃO', v, dadosRelatorio: this.dadosRelatorio, topoCimentoRetiradaM });
  }

  gerarCalculoCirculacaoReversa(): void {
    if (!this.plug) this.simulate();
    const v = this.form.getRawValue();
    const topoCimentoRetiradaM = this.plug?.topCementWithoutTubing ?? v.sectionStartMD;
    this.retiradaReport.abrirCirculacaoReversa({ operacao: 'TAMPÃO', v, dadosRelatorio: this.dadosRelatorio, topoCimentoRetiradaM, tubingIdIn: Number(v.pipeID) });
  }

  gerarRelatorioConformidade(fator: FatorConformidade): void {
    if (!this.hydraulicSim || !this.plug) return;
    const plug = this.plug;
    this.conformidadeReport.abrir({
      operacao: 'TAMPÃO',
      fator,
      sim: this.hydraulicSim,
      dadosRelatorio: this.dadosRelatorio,
      v: this.form.getRawValue(),
      placement: {
        cementTopMD: plug.topCementWithoutTubing,
        cementBaseMD: plug.pBase,
        capBblM: plug.cementPhysicalCapacityBblM,
        displacementBbl: plug.volDisplacement,
        targetTopMD: plug.topCementWithoutTubing,
      },
      reSimulate: (o) => this.reSimulateHidraulica(o),
    });
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
    // Mantém holeID/pipeOD/pipeID em `rest` para que a geometria (poço/coluna) também
    // seja restaurada ao carregar o cenário.
    const { additivos,
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
    this.simulate();
  }

  onCasingSelect(idx: string): void {
    if (idx === '') return;
    const c = this.casingOptions[+idx];
    if (!c) return;
    this.form.patchValue({ holeID: c.idIn });
  }

  onTubingSelect(idx: string): void {
    if (idx === '') return;
    const t = this.tubingOptions[+idx];
    if (!t) return;
    this.form.patchValue({ pipeOD: t.odIn, pipeID: t.idIn });
  }

  openCapaModal(): void {
    const v = this.form.getRawValue();
    const tipoReceita = this.dadosRelatorio.tipoReceitaRelatorio ?? 'volume';
    const vazoesBombeio = this.mergeVazoesBombeio(this.dadosRelatorio.vazoesBombeio as RelatorioCapaData['vazoesBombeio']);
    const reportTemperature = this.getReportTemperature(v);
    const reportPlug = this.schematicPlug ?? this.plug;
    this.relatorioPrefill = {
      ...this.dadosRelatorio,
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
    this.captureGraficosImages(data.graficosOperacionaisSelecionados ?? []).then(graficosImages => {
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

  private async captureGraficosImages(selecionados: GraficoOperacionalTipo[]): Promise<{ label: string; imagem: string }[]> {
    const result: { label: string; imagem: string }[] = [];
    if (selecionados.includes('cronograma') && this.reportOpsChart) {
      const imgs = await this.reportOpsChart.renderForReport();
      result.push(...imgs);
    }
    if (selecionados.includes('pressao') && this.reportPressureChart) {
      const url = await this.reportPressureChart.renderForReport();
      if (url) result.push({ label: 'Envelope de Pressão', imagem: url });
    }
    return result;
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
      theta300: 181, theta200: 132, theta100: 79, theta60: 53, theta30: 31, theta20: 23,
      theta10: 13, theta6: 9, theta3: 6, roughness: 'medium',
      viscosidadeAguaCp: 1.0, freeFallMaxFactor: 3.5, standoffPct: 80,
      motorHP: 1000, pumpEff: 90, maxSurfacePressure: 5000, maxPumpRate: 8.0,
    });
    while (this.additivos.length) this.additivos.removeAt(0);
  }
}
