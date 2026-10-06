import { CommonModule } from '@angular/common';
import { Component, Input, computed, signal } from '@angular/core';
import type { PrimaryFluid, PrimaryHydraulicPoint, PrimarySnapshot, PrimaryTarget } from '../../models/primary-cementing.model';

interface Band {
  x: number; y: number; width: number; height: number;
  color: string; label: string; zone: 'internal' | 'casing-annulus';
}

/**
 * Esquemático 2D da cimentação primária. O cimento é pintado **fora** do OD do
 * revestimento-alvo; dentro dele só aparece o que o transporte realmente deixou,
 * que no final ideal convencional é apenas o shoe track.
 */
@Component({
  selector: 'app-schematic-primaria',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="sp-wrap">
      @if (point; as current) {
        <div class="sp-status" [class.sp-status--pumping]="isPumping">
          <strong>{{ stepLabel }}</strong>
          <span>{{ current.timeMin.toFixed(2) }} min</span>
          <span>{{ current.pumpedVolumeBbl.toFixed(2) }} bbl injetados</span>
          <span>{{ current.pumpRateBpm.toFixed(2) }} bpm</span>
        </div>
      }
      <svg [attr.viewBox]="'0 0 320 ' + height" preserveAspectRatio="xMidYMid meet" role="img"
        [attr.aria-label]="'Esquemático da cimentação primária'">
        <rect x="0" y="0" width="320" height="100%" fill="var(--color-card, #fff)"></rect>

        <!-- Parede externa do poço -->
        <rect [attr.x]="wallLeft" y="18" [attr.width]="wallRight - wallLeft" [attr.height]="height - 36"
          fill="#f1e7d8" stroke="#c9b68f" stroke-width="1"></rect>

        @for (band of bands(); track band.label + band.y + band.x) {
          <rect [attr.x]="band.x" [attr.y]="band.y" [attr.width]="band.width" [attr.height]="band.height"
            [attr.fill]="band.color" opacity="0.92">
            <title>{{ band.label }}</title>
          </rect>
        }

        @if (isPumping) {
          <path [attr.d]="'M140 24 V' + (y(shoeMD) - 8)" class="sp-flow sp-flow--down"></path>
          <path [attr.d]="'M82 ' + (y(shoeMD) - 8) + ' V24'" class="sp-flow sp-flow--up"></path>
          <path [attr.d]="'M198 ' + (y(shoeMD) - 8) + ' V24'" class="sp-flow sp-flow--up"></path>
        }

        <!-- Paredes de aço do revestimento-alvo, desenhadas por cima dos fluidos -->
        <rect [attr.x]="casingLeft" [attr.y]="y(targetTopMD)" [attr.width]="steel"
          [attr.height]="y(shoeMD) - y(targetTopMD)" fill="#8fa3bb"></rect>
        <rect [attr.x]="casingRight - steel" [attr.y]="y(targetTopMD)" [attr.width]="steel"
          [attr.height]="y(shoeMD) - y(targetTopMD)" fill="#8fa3bb"></rect>

        <!-- Colar, sapata e topo do liner -->
        <line [attr.x1]="casingLeft" [attr.x2]="casingRight" [attr.y1]="y(collarMD)" [attr.y2]="y(collarMD)"
          stroke="#334155" stroke-width="2.5"></line>
        <text x="228" [attr.y]="y(collarMD) - 3" class="sp-note">colar</text>
        <line [attr.x1]="casingLeft - 6" [attr.x2]="casingRight + 6" [attr.y1]="y(shoeMD)" [attr.y2]="y(shoeMD)"
          stroke="#334155" stroke-width="3"></line>
        <text x="228" [attr.y]="y(shoeMD) - 3" class="sp-note">sapata</text>
        @if (targetTopMD > 0) {
          <line [attr.x1]="casingLeft - 6" [attr.x2]="casingRight + 6" [attr.y1]="y(targetTopMD)"
            [attr.y2]="y(targetTopMD)" stroke="#0f766e" stroke-width="2"></line>
          <text x="216" [attr.y]="y(targetTopMD) - 3" class="sp-note">topo do liner</text>
        }
        @if (tocMD() !== null) {
          <line x1="20" [attr.x2]="300" [attr.y1]="y(tocMD()!)" [attr.y2]="y(tocMD()!)"
            stroke="#b45309" stroke-width="1.5" stroke-dasharray="5 3"></line>
          <text x="22" [attr.y]="y(tocMD()!) - 4" class="sp-note sp-note--toc">TOC {{ tocMD()!.toFixed(0) }} m</text>
        }

        @for (plug of plugs; track plug.id) {
          @if (plug.md !== null) {
            <rect [attr.x]="casingLeft + steel" [attr.y]="y(plug.md) - 3"
              [attr.width]="casingRight - casingLeft - 2 * steel" height="6" rx="2" fill="#1f2937">
              <title>{{ plug.kind }} — {{ plug.state }}</title>
            </rect>
          }
        }

        <!-- Setas: desce por dentro, sobe por fora -->
        <text x="150" y="14" class="sp-note sp-note--axis">↓ interior</text>
        <text x="40" y="14" class="sp-note sp-note--axis">↑ anular</text>
      </svg>

      <div class="sp-legend">
        @for (entry of legend(); track entry.label) {
          <span class="sp-chip"><i [style.background]="entry.color"></i>{{ entry.label }}</span>
        }
        @if (!snapshot) { <span class="sp-empty">Sem resultado calculado para desenhar.</span> }
      </div>
    </div>
  `,
  styles: [`
    .sp-wrap { display: flex; flex-direction: column; gap: 10px; }
    .sp-status { display: flex; flex-wrap: wrap; align-items: center; gap: 7px 14px; padding: 9px 11px;
      border: 1px solid var(--color-card-border, #d6deeb); border-radius: 8px; color: #475569; font-size: .74rem; }
    .sp-status strong { color: #051833; margin-right: auto; }
    .sp-status--pumping { border-color: #86efac; background: #f0fdf4; }
    svg { width: 100%; max-width: 420px; height: auto; align-self: center; border: 1px solid var(--color-card-border, #d6deeb); border-radius: 8px; }
    .sp-note { font-size: 8px; fill: #475569; font-weight: 600; }
    .sp-note--toc { fill: #b45309; }
    .sp-note--axis { fill: #64748b; }
    .sp-legend { display: flex; flex-wrap: wrap; gap: 8px; }
    .sp-chip { display: inline-flex; align-items: center; gap: 5px; font-size: .72rem; color: var(--color-text-body, #475569); }
    .sp-chip i { width: 11px; height: 11px; border-radius: 3px; display: inline-block; }
    .sp-empty { font-size: .74rem; color: var(--color-text-body, #64748b); }
    .sp-flow { fill: none; stroke: #fff; stroke-width: 2.2; stroke-dasharray: 4 7; opacity: .95;
      animation: primary-flow .7s linear infinite; pointer-events: none; }
    .sp-flow--up { animation-direction: reverse; }
    @keyframes primary-flow { to { stroke-dashoffset: -22; } }
  `],
})
export class SchematicPrimariaComponent {
  @Input() set state(value: { snapshot: PrimarySnapshot | null; target: PrimaryTarget | null;
    fluids: PrimaryFluid[]; tocMD: number | null; point?: PrimaryHydraulicPoint | null;
    stepLabel?: string } | null) {
    this.snapshotState.set(value?.snapshot ?? null);
    this.target = value?.target ?? null;
    this.fluids = value?.fluids ?? [];
    this.point = value?.point ?? null;
    this.stepLabel = value?.stepLabel ?? 'Estado inicial';
    this.toc.set(value?.tocMD ?? null);
  }

  private readonly snapshotState = signal<PrimarySnapshot | null>(null);
  get snapshot(): PrimarySnapshot | null { return this.snapshotState(); }
  target: PrimaryTarget | null = null;
  fluids: PrimaryFluid[] = [];
  point: PrimaryHydraulicPoint | null = null;
  stepLabel = 'Estado inicial';
  private readonly toc = signal<number | null>(null);
  tocMD = computed(() => this.toc());

  readonly height = 360;
  readonly wallLeft = 60;
  readonly wallRight = 220;
  readonly casingLeft = 96;
  readonly casingRight = 184;
  readonly steel = 5;

  get shoeMD(): number { return this.target?.shoeMD ?? 1; }
  get collarMD(): number { return this.target?.floatCollarMD ?? 0; }
  get targetTopMD(): number { return this.target?.kind === 'liner' ? this.target.linerTopMD : 0; }
  get plugs(): PrimarySnapshot['plugs'] { return this.snapshot?.plugs ?? []; }
  get isPumping(): boolean { return (this.point?.pumpRateBpm ?? 0) > 0; }

  /** Escala vertical fixa entre a superfície e a sapata. */
  y(md: number): number {
    const span = Math.max(1, this.shoeMD);
    return 18 + Math.min(1, Math.max(0, md / span)) * (this.height - 36);
  }

  private color(fluidId: string): string {
    const kind = this.fluids.find(f => f.id === fluidId)?.kind;
    const palette: Record<string, string> = {
      mud: '#a8b5c6', wash: '#7dd3fc', spacer: '#fbbf24',
      cement: '#0f766e', displacement: '#60a5fa',
    };
    return palette[kind ?? ''] ?? '#cbd5e1';
  }

  bands = computed<Band[]>(() => {
    const parcels = this.snapshotState()?.parcels ?? [];
    return parcels
      .filter(parcel => parcel.bottomMD > parcel.topMD)
      .map(parcel => {
        const top = this.y(parcel.topMD);
        const bottom = this.y(parcel.bottomMD);
        const internal = parcel.zone === 'internal';
        // Anular fica fora do OD; interior fica dentro do ID. Nunca o contrário.
        return {
          x: internal ? this.casingLeft + this.steel : this.wallLeft,
          width: internal ? this.casingRight - this.casingLeft - 2 * this.steel
            : this.casingLeft - this.wallLeft,
          y: top, height: Math.max(0.6, bottom - top),
          color: this.color(parcel.fluidId),
          label: `${parcel.fluidId} · ${parcel.zone === 'internal' ? 'interior' : 'anular'} · `
            + `${parcel.topMD.toFixed(0)}–${parcel.bottomMD.toFixed(0)} m`,
          zone: parcel.zone,
        };
      })
      // Espelha o anular do outro lado do revestimento para leitura simétrica.
      .flatMap(band => band.zone === 'casing-annulus'
        ? [band, { ...band, x: this.casingRight }] : [band]);
  });

  legend = computed(() => {
    const used = new Set((this.snapshotState()?.parcels ?? []).map(p => p.fluidId));
    return this.fluids.filter(f => used.has(f.id))
      .map(f => ({ label: f.name, color: this.color(f.id) }));
  });
}
