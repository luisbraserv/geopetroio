import { AfterViewInit, Component, ElementRef, Input, OnChanges, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { SqueezeHydraulicSimulation } from '../../models/squeeze.model';
import { ChartZoomModalComponent } from './chart-zoom-modal.component';

type ChartKey = 'envelope' | 'pressureTime' | 'bhpEcd' | 'freeFall' | 'hydroWindow';

Chart.register(...registerables);

@Component({
  selector: 'app-squeeze-operation-charts',
  standalone: true,
  imports: [CommonModule, ChartZoomModalComponent],
  template: `
    @if (data) {
      <div class="sq-charts">
        <div class="sq-block sq-block--wide">
          <div class="sq-block-head">
            <div>
              <div class="sq-title">Envelope de Pressão — {{ referenceTitle }}</div>
              <div class="sq-sub">Pressões calculadas {{ referenceSub }}</div>
            </div>
            <div class="head-actions">
              <button class="save-btn" type="button" (click)="openZoom('envelope')" title="Ampliar gráfico">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Ampliar
              </button>
              <button class="save-btn" type="button" (click)="saveChart(envelope, filePrefix + '-envelope-pressao')">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Salvar
              </button>
            </div>
          </div>
          <div class="sq-chart-box"><canvas #envelope></canvas></div>
        </div>
        <div class="sq-block">
          <div class="sq-block-head">
            <div>
              <div class="sq-title">Pressão e Deslocamento x Tempo — {{ operationTitle }}</div>
              <div class="sq-sub">Volume acumulado, superfície, hidrostática, fricção, poro e fratura</div>
            </div>
            <div class="head-actions">
              <button class="save-btn" type="button" (click)="openZoom('pressureTime')" title="Ampliar gráfico">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Ampliar
              </button>
              <button class="save-btn" type="button" (click)="saveChart(pressureTime, filePrefix + '-pressao-tempo')">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Salvar
              </button>
            </div>
          </div>
          <div class="sq-chart-box"><canvas #pressureTime></canvas></div>
        </div>
        <div class="sq-block">
          <div class="sq-block-head">
            <div>
              <div class="sq-title">BHP e ECD — {{ operationTitle }}</div>
              <div class="sq-sub">Referência {{ referenceSub }}</div>
            </div>
            <div class="head-actions">
              <button class="save-btn" type="button" (click)="openZoom('bhpEcd')" title="Ampliar gráfico">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Ampliar
              </button>
              <button class="save-btn" type="button" (click)="saveChart(bhpEcd, filePrefix + '-bhp-ecd')">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Salvar
              </button>
            </div>
          </div>
          <div class="sq-chart-box"><canvas #bhpEcd></canvas></div>
        </div>
        <div class="sq-block">
          <div class="sq-block-head">
            <div>
              <div class="sq-title">Free Fall / Tubo em U — {{ operationTitle }}</div>
              <div class="sq-sub">Vazão bombeada, vazão real estimada, pressão motriz e perdas</div>
            </div>
            <div class="head-actions">
              <button class="save-btn" type="button" (click)="openZoom('freeFall')" title="Ampliar gráfico">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Ampliar
              </button>
              <button class="save-btn" type="button" (click)="saveChart(freeFall, filePrefix + '-free-fall')">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Salvar
              </button>
            </div>
          </div>
          <div class="sq-chart-box"><canvas #freeFall></canvas></div>
        </div>
        <div class="sq-block">
          <div class="sq-block-head">
            <div>
              <div class="sq-title">Hidrostática × Fratura — {{ operationTitle }}</div>
              <div class="sq-sub">Hidrostática de fundo e BHP no deslocamento{{ operation === 'squeeze' ? ' e na injeção' : '' }} contra a janela poro × fratura</div>
            </div>
            <div class="head-actions">
              <button class="save-btn" type="button" (click)="openZoom('hydroWindow')" title="Ampliar gráfico">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
                Ampliar
              </button>
              <button class="save-btn" type="button" (click)="saveChart(hydroWindow, filePrefix + '-hidrostatica-fratura')">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                Salvar
              </button>
            </div>
          </div>
          <div class="sq-chart-box"><canvas #hydroWindow></canvas></div>
        </div>
      </div>
      @if (zoom) {
        <app-chart-zoom-modal [title]="zoom.title" [config]="zoom.config" (close)="zoom = null"></app-chart-zoom-modal>
      }
    }
  `,
  styles: [`
    .sq-charts {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
      gap: 16px;
      align-items: stretch;
    }
    .sq-block--wide { grid-column: 1 / -1; }
    @media (max-width: 960px) {
      .sq-charts { grid-template-columns: 1fr; }
    }
    .sq-block { padding: 16px; border: 1px solid var(--color-card-border); border-radius: 8px; background: var(--color-card); }
    .sq-block-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .head-actions { display: flex; gap: 6px; flex-shrink: 0; }
    .sq-title { color: var(--color-text-strong); font-size: .92rem; font-weight: 850; }
    .sq-sub { margin: 3px 0 0; color: var(--color-text-body); font-size: .74rem; }
    .sq-chart-box { position: relative; height: clamp(240px, 38vh, 340px); min-height: 0; overflow: hidden; }
    .sq-chart-box canvas { display: block; width: 100% !important; height: 100% !important; }
    .save-btn { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 5px 10px; border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 6px; background: #f8fafc; color: var(--color-text-body, #64748b); font: inherit; font-size: .72rem; font-weight: 650; cursor: pointer; transition: background .15s, color .15s; }
    .save-btn:hover { background: #eef6ff; color: var(--color-primary, #4291e1); border-color: rgba(66,145,225,.3); }
  `],
})
export class SqueezeOperationChartsComponent implements AfterViewInit, OnChanges {
  @Input() data: SqueezeHydraulicSimulation | null = null;
  /** Ajusta títulos/legendas por operação — a engine de simulação é a mesma. */
  @Input() operation: 'squeeze' | 'tampao' = 'squeeze';

  get operationTitle(): string { return this.operation === 'tampao' ? 'Tampão' : 'Squeeze'; }
  get referenceTitle(): string { return this.operation === 'tampao' ? 'Base do Tampão' : 'Zona de Squeeze'; }
  get referenceSub(): string { return this.operation === 'tampao' ? 'na base do tampão' : 'na profundidade dos canhoneados'; }
  get filePrefix(): string { return this.operation === 'tampao' ? 'tampao' : 'squeeze'; }
  @ViewChild('envelope') envelope!: ElementRef<HTMLCanvasElement>;
  @ViewChild('pressureTime') pressureTime!: ElementRef<HTMLCanvasElement>;
  @ViewChild('bhpEcd') bhpEcd!: ElementRef<HTMLCanvasElement>;
  @ViewChild('freeFall') freeFall!: ElementRef<HTMLCanvasElement>;
  @ViewChild('hydroWindow') hydroWindow!: ElementRef<HTMLCanvasElement>;
  private charts: Chart[] = [];
  private configs: Partial<Record<ChartKey, ChartConfiguration>> = {};

  /** Gráfico aberto no modal de ampliação (null = fechado). */
  zoom: { title: string; config: ChartConfiguration } | null = null;

  ngAfterViewInit(): void { this.build(); }
  ngOnChanges(): void { this.zoom = null; this.destroy(); queueMicrotask(() => this.build()); }

  openZoom(key: ChartKey): void {
    const config = this.configs[key];
    if (!config) return;
    const titles: Record<ChartKey, string> = {
      envelope: `Envelope de Pressão — ${this.referenceTitle}`,
      pressureTime: `Pressão e Deslocamento x Tempo — ${this.operationTitle}`,
      bhpEcd: `BHP e ECD — ${this.operationTitle}`,
      freeFall: `Free Fall / Tubo em U — ${this.operationTitle}`,
      hydroWindow: `Hidrostática × Fratura — ${this.operationTitle}`,
    };
    this.zoom = { title: titles[key], config };
  }

  saveChart(canvas: HTMLCanvasElement, filename: string): void {
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.png`;
    a.click();
  }

  getImagesDataUrl(): { label: string; imagem: string }[] {
    const canvases = [
      { ref: this.envelope,     label: 'Envelope de Pressão' },
      { ref: this.pressureTime, label: 'Pressão × Tempo' },
      { ref: this.bhpEcd,       label: 'BHP e ECD' },
      { ref: this.freeFall,     label: 'Free Fall' },
      { ref: this.hydroWindow,  label: 'Hidrostática × Fratura' },
    ];
    return canvases
      .map(c => ({ label: c.label, imagem: c.ref?.nativeElement?.toDataURL('image/png') ?? '' }))
      .filter(c => !!c.imagem);
  }

  renderForReport(): Promise<{ label: string; imagem: string }[]> {
    return new Promise(resolve => {
      requestAnimationFrame(() => resolve(this.getImagesDataUrl()));
    });
  }

  private build(): void {
    if (!this.data || !this.envelope || !this.pressureTime || !this.bhpEcd || !this.freeFall || !this.hydroWindow) return;
    const pts = this.data.points;
    const labels = pts.map(p => p.timeMin.toFixed(1));
    const bhpLabel = this.operation === 'tampao' ? 'BHP tampão' : 'BHP squeeze';
    // Séries segmentadas por fase: BHP só no deslocamento / só na injeção (null fora)
    const isInj = (phase: string) => /Inje/i.test(phase);
    const isDesloc = (phase: string) => phase === 'Deslocamento';
    const hasInjection = pts.some(p => isInj(p.phase));
    const hydroWindowSeries: Array<[string, Array<number | null>, string, string?]> = [
      ['Fratura (psi)', pts.map(p => p.fracturePsi), '#ef4444'],
      ['Poro (psi)', pts.map(p => p.porePsi), '#10b981'],
      ['Hidrostática de fundo (psi)', pts.map(p => p.hydrostaticPsi), '#8b7857'],
      ['BHP demais fases (psi)', pts.map(p => isDesloc(p.phase) || isInj(p.phase) ? null : p.bhpPsi), '#94a3b8'],
      ['BHP — Deslocamento (psi)', pts.map(p => isDesloc(p.phase) ? p.bhpPsi : null), '#f97316'],
      ...(hasInjection
        ? [['BHP — Injeção/pressurização (psi)', pts.map(p => isInj(p.phase) ? p.bhpPsi : null), '#9333ea'] as [string, Array<number | null>, string]]
        : []),
    ];
    this.configs = {
      envelope: this.lineConfig(labels, [
        ['Poro', pts.map(p => p.porePsi), '#10b981'],
        ['Fratura', pts.map(p => p.fracturePsi), '#ef4444'],
        [bhpLabel, pts.map(p => p.bhpPsi), '#f97316'],
        ['Pressão sup.', pts.map(p => p.surfacePressurePsi), '#577ca1'],
        ['Hidrostática', pts.map(p => p.hydrostaticPsi), '#8b7857'],
        ['Fricção', pts.map(p => p.frictionPsi), '#e0a541'],
      ], 'Pressão (psi)', false, 'Tempo (min)'),
      pressureTime: this.lineConfig(labels, [
        ['Volume no poço (bbl)', pts.map(p => p.pumpedVolumeBbl), '#4291e1', 'y1'],
        ['Injetado na formação (bbl)', pts.map(p => p.injectedVolumeBbl ?? 0), '#9333ea', 'y1'],
        ['Pressão sup. (psi)', pts.map(p => p.surfacePressurePsi), '#577ca1'],
        [`${bhpLabel} (psi)`, pts.map(p => p.bhpPsi), '#f97316'],
        ['Hidrostática (psi)', pts.map(p => p.hydrostaticPsi), '#8b7857'],
        ['Fricção coluna (psi)', pts.map(p => p.frictionPsi), '#e0a541'],
        ['Fricção anular (psi)', pts.map(p => p.annularFrictionPsi ?? 0), '#14b8a6'],
        ['Poro (psi)', pts.map(p => p.porePsi), '#10b981'],
        ['Fratura (psi)', pts.map(p => p.fracturePsi), '#ef4444'],
      ], 'Pressão (psi)', true),
      bhpEcd: this.lineConfig(labels, [
        ['BHP (psi)', pts.map(p => p.bhpPsi), '#f97316'],
        ['ECD (ppg)', pts.map(p => p.ecdPpg ?? 0), '#4291e1', 'y1'],
        ['Grad. poro equiv. (ppg)', pts.map(() => this.data!.summary.porePsi / (0.1706 * this.data!.summary.referenceTVD)), '#10b981', 'y1'],
        ['Grad. fratura equiv. (ppg)', pts.map(() => this.data!.summary.fracturePsi / (0.1706 * this.data!.summary.referenceTVD)), '#ef4444', 'y1'],
      ], 'BHP (psi)', true),
      freeFall: this.lineConfig(labels, [
        ['Vazão bombeada', pts.map(p => p.programmedRateBpm), '#4291e1', 'y1'],
        ['Vazão real estimada', pts.map(p => p.realRateBpm), '#e0a541', 'y1'],
        ['Vazão adicional free fall', pts.map(p => p.freeFallExtraRateBpm), '#ef4444', 'y1'],
        ['Drive hidrostático (psi)', pts.map(p => p.drivePsi), '#577ca1'],
        ['Perda hidráulica (psi)', pts.map(p => p.hydraulicLossPsi), '#8b7857'],
        ['Volume free fall (bbl)', pts.map(p => p.freeFallAccumBbl), '#9333ea', 'y1'],
      ], 'Pressão (psi)', true),
      hydroWindow: this.lineConfig(labels, hydroWindowSeries, 'Pressão (psi)', false, 'Tempo (min)'),
    };
    this.charts.push(
      new Chart(this.envelope.nativeElement.getContext('2d')!, this.configs.envelope!),
      new Chart(this.pressureTime.nativeElement.getContext('2d')!, this.configs.pressureTime!),
      new Chart(this.bhpEcd.nativeElement.getContext('2d')!, this.configs.bhpEcd!),
      new Chart(this.freeFall.nativeElement.getContext('2d')!, this.configs.freeFall!),
      new Chart(this.hydroWindow.nativeElement.getContext('2d')!, this.configs.hydroWindow!),
    );
  }

  private lineConfig(
    labels: string[],
    datasets: Array<[string, Array<number | null>, string, string?]>,
    yTitle: string,
    dualAxis = false,
    xTitle?: string,
  ): ChartConfiguration {
    return {
      type: 'line',
      data: {
        labels,
        datasets: datasets.map(([label, data, color, axis]) => ({
          label,
          data,
          yAxisID: axis || 'y',
          borderColor: color,
          backgroundColor: 'transparent',
          pointRadius: labels.length === 1 ? 4 : 0,
          tension: .2,
          borderWidth: 2,
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { title: { display: true, text: xTitle || (labels.length === 1 ? 'Profundidade de referência' : 'Tempo (min)') } },
          y: { title: { display: true, text: yTitle } },
          ...(dualAxis ? { y1: { position: 'right', grid: { drawOnChartArea: false } } } : {}),
        },
      },
    } as ChartConfiguration;
  }

  private destroy(): void {
    this.charts.forEach(chart => chart.destroy());
    this.charts = [];
    this.configs = {};
  }
}
