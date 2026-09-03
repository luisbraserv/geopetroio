import { AfterViewInit, ChangeDetectorRef, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SqueezeGeometry, SqueezeHydraulicSimulation, SqueezeInputs } from '../../models/squeeze.model';
import { SlurryDesign, SlurryRecipe } from '../../models/pasta.model';
import { ADJUSTED_SCHEMATIC_NOTE, computeVisualSegmentHeights, displaySubtitleForSegment, formatBbl, formatM, formatPpg, formatPsi, joinInfoParts, layoutDepthAnnotations, SchematicInfoSection, shouldShowSegmentLabel, visibleInfoRows, visualYForDepth, visualYForSegmentBoundary, VisualSegment, VisualSegmentInput } from './visual-segments';
import { SchematicWellboreComponent, WellboreSchematicConfig } from './schematic-wellbore.component';

type SqueezeSegmentKey = 'completionFluid' | 'displacementFluid' | 'frontWater' | 'backWater' | 'cement' | 'cementTubing' | 'cementAnnulus';

interface SqueezeSegment {
  key: SqueezeSegmentKey;
  name: string;
  sub: string;
  top: number;
  bottom: number;
  color: string;
}

export interface SqueezeSchematicModel {
  mode: 'withTubing' | 'withoutTubing';
  showTubing: boolean;
  showFormation: true;
  showCasing: true;
  topPerfMD: number;
  basePerfMD: number;
  perfs: { top: number; base: number }[];
  lanes: string[];
  segments: SqueezeSegment[];
  tubingSegments: SqueezeSegment[];
  annulusSegments: SqueezeSegment[];
  hasPerforations: boolean;
}

export function createSqueezeSchematicModel(
  mode: 'withTubing' | 'withoutTubing',
  geom: SqueezeGeometry,
  simulation: SqueezeHydraulicSimulation,
): SqueezeSchematicModel {
  const withoutTubingSegments = createWithoutTubingSegments(geom);
  const withTubing = createWithTubingSegments(geom, simulation);

  return {
    mode,
    showTubing: mode === 'withTubing',
    showFormation: true,
    showCasing: true,
    topPerfMD: simulation.summary.topPerfMD,
    basePerfMD: simulation.summary.basePerfMD,
    perfs: (geom.perfs || [])
      .map(p => ({ top: p.top, base: p.base }))
      .filter(p => Number.isFinite(p.top) && Number.isFinite(p.base) && p.base > p.top)
      .sort((a, b) => a.top - b.top),
    lanes: mode === 'withTubing'
      ? ['Dentro do tubing', 'Anular / poço']
      : ['Formação', 'Revestimento', 'Interior do poço', 'Revestimento', 'Formação'],
    segments: withoutTubingSegments,
    tubingSegments: withTubing.tubingSegments,
    annulusSegments: withTubing.annulusSegments,
    hasPerforations: mode === 'withoutTubing' && Number.isFinite(simulation.summary.topPerfMD) && Number.isFinite(simulation.summary.basePerfMD),
  };
}

function createWithoutTubingSegments(geom: SqueezeGeometry): SqueezeSegment[] {
  const base = Math.max(0, geom.base || geom.cementPhysicalBaseMD || 0);
  const finalCapacity = Math.max(geom.finalCapacity_m || geom.cementPhysicalCapacityBblM || 0, 0.0001);
  const displacementHeight = Math.max(0, geom.operationalDisplacementVolumeBbl || geom.displacementVolume || 0) / finalCapacity;
  const cementHeight = Math.max(0, geom.cementHeightWithoutTubing || geom.cementPhysicalHeight || 0);
  const backHeight = Math.max(0, geom.backPhysicalHeight || geom.backOperationalHeight || 0);
  const frontHeight = Math.max(0, geom.frontPhysicalHeight || geom.frontOperationalHeight || 0);
  const topCement = Math.max(0, base - cementHeight);
  const topBack = Math.max(0, topCement - backHeight);
  const topFront = Math.max(0, topBack - frontHeight);
  const topDisplacement = Math.max(0, topFront - displacementHeight);

  // Deslocamento = fluido de deslocamento + espaçador frente + espaçador trás
  // apresentados como um único fluido (volume e altura = soma dos três).
  const displacementVolTotal =
    (geom.operationalDisplacementVolumeBbl || geom.displacementVolume || 0) +
    (geom.frontPhysicalVolumeBbl || geom.washVolFront || 0) +
    (geom.volBackSpacer || geom.backPhysicalVolumeBbl || 0);
  const displacementHeightTotal = Math.max(0, topCement - topDisplacement);

  const segments: SqueezeSegment[] = [
    { key: 'completionFluid', name: 'Fluido de Completação do poço', sub: 'Fluido do poço', top: 0, bottom: topDisplacement, color: '#bae6fd' },
    { key: 'displacementFluid', name: 'Deslocamento', sub: `${fmt(displacementVolTotal)} bbl | ${fmt(displacementHeightTotal, 0)} m`, top: topDisplacement, bottom: topCement, color: '#93c5fd' },
    { key: 'cement', name: 'Cimento', sub: `${fmt(geom.slurryPhysicalVolumeBbl || geom.slurryTotal)} bbl | ${fmt(cementHeight, 1)} m`, top: topCement, bottom: base, color: '#fb923c' },
  ];
  return segments.filter(segment => segment.bottom > segment.top);
}

function createWithTubingSegments(geom: SqueezeGeometry, simulation: SqueezeHydraulicSimulation): { tubingSegments: SqueezeSegment[]; annulusSegments: SqueezeSegment[] } {
  // Mesma lógica do tampão: usar os valores já calculados pelo serviço, não recalcular dividindo por capacidade.
  const base = Math.max(0, geom.base || geom.cementPhysicalBaseMD || simulation.summary.basePerfMD || 0);

  // Capacidades reais de cada coluna
  const tubeCap = Math.max(geom.tubingID_m || 0, 0.0001);
  const annCap  = Math.max(geom.annulusCasing_m || 0, 0.0001);
  const capWithTubing = tubeCap + annCap;

  // ── Altura do cimento com a coluna imersa: pasta no anular + interior da coluna ──
  const cementTubeHeight = Math.max(0, (geom.slurryPhysicalVolumeBbl || 0) / capWithTubing);

  // Volume proporcional à capacidade de cada coluna
  const slurryPhysical  = geom.slurryPhysicalVolumeBbl || 0;
  const cementVolTubing = slurryPhysical * (tubeCap / capWithTubing);
  const cementVolAnn    = slurryPhysical * (annCap  / capWithTubing);

  // Coluna: água trás e deslocamento em altura dentro do tubing
  const backHeight         = Math.max(0, geom.backPhysicalHeight || geom.backOperationalHeight || 0);
  const displacementVol    = geom.operationalDisplacementVolumeBbl || geom.displacementVolume || 0;
  const displacementHeight = Math.max(0, displacementVol / tubeCap);

  const cementTubeTop   = Math.max(0, base - cementTubeHeight);
  const backTop         = Math.max(0, cementTubeTop - backHeight);
  const displacementTop = Math.max(0, backTop - displacementHeight);

  // Anular: mesmo topo de cimento (balanceado), água frente em altura no anular
  const frontHeight = Math.max(0, geom.frontPhysicalHeight || geom.frontOperationalHeight || 0);
  const frontTop    = Math.max(0, cementTubeTop - frontHeight);

  const tubingAll: SqueezeSegment[] = [
    { key: 'displacementFluid', name: 'Fluido de Deslocamento', sub: `${fmt(displacementVol)} bbl | ${fmt(displacementHeight, 0)} m`, top: displacementTop, bottom: backTop, color: '#93c5fd' },
    { key: 'backWater',         name: 'Espaçador Trás',               sub: `${fmt(geom.volBackSpacer || geom.backPhysicalVolumeBbl)} bbl | ${fmt(backHeight, 0)} m`, top: backTop, bottom: cementTubeTop, color: '#d8b4fe' },
    { key: 'cementTubing',      name: 'Cimento tubing',          sub: `${fmt(cementVolTubing)} bbl | ${fmt(cementTubeHeight, 1)} m`, top: cementTubeTop, bottom: base, color: '#fb923c' },
  ];

  const annulusAll: SqueezeSegment[] = [
    { key: 'completionFluid', name: 'Fluido de Completação', sub: 'Fluido do poço', top: 0, bottom: frontTop, color: '#bae6fd' },
    { key: 'frontWater',      name: 'Espaçador Frente',           sub: `${fmt(geom.frontPhysicalVolumeBbl || geom.washVolFront)} bbl | ${fmt(frontHeight, 0)} m`, top: frontTop, bottom: cementTubeTop, color: '#d8b4fe' },
    { key: 'cementAnnulus',   name: 'Cimento anular',        sub: `${fmt(cementVolAnn)} bbl | ${fmt(cementTubeHeight, 1)} m`, top: cementTubeTop, bottom: base, color: '#fb923c' },
  ];

  return {
    tubingSegments: tubingAll.filter(segment => segment.bottom > segment.top),
    annulusSegments: annulusAll.filter(segment => segment.bottom > segment.top),
  };
}

function fmt(v: number | null | undefined, dec = 2): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

@Component({
  selector: 'app-squeeze-schematics',
  standalone: true,
  imports: [CommonModule, SchematicWellboreComponent],
  template: `
    <div class="schema-row">
      <div class="schema-card">
        <div class="schema-card-head">
          <div>
            <div class="schema-title">Com Tubing (Squeeze)</div>
            <div class="schema-sub">Tubing e anular com sequências independentes</div>
          </div>
          <button class="schema-save-btn" type="button" (click)="saveWithTubing()" title="Salvar imagem">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Salvar
          </button>
        </div>
        <canvas #withTubing></canvas>
      </div>
      <div class="schema-card">
        <div class="schema-card-head">
          <div>
            <div class="schema-title">Sem Tubing (Squeeze final)</div>
            <div class="schema-sub">Poço final sem coluna, com canhoneados indicados</div>
          </div>
          <button class="schema-save-btn" type="button" (click)="saveWithoutTubing()" title="Salvar imagem">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Salvar
          </button>
        </div>
        <canvas #withoutTubing></canvas>
      </div>
      @if (wellboreConfig) {
        <app-schematic-wellbore [config]="wellboreConfig"></app-schematic-wellbore>
      }
    </div>
  `,
  styles: [`
    .schema-row{display:grid;grid-template-columns:1fr;gap:16px}
    .schema-card{padding:12px;border:1px solid var(--color-card-border,#e2e8f0);border-radius:8px;background:var(--color-card,#fff)}
    .schema-card-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px}
    .schema-title{color:var(--color-text-strong,#1e293b);font-size:.88rem;font-weight:750;margin-bottom:2px}
    .schema-sub{color:var(--color-text-body,#64748b);font-size:.72rem}
    canvas{width:100%;display:block}
    .schema-save-btn{display:inline-flex;align-items:center;gap:5px;flex-shrink:0;padding:5px 10px;border:1px solid var(--color-card-border,#e2e8f0);border-radius:6px;background:#f8fafc;color:var(--color-text-body,#64748b);font:inherit;font-size:.72rem;font-weight:650;cursor:pointer;transition:background .15s,color .15s}
    .schema-save-btn:hover{background:#eef6ff;color:var(--color-primary,#4291e1);border-color:rgba(66,145,225,.3)}
  `],
})
export class SqueezeSchematicsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() geom: SqueezeGeometry | null = null;
  @Input() slurry: SlurryDesign | null = null;
  @Input() recipe: SlurryRecipe | null = null;
  @Input() simulation: SqueezeHydraulicSimulation | null = null;
  @Input() squeezeInputs: SqueezeInputs | null = null;
  @ViewChild('withTubing') withTubing!: ElementRef<HTMLCanvasElement>;
  @ViewChild('withoutTubing') withoutTubing!: ElementRef<HTMLCanvasElement>;
  @ViewChild(SchematicWellboreComponent) wellboreComponent?: SchematicWellboreComponent;

  wellboreConfig: WellboreSchematicConfig | null = null;

  private resizeObserver?: ResizeObserver;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.draw();
    this.resizeObserver = new ResizeObserver(() => { this.draw(); this.cdr.detectChanges(); });
    if (this.withTubing?.nativeElement.parentElement) {
      this.resizeObserver.observe(this.withTubing.nativeElement.parentElement);
    }
  }

  ngOnChanges(): void {
    this.wellboreConfig = this.buildWellboreConfig();
    this.draw();
  }
  ngOnDestroy(): void { this.resizeObserver?.disconnect(); }

  saveWithTubing(): void { this.saveRef(this.withTubing, 'squeeze-com-tubing'); }
  saveWithoutTubing(): void { this.saveRef(this.withoutTubing, 'squeeze-sem-tubing'); }

  // Ordem no relatório: 1º o esquemático de bombeio (poço com revestimento e
  // tubing), 2º o "Sem Tubing / final". O "Com Tubing" não entra no relatório.
  getReportImages(selected: string[] = ['bombeio', 'semTubing']): { tipo: string; label: string; imagem: string }[] {
    this.draw();
    const images: { tipo: string; label: string; imagem: string }[] = [];
    if (selected.includes('bombeio')) {
      const image = this.wellboreComponent?.toImage();
      if (image) images.push({ tipo: 'bombeio', label: 'Esquemático de bombeio', imagem: image });
    }
    if (selected.includes('semTubing') && this.withoutTubing) {
      images.push({ tipo: 'semTubing', label: 'Sem tubing / final', imagem: this.withoutTubing.nativeElement.toDataURL('image/png') });
    }
    return images;
  }

  private saveRef(ref: ElementRef<HTMLCanvasElement>, filename: string): void {
    const url = ref.nativeElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.png`;
    a.click();
  }

  private draw(): void {
    if (!this.geom || !this.simulation || !this.withTubing || !this.withoutTubing) return;
    this.drawWithTubing(this.withTubing.nativeElement, createSqueezeSchematicModel('withTubing', this.geom, this.simulation));
    this.drawWithoutTubing(this.withoutTubing.nativeElement, createSqueezeSchematicModel('withoutTubing', this.geom, this.simulation));
  }

  private buildWellboreConfig(): WellboreSchematicConfig | null {
    const g = this.geom;
    const inp = this.squeezeInputs;
    if (!g || !this.simulation) return null;

    const withTubingModel = createSqueezeSchematicModel('withTubing', g, this.simulation);
    const tubSegs = withTubingModel.tubingSegments;
    const annSegs = withTubingModel.annulusSegments;

    const cementTubTop  = tubSegs.find(s => s.key === 'cementTubing')?.top  ?? g.cementPhysicalTopMD;
    const cementAnnTop  = annSegs.find(s => s.key === 'cementAnnulus')?.top ?? g.cementPhysicalTopMD;
    const base          = g.base || g.cementPhysicalBaseMD;

    // Rateio da pasta entre tubing e anular pela capacidade de cada coluna
    // (mesma regra do desenho "com tubing") — a soma dos dois é o volume físico.
    const tubeCap = Math.max(g.tubingID_m || 0, 0.0001);
    const annCap  = Math.max(g.annulusCasing_m || 0, 0.0001);
    const capWithTubing = tubeCap + annCap;
    const cementVolTubing = (g.slurryPhysicalVolumeBbl || 0) * (tubeCap / capWithTubing);
    const cementVolAnn    = (g.slurryPhysicalVolumeBbl || 0) * (annCap / capWithTubing);

    const annulusSegments: WellboreSchematicConfig['segments'] = [
      { key: 'completionFluid', zone: 'annulus', label: 'Fl. Completação', sub: '',                                        topM: 0,            bottomM: annSegs.find(s => s.key === 'frontWater')?.top ?? cementAnnTop, color: '#bae6fd' },
      { key: 'frontWater',      zone: 'annulus', label: 'Espaçador Frente',      sub: `${fmt(g.frontPhysicalVolumeBbl || g.washVolFront)} bbl`, topM: annSegs.find(s => s.key === 'frontWater')?.top ?? cementAnnTop, bottomM: cementAnnTop, color: '#d8b4fe' },
      { key: 'cement',          zone: 'annulus', label: 'Cimento anular',   sub: `${fmt(cementVolAnn)} bbl`,   topM: cementAnnTop, bottomM: base, color: '#fb923c' },
    ];
    const tubingSegments: WellboreSchematicConfig['segments'] = [
      { key: 'displacementFluid', zone: 'tubing', label: 'Fl. Deslocamento', sub: `${fmt(g.operationalDisplacementVolumeBbl || g.displacementVolume)} bbl`, topM: tubSegs.find(s => s.key === 'displacementFluid')?.top ?? 0, bottomM: tubSegs.find(s => s.key === 'backWater')?.top ?? cementTubTop, color: '#93c5fd' },
      { key: 'backWater',         zone: 'tubing', label: 'Espaçador Trás',         sub: `${fmt(g.volBackSpacer || g.backPhysicalVolumeBbl)} bbl`,                  topM: tubSegs.find(s => s.key === 'backWater')?.top ?? cementTubTop, bottomM: cementTubTop, color: '#d8b4fe' },
      { key: 'cement',            zone: 'tubing', label: 'Cimento tubing',    sub: `${fmt(cementVolTubing)} bbl`,                                   topM: cementTubTop, bottomM: base, color: '#fb923c' },
    ];

    return {
      casingOD:          inp?.casingOD ?? g.cOD,
      casingID:          inp?.casingID ?? g.cID,
      casingWeightLbmFt: 0,
      casingDepthM:      g.base || g.wellFinalMD,
      tubingOD:          inp?.tubingOD ?? g.tOD,
      tubingID:          inp?.tubingID ?? g.tID,
      tubingWeightLbmFt: 0,
      tubingDepthM:      g.base,
      workZoneTopM:      Math.min(cementTubTop, cementAnnTop),
      workZoneBaseM:     base,
      wellFinalMD:       g.wellFinalMD || base + 60,
      title:             'Esquemático do Poço - Squeeze com Revestimento e Tubing',
      segments: [
        ...annulusSegments.filter(s => s.bottomM > s.topM),
        ...tubingSegments.filter(s => s.bottomM > s.topM),
      ],
      legendItems: [
        { color: '#bae6fd', label: 'Fl. Completação' },
        { color: '#d8b4fe', label: 'Espaçador Frente',      sub: `${fmt(g.frontPhysicalVolumeBbl || g.washVolFront)} bbl` },
        { color: '#d8b4fe', label: 'Espaçador Trás',         sub: `${fmt(g.volBackSpacer || g.backPhysicalVolumeBbl)} bbl` },
        { color: '#93c5fd', label: 'Fl. Deslocamento',  sub: `${fmt(g.operationalDisplacementVolumeBbl || g.displacementVolume)} bbl` },
        { color: '#fb923c', label: 'Cimento tubing',    sub: `${fmt(cementVolTubing)} bbl` },
        { color: '#fb923c', label: 'Cimento anular',    sub: `${fmt(cementVolAnn)} bbl` },
      ],
    };
  }

  private drawWithTubing(canvas: HTMLCanvasElement, model: SqueezeSchematicModel): void {
    const p = this.geom!;
    const { cx, W, H } = this.prepare(canvas);
    const totalDepth = Math.max(p.base, 1);
    const PAD_L = 115, PAD_T = 65, PAD_B = 40, LEGEND_W = 220;
    const drawH = H - PAD_T - PAD_B;
    const toY = (d: number) => PAD_T + drawH * (d / totalDepth);
    const drawW = W - LEGEND_W - PAD_L - 8;
    const colW = drawW * 0.37;
    const annW = drawW * 0.37;
    const gap = drawW * 0.26;
    const colX = PAD_L;
    const annX = PAD_L + colW + gap;
    const legX = PAD_L + drawW + 12;
    const yTop = toY(0);
    const yBase = toY(p.base);
    const stackH = yBase - yTop;

    this.title(cx, W, 'Esquemático com Tubing - Squeeze', ADJUSTED_SCHEMATIC_NOTE);
    cx.fillStyle = '#1e293b'; cx.font = 'bold 11px Inter,Arial'; cx.textAlign = 'center';
    cx.fillText('Dentro do tubing', colX + colW / 2, PAD_T - 10);
    cx.fillText('Anular / poço', annX + annW / 2, PAD_T - 10);

    const tubingVisualSegments = this.renderStack(cx, colX, colW, yTop, stackH, model.tubingSegments);
    const annulusVisualSegments = this.renderStack(cx, annX, annW, yTop, stackH, model.annulusSegments);

    cx.strokeStyle = '#475569'; cx.lineWidth = 1.5;
    cx.strokeRect(colX, yTop, colW, stackH);
    cx.strokeRect(annX, yTop, annW, stackH);

    this.drawDepthAnnotations(cx, [
      ...this.segmentAnnotations('tub', model.tubingSegments, tubingVisualSegments, yTop, [
        ['displacementFluid', 'top', 'Topo desl. tub.'],
        ['backWater', 'top', 'Topo água trás'],
        ['cementTubing', 'top', 'Topo cimento tub.'],
        ['cementTubing', 'bottom', 'Base tubing'],
      ]),
      ...this.segmentAnnotations('ann', model.annulusSegments, annulusVisualSegments, yTop, [
        ['frontWater', 'top', 'Topo água frente'],
        ['cementAnnulus', 'top', 'Topo cimento anular'],
        ['cementAnnulus', 'bottom', 'Base anular'],
      ]),
    ], PAD_L - 8, annX + annW + 6, PAD_L - 12, PAD_T + 8, H - PAD_B - 8);
    const legendBottom = this.legend(cx, legX, PAD_T, false);
    this.drawInfoPanel(cx, legX, legendBottom + 14, this.squeezeInfoSections());
  }

  private drawWithoutTubing(canvas: HTMLCanvasElement, model: SqueezeSchematicModel): void {
    const p = this.geom!;
    const { cx, W, H } = this.prepare(canvas);
    const visibleBase = Math.max(p.base, model.basePerfMD || 0);
    const totalDepth = Math.max(visibleBase, 1);
    const PAD_L = 120, PAD_T = 65, PAD_B = 40, LEGEND_W = 230;
    const drawH = H - PAD_T - PAD_B;
    const toY = (d: number) => PAD_T + drawH * (d / totalDepth);
    const drawW = W - LEGEND_W - PAD_L - 8;
    const formationW = Math.max(30, drawW * 0.12);
    const casingW = Math.max(10, drawW * 0.04);
    const wellW = Math.max(120, drawW - (formationW + casingW) * 2 - 54);
    const formationLX = PAD_L;
    const casingLX = formationLX + formationW;
    const wellX = casingLX + casingW;
    const casingRX = wellX + wellW;
    const formationRX = casingRX + casingW;
    const structureRight = formationRX + formationW;
    const legX = structureRight + 24;
    const yTop = toY(0);
    const yBase = toY(visibleBase);
    const structureH = yBase - yTop;

    this.title(cx, W, 'Esquemático sem Tubing - Squeeze Final', ADJUSTED_SCHEMATIC_NOTE);
    this.structuralLane(cx, formationLX, yTop, formationW, structureH, '#d4b896');
    this.structuralLane(cx, formationRX, yTop, formationW, structureH, '#d4b896');
    this.structuralLane(cx, casingLX, yTop, casingW, structureH, '#94a3b8');
    this.structuralLane(cx, casingRX, yTop, casingW, structureH, '#94a3b8');
    const wellSegments = this.extendSegmentsToVisibleBase(model.segments, visibleBase);
    const wellVisualSegments = this.renderStack(cx, wellX, wellW, yTop, structureH, wellSegments);
    cx.strokeStyle = '#334155'; cx.lineWidth = 1.5; cx.strokeRect(wellX, yTop, wellW, structureH);

    // Cada intervalo de canhoneado é desenhado separadamente — não mescla o topo do
    // primeiro com a base do último, e o vão entre intervalos não é hachurado.
    // Usa a lista real digitada (atualiza ao adicionar/remover); cai para geom.perfs se ausente.
    const rawPerfs = (((this.squeezeInputs as { perforacoes?: { top: number; base: number }[] } | null)?.perforacoes) ?? [])
      .map(p => ({ top: +p.top, base: +p.base }))
      .filter(p => Number.isFinite(p.top) && Number.isFinite(p.base) && p.base > p.top)
      .sort((a, b) => a.top - b.top);
    const perfIntervals = rawPerfs.length ? rawPerfs : model.perfs;
    const multiplePerfs = perfIntervals.length > 1;
    const perfAnnotations = perfIntervals.flatMap((perf, i) => {
      const yPerfTop = visualYForDepth(wellVisualSegments, perf.top, yTop);
      const yPerfBase = visualYForDepth(wellVisualSegments, perf.base, yTop);
      this.drawPerforations(cx, casingLX, casingRX + casingW, yPerfTop, yPerfBase);
      this.bracket(cx, structureRight + 8, yPerfTop, yPerfBase, multiplePerfs ? `CANH. ${i + 1}` : 'CANHONEADOS');
      const suffix = multiplePerfs ? ` ${i + 1}` : '';
      return [
        { id: `topPerf-${i}`, label: `Topo canh.${suffix}\n${perf.top.toFixed(1)} m`, depthReal: perf.top, yReal: yPerfTop },
        { id: `basePerf-${i}`, label: `Base canh.${suffix}\n${perf.base.toFixed(1)} m`, depthReal: perf.base, yReal: yPerfBase },
      ];
    });
    this.drawDepthAnnotations(cx, [
      ...this.segmentAnnotations('final', wellSegments, wellVisualSegments, yTop, [
        ['displacementFluid', 'top', 'Topo deslocamento'],
        ['cement', 'top', 'Topo cimento'],
        ['cement', 'bottom', 'Base squeeze'],
      ]),
      ...perfAnnotations,
    ], PAD_L - 8, structureRight + 6, PAD_L - 12, PAD_T + 8, H - PAD_B - 8);
    const legendBottom = this.legend(cx, legX, PAD_T, true);
    this.drawInfoPanel(cx, legX, legendBottom + 14, this.squeezeInfoSections());
  }

  private extendSegmentsToVisibleBase(segments: SqueezeSegment[], visibleBase: number): SqueezeSegment[] {
    const output = segments.map(segment => ({ ...segment }));
    const last = output.at(-1);
    if (last && visibleBase > last.bottom) {
      last.bottom = visibleBase;
    }
    return output;
  }

  private renderStack(cx: CanvasRenderingContext2D, x: number, w: number, yTop: number, totalVisualHeight: number, segments: SqueezeSegment[]): VisualSegment[] {
    const visualSegments = this.visualSegments(segments.map(segment => ({
      key: this.isCement(segment.key) ? 'cement' : segment.key,
      top: segment.top,
      bottom: segment.bottom,
      label: segment.name,
      sub: segment.sub,
      color: segment.color,
    })), totalVisualHeight);
    visualSegments.forEach(segment => {
      this.fill(cx, x, yTop + segment.visualTop, w, segment.visualHeight, segment.color!, segment.label!, displaySubtitleForSegment(segment));
    });
    return visualSegments;
  }

  private prepare(canvas: HTMLCanvasElement): { cx: CanvasRenderingContext2D; W: number; H: number } {
    const H = 920;
    const W = Math.max(420, (canvas.parentElement?.clientWidth || 520) - 24);
    // Super-amostragem: backing store 3× maior (mesmo layout lógico W×H) para
    // exportar/imprimir o esquemático nítido no relatório/PDF.
    const scale = 3;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const cx = canvas.getContext('2d')!;
    cx.setTransform(scale, 0, 0, scale, 0, 0);
    cx.clearRect(0, 0, W, H);
    return { cx, W, H };
  }

  private title(cx: CanvasRenderingContext2D, W: number, title: string, subtitle: string): void {
    cx.fillStyle = '#1e293b'; cx.font = 'bold 13px Inter,Arial'; cx.textAlign = 'center';
    cx.fillText(title, W / 2, 22);
    cx.fillStyle = '#64748b'; cx.font = '10px Inter,Arial';
    cx.fillText(subtitle, W / 2, 36);
  }

  private structuralLane(cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string): void {
    cx.fillStyle = color; cx.fillRect(x, y, w, h);
    cx.strokeStyle = '#475569'; cx.lineWidth = 1; cx.strokeRect(x, y, w, h);
  }

  private fill(cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, label: string, sub?: string): void {
    if (h <= 0 || w <= 0) return;
    cx.fillStyle = color; cx.fillRect(x, y, w, h);
    cx.strokeStyle = 'rgba(0,0,0,.12)'; cx.lineWidth = .7; cx.strokeRect(x, y, w, h);
    if (shouldShowSegmentLabel(h)) {
      cx.fillStyle = 'rgba(0,0,0,.75)'; cx.font = 'bold 11px Inter,Arial'; cx.textAlign = 'center';
      cx.fillText(label, x + w / 2, y + h / 2 + (sub ? -7 : 4));
      if (sub) {
        cx.fillStyle = 'rgba(0,0,0,.55)'; cx.font = '10px Inter,Arial';
        cx.fillText(sub, x + w / 2, y + h / 2 + 9);
      }
    }
  }

  private drawPerforations(cx: CanvasRenderingContext2D, xLeft: number, xRight: number, yTop: number, yBase: number): void {
    const top = Math.min(yTop, yBase);
    const base = Math.max(yTop, yBase);
    cx.fillStyle = 'rgba(249,115,22,.10)';
    cx.fillRect(xLeft, top, xRight - xLeft, Math.max(2, base - top));
    cx.strokeStyle = '#f97316'; cx.lineWidth = 3;
    const count = Math.max(4, Math.min(18, Math.ceil((base - top) / 6)));
    for (let i = 0; i < count; i += 1) {
      const y = top + (base - top) * (i + .5) / count;
      cx.beginPath(); cx.moveTo(xLeft, y); cx.lineTo(xRight, y); cx.stroke();
    }
  }

  private bracket(cx: CanvasRenderingContext2D, x: number, yTop: number, yBase: number, label: string): void {
    cx.strokeStyle = '#ea580c'; cx.lineWidth = 1.5;
    cx.beginPath();
    cx.moveTo(x, yTop); cx.lineTo(x + 12, yTop);
    cx.moveTo(x + 6, yTop); cx.lineTo(x + 6, yBase);
    cx.moveTo(x, yBase); cx.lineTo(x + 12, yBase);
    cx.stroke();
    cx.fillStyle = '#ea580c'; cx.font = 'bold 9px Inter,Arial'; cx.textAlign = 'left';
    cx.fillText(label, x + 16, (yTop + yBase) / 2 + 3);
  }

  private depthLine(cx: CanvasRenderingContext2D, x1: number, x2: number, labelX: number, y: number, label: string): void {
    cx.save();
    cx.setLineDash([4, 3]); cx.strokeStyle = '#94a3b8'; cx.lineWidth = .8;
    cx.beginPath(); cx.moveTo(x1, y); cx.lineTo(x2, y); cx.stroke(); cx.setLineDash([]);
    cx.fillStyle = '#475569'; cx.font = '9.5px Inter,Arial'; cx.textAlign = 'right';
    label.split('\n').forEach((line, i) => cx.fillText(line, labelX, y + i * 12 - 5));
    cx.restore();
  }

  private drawDepthAnnotations(
    cx: CanvasRenderingContext2D,
    annotations: { id: string; label: string; depthReal: number; yReal: number }[],
    x1: number,
    x2: number,
    labelX: number,
    topPadding: number,
    bottomPadding: number,
  ): void {
    const laidOut = layoutDepthAnnotations(annotations, { minGapPx: 26, topPadding, bottomPadding });
    laidOut.forEach(annotation => {
      cx.save();
      cx.setLineDash([4, 3]);
      cx.strokeStyle = '#94a3b8';
      cx.lineWidth = 0.8;
      cx.beginPath();
      cx.moveTo(x1, annotation.yReal);
      cx.lineTo(x2, annotation.yReal);
      cx.stroke();
      cx.setLineDash([]);
      cx.strokeStyle = '#94a3b8';
      cx.beginPath();
      cx.moveTo(labelX + 4, annotation.yLabel);
      cx.lineTo(x1 - 2, annotation.yReal);
      cx.stroke();
      cx.fillStyle = '#475569';
      cx.font = '10px Inter,Arial';
      cx.textAlign = 'right';
      annotation.label.split('\n').forEach((line, i) => cx.fillText(line, labelX, annotation.yLabel + i * 12 - 5));
      cx.restore();
    });
  }

  private legend(cx: CanvasRenderingContext2D, x: number, y: number, includePerfs: boolean): number {
    // Na view sem tubing (includePerfs) os três fluidos são exibidos fundidos em
    // "Deslocamento"; na view com tubing eles aparecem separados.
    const items = includePerfs
      ? [
          { color: '#bae6fd', label: 'Fl. Completação' },
          { color: '#93c5fd', label: 'Deslocamento' },
          { color: '#fb923c', label: 'Cimento' },
          { color: '#d4b896', label: 'Formação' },
          { color: '#94a3b8', label: 'Revestimento' },
          { color: '#f97316', label: 'Canhoneados' },
        ]
      : [
          { color: '#bae6fd', label: 'Fl. Completação' },
          { color: '#93c5fd', label: 'Fl. Deslocamento' },
          { color: '#d8b4fe', label: 'Espaçador Frente' },
          { color: '#d8b4fe', label: 'Espaçador Trás' },
          { color: '#fb923c', label: 'Cimento' },
          { color: '#d4b896', label: 'Formação' },
          { color: '#94a3b8', label: 'Revestimento' },
        ];
    cx.fillStyle = '#1e293b'; cx.font = 'bold 11px Inter,Arial'; cx.textAlign = 'left'; cx.fillText('Legenda', x, y + 10);
    items.forEach((item, i) => {
      const ly = y + 28 + i * 24;
      cx.fillStyle = item.color; cx.fillRect(x, ly, 14, 14);
      cx.strokeStyle = '#94a3b8'; cx.lineWidth = .5; cx.strokeRect(x, ly, 14, 14);
      cx.fillStyle = '#334155'; cx.font = '10.5px Inter,Arial'; cx.fillText(item.label, x + 18, ly + 11);
    });
    return y + 28 + items.length * 24;
  }

  private visualSegments(segments: VisualSegmentInput[], totalVisualHeight: number) {
    return computeVisualSegmentHeights(segments, {
      totalVisualHeight,
      cementKey: 'cement',
      cementVisualRatio: 0.4,
      minWaterFrontPx: 42,
      minWaterBackPx: 42,
      minOtherSegmentPx: 30,
    });
  }

  private isCement(key: SqueezeSegmentKey): boolean {
    return key === 'cement' || key === 'cementTubing' || key === 'cementAnnulus';
  }

  private squeezeInfoSections(): SchematicInfoSection[] {
    const p = this.geom!;
    const summary = this.simulation?.summary;
    const pressureWindow = summary ? summary.fracturePsi - summary.porePsi : null;

    // Base do cimento, volume injetado e topos (fonte única: serviço de cálculo)
    const baseMD = Math.max(0, p.base || p.cementPhysicalBaseMD || 0);
    const injected = p.slurryInjectedVolumeBbl || p.expectedLoss || 0;        // squeeze para a formação
    const topImmersedBefore = p.topCementImmersedMD ?? baseMD;                  // antes, c/ tubing
    const topFullBefore = p.topCementAfterPullMD ?? baseMD;                     // antes, s/ tubing
    const topImmersedAfter = p.topCementImmersedAfterInjectionMD ?? baseMD;     // depois, c/ tubing
    const topFullAfter = p.topCementAfterInjectionMD ?? baseMD;                 // depois, s/ tubing

    return [
      visibleInfoRows({
        title: 'Dados do esquemático',
        rows: [
          { label: 'Zona trabalho', value: formatM(p.len || (p.base - p.top), 0) },
          { label: 'Cimento', value: formatBbl(p.slurryPhysicalVolumeBbl || p.workVolumeBbl || p.slurryTotal) },
          { label: 'Água de Deslocamento', value: joinInfoParts(formatBbl(p.operationalDisplacementVolumeBbl || p.displacementVolume), formatPpg(this.squeezeInputs?.displacementWeight ?? this.squeezeInputs?.completionWeight)) },
          { label: 'Água frente', value: joinInfoParts(formatM(p.frontPhysicalHeight || p.frontOperationalHeight, 0), formatBbl(p.frontPhysicalVolumeBbl || p.washVolFront)) },
          { label: 'Água trás', value: joinInfoParts(formatM(p.backPhysicalHeight || p.backOperationalHeight, 0), formatBbl(p.backPhysicalVolumeBbl || p.volBackSpacer)) },
          { label: 'Cimento na formação', value: formatBbl(injected) },
          { label: 'Janela', value: formatPsi(pressureWindow) },
        ],
      }),
      visibleInfoRows({
        title: 'Profundidade da pasta',
        rows: [
          { label: 'Base do cimento', value: formatM(baseMD) },
        ],
      }),
      visibleInfoRows({
        title: 'Antes de injetar o cimento',
        rows: [
          { label: 'Topo do cimento c/ tubing', value: formatM(topImmersedBefore) },
          { label: 'Topo do cimento s/ tubing', value: formatM(topFullBefore) },
        ],
      }),
      visibleInfoRows({
        title: 'Depois de injetar o cimento',
        rows: [
          { label: 'Topo do cimento c/ tubing', value: formatM(topImmersedAfter) },
          { label: 'Topo do cimento s/ tubing', value: formatM(topFullAfter) },
        ],
      }),
    ];
  }

  private drawInfoPanel(cx: CanvasRenderingContext2D, x: number, y: number, sections: SchematicInfoSection[]): void {
    let cursor = y;
    sections.filter(section => section.rows.length).forEach((section, sectionIndex) => {
      if (sectionIndex > 0) {
        cx.strokeStyle = '#e2e8f0';
        cx.lineWidth = 0.8;
        cx.beginPath();
        cx.moveTo(x, cursor + 5);
        cx.lineTo(x + 205, cursor + 5);
        cx.stroke();
        cursor += 18;
      }
      cx.fillStyle = '#1e293b';
      cx.font = 'bold 11px Inter,Arial';
      cx.textAlign = 'left';
      cx.fillText(section.title, x, cursor + 10);
      cursor += 26;
      section.rows.forEach(row => {
        cx.fillStyle = '#64748b';
        cx.font = '9.5px Inter,Arial';
        cx.fillText(row.label, x, cursor);
        cx.fillStyle = '#334155';
        cx.font = 'bold 9.5px Inter,Arial';
        cx.fillText(row.value!, x, cursor + 12);
        cursor += 30;
      });
    });
  }

  private segmentAnnotations(
    prefix: string,
    realSegments: SqueezeSegment[],
    visualSegments: VisualSegment[],
    yTop: number,
    markers: Array<[SqueezeSegmentKey, 'top' | 'bottom', string]>,
  ): { id: string; label: string; depthReal: number; yReal: number }[] {
    return markers
      .map(([key, boundary, label]) => {
        const realSegment = realSegments.find(segment => segment.key === key);
        if (!realSegment) return null;
        const visualKey = this.isCement(key) ? 'cement' : key;
        const depthReal = boundary === 'top' ? realSegment.top : realSegment.bottom;
        const yReal = visualYForSegmentBoundary(visualSegments, visualKey, boundary, yTop) ?? visualYForDepth(visualSegments, depthReal, yTop);
        return {
          id: `${prefix}-${key}-${boundary}`,
          label: `${label}\n${depthReal.toFixed(1)} m`,
          depthReal,
          yReal,
        };
      })
      .filter((item): item is { id: string; label: string; depthReal: number; yReal: number } => item !== null);
  }
}
