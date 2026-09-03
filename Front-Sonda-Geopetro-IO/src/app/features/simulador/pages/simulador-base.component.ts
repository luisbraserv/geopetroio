import { inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, Validators } from '@angular/forms';
import { CementSlurryRecipeRow, SlurryDesign, SlurryRecipe, SlurryRecipeByVolume } from '../models/pasta.model';
import { ADITIVOS_CATALOGO, AditivoCatalogo, Aditivo, unidadePadraoAditivo } from '../models/aditivo.model';
import { Rheology } from '../models/reologia.model';
import { AditivosStoreService } from '../services/aditivos-store.service';
import { SlurryCalculoService } from '../services/slurry-calculo.service';
import { CoreCalculoService, SqtTemperatureResult, TemperatureUnit } from '../services/core-calculo.service';
import { SimuladorStateStoreService, DadosRelatorio } from '../services/simulador-state-store.service';
import { RheologyAdjustmentResult } from '../services/rheology-adjustment.service';
import { RelatorioCapaData } from '../components/relatorio/relatorio-capa-modal.component';
import { OpsPhase } from '../components/charts/ops-chart.component';

/**
 * Lógica compartilhada entre os simuladores de squeeze e tampão:
 * formatação numérica/de receita, gestão de aditivos, receita manual por volume,
 * temperatura e dados do relatório. Os componentes a estendem; cada concreto define
 * `form`, `operacaoKey`, `simulate()` e `buildManualRecipeOpsPhases()`.
 */
export abstract class SimuladorBaseComponent {
  /** FormGroup principal do simulador (definido no componente concreto). */
  abstract form: FormGroup;
  /** Chave usada para persistir aditivos/estado por operação. */
  protected abstract readonly operacaoKey: 'squeeze' | 'tampao';
  /** Recalcula toda a simulação (implementado no componente concreto). */
  abstract simulate(): void;
  /** Recalcula o cronograma da receita por volume (depende de geom/plug). */
  protected abstract buildManualRecipeOpsPhases(): void;

  protected readonly fb = inject(FormBuilder);
  protected readonly aditivosStore = inject(AditivosStoreService);
  protected readonly slurryCalc = inject(SlurryCalculoService);
  protected readonly coreCalc = inject(CoreCalculoService);
  protected readonly stateStore = inject(SimuladorStateStoreService);

  // ── Estado compartilhado ──
  slurry: SlurryDesign | null = null;
  recipe: SlurryRecipe | null = null;
  manualRecipeResult: SlurryRecipeByVolume | null = null;
  temperatureResult: SqtTemperatureResult | null = null;
  rheologyResult: RheologyAdjustmentResult | null = null;
  manualRecipeOpsPhases: OpsPhase[] = [];

  manualVolumeBbl = 10;
  manualYieldFt3: number | null = null;
  manualFacGpc: number | null = null;
  manualFamGpc: number | null = null;
  pastaParametrosSource: 'simulador' | 'manual' = 'simulador';
  manualBhstValue: number | null = null;
  manualBhstUnit: TemperatureUnit = 'F';

  /**
   * Fonte da temperatura na seção "3.1 Temperatura" do relatório:
   * 'manual' usa a BHST manual informada (cai no automático se não houver);
   * 'automatica' força a BHST/SQT simuladas.
   */
  reportTemperatureMode: 'automatica' | 'manual' = 'manual';

  cementVolumeSource: 'simulador' | 'receita' = 'simulador';
  simuladorVolumeBbl = 0;

  dadosRelatorio: DadosRelatorio = {};

  aditivosModalOpen = false;

  // ── Formatação numérica ──
  fmt(v: number | null | undefined, dec = 2): string {
    if (v == null || !Number.isFinite(v)) return '-';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  fmtTime(h: number): string {
    if (!Number.isFinite(h)) return '-';
    const hh = Math.floor(h);
    const mm = Math.round((h - hh) * 60);
    return `${hh}h ${mm.toString().padStart(2, '0')}min`;
  }

  /**
   * Diâmetro em polegadas como fração de campo (2,875 → "2 7/8") quando o valor
   * casa com uma fração limpa de 1/16" (tolerância ~0,01"). Caso contrário
   * devolve null — ex.: IDs arbitrários como 4,778.
   */
  inchFraction(value: number | null | undefined): string | null {
    if (value == null || !Number.isFinite(value) || value <= 0) return null;
    const denom = 16;
    const scaled = value * denom;
    const rounded = Math.round(scaled);
    if (Math.abs(scaled - rounded) > 0.16) return null; // não é múltiplo limpo de 1/16"
    const whole = Math.floor(rounded / denom);
    let num = rounded - whole * denom;
    if (num === 0) return `${whole}`;
    let d = denom;
    while (num % 2 === 0) { num /= 2; d /= 2; }
    return whole > 0 ? `${whole} ${num}/${d}` : `${num}/${d}`;
  }

  /** Polegadas em fração de campo quando possível; senão decimal, com `suffix`. */
  fmtInches(value: number | null | undefined, suffix = '"'): string {
    const frac = this.inchFraction(value);
    return frac != null ? `${frac}${suffix}` : `${this.fmt(value, 3)}${suffix}`;
  }

  kgFromLb(v: number | null | undefined): number | null {
    return v == null || !Number.isFinite(v) ? null : v * 0.45359237;
  }

  litersFromGal(v: number | null | undefined): number | null {
    return v == null || !Number.isFinite(v) ? null : v * 3.785411784;
  }

  protected toNumber(value: unknown, fallback = 0): number {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  // ── Formatação de linhas de receita ──
  recipeQuantity(row: CementSlurryRecipeRow, scaled = false): number {
    if (this.isMassRecipeRow(row)) {
      return scaled
        ? (row.scaledMassKg ?? row.baseMassLb * 0.45359237)
        : row.baseMassLb * 0.45359237;
    }

    const gal = scaled ? (row.scaledVolumeGal ?? row.baseVolumeGal) : row.baseVolumeGal;
    return gal * 3.785411784;
  }

  recipeQuantityUnit(row: CementSlurryRecipeRow): 'kg' | 'L' {
    return this.isMassRecipeRow(row) ? 'kg' : 'L';
  }

  recipeQuantityText(row: CementSlurryRecipeRow, scaled = false): string {
    return `${this.fmt(this.recipeQuantity(row, scaled), scaled ? 1 : 3)} ${this.recipeQuantityUnit(row)}`;
  }

  recipeConcentrationText(row: CementSlurryRecipeRow): string {
    if (row.concentration === 'base') return row.concentrationUnit;
    const value = typeof row.concentration === 'number' ? this.fmt(row.concentration, 4) : row.concentration;
    return `${value}${row.concentrationUnit}`;
  }

  recipeItemLabel(row: CementSlurryRecipeRow): string {
    const labels: Record<string, string> = {
      cement: 'Cimento',
      water: 'Agua',
      liquidAdditive: this.additiveCategoryLabel(row),
      solidAdditive: this.additiveCategoryLabel(row),
      salt: 'Sal',
      silica: 'Silica',
    };
    return labels[row.type] ?? row.productName;
  }

  recipeCode(row: CementSlurryRecipeRow): string {
    return row.type === 'liquidAdditive' || row.type === 'solidAdditive' || row.type === 'salt' || row.type === 'silica'
      ? row.productName
      : '';
  }

  protected recipeReportQuantityText(row: CementSlurryRecipeRow, scaled = false): string {
    if (row.type === 'water') {
      const gal = scaled ? (row.scaledVolumeGal ?? row.baseVolumeGal) : row.baseVolumeGal;
      return `${this.fmt(gal / 42, 2)} bbl`;
    }

    return this.recipeQuantityText(row, scaled);
  }

  protected isMassRecipeRow(row: CementSlurryRecipeRow): boolean {
    return row.type === 'cement' || row.type === 'solidAdditive' || row.type === 'salt' || row.type === 'silica';
  }

  protected additiveCategoryLabel(row: CementSlurryRecipeRow): string {
    const name = row.productName.toLowerCase();
    if (name.includes('def') || name.includes('anti')) return 'Antiespumante';
    if (name.includes('bqflux') || name.includes('bq-20') || name.includes('dispers')) return 'Dispersante';
    if (name.includes('bqfl') || name.includes('fl-') || name.includes('polytrol')) return 'Controlador de filtrado';
    if (name.includes('bqrt') || name.includes('retard')) return 'Retardador';
    if (name.includes('bqac') || name.includes('aceler')) return 'Acelerador';
    return 'Aditivo';
  }

  // ── Aditivos ──
  get additivos(): FormArray { return this.form.get('additivos') as FormArray; }

  protected restoreAditivos(): void {
    const saved = this.aditivosStore.load(this.operacaoKey) as any[];
    saved.forEach(data => this.additivos.push(this.createAditivoGroup(data)));
  }

  onExportJson(): void {
    this.aditivosStore.exportJson(this.operacaoKey, this.additivos.getRawValue());
  }

  onImportJson(data: unknown[]): void {
    while (this.additivos.length) this.additivos.removeAt(0);
    (data as any[]).forEach(d => this.additivos.push(this.createAditivoGroup(d)));
    this.aditivosStore.save(this.operacaoKey, this.additivos.getRawValue());
  }

  protected createAditivoGroup(data: Partial<AditivoCatalogo & { conc: number; coefficients?: any }> = {}): FormGroup {
    const cat = ADITIVOS_CATALOGO.find(c => c.catalogId === data.catalogId);
    const source = { ...cat, ...data } as Partial<Aditivo>;
    return this.fb.group({
      catalogId: [data.catalogId ?? ''],
      name: [data.name ?? cat?.name ?? '', Validators.required],
      funcaoPrincipal: [data.funcaoPrincipal ?? cat?.funcaoPrincipal ?? cat?.primaryFunction ?? ''],
      conc: [data.conc ?? data.defaultConc ?? 0, [Validators.required, Validators.min(0)]],
      unidadeDosagem: [data.unidadeDosagem ?? unidadePadraoAditivo(source)],
      misturadoEm: [data.misturadoEm ?? cat?.misturadoEm ?? 'aguaMistura'],
      ativo: [data.ativo ?? true],
    });
  }

  addAditivo(): void {
    this.additivos.push(this.createAditivoGroup({ name: 'Novo Aditivo', category: 'retarder', type: 'liquid', conc: 0.03 }));
  }

  addAditivoCatalogo(cat: AditivoCatalogo): void {
    this.additivos.push(this.createAditivoGroup(cat));
  }

  removeAditivo(i: number): void { this.additivos.removeAt(i); }

  aditivoUnit(i: number): string {
    const ad = this.additivos.at(i);
    const unit = ad?.get('unidadeDosagem')?.value;
    return unit === 'percentBWOW' ? '% BWOW' : unit === 'percentBWOC' ? '% BWOC' : 'GPC';
  }

  openAditivosModal(): void { this.aditivosModalOpen = true; }

  closeAditivosModal(): void { this.aditivosModalOpen = false; }

  // ── Reologia / temperatura ──
  rheologySourceLabel(): string {
    const source = this.rheologyResult?.source;
    if (source === 'laboratorio' || source === 'theta') return 'Laboratório';
    if (source === 'catalogo') return 'Catálogo';
    if (source === 'estimado') return 'Estimado';
    return 'Base';
  }

  protected buildThetaReadings(v: any): Rheology {
    return {
      theta300: +v.theta300,
      theta200: +v.theta200,
      theta100: +v.theta100,
      theta60: +v.theta60,
      theta30: +v.theta30,
      theta20: +v.theta20,
      theta10: +v.theta10,
      theta6: +v.theta6,
      theta3: +v.theta3,
    };
  }

  protected resolveTemperatureResult(v: any, automaticBhstF: number): SqtTemperatureResult {
    const manual = this.manualBhstValue != null && Number.isFinite(this.manualBhstValue) && this.manualBhstValue > 0;
    return this.coreCalc.calcSqtFromBhst(
      manual ? this.manualBhstValue! : automaticBhstF,
      manual ? this.manualBhstUnit : 'F',
      Number(v.sectionEndTVD),
      manual ? 'manual' : 'automatica',
    );
  }

  // ── Receita manual por volume ──
  calcManualRecipe(): void {
    // Quando o esquemático usa o volume da receita, recalcula toda a geometria;
    // caso contrário só atualiza a receita por volume.
    if (this.cementVolumeSource === 'receita') {
      this.simulate();
    } else {
      this.computeManualRecipe();
      this.buildManualRecipeOpsPhases();
    }
  }

  onManualVolumeChange(value: string | number): void {
    this.manualVolumeBbl = Math.max(0, this.toNumber(value, 0));
    this.calcManualRecipe();
  }

  protected computeManualRecipe(): void {
    if (!this.slurry) { this.manualRecipeResult = null; this.manualRecipeOpsPhases = []; return; }
    const useManual = this.pastaParametrosSource === 'manual';
    const fac    = useManual ? this.manualFacGpc : this.recipe?.baseRecipe?.facGpc ?? null;
    const fam    = useManual ? this.manualFamGpc : this.recipe?.baseRecipe?.famGpc ?? null;
    const yield3 = useManual ? this.manualYieldFt3 : this.recipe?.baseRecipe?.yieldFt3PerFt3Cement ?? null;

    if (useManual && this.isPositive(fac) && this.isPositive(fam) && this.isPositive(yield3)) {
      this.manualRecipeResult = this.slurryCalc.buildSlurryRecipeByFacFam(
        this.slurry,
        this.manualVolumeBbl,
        fac!,
        fam!,
        yield3!,
      );
    } else if (useManual) {
      this.manualRecipeResult = this.emptyManualRecipeError(
        'Preencha rendimento, FAC e FAM manuais válidos para calcular.',
      );
    } else {
      const rec = this.slurryCalc.buildSlurryRecipe(this.manualVolumeBbl, this.slurry);
      this.manualRecipeResult = rec.volumeRecipe ?? null;
    }
  }

  protected buildRelatorioPastaResumo(tipo: RelatorioCapaData['tipoReceitaRelatorio']): RelatorioCapaData['pastaResumo'] {
    const base = this.recipe?.baseRecipe;
    const useManual = this.pastaParametrosSource === 'manual';

    return {
      tipo: tipo === 'volume' ? 'Receita por volume' : 'Receita da pasta',
      origem: useManual ? 'Manual' : 'Simulador',
      rendimentoFt3PerFt3Cement: useManual ? this.manualYieldFt3 ?? undefined : base?.yieldFt3PerFt3Cement,
      facGpc: useManual ? this.manualFacGpc ?? undefined : base?.facGpc,
      famGpc: useManual ? this.manualFamGpc ?? undefined : base?.famGpc,
    };
  }

  protected buildRelatorioReceitaRowsPorVolume(volumeBbl: number | string): RelatorioCapaData['receitaRows'] {
    if (!this.slurry) return [];

    const volume = Math.max(0, this.toNumber(volumeBbl, 0));
    if (volume <= 0) return [];

    const rows = this.buildReceitaRowsPorVolume(volume);
    return rows.map(row => ({
      aditivo: this.recipeItemLabel(row),
      codigo: this.recipeCode(row),
      concentracao: this.recipeConcentrationText(row),
      quantidade: this.recipeReportQuantityText(row, true),
    }));
  }

  private buildReceitaRowsPorVolume(volumeBbl: number): CementSlurryRecipeRow[] {
    if (!this.slurry) return [];

    const useManual = this.pastaParametrosSource === 'manual';
    const base = this.recipe?.baseRecipe;

    if (useManual) {
      const fac = this.manualFacGpc ?? base?.facGpc ?? null;
      const fam = this.manualFamGpc ?? base?.famGpc ?? null;
      const yield3 = this.manualYieldFt3 ?? base?.yieldFt3PerFt3Cement ?? null;
      if (!this.isPositive(fac) || !this.isPositive(fam) || !this.isPositive(yield3)) return [];
      return this.slurryCalc.buildSlurryRecipeByFacFam(this.slurry!, volumeBbl, fac!, fam!, yield3!).rows;
    }

    return this.slurryCalc.buildSlurryRecipe(volumeBbl, this.slurry).volumeRecipe?.rows ?? [];
  }

  private isPositive(value: number | null | undefined): boolean {
    return value != null && Number.isFinite(value) && value > 0;
  }

  setPastaParametrosSource(source: 'simulador' | 'manual'): void {
    this.pastaParametrosSource = source === 'manual' ? 'manual' : 'simulador';
    if (this.pastaParametrosSource === 'manual') this.prefillManualPastaParametros();
    this.calcManualRecipe();
  }

  pastaParametrosManual(): boolean {
    return this.pastaParametrosSource === 'manual';
  }

  pastaYieldInputValue(): number | null {
    return this.pastaParametrosManual()
      ? this.manualYieldFt3
      : this.recipe?.baseRecipe?.yieldFt3PerFt3Cement ?? null;
  }

  pastaFacInputValue(): number | null {
    return this.pastaParametrosManual()
      ? this.manualFacGpc
      : this.recipe?.baseRecipe?.facGpc ?? null;
  }

  pastaFamInputValue(): number | null {
    return this.pastaParametrosManual()
      ? this.manualFamGpc
      : this.recipe?.baseRecipe?.famGpc ?? null;
  }

  private prefillManualPastaParametros(): void {
    const base = this.recipe?.baseRecipe;
    if (!base) return;
    if (!this.isPositive(this.manualYieldFt3)) this.manualYieldFt3 = base.yieldFt3PerFt3Cement;
    if (!this.isPositive(this.manualFacGpc)) this.manualFacGpc = base.facGpc;
    if (!this.isPositive(this.manualFamGpc)) this.manualFamGpc = base.famGpc;
  }

  private emptyManualRecipeError(error: string): SlurryRecipeByVolume {
    return {
      targetSlurryVolumeBbl: this.manualVolumeBbl,
      targetSlurryVolumeFt3: this.manualVolumeBbl * 5.6146,
      yieldFt3PerFt3Cement: this.manualYieldFt3 ?? 0,
      cementVolumeFt3: 0,
      sacks94lb: 0,
      scaleFactor: 0,
      totalCementLb: 0,
      totalCementKg: 0,
      totalMixWaterGal: 0,
      totalMixWaterBbl: 0,
      facGpc: this.manualFacGpc ?? undefined,
      famGpc: this.manualFamGpc ?? undefined,
      rows: [],
      error,
    };
  }

  onCementVolumeSourceChange(source: 'simulador' | 'receita'): void {
    this.cementVolumeSource = source;
    this.simulate();
  }

  setManualBhstValue(value: string | number | null): void {
    const n = this.toNumber(value, NaN);
    this.manualBhstValue = Number.isFinite(n) && n > 0 ? n : null;
    this.simulate();
  }

  setManualBhstUnit(unit: TemperatureUnit): void {
    this.manualBhstUnit = unit === 'C' ? 'C' : 'F';
    this.simulate();
  }

  setReportTemperatureMode(mode: 'automatica' | 'manual'): void {
    this.reportTemperatureMode = mode === 'automatica' ? 'automatica' : 'manual';
  }

  // ── Dados do relatório / vazões ──
  saveDadosRelatorio(): void {
    this.stateStore.saveDadosRelatorio(this.operacaoKey, this.dadosRelatorio);
  }

  onClienteLogoSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Selecione um arquivo de imagem.');
      input.value = '';
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      alert('Selecione uma imagem de logo com no maximo 2 MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.dadosRelatorio.clienteLogoNome = file.name;
      this.dadosRelatorio.clienteLogoImagem = String(reader.result || '');
      this.saveDadosRelatorio();
    };
    reader.readAsDataURL(file);
  }

  clearClienteLogo(): void {
    this.dadosRelatorio.clienteLogoNome = '';
    this.dadosRelatorio.clienteLogoImagem = '';
    this.saveDadosRelatorio();
  }

  setVazaoBombeio(campo: keyof NonNullable<DadosRelatorio['vazoesBombeio']>, valor: string | number): void {
    const vazoes = this.dadosRelatorio.vazoesBombeio ?? {};
    vazoes[campo] = valor;
    this.dadosRelatorio.vazoesBombeio = vazoes;
    this.saveDadosRelatorio();
    // As vazões por fluido alimentam o cronograma e a simulação hidráulica.
    this.simulate();
  }

  /**
   * Vazão de bombeio de um fluido (bpm), informada em "Dados do Relatório".
   * Cada fluido tem sua própria vazão; quando não preenchida, cai no
   * pumpRate do form (vazão geral legada).
   */
  vazaoFluido(campo: keyof NonNullable<DadosRelatorio['vazoesBombeio']>): number {
    const n = this.toNumber(this.dadosRelatorio.vazoesBombeio?.[campo], NaN);
    if (Number.isFinite(n) && n > 0) return n;
    const fallback = this.toNumber(this.form?.get('pumpRate')?.value, NaN);
    return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
  }

  // ── Sequência operacional (editável na sidebar e no relatório) ──
  protected ensureSequenciaDefaults(): void {
    this.dadosRelatorio.sequenciaOperacional = {
      comprimentoTuboM: 9.4,
      secoesAcimaTopoCimento: 2,
      tubosPorSecao: 2,
      minPrimeirosTubos: 3,
      minDemaisTubos: 6,
      tempoMaxPressurizacaoH: '01:00h',
      tempoBombeabilidade: '04:31 h',
      tempoResistencia: '08:00 h',
      pressaoResistenciaPsi: 1500,
      ...(this.dadosRelatorio.sequenciaOperacional ?? {}),
    };
    this.recomputeMinPorSecao();
  }

  setSeqOp(campo: string, valor: string | number): void {
    const seq = this.dadosRelatorio.sequenciaOperacional ?? {};
    seq[campo] = valor;
    this.dadosRelatorio.sequenciaOperacional = seq;
    if (campo === 'tubosPorSecao' || campo === 'minPrimeirosTubos') this.recomputeMinPorSecao();
    this.saveDadosRelatorio();
  }

  // Min. por seção = tubos por seção × min. por tubo (sempre automático)
  private recomputeMinPorSecao(): void {
    const seq = this.dadosRelatorio.sequenciaOperacional;
    if (!seq) return;
    seq['minDemaisTubos'] = (Number(seq['tubosPorSecao']) || 0) * (Number(seq['minPrimeirosTubos']) || 0);
  }

  protected mergeVazoesBombeio(vazoes?: RelatorioCapaData['vazoesBombeio']): RelatorioCapaData['vazoesBombeio'] {
    const saved = this.dadosRelatorio.vazoesBombeio ?? {};
    return {
      fluidoFrenteBpm: this.firstFilled(vazoes?.fluidoFrenteBpm, saved.fluidoFrenteBpm, ''),
      pastaBpm: this.firstFilled(vazoes?.pastaBpm, saved.pastaBpm, ''),
      fluidoAtrasBpm: this.firstFilled(vazoes?.fluidoAtrasBpm, saved.fluidoAtrasBpm, ''),
      deslocamentoBpm: this.firstFilled(vazoes?.deslocamentoBpm, saved.deslocamentoBpm, ''),
    };
  }

  protected firstFilled(...values: unknown[]): number | string {
    const value = values.find(item => item != null && String(item).trim() !== '');
    return (value ?? '') as number | string;
  }

  protected persistDadosRelatorioFromCapa(
    data: RelatorioCapaData,
    vazoesBombeio: RelatorioCapaData['vazoesBombeio'],
    sequenciaOperacional: RelatorioCapaData['sequenciaOperacional'] = data.sequenciaOperacional,
  ): void {
    this.dadosRelatorio = {
      ...this.dadosRelatorio,
      cliente: data.cliente,
      clienteLogoNome: data.clienteLogoNome ?? this.dadosRelatorio.clienteLogoNome,
      clienteLogoImagem: data.clienteLogoImagem ?? this.dadosRelatorio.clienteLogoImagem,
      preparadoPara: data.preparadoPara,
      documento: data.documento,
      preparadoPor: data.preparadoPor,
      revisadoPor: data.revisadoPor,
      data: data.data,
      versao: data.versao,
      origem: data.origem,
      poco: data.poco,
      campo: data.campo,
      sonda: data.sonda,
      jobNum: data.jobNum,
      pais: data.pais ?? this.dadosRelatorio.pais,
      zonaIsolarNome: data.zonaIsolarNome ?? this.dadosRelatorio.zonaIsolarNome,
      tipoReceitaRelatorio: data.tipoReceitaRelatorio ?? 'volume',
      esquematicosSelecionados: data.esquematicosSelecionados,
      graficosOperacionaisSelecionados: data.graficosOperacionaisSelecionados ?? [],
      vazoesBombeio,
      sequenciaOperacional: sequenciaOperacional as any,
      esquemaMecanicoNome: data.esquemaMecanicoNome,
      esquemaMecanicoImagem: data.esquemaMecanicoImagem,
      secoesPersonalizadas: data.secoesPersonalizadas ?? [],
      operacao: data.operacao,
    };
  }

  onMechanicalSchematicSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Selecione uma imagem com no máximo 5 MB.');
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.dadosRelatorio.esquemaMecanicoNome = file.name;
      this.dadosRelatorio.esquemaMecanicoImagem = String(reader.result || '');
      this.saveDadosRelatorio();
    };
    reader.readAsDataURL(file);
  }
}
