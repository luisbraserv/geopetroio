import { DepthUnit, formatDepthNumber } from '../../models/depth-unit';
import { Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { WellGeometry, WellOverlay, WellOverlayType, WellPhase } from '../../models/well-geometry.model';
import { formatInches, WellGeometryService } from '../../services/well-geometry.service';

export type WellScaleMode = 'schematic' | 'proportional';

export interface WellSchematicState {
  id: string;
  label: string;
}

interface PhaseBand {
  phase: WellPhase;
  y0: number;
  y1: number;
  halfHole: number;
  halfCasing: number;
  casedY0: number;
  casedY1: number;
  hasCasing: boolean;
}

interface ShoeMark {
  y: number;
  half: number;
  label: string;
  md: number;
  tvd: number;
}

interface OverlayShape {
  overlay: WellOverlay;
  x: number;
  y: number;
  width: number;
  height: number;
  color: string;
  labelY: number;
  perforation: boolean;
}

interface DepthTick {
  y: number;
  md: number;
  label: string;
  strong: boolean;
}

const VIEW_WIDTH = 460;
const VIEW_HEIGHT = 660;
const AXIS_X = 214;
const TOP_PAD = 26;
const BOTTOM_PAD = 34;
const MAX_HALF_WIDTH = 96;
const MIN_HALF_WIDTH = 16;
const MIN_PHASE_PX = 52;
const MIN_OVERLAY_PX = 7;

const OVERLAY_COLORS: Record<WellOverlayType, string> = {
  CEMENT: '#fb923c',
  SPACER: '#d8b4fe',
  DISPLACEMENT: '#93c5fd',
  PERFORATION: '#dc2626',
  SQUEEZE: '#ea580c',
  TUBING: '#94a3b8',
};

/**
 * Desenho da estrutura física do poço com overlays da operação.
 *
 * Responsabilidade estritamente visual: recebe `WellGeometry` (estrutura) e
 * `WellOverlay[]` (posições JÁ calculadas pelos services) e apenas representa.
 * Não faz cálculo hidráulico nem volumétrico, e não deduz fase/diâmetro por
 * conta própria — quem faz isso é o `WellGeometryService`.
 */
@Component({
  selector: 'app-well-schematic',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ws-card">
      <div class="ws-head">
        <div>
          <div class="ws-title">{{ title }}</div>
          @if (subtitle) { <div class="ws-sub">{{ subtitle }}</div> }
        </div>
        <div class="ws-actions">
          @if (stateOptions.length > 1) {
            <div class="ws-toggle">
              @for (state of stateOptions; track state.id) {
                <button type="button" [class.active]="state.id === activeStateId"
                  (click)="stateChange.emit(state.id)">{{ state.label }}</button>
              }
            </div>
          }
          <div class="ws-toggle">
            <button type="button" [class.active]="scaleMode === 'schematic'" (click)="setScale('schematic')">Esquemático</button>
            <button type="button" [class.active]="scaleMode === 'proportional'" (click)="setScale('proportional')">Proporcional</button>
          </div>
        </div>
      </div>

      @if (bands.length) {
        <svg class="ws-svg" [attr.viewBox]="'0 0 ' + viewWidth + ' ' + viewHeight" preserveAspectRatio="xMidYMid meet">
          <!-- superfície -->
          <line [attr.x1]="axisX - maxHalf - 16" [attr.y1]="topPad" [attr.x2]="axisX + maxHalf + 16" [attr.y2]="topPad"
            stroke="#475569" stroke-width="2.5" />
          <text [attr.x]="axisX - maxHalf - 18" [attr.y]="topPad - 8" class="ws-label ws-label--end">SUPERFÍCIE</text>

          <!-- fases: poço aberto e revestimento -->
          @for (band of bands; track band.phase.id) {
            <rect [attr.x]="axisX - band.halfHole" [attr.y]="band.y0"
              [attr.width]="band.halfHole * 2" [attr.height]="band.y1 - band.y0"
              fill="#f8fafc" stroke="#cbd5e1" stroke-width="1" />
            @if (band.hasCasing) {
              <rect [attr.x]="axisX - band.halfCasing" [attr.y]="band.casedY0"
                [attr.width]="4" [attr.height]="band.casedY1 - band.casedY0"
                fill="#64748b" />
              <rect [attr.x]="axisX + band.halfCasing - 4" [attr.y]="band.casedY0"
                [attr.width]="4" [attr.height]="band.casedY1 - band.casedY0"
                fill="#64748b" />
            }
            <text [attr.x]="axisX" [attr.y]="(band.y0 + band.y1) / 2" class="ws-phase-name">{{ band.phase.name }}</text>
            <text [attr.x]="axisX" [attr.y]="(band.y0 + band.y1) / 2 + 12" class="ws-phase-sub">{{ diameter(band.phase.holeDiameterIn) }}</text>
          }

          <!-- overlays da operação -->
          @for (shape of overlayShapes; track $index) {
            @if (shape.perforation) {
              @for (side of [-1, 1]; track side) {
                <rect [attr.x]="side < 0 ? shape.x - 9 : shape.x + shape.width" [attr.y]="shape.y"
                  [attr.width]="9" [attr.height]="shape.height" [attr.fill]="shape.color" opacity=".85" />
              }
            } @else {
              <rect [attr.x]="shape.x" [attr.y]="shape.y" [attr.width]="shape.width" [attr.height]="shape.height"
                [attr.fill]="shape.color" opacity=".82" />
            }
            <line [attr.x1]="shape.x + shape.width" [attr.y1]="shape.labelY"
              [attr.x2]="axisX + maxHalf + 14" [attr.y2]="shape.labelY" stroke="#94a3b8" stroke-width=".8" stroke-dasharray="2 2" />
            <text [attr.x]="axisX + maxHalf + 18" [attr.y]="shape.labelY + 3" class="ws-overlay-label">
              {{ shape.overlay.label }}
              <tspan class="ws-overlay-depth"> · {{ fmt(shape.overlay.topMD) }}–{{ fmt(shape.overlay.bottomMD) }} {{ depthUnit }}</tspan>
            </text>
          }

          <!-- sapatas -->
          @for (shoe of shoes; track shoe.md) {
            <path [attr.d]="shoePath(shoe)" fill="#334155" />
            <text [attr.x]="axisX - maxHalf - 18" [attr.y]="shoe.y + 3" class="ws-label ws-label--end">
              {{ fmt(shoe.md) }} {{ depthUnit }}
            </text>
            <text [attr.x]="axisX - maxHalf - 18" [attr.y]="shoe.y + 14" class="ws-label ws-label--end ws-label--muted">
              Sapata {{ shoe.label }} · {{ fmt(shoe.tvd) }} {{ depthUnit }} TVD
            </text>
          }

          <!-- profundidades das fases -->
          @for (tick of ticks; track tick.md) {
            <line [attr.x1]="axisX - maxHalf - 12" [attr.y1]="tick.y" [attr.x2]="axisX - maxHalf - 4" [attr.y2]="tick.y"
              stroke="#94a3b8" stroke-width="1" />
            <text [attr.x]="axisX - maxHalf - 18" [attr.y]="tick.y + 3"
              class="ws-label ws-label--end" [class.ws-label--muted]="!tick.strong">{{ tick.label }}</text>
          }

          <!-- fundo do poço -->
          <path [attr.d]="bottomPath()" fill="none" stroke="#475569" stroke-width="2" />
          <text [attr.x]="axisX" [attr.y]="bottomY + 20" class="ws-bottom-label">FUNDO {{ fmt(geometry.finalMD) }} {{ depthUnit }} MD · {{ fmt(geometry.finalTVD) }} {{ depthUnit }} TVD</text>
        </svg>

        @if (scaleMode === 'schematic') {
          <p class="ws-note">Representação esquemática. As profundidades indicadas são os valores reais.</p>
        }
      } @else {
        <p class="ws-empty">Cadastre as fases do poço para ver o esquemático.</p>
      }
    </div>
  `,
  styles: [`
    .ws-card { background: var(--color-card, #fff); border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 10px; padding: 14px; }
    .ws-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 10px; flex-wrap: wrap; }
    .ws-title { font-size: .88rem; font-weight: 800; color: var(--color-text-strong, #1e293b); }
    .ws-sub { font-size: .72rem; color: var(--color-text-body, #64748b); margin-top: 2px; }
    .ws-actions { display: flex; gap: 6px; flex-wrap: wrap; }
    .ws-toggle { display: inline-flex; border: 1px solid #e2e8f0; border-radius: 7px; overflow: hidden; }
    .ws-toggle button { border: 0; background: #f8fafc; color: #64748b; font: inherit; font-size: .7rem; font-weight: 650; padding: 5px 10px; cursor: pointer; }
    .ws-toggle button + button { border-left: 1px solid #e2e8f0; }
    .ws-toggle button.active { background: #4291e1; color: #fff; }

    .ws-svg { display: block; width: 100%; height: auto; max-height: 78vh; }
    .ws-note { margin: 8px 0 0; font-size: .68rem; color: #64748b; font-style: italic; }
    .ws-empty { margin: 0; font-size: .75rem; color: #64748b; }

    .ws-label { font-size: 9px; fill: #475569; font-weight: 650; }
    .ws-label--end { text-anchor: end; }
    .ws-label--muted { fill: #94a3b8; font-weight: 500; }
    .ws-phase-name { font-size: 10px; fill: #64748b; font-weight: 700; text-anchor: middle; }
    .ws-phase-sub { font-size: 9px; fill: #94a3b8; text-anchor: middle; }
    .ws-overlay-label { font-size: 9px; fill: #334155; font-weight: 650; }
    .ws-overlay-depth { fill: #94a3b8; font-weight: 500; }
    .ws-bottom-label { font-size: 9px; fill: #475569; font-weight: 700; text-anchor: middle; }
  `],
})
export class WellSchematicComponent implements OnChanges {
  private readonly wellGeo = new WellGeometryService();
  @Input({ required: true }) geometry!: WellGeometry;
  @Input() depthUnit: DepthUnit = 'm';
  @Input() overlays: WellOverlay[] = [];
  @Input() title = 'Esquemático do poço';
  @Input() subtitle = '';
  /** Estados alternáveis (ex.: antes/depois do squeeze) — quem troca os overlays é a página. */
  @Input() stateOptions: WellSchematicState[] = [];
  @Input() activeStateId = '';
  @Output() stateChange = new EventEmitter<string>();

  scaleMode: WellScaleMode = 'schematic';

  readonly viewWidth = VIEW_WIDTH;
  readonly viewHeight = VIEW_HEIGHT;
  readonly axisX = AXIS_X;
  readonly topPad = TOP_PAD;
  maxHalf = MAX_HALF_WIDTH;
  bottomY = VIEW_HEIGHT - BOTTOM_PAD;

  bands: PhaseBand[] = [];
  shoes: ShoeMark[] = [];
  ticks: DepthTick[] = [];
  overlayShapes: OverlayShape[] = [];

  ngOnChanges(): void { this.build(); }

  setScale(mode: WellScaleMode): void {
    if (this.scaleMode === mode) return;
    this.scaleMode = mode;
    this.build();
  }

  fmt(value: number | null | undefined): string {
    return formatDepthNumber(value, this.depthUnit, 0);
  }

  diameter(value: number): string { return formatInches(value); }

  shoePath(shoe: ShoeMark): string {
    const x = this.axisX;
    const h = 9;
    return `M ${x - shoe.half - 3} ${shoe.y} l -9 0 l 0 ${h} l 9 0 z `
      + `M ${x + shoe.half + 3} ${shoe.y} l 9 0 l 0 ${h} l -9 0 z`;
  }

  bottomPath(): string {
    const band = this.bands.at(-1);
    const half = band ? band.halfHole : MIN_HALF_WIDTH;
    const x = this.axisX;
    const y = this.bottomY;
    return `M ${x - half} ${y - 14} Q ${x} ${y + 10} ${x + half} ${y - 14}`;
  }

  // ── Construção do modelo visual ─────────────────────────────────────────

  private build(): void {
    this.bands = [];
    this.shoes = [];
    this.ticks = [];
    this.overlayShapes = [];

    const phases = [...(this.geometry?.phases ?? [])]
      .filter(p => p.bottomMD > p.topMD)
      .sort((a, b) => a.topMD - b.topMD);
    if (!phases.length) return;

    const drawHeight = this.bottomY - this.topPad - 16;
    const heights = this.scaleMode === 'proportional'
      ? this.proportionalHeights(phases, drawHeight)
      : this.schematicHeights(phases, drawHeight);

    const maxDiameter = Math.max(...phases.map(p => p.holeDiameterIn || 0), 1);
    const halfFor = (diameterIn: number): number => {
      const ratio = Math.max(0, diameterIn) / maxDiameter;
      return Math.max(MIN_HALF_WIDTH, ratio * MAX_HALF_WIDTH);
    };
    this.maxHalf = MAX_HALF_WIDTH;

    let cursor = this.topPad;
    phases.forEach((phase, index) => {
      const y0 = cursor;
      const y1 = cursor + heights[index];
      cursor = y1;

      const casing = phase.casing;
      const casedTop = casing ? Math.max(phase.topMD, casing.topMD ?? 0) : 0;
      const casedBottom = casing ? Math.min(phase.bottomMD, casing.bottomMD) : 0;
      const hasCasing = !!casing && casedBottom > casedTop;

      const band: PhaseBand = {
        phase,
        y0,
        y1,
        halfHole: halfFor(phase.holeDiameterIn),
        halfCasing: casing ? halfFor(casing.odIn) : halfFor(phase.holeDiameterIn),
        casedY0: hasCasing ? this.yWithinBand(phase, casedTop, y0, y1) : y0,
        casedY1: hasCasing ? this.yWithinBand(phase, casedBottom, y0, y1) : y1,
        hasCasing,
      };
      this.bands.push(band);

      this.ticks.push({ y: y0, md: phase.topMD, label: `${this.fmt(phase.topMD)} ${this.depthUnit}`, strong: index === 0 });

      const shoe = phase.shoe ?? (casing ? { md: casing.bottomMD, tvd: this.tvdAtBand(phase, casing.bottomMD) } : null);
      if (shoe && casing) {
        this.shoes.push({
          y: this.yWithinBand(phase, shoe.md, y0, y1),
          half: band.halfCasing,
          label: formatInches(casing.odIn),
          md: shoe.md,
          tvd: shoe.tvd,
        });
      }
    });

    this.bottomY = cursor + 16;
    this.buildOverlays();
  }

  /** Altura visual proporcional ao trecho de MD. */
  private proportionalHeights(phases: WellPhase[], total: number): number[] {
    const lengths = phases.map(p => p.bottomMD - p.topMD);
    const sum = lengths.reduce((a, b) => a + b, 0) || 1;
    return lengths.map(l => (l / sum) * total);
  }

  /**
   * Altura visual com mínimo por fase: uma fase curta continua legível.
   * Distribui o restante proporcionalmente entre as fases que ficaram acima
   * do mínimo, iterando até estabilizar.
   */
  private schematicHeights(phases: WellPhase[], total: number): number[] {
    const lengths = phases.map(p => p.bottomMD - p.topMD);
    const minPx = Math.min(MIN_PHASE_PX, total / Math.max(1, phases.length));
    const heights = new Array(lengths.length).fill(0);
    const pinned = new Array(lengths.length).fill(false);

    for (let guard = 0; guard < lengths.length + 1; guard += 1) {
      const freeIndexes = lengths.map((_, i) => i).filter(i => !pinned[i]);
      const pinnedTotal = heights.reduce((sum, h, i) => sum + (pinned[i] ? h : 0), 0);
      const available = Math.max(0, total - pinnedTotal);
      const freeLength = freeIndexes.reduce((sum, i) => sum + lengths[i], 0) || 1;

      let changed = false;
      for (const i of freeIndexes) {
        const share = (lengths[i] / freeLength) * available;
        if (share < minPx) { heights[i] = minPx; pinned[i] = true; changed = true; }
        else heights[i] = share;
      }
      if (!changed) break;
    }
    return heights;
  }

  private yWithinBand(phase: WellPhase, md: number, y0: number, y1: number): number {
    const span = phase.bottomMD - phase.topMD;
    if (span <= 0) return y0;
    const ratio = (md - phase.topMD) / span;
    return y0 + Math.max(0, Math.min(1, ratio)) * (y1 - y0);
  }

  private tvdAtBand(phase: WellPhase, md: number): number {
    if (this.geometry?.trajectory) return this.wellGeo.mdToTvd(this.geometry, md);
    const span = phase.bottomMD - phase.topMD;
    if (span <= 0) return phase.topTVD;
    return phase.topTVD + ((md - phase.topMD) / span) * (phase.bottomTVD - phase.topTVD);
  }

  /** Converte MD em y usando as faixas já posicionadas (mesma escala do desenho). */
  private yAt(md: number): number | null {
    for (const band of this.bands) {
      if (md >= band.phase.topMD && md <= band.phase.bottomMD) {
        return this.yWithinBand(band.phase, md, band.y0, band.y1);
      }
    }
    return null;
  }

  private bandAt(md: number): PhaseBand | null {
    return this.bands.find(b => md >= b.phase.topMD && md <= b.phase.bottomMD) ?? null;
  }

  private buildOverlays(): void {
    for (const overlay of this.overlays ?? []) {
      const top = Math.min(overlay.topMD, overlay.bottomMD);
      const bottom = Math.max(overlay.topMD, overlay.bottomMD);
      const yTop = this.yAt(top);
      const yBottom = this.yAt(bottom);
      if (yTop === null || yBottom === null) continue; // fora das fases: não inventa posição

      const band = this.bandAt((top + bottom) / 2) ?? this.bands[0];
      const height = Math.max(MIN_OVERLAY_PX, yBottom - yTop);
      const inner = band.hasCasing ? band.halfCasing - 5 : band.halfHole - 2;
      const zone = overlay.zone ?? 'full';
      const half = zone === 'tubing' ? Math.max(6, inner * 0.34) : inner;

      this.overlayShapes.push({
        overlay,
        x: this.axisX - half,
        y: yTop,
        width: half * 2,
        height,
        color: overlay.color ?? OVERLAY_COLORS[overlay.type],
        labelY: yTop + height / 2,
        perforation: overlay.type === 'PERFORATION',
      });
    }
    // rótulos empilhados de cima para baixo, sem sobreposição
    this.overlayShapes.sort((a, b) => a.labelY - b.labelY);
    let lastLabel = -Infinity;
    for (const shape of this.overlayShapes) {
      shape.labelY = Math.max(shape.labelY, lastLabel + 12);
      lastLabel = shape.labelY;
    }
  }
}
