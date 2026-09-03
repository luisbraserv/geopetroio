import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  OnChanges,
  OnDestroy,
  ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { PlugGeometry, TampaoInputs } from '../../models/tampao.model';
import { SlurryDesign, SlurryRecipe } from '../../models/pasta.model';
import { ADJUSTED_SCHEMATIC_NOTE, computeVisualSegmentHeights, displaySubtitleForSegment, formatBbl, formatM, formatPpg, joinInfoParts, layoutDepthAnnotations, SchematicInfoSection, shouldShowSegmentLabel, visibleInfoRows, visualYForSegmentBoundary, VisualSegmentInput } from './visual-segments';
import { SchematicWellboreComponent, WellboreSchematicConfig, WellboreSegment } from './schematic-wellbore.component';

export interface SchematicSegment {
  key: 'completionFluid' | 'displacementFluid' | 'frontWater' | 'backWater' | 'cement';
  name: string;
  sub: string;
  top: number;
  bottom: number;
  color: string;
}

export interface SchematicLane {
  key: string;
  label: string;
  role: 'formation' | 'casing' | 'well';
}

export interface DepthMarker {
  key: string;
  label: string;
  depth: number;
  displayY: number;
}

export interface SchematicBracket {
  label: string;
  top: number;
  bottom: number;
}

export interface WithoutTubingSchematic {
  mode: 'withoutTubing';
  showFormation: true;
  showCasing: true;
  showTubing: false;
  showAnnulusSplit: false;
  lanes: SchematicLane[];
  segments: SchematicSegment[];
  depthMarkers: DepthMarker[];
  workZone: SchematicBracket;
}

export function createWithoutTubingSchematic(plug: PlugGeometry): WithoutTubingSchematic {
  const base = Math.max(0, plug.pBase);
  const finalCapacity = Math.max(plug.capFinal || plug.capHole || plug.cementPhysicalCapacityBblM || 0, 0);
  const displacementHeight = finalCapacity > 0 ? Math.max(0, plug.volDisplacement || 0) / finalCapacity : 0;
  const cementHeight = Math.max(0, plug.cementHeightWithoutTubing || plug.cementPhysicalHeight || 0);
  const backHeight = Math.max(0, plug.backPhysicalHeight || 0);
  const frontHeight = Math.max(0, plug.frontPhysicalHeight || 0);
  const topCement = Math.max(0, base - cementHeight);
  const topBack = Math.max(0, topCement - backHeight);
  const topFront = Math.max(0, topBack - frontHeight);
  const topDisplacement = Math.max(0, topFront - displacementHeight);
  const totalDepth = Math.max(base, 1);
  // Deslocamento = fluido de deslocamento + espaçador frente + espaçador trás
  // apresentados como um único fluido (volume e altura = soma dos três).
  const displacementVolTotal = (plug.volDisplacement || 0) + (plug.volWashTotal || 0) + (plug.volBackSpacer || 0);
  const displacementHeightTotal = Math.max(0, topCement - topDisplacement);
  const allSegments: SchematicSegment[] = [
    {
      key: 'completionFluid',
      name: 'Fluido de Completação do poço',
      sub: 'Fluido do poço',
      top: 0,
      bottom: topDisplacement,
      color: '#bae6fd',
    },
    {
      key: 'displacementFluid',
      name: 'Deslocamento',
      sub: `${formatPt(displacementVolTotal)} bbl | ${formatPt(displacementHeightTotal, 0)} m`,
      top: topDisplacement,
      bottom: topCement,
      color: '#93c5fd',
    },
    {
      key: 'cement',
      name: 'Cimento',
      sub: `${formatPt(plug.volCementTotal)} bbl | ${formatPt(cementHeight, 1)} m`,
      top: topCement,
      bottom: base,
      color: '#fb923c',
    },
  ];
  const segments = allSegments.filter(segment => segment.bottom > segment.top);

  return {
    mode: 'withoutTubing',
    showFormation: true,
    showCasing: true,
    showTubing: false,
    showAnnulusSplit: false,
    lanes: [
      { key: 'formationLeft', label: 'Formação esquerda', role: 'formation' },
      { key: 'casingLeft', label: 'Revestimento esquerdo', role: 'casing' },
      { key: 'well', label: 'Conteúdo interno do poço', role: 'well' },
      { key: 'casingRight', label: 'Revestimento direito', role: 'casing' },
      { key: 'formationRight', label: 'Formação direita', role: 'formation' },
    ],
    segments,
    depthMarkers: distributeMarkerLabels([
      { key: 'displacementTop', label: `Topo deslocamento\n${topDisplacement.toFixed(1)} m`, depth: topDisplacement },
      { key: 'cementTop', label: `Topo cimento\n${topCement.toFixed(1)} m`, depth: topCement },
      { key: 'plugBase', label: `Base tampão\n${base.toFixed(0)} m`, depth: base },
    ], totalDepth, 30),
    workZone: {
      label: `ZONA DE TRABALHO\n${plug.plugHeight.toFixed(0)} m`,
      top: topCement,
      bottom: base,
    },
  };
}
export function distributeMarkerLabels(
  markers: Array<Omit<DepthMarker, 'displayY'>>,
  totalDepth: number,
  minGapPx: number,
): DepthMarker[] {
  const topPad = 65;
  const drawH = 635;
  const toY = (depth: number) => topPad + drawH * (depth / totalDepth);
  const ordered = markers
    .map(marker => ({ ...marker, displayY: toY(marker.depth) }))
    .sort((a, b) => a.displayY - b.displayY);

  for (let i = 1; i < ordered.length; i += 1) {
    if (ordered[i].displayY - ordered[i - 1].displayY < minGapPx) {
      ordered[i].displayY = ordered[i - 1].displayY + minGapPx;
    }
  }

  return ordered;
}

function formatPt(v: number | null | undefined, dec = 2): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

@Component({
  selector: 'app-schematic-tampao',
  standalone: true,
  imports: [CommonModule, SchematicWellboreComponent],
  template: `
    <div class="schema-row">
      <div class="schema-card">
        <div class="schema-card-head">
          <div>
            <div class="schema-title">Com Tubing (Balanceado)</div>
            <div class="schema-sub">Coluna interna e anular - mesmo topo de cimento</div>
          </div>
          <button class="schema-save-btn" type="button" (click)="saveTubing()" title="Salvar imagem">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Salvar
          </button>
        </div>
        <canvas #cvTubing class="schema-canvas"></canvas>
      </div>
      <div class="schema-card">
        <div class="schema-card-head">
          <div>
            <div class="schema-title">Sem Tubing (Tampão final)</div>
            <div class="schema-sub">Cimento no poço aberto após retirada da coluna</div>
          </div>
          <button class="schema-save-btn" type="button" (click)="saveNoTub()" title="Salvar imagem">
            <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Salvar
          </button>
        </div>
        <canvas #cvNoTub class="schema-canvas"></canvas>
      </div>
      @if (wellboreConfig) {
        <app-schematic-wellbore [config]="wellboreConfig"></app-schematic-wellbore>
      }
    </div>
  `,
  styles: [`
    .schema-row { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .schema-card { background: var(--color-card, #fff); border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 8px; padding: 12px; }
    .schema-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .schema-title { font-size: .88rem; font-weight: 750; color: var(--color-text-strong, #1e293b); margin-bottom: 2px; }
    .schema-sub { font-size: .72rem; color: var(--color-text-body, #64748b); }
    .schema-canvas { width: 100%; display: block; }
    .schema-save-btn { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 5px 10px; border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 6px; background: #f8fafc; color: var(--color-text-body, #64748b); font: inherit; font-size: .72rem; font-weight: 650; cursor: pointer; transition: background .15s, color .15s; }
    .schema-save-btn:hover { background: #eef6ff; color: var(--color-primary, #4291e1); border-color: rgba(66,145,225,.3); }
  `],
})
export class SchematicTampaoComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() plug: PlugGeometry | null = null;
  @Input() slurry: SlurryDesign | null = null;
  @Input() recipe: SlurryRecipe | null = null;
  @Input() inputs: TampaoInputs | null = null;

  @ViewChild('cvTubing') cvTubing!: ElementRef<HTMLCanvasElement>;
  @ViewChild('cvNoTub') cvNoTub!: ElementRef<HTMLCanvasElement>;
  @ViewChild(SchematicWellboreComponent) wellboreComponent?: SchematicWellboreComponent;

  wellboreConfig: WellboreSchematicConfig | null = null;

  private resizeObserver?: ResizeObserver;

  constructor(private cdr: ChangeDetectorRef) {}

  ngAfterViewInit(): void {
    this.draw();
    this.resizeObserver = new ResizeObserver(() => { this.draw(); this.cdr.detectChanges(); });
    if (this.cvTubing?.nativeElement.parentElement) {
      this.resizeObserver.observe(this.cvTubing.nativeElement.parentElement);
    }
  }

  ngOnChanges(): void {
    // Calcula wellboreConfig aqui para garantir que o @if reaja antes dos canvases estarem prontos
    this.wellboreConfig = this.buildWellboreConfig();
    this.draw();
  }
  ngOnDestroy(): void { this.resizeObserver?.disconnect(); }

  saveTubing(): void { this.saveRef(this.cvTubing, 'tampao-com-tubing'); }
  saveNoTub(): void { this.saveRef(this.cvNoTub, 'tampao-sem-tubing'); }

  // Ordem no relatório: 1º o esquemático de bombeio (poço com revestimento e
  // tubing), 2º o "Sem Tubing / final". O "Com Tubing" não entra no relatório.
  getReportImages(selected: string[] = ['bombeio', 'semTubing']): { tipo: string; label: string; imagem: string }[] {
    this.draw();
    const images: { tipo: string; label: string; imagem: string }[] = [];
    if (selected.includes('bombeio')) {
      const image = this.wellboreComponent?.toImage();
      if (image) images.push({ tipo: 'bombeio', label: 'Esquemático de bombeio', imagem: image });
    }
    if (selected.includes('semTubing') && this.cvNoTub) {
      images.push({ tipo: 'semTubing', label: 'Sem tubing / final', imagem: this.cvNoTub.nativeElement.toDataURL('image/png') });
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

  draw(): void {
    if (!this.plug || !this.slurry || !this.recipe) return;
    if (!this.cvTubing || !this.cvNoTub) return;
    this.drawWithTubing();
    this.drawWithoutTubing();
  }

  private buildWellboreConfig(): WellboreSchematicConfig | null {
    const p = this.plug;
    const inp = this.inputs;
    if (!p) return null;

    const topCem = p.topCementWithTubing;
    const topBack = p.topBackSpacer;
    const topFront = p.topFrontSpacer;

    // Peso linear: disponível nos inputs brutos; se ausente usa 0
    const casingWeightLbmFt = 0;   // TampaoInputs não tem peso linear de casing — campo não existe no modelo
    const tubingWeightLbmFt = 0;

    // Diâmetros em polegadas
    const casingOD = inp?.holeID ?? p.hID;   // holeID é o ID do poço (buraco), equivale ao casing ID no tampão
    const casingID = p.hID;
    const tubingOD = inp?.pipeOD ?? p.pOD;
    const tubingID = inp?.pipeID ?? p.pID;

    const casingDepthM = p.sEnd;
    const tubingDepthM = p.pipeDep;

    const annulusSegments: WellboreSchematicConfig['segments'] = [
      { key: 'completionFluid', zone: 'annulus', label: 'Fl. Completação', sub: '', topM: 0, bottomM: topFront, color: '#bae6fd' },
      { key: 'frontWater', zone: 'annulus', label: 'Espaçador Frente', sub: `${this.f(p.volWashTotal)} bbl`, topM: topFront, bottomM: topCem, color: '#d8b4fe' },
      { key: 'cement', zone: 'annulus', label: 'Cimento anular', sub: `${this.f(p.volCementAnn)} bbl`, topM: topCem, bottomM: p.pBase, color: '#fb923c' },
    ];
    const tubingSegments: WellboreSchematicConfig['segments'] = [
      { key: 'displacementFluid', zone: 'tubing', label: 'Fl. Deslocamento', sub: `${this.f(p.volDisplacement)} bbl`, topM: 0, bottomM: topBack, color: '#93c5fd' },
      { key: 'backWater', zone: 'tubing', label: 'Espaçador Trás', sub: `${this.f(p.volBackSpacer)} bbl`, topM: topBack, bottomM: topCem, color: '#d8b4fe' },
      { key: 'cement', zone: 'tubing', label: 'Cimento tubing', sub: `${this.f(p.volCementPipe)} bbl`, topM: topCem, bottomM: p.pBase, color: '#fb923c' },
    ];

    return {
      casingOD,
      casingID,
      casingWeightLbmFt,
      casingDepthM,
      tubingOD,
      tubingID,
      tubingWeightLbmFt,
      tubingDepthM,
      workZoneTopM: topCem,
      workZoneBaseM: p.pBase,
      wellFinalMD: p.wellFinalMD || p.pBase + 60,
      title: 'Esquemático do Poço - Tampão com Revestimento e Tubing',
      segments: [
        ...annulusSegments.filter(s => s.bottomM > s.topM),
        ...tubingSegments.filter(s => s.bottomM > s.topM),
      ],
      legendItems: [
        { color: '#bae6fd', label: 'Fl. Completação' },
        { color: '#d8b4fe', label: 'Espaçador Frente', sub: `${this.f(p.volWashTotal)} bbl` },
        { color: '#d8b4fe', label: 'Espaçador Trás', sub: `${this.f(p.volBackSpacer)} bbl` },
        { color: '#fb923c', label: 'Cimento tubing', sub: `${this.f(p.volCementPipe)} bbl` },
        { color: '#fb923c', label: 'Cimento anular', sub: `${this.f(p.volCementAnn)} bbl` },
        { color: '#93c5fd', label: 'Fl. Deslocamento', sub: `${this.f(p.volDisplacement)} bbl` },
      ],
    };
  }

  private drawWithTubing(): void {
    const p = this.plug!, rec = this.recipe!;
    const cv = this.cvTubing.nativeElement;
    const { cx, W, H } = this.prepareCanvas(cv);
    const topCem = p.topCementWithTubing;
    const topBack = p.topBackSpacer;
    const topFront = p.topFrontSpacer;
    const totalDepth = Math.max(p.pBase, 1);
    const PAD_L = 115, PAD_T = 65, PAD_B = 40, LEGEND_W = 230;
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
    const yBase = toY(p.pBase);

    this.drawTitle(cx, W, 'Esquemático com Tubing - Tampão Balanceado', ADJUSTED_SCHEMATIC_NOTE);

    cx.fillStyle = '#1e293b';
    cx.font = 'bold 11px Inter,Arial';
    cx.textAlign = 'center';
    cx.fillText('Dentro do tubing', colX + colW / 2, PAD_T - 10);
    cx.fillText('Anular / poço', annX + annW / 2, PAD_T - 10);

    const columnSegments = this.visualSegments([
      { key: 'displacementFluid', top: 0, bottom: topBack, label: 'Fl. Deslocamento', sub: `${this.f(p.volDisplacement)} bbl`, color: '#93c5fd' },
      { key: 'backWater', top: topBack, bottom: topCem, label: 'Água Atrás', sub: `${this.f(p.volBackSpacer)} bbl | ${this.f(p.backPhysicalHeight, 0)} m`, color: '#d8b4fe' },
      { key: 'cement', top: topCem, bottom: p.pBase, label: 'Cimento tubing', sub: `${this.f(p.volCementPipe)} bbl | ${this.f(p.cementHeightWithTubing, 1)} m`, color: '#fb923c' },
    ], yBase - yTop);
    const annularSegments = this.visualSegments([
      { key: 'completionFluid', top: 0, bottom: topFront, label: 'Fl. Completação', sub: '', color: '#bae6fd' },
      { key: 'frontWater', top: topFront, bottom: topCem, label: 'Espaçador Frente', sub: `${this.f(p.volWashTotal)} bbl | ${this.f(p.frontPhysicalHeight, 0)} m`, color: '#d8b4fe' },
      { key: 'cement', top: topCem, bottom: p.pBase, label: 'Cimento anular', sub: `${this.f(p.volCementAnn)} bbl | ${this.f(p.cementHeightWithTubing, 1)} m`, color: '#fb923c' },
    ], yBase - yTop);
    columnSegments.forEach(segment => this.fillRect(cx, colX, yTop + segment.visualTop, colW, segment.visualHeight, segment.color!, segment.label!, displaySubtitleForSegment(segment)));
    annularSegments.forEach(segment => this.fillRect(cx, annX, yTop + segment.visualTop, annW, segment.visualHeight, segment.color!, segment.label!, displaySubtitleForSegment(segment)));

    cx.strokeStyle = '#475569';
    cx.lineWidth = 1.5;
    cx.strokeRect(colX, toY(0), colW, toY(p.pBase) - toY(0));
    cx.strokeRect(annX, toY(0), annW, toY(p.pBase) - toY(0));

    this.drawDepthAnnotations(cx, [
      { id: 'front', label: `Topo água frente\n${topFront.toFixed(1)} m`, depthReal: topFront, yReal: visualYForSegmentBoundary(annularSegments, 'frontWater', 'top', yTop) ?? toY(topFront) },
      { id: 'back', label: `Topo água atrás\n${topBack.toFixed(1)} m`, depthReal: topBack, yReal: visualYForSegmentBoundary(columnSegments, 'backWater', 'top', yTop) ?? toY(topBack) },
      { id: 'cement', label: `Topo cimento\n${topCem.toFixed(1)} m`, depthReal: topCem, yReal: visualYForSegmentBoundary(annularSegments, 'cement', 'top', yTop) ?? toY(topCem) },
      { id: 'base', label: `Base tampão\n${p.pBase.toFixed(0)} m`, depthReal: p.pBase, yReal: visualYForSegmentBoundary(annularSegments, 'cement', 'bottom', yTop) ?? toY(p.pBase) },
    ], PAD_L - 8, annX + annW + 6, PAD_L - 12, PAD_T + 8, H - PAD_B - 8);

    const legendBottom = this.drawLegend(cx, legX, PAD_T, [
      { color: '#93c5fd', label: 'Fl. Deslocamento' },
      { color: '#d8b4fe', label: 'Água Atrás' },
      { color: '#fb923c', label: 'Cimento tubing' },
      { color: '#bae6fd', label: 'Fl. Completação' },
      { color: '#d8b4fe', label: 'Espaçador Frente' },
      { color: '#fb923c', label: 'Cimento anular' },
    ]);
    this.drawInfoPanel(cx, legX, legendBottom + 14, this.tampaoInfoSections(topCem));
  }

  private drawWithoutTubing(): void {
    const p = this.plug!, rec = this.recipe!;
    const model = createWithoutTubingSchematic(p);
    const cv = this.cvNoTub.nativeElement;
    const { cx, W, H } = this.prepareCanvas(cv);
    const totalDepth = Math.max(p.pBase, 1);
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
    const yBase = toY(p.pBase);
    const structureH = yBase - yTop;

    this.drawTitle(cx, W, 'Esquemático Sem Tubing - Tampão Final', ADJUSTED_SCHEMATIC_NOTE);

    cx.fillStyle = '#d4b896';
    cx.fillRect(formationLX, yTop, formationW, structureH);
    cx.fillRect(formationRX, yTop, formationW, structureH);
    cx.fillStyle = '#94a3b8';
    cx.fillRect(casingLX, yTop, casingW, structureH);
    cx.fillRect(casingRX, yTop, casingW, structureH);

    cx.strokeStyle = '#475569';
    cx.lineWidth = 1;
    cx.strokeRect(formationLX, yTop, formationW, structureH);
    cx.strokeRect(casingLX, yTop, casingW, structureH);
    cx.strokeRect(casingRX, yTop, casingW, structureH);
    cx.strokeRect(formationRX, yTop, formationW, structureH);

    const wellSegments = this.visualSegments(model.segments.map(segment => ({
      key: segment.key,
      top: segment.top,
      bottom: segment.bottom,
      label: segment.name,
      sub: segment.sub,
      color: segment.color,
    })), structureH);
    wellSegments.forEach(segment => {
      this.fillRect(cx, wellX, yTop + segment.visualTop, wellW, segment.visualHeight, segment.color!, segment.label!, displaySubtitleForSegment(segment));
    });

    cx.strokeStyle = '#334155';
    cx.lineWidth = 1.5;
    cx.strokeRect(wellX, yTop, wellW, structureH);

    this.drawVerticalText(cx, 'FORMAÇÃO', formationLX + formationW / 2, yTop + 88, -Math.PI / 2);
    this.drawVerticalText(cx, 'FORMAÇÃO', formationRX + formationW / 2, yTop + 88, Math.PI / 2);

    const zTop = visualYForSegmentBoundary(wellSegments, 'cement', 'top', yTop) ?? toY(model.workZone.top);
    const zBot = visualYForSegmentBoundary(wellSegments, 'cement', 'bottom', yTop) ?? toY(model.workZone.bottom);
    const bX = structureRight + 8;
    cx.strokeStyle = '#ca8a04';
    cx.lineWidth = 1.5;
    cx.beginPath();
    cx.moveTo(bX, zTop); cx.lineTo(bX + 12, zTop);
    cx.moveTo(bX + 6, zTop); cx.lineTo(bX + 6, zBot);
    cx.moveTo(bX, zBot); cx.lineTo(bX + 12, zBot);
    cx.stroke();
    cx.fillStyle = '#ca8a04';
    cx.font = 'bold 9px Inter,Arial';
    cx.textAlign = 'left';
    const zm = (zTop + zBot) / 2;
    cx.fillText('ZONA DE', bX + 16, zm - 8);
    cx.fillText('TRABALHO', bX + 16, zm + 4);
    cx.fillText(`${p.plugHeight.toFixed(0)} m`, bX + 16, zm + 16);

    this.drawDepthAnnotations(cx, model.depthMarkers.map(marker => ({
      id: marker.key,
      label: marker.label,
      depthReal: marker.depth,
      yReal: this.getTampaoMarkerAnchorY(marker.key, marker.depth, wellSegments, yTop, toY),
    })), PAD_L - 8, structureRight + 6, PAD_L - 46, PAD_T + 8, H - PAD_B - 8);

    const legendBottom = this.drawLegend(cx, legX, PAD_T, [
      { color: '#bae6fd', label: 'Fl. Completação' },
      { color: '#93c5fd', label: 'Deslocamento' },
      { color: '#fb923c', label: 'Cimento' },
      { color: '#d4b896', label: 'Formação' },
      { color: '#94a3b8', label: 'Revestimento' },
    ]);
    this.drawInfoPanel(cx, legX, legendBottom + 14, this.tampaoInfoSections(model.segments.find(segment => segment.key === 'cement')?.top ?? p.topCementWithoutTubing));
  }

  private prepareCanvas(cv: HTMLCanvasElement): { cx: CanvasRenderingContext2D; W: number; H: number } {
    const H = 740;
    const W = Math.max(420, (cv.parentElement?.clientWidth || 520) - 24);
    // Super-amostragem: backing store 3× maior (mesmo layout lógico W×H) para
    // exportar/imprimir o esquemático nítido no relatório/PDF.
    const scale = 3;
    cv.width = Math.round(W * scale);
    cv.height = Math.round(H * scale);
    const cx = cv.getContext('2d')!;
    cx.setTransform(scale, 0, 0, scale, 0, 0);
    cx.clearRect(0, 0, W, H);
    return { cx, W, H };
  }

  private drawTitle(cx: CanvasRenderingContext2D, width: number, title: string, subtitle: string): void {
    cx.fillStyle = '#1e293b';
    cx.font = 'bold 13px Inter,Arial';
    cx.textAlign = 'center';
    cx.fillText(title, width / 2, 22);
    cx.font = '10px Inter,Arial';
    cx.fillStyle = '#64748b';
    cx.fillText(subtitle, width / 2, 36);
  }

  private drawVerticalText(cx: CanvasRenderingContext2D, text: string, x: number, y: number, rotation: number): void {
    cx.save();
    cx.fillStyle = 'rgba(54, 51, 46, 0.62)';
    cx.font = 'bold 9px Inter,Arial';
    cx.textAlign = 'center';
    cx.translate(x, y);
    cx.rotate(rotation);
    cx.fillText(text, 0, 0);
    cx.restore();
  }

  private drawDepthLine(
    cx: CanvasRenderingContext2D,
    x1: number,
    x2: number,
    labelX: number,
    y: number,
    label: string,
  ): void {
    cx.save();
    cx.setLineDash([4, 3]);
    cx.strokeStyle = '#94a3b8';
    cx.lineWidth = 0.8;
    cx.beginPath();
    cx.moveTo(x1, y);
    cx.lineTo(x2, y);
    cx.stroke();
    cx.setLineDash([]);
    cx.fillStyle = '#475569';
    cx.font = '9.5px Inter,Arial';
    cx.textAlign = 'right';
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

  private fillRect(
    cx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    color: string,
    label: string,
    sub?: string,
  ): void {
    if (h <= 0) return;
    cx.fillStyle = color;
    cx.fillRect(x, y, w, h);
    cx.strokeStyle = 'rgba(0,0,0,0.12)';
    cx.lineWidth = 0.7;
    cx.strokeRect(x, y, w, h);
    if (shouldShowSegmentLabel(h)) {
      cx.fillStyle = 'rgba(0,0,0,0.75)';
      cx.font = 'bold 11px Inter,Arial';
      cx.textAlign = 'center';
      cx.fillText(label, x + w / 2, y + h / 2 + (sub ? -7 : 4));
      if (sub) {
        cx.font = '10px Inter,Arial';
        cx.fillStyle = 'rgba(0,0,0,0.55)';
        cx.fillText(sub, x + w / 2, y + h / 2 + 9);
      }
    }
  }

  private drawLegend(
    cx: CanvasRenderingContext2D,
    x: number,
    padT: number,
    items: { color: string; label: string }[],
  ): number {
    cx.fillStyle = '#1e293b';
    cx.font = 'bold 11px Inter,Arial';
    cx.textAlign = 'left';
    cx.fillText('Legenda', x, padT + 10);
    items.forEach((it, i) => {
      const ly = padT + 28 + i * 24;
      cx.fillStyle = it.color;
      cx.fillRect(x, ly, 14, 14);
      cx.strokeStyle = '#94a3b8';
      cx.lineWidth = 0.5;
      cx.strokeRect(x, ly, 14, 14);
      cx.fillStyle = '#334155';
      cx.font = '10.5px Inter,Arial';
      cx.fillText(it.label, x + 18, ly + 11);
    });
    return padT + 28 + items.length * 24;
  }

  private f(v: number | null | undefined, dec = 2): string {
    return formatPt(v, dec);
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

  private tampaoInfoSections(topCement: number): SchematicInfoSection[] {
    const p = this.plug!;
    return [
      visibleInfoRows({
        title: 'Dados do esquemático',
        rows: [
          { label: 'Zona trabalho', value: formatM(p.plugHeight, 0) },
          { label: 'Cimento', value: formatBbl(p.volCementTotal) },
          { label: 'Água de Deslocamento', value: joinInfoParts(formatBbl(p.volDisplacement), formatPpg(this.inputs?.displacementWeight ?? this.inputs?.completionWeight)) },
          { label: 'Água frente', value: joinInfoParts(formatM(p.frontPhysicalHeight, 0), formatBbl(p.volWashTotal)) },
          { label: 'Água trás', value: joinInfoParts(formatM(p.backPhysicalHeight, 0), formatBbl(p.volBackSpacer)) },
        ],
      }),
      visibleInfoRows({
        title: 'Profundidade da pasta',
        rows: [
          { label: 'Volume total de pasta', value: formatBbl(p.volCementTotal) },
          { label: 'Altura com coluna', value: formatM(p.cementHeightWithTubing) },
          { label: 'Altura sem coluna', value: formatM(p.cementHeightWithoutTubing) },
          { label: 'Topo antes da injeção', value: formatM(topCement) },
          { label: 'Volume a ser injetado', value: null },
          { label: 'Topo após injeção', value: null },
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

  private getTampaoMarkerAnchorY(
    key: string,
    depth: number,
    segments: ReturnType<SchematicTampaoComponent['visualSegments']>,
    yTop: number,
    fallback: (depth: number) => number,
  ): number {
    const anchors: Record<string, ['completionFluid' | 'displacementFluid' | 'frontWater' | 'backWater' | 'cement', 'top' | 'bottom']> = {
      displacementTop: ['displacementFluid', 'top'],
      frontTop: ['frontWater', 'top'],
      backTop: ['backWater', 'top'],
      cementTop: ['cement', 'top'],
      plugBase: ['cement', 'bottom'],
    };
    const anchor = anchors[key];
    if (!anchor) return fallback(depth);
    return visualYForSegmentBoundary(segments, anchor[0], anchor[1], yTop) ?? fallback(depth);
  }
}
