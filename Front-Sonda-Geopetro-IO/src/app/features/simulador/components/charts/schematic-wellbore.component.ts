import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { computeVisualSegmentHeights, displaySubtitleForSegment, layoutDepthAnnotations, shouldShowSegmentLabel, visualYForSegmentBoundary, VisualSegmentInput } from './visual-segments';

export interface WellboreSchematicConfig {
  // Casing
  casingOD: number;   // in
  casingID: number;   // in
  casingWeightLbmFt: number;
  casingDepthM: number;
  // Tubing
  tubingOD: number;   // in
  tubingID: number;   // in
  tubingWeightLbmFt: number;
  tubingDepthM: number;
  // Zona de trabalho
  workZoneTopM: number;
  workZoneBaseM: number;
  wellFinalMD: number;
  title: string;
  // Fluidos
  segments: WellboreSegment[];
  // Legenda
  legendItems: { color: string; label: string; sub?: string }[];
}

export interface WellboreSegment {
  key: string;
  zone: 'tubing' | 'annulus' | 'both';
  label: string;
  sub: string;
  topM: number;
  bottomM: number;
  color: string;
}

function fmtIn(v: number | null | undefined): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}
function fmtNum(v: number | null | undefined, dec = 2): string {
  if (v == null || !Number.isFinite(v)) return '-';
  return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
}

@Component({
  selector: 'app-schematic-wellbore',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="schema-card">
      <div class="schema-card-head">
        <div>
          <div class="schema-title">{{ config?.title ?? 'Esquemático do Poço' }}</div>
          <div class="schema-sub">Coluna de revestimento e tubing com fluidos</div>
        </div>
        <button class="schema-save-btn" type="button" (click)="save()" title="Salvar imagem">
          <svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Salvar
        </button>
      </div>
      <canvas #cv></canvas>
    </div>
  `,
  styles: [`
    :host { display: block; }
    .schema-card { background: var(--color-card, #fff); border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 8px; padding: 12px; }
    .schema-card-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .schema-title { font-size: .88rem; font-weight: 750; color: var(--color-text-strong, #1e293b); margin-bottom: 2px; }
    .schema-sub { font-size: .72rem; color: var(--color-text-body, #64748b); }
    canvas { width: 100%; display: block; }
    .schema-save-btn { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 5px 10px; border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 6px; background: #f8fafc; color: var(--color-text-body, #64748b); font: inherit; font-size: .72rem; font-weight: 650; cursor: pointer; transition: background .15s, color .15s; }
    .schema-save-btn:hover { background: #eef6ff; color: var(--color-primary, #4291e1); border-color: rgba(66,145,225,.3); }
  `],
})
export class SchematicWellboreComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() config: WellboreSchematicConfig | null = null;
  @ViewChild('cv') cv!: ElementRef<HTMLCanvasElement>;

  private resizeObserver?: ResizeObserver;

  ngAfterViewInit(): void {
    this.draw();
    this.resizeObserver = new ResizeObserver(() => this.draw());
    if (this.cv?.nativeElement.parentElement) {
      this.resizeObserver.observe(this.cv.nativeElement.parentElement);
    }
  }

  ngOnChanges(): void { this.draw(); }
  ngOnDestroy(): void { this.resizeObserver?.disconnect(); }

  save(): void {
    if (!this.cv) return;
    const url = this.cv.nativeElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'esquematico-poco.png';
    a.click();
  }

  toImage(): string | null {
    if (!this.cv) return null;
    this.draw();
    return this.cv.nativeElement.toDataURL('image/png');
  }

  private draw(): void {
    if (!this.config || !this.cv) return;
    const cfg = this.config;
    const canvas = this.cv.nativeElement;

    const H = 740;
    const W = Math.max(420, (canvas.parentElement?.clientWidth || 520) - 24);
    // Super-amostragem: backing store 3× maior (mesmo layout lógico W×H) para
    // exportar/imprimir o esquemático nítido no relatório/PDF.
    const scale = 3;
    canvas.width = Math.round(W * scale);
    canvas.height = Math.round(H * scale);
    const cx = canvas.getContext('2d')!;
    cx.setTransform(scale, 0, 0, scale, 0, 0);
    cx.clearRect(0, 0, W, H);

    const totalDepth = Math.max(cfg.workZoneBaseM + 60, cfg.wellFinalMD || cfg.workZoneBaseM + 60);
    const PAD_L = 130, PAD_T = 55, PAD_B = 30, LEGEND_W = 220;
    const drawH = H - PAD_T - PAD_B;
    const toY = (d: number) => PAD_T + drawH * (d / totalDepth);

    const drawW = W - LEGEND_W - PAD_L - 16;
    const legX = PAD_L + drawW + 20;

    // Título
    cx.fillStyle = '#1e293b'; cx.font = 'bold 13px Inter,Arial'; cx.textAlign = 'center';
    cx.fillText(cfg.title, (PAD_L + drawW) / 2, 20);
    cx.fillStyle = '#64748b'; cx.font = '10px Inter,Arial';
    cx.fillText('Coluna de revestimento e tubing', (PAD_L + drawW) / 2, 34);

    // ── Proporções: paredes finas, anular e centro largos ──
    const csgW  = Math.max(8,  drawW * 0.04);   // parede casing (fina)
    const tbgW  = Math.max(6,  drawW * 0.03);   // parede tubing (fina)
    const annW  = Math.max(55, drawW * 0.20);   // anular (sem texto – só cor)
    const cenW  = Math.max(90, drawW * 0.30);   // centro tubing (texto horizontal)

    const totalStructW = csgW * 2 + annW * 2 + tbgW * 2 + cenW;
    const x0 = PAD_L + (drawW - totalStructW) / 2;

    const csgLX  = x0;
    const annLX  = csgLX + csgW;
    const tbgLX  = annLX + annW;
    const cenX   = tbgLX + tbgW;
    const tbgRX  = cenX  + cenW;
    const annRX  = tbgRX + tbgW;
    const csgRX  = annRX + annW;
    const structRight = csgRX + csgW;

    const yTop  = toY(0);
    const yBase = toY(cfg.workZoneBaseM);
    const stackH = yBase - yTop;
    const yCsgEnd = toY(cfg.casingDepthM);
    const yTbgEnd = toY(cfg.tubingDepthM);

    // ── Casing ──
    const csgColor = '#94a3b8';
    cx.fillStyle = csgColor;
    cx.fillRect(csgLX, yTop, csgW, yCsgEnd - yTop);
    cx.fillRect(csgRX, yTop, csgW, yCsgEnd - yTop);
    cx.strokeStyle = '#475569'; cx.lineWidth = 1;
    cx.strokeRect(csgLX, yTop, csgW, yCsgEnd - yTop);
    cx.strokeRect(csgRX, yTop, csgW, yCsgEnd - yTop);
    // Linhas tracejadas acima do casing
    cx.save(); cx.setLineDash([5, 4]); cx.strokeStyle = '#94a3b8'; cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(csgLX + csgW / 2, PAD_T - 12); cx.lineTo(csgLX + csgW / 2, yTop);
    cx.moveTo(csgRX + csgW / 2, PAD_T - 12); cx.lineTo(csgRX + csgW / 2, yTop);
    cx.stroke(); cx.setLineDash([]); cx.restore();

    // ── Fluidos anular (mesmo stack dos dois lados) ──
    const annSegments = cfg.segments.filter(s => s.zone === 'annulus' || s.zone === 'both');
    const spacerPx = stackH * 0.18;
    const annVisual = computeVisualSegmentHeights(
      annSegments.map(s => ({ key: s.key, top: s.topM, bottom: s.bottomM, label: s.label, sub: s.sub, color: s.color })) as VisualSegmentInput[],
      { totalVisualHeight: stackH, cementKey: 'cement', cementVisualRatio: 0.30, minWaterFrontPx: spacerPx, minWaterBackPx: spacerPx, minOtherSegmentPx: 20 },
    );
    annVisual.forEach(seg => {
      cx.fillStyle = seg.color!; cx.fillRect(annLX, yTop + seg.visualTop, annW, seg.visualHeight);
      cx.fillRect(annRX, yTop + seg.visualTop, annW, seg.visualHeight);
      cx.strokeStyle = 'rgba(0,0,0,.08)'; cx.lineWidth = 0.5;
      cx.strokeRect(annLX, yTop + seg.visualTop, annW, seg.visualHeight);
      cx.strokeRect(annRX, yTop + seg.visualTop, annW, seg.visualHeight);
    });
    cx.strokeStyle = '#334155'; cx.lineWidth = 1;
    cx.strokeRect(annLX, yTop, annW, stackH);
    cx.strokeRect(annRX, yTop, annW, stackH);

    // Labels verticais no anular (ambos os lados) — nome abreviado + bbl
    annVisual.filter(seg => seg.key !== 'completionFluid' && seg.visualHeight > 24).forEach(seg => {
      const realSeg = annSegments.find(s => s.key === seg.key);
      const label = realSeg?.label ?? seg.key;
      const sub = realSeg?.sub ?? '';
      const shortLabel = label.replace('Espaçador ', 'Esp. ').replace('anular', '').trim();
      const fullText = sub ? `${shortLabel} | ${sub}` : shortLabel;
      [annLX, annRX].forEach(ax => {
        cx.save();
        cx.beginPath(); cx.rect(ax, yTop + seg.visualTop, annW, seg.visualHeight); cx.clip();
        cx.translate(ax + annW / 2, yTop + seg.visualTop + seg.visualHeight / 2);
        cx.rotate(-Math.PI / 2);
        cx.fillStyle = 'rgba(0,0,0,.72)'; cx.font = 'bold 9px Inter,Arial';
        cx.textAlign = 'center'; cx.textBaseline = 'middle';
        cx.fillText(fullText, 0, 0, seg.visualHeight - 6);
        cx.restore();
      });
    });

    // ── Tubing ──
    const tbgColor = '#64748b';
    cx.fillStyle = tbgColor;
    cx.fillRect(tbgLX, yTop, tbgW, yTbgEnd - yTop);
    cx.fillRect(tbgRX, yTop, tbgW, yTbgEnd - yTop);
    cx.strokeStyle = '#334155'; cx.lineWidth = 1;
    cx.strokeRect(tbgLX, yTop, tbgW, yTbgEnd - yTop);
    cx.strokeRect(tbgRX, yTop, tbgW, yTbgEnd - yTop);
    // Sapata tubing
    this.drawShoeFoot(cx, tbgLX + tbgW / 2, yTbgEnd);
    this.drawShoeFoot(cx, tbgRX + tbgW / 2, yTbgEnd);
    // Linhas tracejadas acima do tubing
    cx.save(); cx.setLineDash([5, 4]); cx.strokeStyle = '#64748b'; cx.lineWidth = 1;
    cx.beginPath();
    cx.moveTo(tbgLX + tbgW / 2, PAD_T - 12); cx.lineTo(tbgLX + tbgW / 2, yTop);
    cx.moveTo(tbgRX + tbgW / 2, PAD_T - 12); cx.lineTo(tbgRX + tbgW / 2, yTop);
    cx.stroke(); cx.setLineDash([]); cx.restore();

    // ── Fluidos centro tubing (COM texto) ──
    const tubSegments = cfg.segments.filter(s => s.zone === 'tubing' || s.zone === 'both');
    const tubVisual = computeVisualSegmentHeights(
      tubSegments.map(s => ({ key: s.key, top: s.topM, bottom: s.bottomM, label: s.label, sub: s.sub, color: s.color })) as VisualSegmentInput[],
      { totalVisualHeight: stackH, cementKey: 'cement', cementVisualRatio: 0.30, minWaterFrontPx: spacerPx, minWaterBackPx: spacerPx, minOtherSegmentPx: 20 },
    );
    tubVisual.forEach(seg => {
      this.fillSegment(cx, cenX, yTop + seg.visualTop, cenW, seg.visualHeight, seg.color!, seg.label!, displaySubtitleForSegment(seg), 'horizontal');
    });
    cx.strokeStyle = '#334155'; cx.lineWidth = 1;
    cx.strokeRect(cenX, yTop, cenW, stackH);

    // Sapata casing
    this.drawShoeFoot(cx, csgLX + csgW / 2, yCsgEnd);
    this.drawShoeFoot(cx, csgRX + csgW / 2, yCsgEnd);

    // ── Anotações Csg / Tbg (caixas com seta, lado esquerdo da estrutura) ──
    const boxW = 108, boxLineH = 14;
    const drawBox = (lines: string[], bxRight: number, byMid: number, arrowX: number, arrowY: number) => {
      const bh = lines.length * boxLineH + 8;
      const bx = bxRight - boxW;
      const by = byMid - bh / 2;
      cx.fillStyle = '#fff'; cx.strokeStyle = '#94a3b8'; cx.lineWidth = 0.8;
      cx.beginPath(); cx.roundRect(bx, by, boxW, bh, 3); cx.fill(); cx.stroke();
      cx.fillStyle = '#334155'; cx.font = '9.5px Inter,Arial'; cx.textAlign = 'left';
      lines.forEach((l, i) => cx.fillText(l, bx + 5, by + 13 + i * boxLineH));
      cx.save(); cx.strokeStyle = '#94a3b8'; cx.lineWidth = 0.8;
      cx.beginPath(); cx.moveTo(bxRight, byMid); cx.lineTo(arrowX, arrowY); cx.stroke(); cx.restore();
    };
    // Posições Y corretas: interpolação dentro da faixa da coluna
    const yCsgMid = yTop + (yCsgEnd - yTop) * 0.30;
    const yTbgMid = yTop + (yTbgEnd - yTop) * 0.55;

    // OD em polegadas com formatação en-US (ex: 5.500 in) para evitar ambiguidade pt-BR
    const fmtOD = (v: number) => Number.isFinite(v) ? v.toFixed(3) : '-';

    drawBox(
      [`${fmtOD(cfg.casingOD)} in  Csg`, `${fmtNum(cfg.casingDepthM, 0)} m`],
      csgLX - 4, yCsgMid, csgLX, yCsgMid,
    );
    drawBox(
      [`${fmtOD(cfg.tubingOD)} in  Tbg`, `${fmtNum(cfg.tubingDepthM, 0)} m`],
      tbgLX - 4, yTbgMid, tbgLX, yTbgMid,
    );

    // ── Legenda à direita ──
    let ly = PAD_T + 10;
    cx.fillStyle = '#1e293b'; cx.font = 'bold 11px Inter,Arial'; cx.textAlign = 'left';
    cx.fillText('Legenda', legX, ly);
    ly += 18;
    cfg.legendItems.forEach(item => {
      cx.fillStyle = item.color; cx.fillRect(legX, ly, 16, 16);
      cx.strokeStyle = '#94a3b8'; cx.lineWidth = 0.5; cx.strokeRect(legX, ly, 16, 16);
      cx.fillStyle = '#1e293b'; cx.font = 'bold 11px Inter,Arial'; cx.textAlign = 'left';
      cx.fillText(item.label, legX + 22, ly + 11);
      if (item.sub) {
        cx.fillStyle = '#64748b'; cx.font = '10px Inter,Arial';
        cx.fillText(item.sub, legX + 22, ly + 24);
        ly += 36;
      } else {
        ly += 26;
      }
    });

    // Legenda estrutural
    ly += 8;
    cx.strokeStyle = '#e2e8f0'; cx.lineWidth = 0.8;
    cx.beginPath(); cx.moveTo(legX, ly); cx.lineTo(legX + 210, ly); cx.stroke();
    ly += 10;
    cx.fillStyle = csgColor; cx.fillRect(legX, ly, 16, 16);
    cx.strokeStyle = '#94a3b8'; cx.lineWidth = 0.5; cx.strokeRect(legX, ly, 16, 16);
    cx.fillStyle = '#1e293b'; cx.font = 'bold 11px Inter,Arial'; cx.fillText('Revestimento (Csg)', legX + 22, ly + 11); ly += 26;
    cx.fillStyle = tbgColor; cx.fillRect(legX, ly, 16, 16);
    cx.strokeStyle = '#94a3b8'; cx.lineWidth = 0.5; cx.strokeRect(legX, ly, 16, 16);
    cx.fillStyle = '#1e293b'; cx.fillText('Tubing (Tbg)', legX + 22, ly + 11);
  }

  private fillSegment(cx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, color: string, label: string, sub?: string, orient: 'horizontal' | 'vertical' = 'horizontal'): void {
    if (h <= 0 || w <= 0) return;
    cx.fillStyle = color; cx.fillRect(x, y, w, h);
    cx.strokeStyle = 'rgba(0,0,0,.1)'; cx.lineWidth = 0.7; cx.strokeRect(x, y, w, h);
    if (!shouldShowSegmentLabel(h)) return;
    if (orient === 'vertical') {
      cx.save();
      // Clip dentro do segmento para o texto não vazar
      cx.beginPath(); cx.rect(x, y, w, h); cx.clip();
      cx.translate(x + w / 2, y + h / 2);
      cx.rotate(-Math.PI / 2);
      cx.fillStyle = 'rgba(0,0,0,.78)';
      // Fonte menor para caber na coluna estreita
      const fontSize = Math.min(10, h * 0.55);
      cx.font = `bold ${fontSize}px Inter,Arial`;
      cx.textAlign = 'center'; cx.textBaseline = 'middle';
      // Trunca o label ao espaço disponível (h = largura após rotação)
      const maxW = h - 8;
      cx.fillText(label, 0, 0, maxW);
      cx.restore();
    } else {
      cx.fillStyle = 'rgba(0,0,0,.75)'; cx.font = 'bold 10px Inter,Arial'; cx.textAlign = 'center';
      cx.fillText(label, x + w / 2, y + h / 2 + (sub ? -6 : 4));
      if (sub) {
        cx.fillStyle = 'rgba(0,0,0,.55)'; cx.font = '9px Inter,Arial';
        cx.fillText(sub, x + w / 2, y + h / 2 + 8);
      }
    }
  }

  private drawShoeFoot(cx: CanvasRenderingContext2D, cxPos: number, y: number): void {
    // Pé/sapata: triângulo preto na base da coluna
    cx.fillStyle = '#0f172a';
    cx.beginPath();
    cx.moveTo(cxPos - 7, y + 12);
    cx.lineTo(cxPos + 7, y + 12);
    cx.lineTo(cxPos, y);
    cx.closePath();
    cx.fill();
  }

  private drawInjectionArrow(cx: CanvasRenderingContext2D, xRight: number, y: number): void {
    // Seta apontando para dentro do poço (►)
    cx.strokeStyle = '#64748b'; cx.lineWidth = 1.2;
    cx.beginPath(); cx.moveTo(xRight - 10, y); cx.lineTo(xRight + 4, y); cx.stroke();
    cx.fillStyle = '#64748b';
    cx.beginPath();
    cx.moveTo(xRight + 4, y - 4);
    cx.lineTo(xRight + 10, y);
    cx.lineTo(xRight + 4, y + 4);
    cx.closePath();
    cx.fill();
  }

  private drawStringBox(cx: CanvasRenderingContext2D, boxX: number, boxY: number, text: string, lineEndX: number, lineEndY: number): void {
    const lines = text.split('\n');
    const lineH = 14;
    const boxW = 110;
    const boxH = lines.length * lineH + 8;
    const bx = Math.max(4, boxX - boxW / 2);
    const by = boxY - boxH / 2;

    cx.fillStyle = '#ffffff'; cx.strokeStyle = '#94a3b8'; cx.lineWidth = 0.8;
    cx.beginPath();
    cx.roundRect(bx, by, boxW, boxH, 4);
    cx.fill(); cx.stroke();

    cx.fillStyle = '#334155'; cx.font = '9.5px Inter,Arial'; cx.textAlign = 'left';
    lines.forEach((line, i) => cx.fillText(line, bx + 6, by + 14 + i * lineH));

    // Linha conectora
    cx.save();
    cx.strokeStyle = '#94a3b8'; cx.lineWidth = 0.8;
    cx.beginPath();
    cx.moveTo(bx + boxW, by + boxH / 2);
    cx.lineTo(lineEndX, lineEndY);
    cx.stroke();
    cx.restore();
  }
}
