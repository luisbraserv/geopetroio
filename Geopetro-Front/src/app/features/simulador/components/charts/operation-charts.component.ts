import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables, type Plugin } from 'chart.js';
import type { OperationCharts, OperationFractureRisk, OperationHydroEcdReference, OperationPressureEnvelopePoint,
  OperationVolumeSeriesKind } from '../../services/operation-charts';
import { BELOW_PORE_FILL, envelopeOutOfWindow, FRACTURE_FILL, FRACTURE_STROKE, operationReference, operationWindowRuns,
  pressureEnvelopeForPhase, synchronizedHydroEcdAxes, WINDOW_FILL, WINDOW_STROKE } from '../../services/operation-charts';
import { ChartZoomModalComponent } from './chart-zoom-modal.component';

Chart.register(...registerables);
type ChartKey = 'hydroEcd' | 'envelope' | 'volumeTime' | 'fractureRisk';

/** Janela operacional do envelope: polígono verde entre poro e fratura, atrás das linhas. */
function envelopeWindowPlugin(runs: OperationPressureEnvelopePoint[][]): Plugin<'line'> {
  return { id: 'operationWindow', beforeDatasetsDraw: chart => {
    const { ctx, chartArea, scales } = chart; const x = scales['x']; const y = scales['y'];
    if (!x || !y) return;
    ctx.save();
    ctx.beginPath(); ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height); ctx.clip();
    ctx.fillStyle = WINDOW_FILL; ctx.strokeStyle = WINDOW_STROKE; ctx.lineWidth = 1;
    for (const run of runs) {
      const ys = run.map(p => y.getPixelForValue(p.tvd));
      ctx.beginPath();
      // Trecho curto (canhoneados): altura mínima, senão some.
      if (Math.max(...ys) - Math.min(...ys) < 8) {
        const cy = (Math.max(...ys) + Math.min(...ys)) / 2;
        const x1 = x.getPixelForValue(Math.min(...run.map(p => p.porePpg!)));
        const x2 = x.getPixelForValue(Math.max(...run.map(p => p.fracturePpg!)));
        ctx.rect(x1, cy - 5, x2 - x1, 10);
      } else {
        run.forEach((p, i) => { const px = x.getPixelForValue(p.porePpg!); if (i) ctx.lineTo(px, ys[i]); else ctx.moveTo(px, ys[i]); });
        [...run].reverse().forEach(p => ctx.lineTo(x.getPixelForValue(p.fracturePpg!), y.getPixelForValue(p.tvd)));
        ctx.closePath();
      }
      ctx.fill(); ctx.stroke();
    }
    ctx.restore();
  } };
}

/** Risco de fratura: vermelho acima da fratura, verde na janela, azul abaixo dos poros, e a compressão. */
function fractureZonesPlugin(risk: OperationFractureRisk): Plugin<'line'> {
  return { id: 'fractureZones', beforeDatasetsDraw: chart => {
    const { ctx, chartArea, scales } = chart; const x = scales['x']; const y = scales['y'];
    const pts = risk.points;
    if (!x || !y || pts.length < 2) return;
    // De borda a borda da área do gráfico, com o primeiro e o último valor.
    const line = (read: (p: typeof pts[number]) => number) => [
      [chartArea.left, y.getPixelForValue(read(pts[0]))] as const,
      ...pts.map(p => [x.getPixelForValue(p.timeMin), y.getPixelForValue(read(p))] as const),
      [chartArea.right, y.getPixelForValue(read(pts.at(-1)!))] as const];
    const fracture = line(p => p.fracturePsi); const pore = line(p => p.porePsi);
    const x0 = chartArea.left; const x1 = chartArea.right;
    const polygon = (points: (readonly [number, number])[], color: string) => {
      ctx.beginPath(); points.forEach(([px, py], i) => i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
    };
    ctx.save();
    ctx.beginPath(); ctx.rect(chartArea.left, chartArea.top, chartArea.width, chartArea.height); ctx.clip();
    polygon([...fracture, [x1, chartArea.top], [x0, chartArea.top]], FRACTURE_FILL);
    polygon([...pore, ...[...fracture].reverse()], WINDOW_FILL);
    polygon([...pore, [x1, chartArea.bottom], [x0, chartArea.bottom]], BELOW_PORE_FILL);
    if (risk.compression) {
      ctx.strokeStyle = '#7f1d1d'; ctx.setLineDash([5, 4]); ctx.lineWidth = 1.2;
      for (const t of [risk.compression.from, risk.compression.to]) {
        const px = x.getPixelForValue(t);
        ctx.beginPath(); ctx.moveTo(px, chartArea.top); ctx.lineTo(px, chartArea.bottom); ctx.stroke();
      }
      ctx.setLineDash([]); ctx.fillStyle = '#7f1d1d'; ctx.font = '11px Arial';
      ctx.fillText('Compressao', x.getPixelForValue(risk.compression.from) + 4, chartArea.top + 13);
    }
    ctx.restore();
  } };
}
const VOLUME_STROKE: Record<OperationVolumeSeriesKind, { width: number; dash?: number[] }> = {
  total: { width: 3 }, fluid: { width: 2, dash: [7, 3] }, extra: { width: 2.5, dash: [2, 3] },
};

/** Os três gráficos de operação da primária, do tampão e do squeeze. */
@Component({
  selector: 'app-operation-charts',
  standalone: true,
  imports: [CommonModule, ChartZoomModalComponent],
  template: `
    @if (data) {
      <div class="pc-grid">
        @if (reference; as ref) {
          <section class="pc-card pc-card--wide" data-chart="hydro-ecd">
            <header><div><h3>{{ ref.title }}</h3><p>{{ ref.description }}</p></div><div class="actions">@if (data.references.length > 1) { <label>Refer&ecirc;ncia<select data-reference-select [value]="ref.id" (change)="selectReference($any($event.target).value)">@for (entry of data.references; track entry.id) { <option [value]="entry.id">{{ entry.label }}</option> }</select></label> }<button type="button" (click)="openZoom('hydroEcd')">Ampliar</button><button type="button" (click)="save(hydroEcd, 'hidrostatica-ecd')">Salvar</button></div></header>
            <div class="pc-metrics">
              <span><small>Hidrost&aacute;tica m&aacute;x.</small><strong>{{ number(ref.summary.maxHydrostaticPsi, 1) }} psi</strong></span>
              <span><small>ECD m&aacute;x. em circula&ccedil;&atilde;o</small><strong>{{ number(ref.summary.maxEcdPpg, 4) }} ppg</strong></span>
              <span><small>&Delta;ECD m&aacute;x. (atrito)</small><strong>{{ number(ref.summary.maxDeltaEcdPpg, 4) }} ppg</strong></span>
              <span><small>&Delta;P de atrito m&aacute;x.</small><strong>{{ number(ref.summary.maxDynamicPressurePsi, 2) }} psi</strong></span>
              @if (ref.summary.maxAppliedPressurePsi > 0) {
                <span><small>Press&atilde;o aplicada m&aacute;x.</small><strong>{{ number(ref.summary.maxAppliedPressurePsi, 0) }} psi</strong></span>
              }
              @if (ref.marker; as marker) {
                <span><small>{{ marker.label }}</small><strong>{{ number(marker.ecdPpg, 4) }} ppg</strong></span>
              }
            </div>
            @if (ref.summary.unavailableSamples > 0) {
              <p class="pc-alert pc-alert--warning">
                ECD indispon&iacute;vel em {{ ref.summary.unavailableSamples }} de {{ ref.summary.circulatingSamples }} amostras de circula&ccedil;&atilde;o. Os pontos foram marcados em laranja.
                @if (ref.summary.freeFallUnavailable) {
                  <span> O motor n&atilde;o resolveu a vaz&atilde;o de queda livre nesse trecho.</span>
                }
              </p>
            }
            @if (ref.summary.maxDeltaEcdPpg !== null && ref.summary.maxDeltaEcdPpg < 0.01) {
              <p class="pc-alert">Curvas quase sobrepostas: a diferen&ccedil;a calculada &eacute; {{ number(ref.summary.maxDeltaEcdPpg, 4) }} ppg ({{ number(ref.summary.maxDynamicPressurePsi, 2) }} psi), menor que a espessura do tra&ccedil;o.</p>
            }
            @if (data.rheologyWarning) {
              <p class="pc-alert pc-alert--warning">{{ data.rheologyWarning }}</p>
            }
            <div class="pc-canvas"><canvas #hydroEcd></canvas></div>
          </section>
        }

        <section class="pc-card pc-card--wide" data-chart="envelope">
          <header><div><h3>Perfil de press&atilde;o &mdash; envelope</h3><p>Poro e fratura pontilhados, s&oacute; onde h&aacute; forma&ccedil;&atilde;o exposta. Hidrost&aacute;tica m&iacute;nima em cada profundidade (cont&iacute;nua) e a m&iacute;nima do po&ccedil;o (tracejada); ECD m&aacute;ximo do bombeio. No squeeze, a ECD da compress&atilde;o aparece &agrave; parte, nos canhoneados.</p></div><div class="actions"><label>Fase<select [value]="phaseId" (change)="selectPhase($any($event.target).value)"><option value="all">Todas as fases</option>@for (phase of data.phases; track phase.id) { <option [value]="phase.id">{{ phase.name }}</option> }</select></label><button type="button" (click)="openZoom('envelope')">Ampliar</button><button type="button" (click)="save(envelope, 'envelope-pressao')">Salvar</button></div></header>
          <div class="pc-canvas pc-canvas--depth"><canvas #envelope></canvas></div>
        </section>

        @if (data.fractureRisk; as risk) {
          <section class="pc-card pc-card--wide" data-chart="fracture-risk">
            <header><div><h3>Risco de fratura nos canhoneados</h3><p>Press&atilde;o no po&ccedil;o na refer&ecirc;ncia dos canhoneados, do posicionamento ao fim da compress&atilde;o. Na faixa verde, entre poros e fratura, est&aacute; na janela; acima da linha de fratura (faixa vermelha), algum ponto do intervalo fratura. A linha de fratura &eacute; a do ponto mais cr&iacute;tico do canhoneado, a mesma regra do aviso de squeeze de alta press&atilde;o.</p></div><div class="actions"><button type="button" (click)="openZoom('fractureRisk')">Ampliar</button><button type="button" (click)="save(fractureRisk, 'risco-fratura')">Salvar</button></div></header>
            <div class="pc-metrics">
              @if (risk.surfaceLimitPsi !== null) {
                <span><small>Maior press&atilde;o de superf&iacute;cie sem fraturar</small><strong>{{ number(risk.surfaceLimitPsi, 0) }} psi</strong></span>
              }
              <span><small>Press&atilde;o aplicada m&aacute;x.</small><strong>{{ number(risk.maxSurfacePressurePsi, 0) }} psi</strong></span>
              <span><small>Situa&ccedil;&atilde;o</small><strong [class.pc-danger]="risk.fractureStart">{{ risk.fractureStart ? 'Fratura' : risk.belowPore ? 'Abaixo da fratura' : 'Na janela' }}</strong></span>
              @if (risk.fractureStart; as start) {
                <span><small>In&iacute;cio da fratura</small><strong class="pc-danger">{{ number(start.timeMin, 1) }} min &middot; {{ number(start.surfacePressurePsi, 0) }} psi na sup.</strong></span>
              }
            </div>
            @if (risk.fractureStart) {
              <p class="pc-alert pc-alert--danger">A press&atilde;o nos canhoneados passa da fratura na compress&atilde;o: squeeze de alta press&atilde;o, a forma&ccedil;&atilde;o pode fraturar e aceitar a pasta inteira. Para ficar na janela, a press&atilde;o de superf&iacute;cie precisa ficar abaixo de {{ number(risk.surfaceLimitPsi, 0) }} psi.</p>
            }
            @if (risk.belowPore) {
              <p class="pc-alert pc-alert--warning">Em algum instante a press&atilde;o nos canhoneados fica abaixo da press&atilde;o de poros (faixa azul): risco de influxo.</p>
            }
            <div class="pc-canvas"><canvas #fractureRisk></canvas></div>
          </section>
        }

        <section class="pc-card pc-card--wide" data-chart="volume-time">
          <header><div><h3>Volume injetado x tempo</h3><p>Acumulado total e acumulado de cada fluido da sequ&ecirc;ncia operacional.</p></div><div class="actions"><button type="button" (click)="openZoom('volumeTime')">Ampliar</button><button type="button" (click)="save(volumeTime, 'volume-tempo')">Salvar</button></div></header>
          <div class="pc-canvas"><canvas #volumeTime></canvas></div>
        </section>
      </div>
      @if (zoom) { <app-chart-zoom-modal [title]="zoom.title" [config]="zoom.config" (close)="zoom = null"></app-chart-zoom-modal> }
    }
  `,
  styles: [`
    .pc-grid { display: grid; grid-template-columns: 1fr; gap: 16px; }
    .pc-card { padding: 16px; border: 1px solid var(--color-card-border, #d6deeb); border-radius: 9px; background: var(--color-card, #fff); min-width: 0; }
    header { display: flex; align-items: flex-start; justify-content: space-between; gap: 14px; margin-bottom: 10px; }
    h3 { margin: 0; color: var(--color-text-strong, #051833); font-size: .94rem; }
    p { margin: 4px 0 0; color: var(--color-text-body, #64748b); font-size: .73rem; }
    .actions { display: flex; align-items: end; justify-content: flex-end; flex-wrap: wrap; gap: 7px; }
    .actions label { display: grid; gap: 3px; color: var(--color-text-body, #475569); font-size: .7rem; font-weight: 700; }
    .actions select, .actions button { min-height: 31px; border: 1px solid var(--color-card-border, #d6deeb); border-radius: 6px; background: #f8fafc; color: #334155; font: inherit; font-size: .73rem; padding: 5px 9px; }
    .actions button { cursor: pointer; font-weight: 700; }
    .actions button:hover { border-color: #93c5fd; background: #eff6ff; color: #1d4ed8; }
    .pc-metrics { display: grid; grid-template-columns: repeat(4, minmax(130px, 1fr)); gap: 8px; margin: 0 0 9px; }
    .pc-metrics span { display: grid; gap: 2px; padding: 8px 10px; border: 1px solid #dbe5f1; border-radius: 7px; background: #f8fafc; }
    .pc-metrics small { color: #64748b; font-size: .66rem; }
    .pc-metrics strong { color: #0f172a; font-size: .82rem; }
    .pc-alert { margin: 6px 0 9px; padding: 7px 9px; border-left: 3px solid #64748b; border-radius: 4px; background: #f8fafc; color: #475569; font-size: .72rem; }
    .pc-alert--warning { border-left-color: #d97706; background: #fffbeb; color: #92400e; }
    .pc-alert--danger { border-left-color: #b91c1c; background: #fef2f2; color: #991b1b; }
    .pc-danger { color: #b91c1c !important; }
    .pc-canvas { position: relative; width: 100%; height: clamp(300px, 43vh, 410px); }
    .pc-canvas--depth { height: clamp(360px, 54vh, 520px); }
    canvas { width: 100% !important; height: 100% !important; display: block; }
    @media (max-width: 760px) { header { flex-direction: column; } .actions { justify-content: flex-start; } .pc-metrics { grid-template-columns: repeat(2, 1fr); } }
  `],
})
export class OperationChartsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() data: OperationCharts | null = null;
  @Input() selectedPhaseId: string | null = null;
  @ViewChild('hydroEcd') hydroEcd?: ElementRef<HTMLCanvasElement>;
  @ViewChild('envelope') envelope!: ElementRef<HTMLCanvasElement>;
  @ViewChild('volumeTime') volumeTime!: ElementRef<HTMLCanvasElement>;
  @ViewChild('fractureRisk') fractureRisk?: ElementRef<HTMLCanvasElement>;

  phaseId = 'all';
  referenceId: string | null = null;
  zoom: { title: string; config: ChartConfiguration } | null = null;
  private charts: Chart[] = [];
  private configs: Partial<Record<ChartKey, ChartConfiguration>> = {};
  private phaseInitialized = false;

  get reference(): OperationHydroEcdReference | null {
    return this.data ? operationReference(this.data, this.referenceId) : null;
  }

  ngAfterViewInit(): void { this.applyDefaultPhase(); this.build(); }
  ngOnChanges(): void { this.applyDefaultPhase(); this.zoom = null; this.rebuild(); }
  ngOnDestroy(): void { this.destroy(); }

  number(value: number | null, digits: number): string {
    return value === null || !Number.isFinite(value) ? 'indisponivel'
      : value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }

  selectPhase(id: string): void { this.phaseId = id; this.phaseInitialized = true;
    this.zoom = null; this.rebuild(); }
  /** Troca só o desenho: as referências já vêm calculadas. */
  selectReference(id: string): void { this.referenceId = id; this.zoom = null; this.rebuild(); }
  openZoom(key: ChartKey): void {
    const config = this.configs[key]; if (!config) return;
    const title: Record<ChartKey, string> = { hydroEcd: 'Pressao hidrostatica (ESD) e ECD',
      envelope: 'Perfil de pressao - envelope', volumeTime: 'Volume injetado x tempo',
      fractureRisk: 'Risco de fratura nos canhoneados' };
    this.zoom = { title: title[key], config };
  }
  save(ref: HTMLCanvasElement | ElementRef<HTMLCanvasElement> | undefined, name: string): void {
    if (!ref) return;
    const canvas = 'nativeElement' in ref ? ref.nativeElement : ref;
    const link = document.createElement('a'); link.href = canvas.toDataURL('image/png', 1);
    link.download = `${this.data?.operation ?? 'operacao'}-${name}.png`; link.click();
  }

  private applyDefaultPhase(): void {
    if (this.phaseInitialized && (this.phaseId === 'all'
      || this.data?.phases.some(phase => phase.id === this.phaseId))) return;
    this.phaseId = this.selectedPhaseId && this.data?.phases.some(phase => phase.id === this.selectedPhaseId)
      ? this.selectedPhaseId : 'all';
    this.phaseInitialized = true;
  }
  private rebuild(): void { this.destroy(); queueMicrotask(() => this.build()); }
  private destroy(): void { this.charts.forEach(chart => chart.destroy()); this.charts = []; }
  private render(ref: ElementRef<HTMLCanvasElement> | undefined, config: ChartConfiguration): void {
    const context = ref?.nativeElement?.getContext('2d'); if (context) this.charts.push(new Chart(context, config));
  }
  private build(): void {
    if (!this.data || !this.envelope || !this.volumeTime) return;
    const configs: Partial<Record<ChartKey, ChartConfiguration>> = {
      envelope: this.envelopeConfig(), volumeTime: this.volumeTimeConfig() };
    const reference = this.reference;
    if (reference) configs.hydroEcd = this.hydroEcdConfig(reference);
    if (this.data.fractureRisk?.points.length) configs.fractureRisk = this.fractureRiskConfig(this.data.fractureRisk);
    this.configs = configs;
    if (configs.hydroEcd) this.render(this.hydroEcd, configs.hydroEcd);
    this.render(this.envelope, configs.envelope!);
    if (configs.fractureRisk) this.render(this.fractureRisk, configs.fractureRisk);
    this.render(this.volumeTime, configs.volumeTime!);
  }

  private commonOptions(): ChartConfiguration['options'] {
    return { responsive: true, maintainAspectRatio: false, animation: false,
      layout: { padding: { top: 8, right: 10, bottom: 8, left: 10 } },
      interaction: { mode: 'nearest', intersect: false }, plugins: { legend: { position: 'top' } } };
  }
  private hydroEcdConfig(reference: OperationHydroEcdReference): ChartConfiguration {
    const rows = reference.points;
    const axes = synchronizedHydroEcdAxes(reference);
    // Squeeze pelo tempo, para a compressão aparecer com a duração real; os demais pelo volume.
    const byTime = reference.axis === 'time';
    const xOf = (row: { volumeBbl: number; timeMin: number }) => byTime ? row.timeMin : row.volumeBbl;
    const marker = reference.marker;
    const maxX = Math.max(0, ...rows.map(xOf), ...(marker ? [xOf(marker)] : []));
    const bands = (reference.bands ?? []).flatMap(band => [
      { label: band.label, data: [{ x: band.from, y: axes.pressureMin }, { x: band.from, y: axes.pressureMax }, { x: band.from, y: null },
        { x: band.to, y: axes.pressureMax }, { x: band.to, y: axes.pressureMin }], yAxisID: 'pressure', borderColor: '#b91c1c',
        backgroundColor: '#b91c1c', borderWidth: 1.5, borderDash: [6, 4], pointRadius: 0, spanGaps: false }]);
    return { type: 'line', data: { datasets: [
      { label: 'Pressao hidrostatica (psi)', data: rows.map(row => ({ x: xOf(row), y: row.hydrostaticPsi })), yAxisID: 'pressure', borderColor: '#16a34a', backgroundColor: '#16a34a', borderWidth: 2.5, pointRadius: 0, spanGaps: false },
      { label: 'ECD (ppg)', data: rows.map(row => ({ x: xOf(row), y: row.ecdPpg })), yAxisID: 'gradient', borderColor: '#dc2626', backgroundColor: '#dc2626', borderWidth: 2.5, pointRadius: 0, pointHoverRadius: 5, spanGaps: false },
      { label: 'ECD indisponivel', data: rows.map(row => ({ x: xOf(row),
        y: row.unavailable ? row.hydrostaticPpg : null })), yAxisID: 'gradient', showLine: false,
        borderColor: '#d97706', backgroundColor: '#d97706', pointStyle: 'crossRot', pointRadius: 6,
        pointHoverRadius: 8, spanGaps: false },
      ...(marker ? [{ label: `${marker.label} (ppg)`, data: [{ x: xOf(marker), y: marker.ecdPpg }], yAxisID: 'gradient',
        showLine: false, borderColor: '#1e293b', backgroundColor: '#1e293b', pointStyle: 'rectRot', pointRadius: 7,
        pointHoverRadius: 9 }] : []),
      ...bands,
    ] }, options: { ...this.commonOptions(), parsing: false, scales: {
      // Volume a partir de zero, como o eixo "Volume In" do iCem; no squeeze, o tempo.
      x: { type: 'linear', min: 0, suggestedMax: maxX,
        title: { display: true, text: byTime ? 'Tempo (min)' : 'Volume injetado (bbl)' } },
      pressure: { type: 'linear', position: 'left', min: axes.pressureMin, max: axes.pressureMax,
        title: { display: true, text: 'Pressao hidrostatica (psi)' } },
      gradient: { type: 'linear', position: 'right', min: axes.ecdMin, max: axes.ecdMax,
        grid: { drawOnChartArea: false }, title: { display: true, text: 'ECD (ppg)' } },
    }, plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
      afterBody: items => {
        if ((items[0]?.datasetIndex ?? 0) > 2) return [];
        const row = rows[items[0]?.dataIndex ?? -1];
        if (!row) return [];
        return [
          `Pressao hidrostatica: ${this.number(row.hydrostaticPsi, 2)} psi`,
          `ESD: ${this.number(row.hydrostaticPpg, 4)} ppg`,
          `ECD: ${this.number(row.ecdPpg, 4)} ppg`,
          `Delta ECD (atrito): ${this.number(row.deltaEcdPpg, 4)} ppg`,
          `Delta P de atrito: ${this.number(row.dynamicPressurePsi, 2)} psi`,
          ...(row.appliedPressurePsi > 0 ? [`Pressao aplicada: ${this.number(row.appliedPressurePsi, 0)} psi`] : []),
          `Tempo: ${this.number(row.timeMin, 1)} min · volume: ${this.number(row.volumeBbl, 2)} bbl`,
          `Vazao: ${this.number(row.pumpRateBpm, 2)} bpm`,
        ];
      },
    } } } } } as ChartConfiguration;
  }
  private envelopeConfig(): ChartConfiguration {
    const rows = this.data ? pressureEnvelopeForPhase(this.data, this.phaseId) : [];
    const tvds = rows.map(row => row.tvd);
    const depthSpan = tvds.length ? Math.max(...tvds) - Math.min(...tvds) : 0;
    // Série que só existe num trecho curto (poro, fratura e compressão nos canhoneados): a
    // linha some no desenho, então os pontos aparecem.
    const shortSpan = (read: (row: typeof rows[number]) => number | null) => {
      const defined = rows.filter(row => { const v = read(row); return v != null && Number.isFinite(v); }).map(row => row.tvd);
      return defined.length > 0 && Math.max(...defined) - Math.min(...defined) <= .04 * depthSpan;
    };
    const dataset = (label: string, read: (row: typeof rows[number]) => number | null,
      color: string, dashed = false) => ({ label, data: rows.map(row => ({ x: read(row), y: row.tvd })),
      borderColor: color, backgroundColor: color, borderWidth: dashed ? 2 : 2.5,
      borderDash: dashed ? [3, 4] : undefined, pointRadius: shortSpan(read) ? 4 : 0, pointHoverRadius: 6, spanGaps: false });
    const datasets = [
      dataset('ECD maximo', row => row.maxEcdPpg, '#dc2626'),
      dataset('Hidrostatica minima (perfil)', row => row.minHydrostaticPpg, '#16a34a'),
      { ...dataset('Hidrostatica minima do poco', row => row.minHydrostaticWellPpg, '#15803d'), borderDash: [8, 4], borderWidth: 1.8 },
      dataset('Gradiente de poro', row => row.porePpg, '#0369a1', true),
      dataset('Gradiente de fratura', row => row.fracturePpg, '#f97316', true),
      ...(rows.some(row => row.compressionEcdPpg != null)
        ? [{ ...dataset('ECD na compressao', row => row.compressionEcdPpg ?? null, '#7c3aed'), borderWidth: 3.5 }] : []),
    ];
    // Fora da janela: acima da fratura (ECD do bombeio ou da compressão) e abaixo do poro.
    const outside = envelopeOutOfWindow(rows);
    const cross = (label: string, points: { tvd: number; ppg: number }[], color: string) => ({ label,
      data: points.map(p => ({ x: p.ppg, y: p.tvd })), showLine: false, borderColor: color, backgroundColor: color,
      borderWidth: 2, pointStyle: 'crossRot' as const, pointRadius: 6, pointHoverRadius: 8, spanGaps: false });
    const runs = operationWindowRuns(rows);
    datasets.unshift(...(runs.length ? [{ label: 'Janela operacional (poro-fratura)', data: [], borderColor: WINDOW_STROKE,
      backgroundColor: WINDOW_FILL, borderWidth: 1, pointRadius: 0, pointHoverRadius: 0, spanGaps: false }] : []) as unknown as typeof datasets);
    if (outside.aboveFracture.length) datasets.push(cross('Acima da fratura', outside.aboveFracture, '#b91c1c') as unknown as typeof datasets[number]);
    if (outside.belowPore.length) datasets.push(cross('Abaixo do poro', outside.belowPore, '#0369a1') as unknown as typeof datasets[number]);
    const marker = this.data?.envelopeMarker;
    const markerRow = marker ? rows.find(row => Math.abs(row.md - marker.md) < 1e-6) : undefined;
    const xValues = rows.flatMap(row => [row.porePpg, row.minHydrostaticPpg, row.minHydrostaticWellPpg,
      row.maxEcdPpg, row.fracturePpg, row.compressionEcdPpg ?? null])
      .filter((value): value is number => value !== null && Number.isFinite(value));
    if (marker && markerRow && xValues.length)
      datasets.push({ label: marker.label, data: [
        { x: Math.min(...xValues), y: markerRow.tvd }, { x: Math.max(...xValues), y: markerRow.tvd },
      ], borderColor: '#64748b', backgroundColor: '#64748b', borderWidth: 1.5,
      borderDash: [6, 5], pointRadius: 0, pointHoverRadius: 0, spanGaps: false });
    return { type: 'line', data: { datasets }, plugins: [envelopeWindowPlugin(runs)],
      options: { ...this.commonOptions(), parsing: false, scales: {
      x: { type: 'linear', position: 'top', grace: '5%',
        title: { display: true, text: 'ECD (ppg)' } },
      // Da superfície para baixo, como o perfil do iCem.
      y: { type: 'linear', reverse: true, min: 0, grace: '4%',
        title: { display: true, text: 'TVD (m)' } },
    } } } as ChartConfiguration;
  }
  private fractureRiskConfig(risk: OperationFractureRisk): ChartConfiguration {
    const rows = risk.points;
    const series = (label: string, read: (row: typeof rows[number]) => number, color: string, dash?: number[], width = 2) => ({
      label, data: rows.map(row => ({ x: row.timeMin, y: read(row) })), borderColor: color, backgroundColor: color,
      borderWidth: width, borderDash: dash, pointRadius: 0, pointHoverRadius: 5, spanGaps: false });
    const area = (label: string, fill: string, stroke: string) => ({ label, data: [], borderColor: stroke, backgroundColor: fill,
      borderWidth: 1, pointRadius: 0, pointHoverRadius: 0, spanGaps: false });
    const start = risk.fractureStart;
    return { type: 'line', data: { datasets: [
      series('Pressao nos canhoneados (psi)', row => row.pressurePsi, '#7f1d1d', undefined, 2.5),
      series('Fratura - ponto mais critico (psi)', row => row.fracturePsi, '#ea580c', [6, 3]),
      series('Poros (psi)', row => row.porePsi, '#0369a1', [3, 4]),
      ...(start ? [{ label: 'Inicio da fratura', data: [{ x: start.timeMin, y: start.pressurePsi }], showLine: false,
        borderColor: '#b91c1c', backgroundColor: '#b91c1c', pointRadius: 7, pointHoverRadius: 9, spanGaps: false }] : []),
      area('Janela operacional', WINDOW_FILL, WINDOW_STROKE),
      area('Zona de fratura', FRACTURE_FILL, FRACTURE_STROKE),
    ] }, plugins: [fractureZonesPlugin(risk)],
    options: { ...this.commonOptions(), parsing: false, scales: {
      x: { type: 'linear', min: 0, title: { display: true, text: 'Tempo (min)' } },
      y: { type: 'linear', grace: '6%', title: { display: true, text: 'Pressao nos canhoneados (psi)' } },
    }, plugins: { legend: { position: 'top' }, tooltip: { callbacks: {
      afterBody: items => {
        if ((items[0]?.datasetIndex ?? 9) > 2) return [];
        const row = rows[items[0]?.dataIndex ?? -1];
        if (!row) return [];
        return [
          `Margem ate a fratura: ${this.number(row.fracturePsi - row.pressurePsi, 0)} psi`,
          `Margem sobre os poros: ${this.number(row.pressurePsi - row.porePsi, 0)} psi`,
          ...(row.maxSurfacePressurePsi !== null ? [`Pressao de superficie: ${this.number(row.surfacePressurePsi, 0)} psi `
            + `(maxima sem fraturar ${this.number(row.maxSurfacePressurePsi, 0)} psi)`] : []),
          `Tempo: ${this.number(row.timeMin, 1)} min`,
        ];
      },
    } } } } } as ChartConfiguration;
  }
  private volumeTimeConfig(): ChartConfiguration {
    const series = this.data?.volumes ?? [];
    return { type: 'line', data: { datasets: series.map(entry => ({ label: `${entry.label} (bbl)`,
      data: entry.points.map(point => ({ x: point.timeMin, y: point.volumeBbl })),
      borderColor: entry.color, backgroundColor: entry.color, borderWidth: VOLUME_STROKE[entry.kind].width,
      borderDash: VOLUME_STROKE[entry.kind].dash, pointRadius: 0, stepped: false })) },
      options: { ...this.commonOptions(), parsing: false, scales: {
        x: { type: 'linear', offset: true, grace: '4%', title: { display: true, text: 'Tempo (min)' } },
        y: { type: 'linear', offset: true, beginAtZero: true, grace: '4%',
          title: { display: true, text: 'Volume injetado (bbl)' } },
      } } } as ChartConfiguration;
  }
}
