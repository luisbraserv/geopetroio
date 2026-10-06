import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, Input, OnChanges, OnDestroy, ViewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import type { DepthUnit } from '../../models/depth-unit';
import type { AnnexProfileSeries, AnnexReferenceLine, AnnexSeries } from '../../services/primary-annex-charts';
import { buildPressureDepthConfig, type DepthPressureSeries } from './pressure-depth-config';

Chart.register(...registerables);

const COLORS = ['#4291e1', '#0f766e', '#f97316', '#9333ea', '#e0a541', '#14b8a6', '#577ca1', '#ef4444'];

/**
 * G1–G5 do documento complementar. O componente só desenha: as séries chegam
 * prontas do motor. `null` vira quebra na curva, nunca zero, e série medida usa
 * traço próprio para não se confundir com a calculada.
 */
@Component({
  selector: 'app-primary-annex-charts',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="ax-grid">
      @for (block of blocks; track block.key) {
        <div class="ax-block">
          <div class="ax-head">
            <div>
              <div class="ax-title">{{ block.title }}</div>
              <div class="ax-sub">{{ block.subtitle }}</div>
            </div>
            <button class="ax-save" type="button" (click)="save(block.key)">Salvar</button>
          </div>
          <div class="ax-box">
            <canvas [attr.data-chart]="block.key" #canvasRef></canvas>
          </div>
          @if (block.key === 'g3' && limits.length) {
            <p class="ax-note">
              @for (limit of limits; track limit.label) {
                <span>{{ limit.label }} — limite da correlação {{ limit.correlationId }}, não universal. </span>
              }
            </p>
          }
        </div>
      }
    </div>
  `,
  styles: [`
    .ax-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(340px, 1fr)); gap: 14px; }
    .ax-block { border: 1px solid var(--color-card-border, #d6deeb); border-radius: 8px; padding: 14px;
      background: var(--color-card, #fff); }
    .ax-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 10px; margin-bottom: 8px; }
    .ax-title { font-size: .9rem; font-weight: 800; color: var(--color-text-strong, #051833); }
    .ax-sub { margin-top: 3px; font-size: .72rem; color: var(--color-text-body, #64748b); }
    .ax-box { position: relative; height: clamp(230px, 34vh, 330px); }
    .ax-box canvas { display: block; width: 100% !important; height: 100% !important; }
    .ax-save { padding: 5px 10px; border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 6px;
      background: #f8fafc; font: inherit; font-size: .72rem; font-weight: 650; cursor: pointer; }
    .ax-note { margin: 8px 0 0; font-size: .7rem; color: var(--color-text-body, #64748b); }
  `],
})
export class PrimaryAnnexChartsComponent implements AfterViewInit, OnChanges, OnDestroy {
  @Input() g1: AnnexSeries[] = [];
  @Input() g2: AnnexSeries[] = [];
  @Input() g3: AnnexProfileSeries | null = null;
  @Input() g4: AnnexSeries[] = [];
  @Input() g5: AnnexProfileSeries[] = [];
  @Input() limits: AnnexReferenceLine[] = [];
  @Input() volumeAxisLabel = 'Volume total bombeado (bbl)';
  @Input() depthUnit: DepthUnit = 'm';
  @Input() instantLabel = '';

  @ViewChild('canvasRef') firstCanvas?: ElementRef<HTMLCanvasElement>;

  readonly blocks = [
    { key: 'g1', title: 'G1 — retorno, volume e pressão no tempo',
      subtitle: 'Retorno calculado, acumulado do modo selecionado e pressão de bombeio' },
    { key: 'g2', title: 'G2 — ECD por volume nas referências',
      subtitle: 'Mesma escala em ppg; volume no eixo horizontal' },
    { key: 'g3', title: 'G3 — Reynolds nominal por profundidade',
      subtitle: 'Perfil do instante selecionado, com os limites da correlação' },
    { key: 'g4', title: 'G4 — pressão, densidade e vazões no tempo',
      subtitle: 'Densidade do fluido que entra, não apenas da pasta' },
    { key: 'g5', title: 'G5 — densidade, ECD e janela por profundidade',
      subtitle: 'Densidade local distinta da densidade equivalente do ECD' },
  ] as const;

  private charts = new Map<string, Chart>();

  ngAfterViewInit(): void { queueMicrotask(() => this.build()); }
  ngOnChanges(): void { queueMicrotask(() => this.build()); }
  ngOnDestroy(): void { this.destroy(); }

  save(key: string): void {
    const canvas = this.canvas(key);
    if (!canvas) return;
    const link = document.createElement('a');
    link.href = canvas.toDataURL('image/png');
    link.download = `primaria-${key}.png`;
    link.click();
  }

  private canvas(key: string): HTMLCanvasElement | null {
    return document.querySelector<HTMLCanvasElement>(`canvas[data-chart="${key}"]`);
  }

  private destroy(): void {
    for (const chart of this.charts.values()) chart.destroy();
    this.charts.clear();
  }

  private build(): void {
    this.destroy();
    this.render('g1', this.timeConfig(this.g1));
    this.render('g2', this.volumeConfig(this.g2));
    this.render('g3', this.depthConfig(this.g3 ? [this.g3] : [], 'Reynolds nominal', this.limits));
    this.render('g4', this.timeConfig(this.g4));
    this.render('g5', this.depthConfig(this.g5, 'ppg', []));
  }

  private render(key: string, config: ChartConfiguration): void {
    const canvas = this.canvas(key);
    const context = canvas?.getContext('2d');
    if (!context) return;
    this.charts.set(key, new Chart(context, config));
  }

  /** Uma escala por família física: vazões juntas, pressão e densidade separadas. */
  private axisFor(unit: string): string {
    return unit === 'psi' ? 'y' : unit === 'bpm' ? 'y1' : unit === 'ppg' ? 'y2' : 'y3';
  }

  private timeConfig(series: AnnexSeries[]): ChartConfiguration {
    return this.xyConfig(series, 'Tempo (min)');
  }
  private volumeConfig(series: AnnexSeries[]): ChartConfiguration {
    return this.xyConfig(series, this.volumeAxisLabel);
  }

  private xyConfig(series: AnnexSeries[], xTitle: string): ChartConfiguration {
    const used = new Set(series.map(entry => this.axisFor(entry.unit)));
    const titles: Record<string, string> = { y: 'Pressão (psi)', y1: 'Vazão (bpm)',
      y2: 'Densidade equivalente (ppg)', y3: 'Volume (bbl)' };
    return {
      type: 'line',
      data: {
        datasets: series.map((entry, index) => ({
          label: `${entry.label} [${entry.unit}]`,
          // Ponto com y null quebra a linha: lacuna é lacuna.
          data: entry.points.map(point => ({ x: point.x, y: point.y })),
          yAxisID: this.axisFor(entry.unit),
          borderColor: COLORS[index % COLORS.length],
          backgroundColor: 'transparent',
          borderDash: entry.origin === 'measured' ? [6, 3] : undefined,
          pointStyle: entry.origin === 'measured' ? 'triangle' : 'circle',
          pointRadius: entry.origin === 'measured' ? 3 : 0,
          spanGaps: false, tension: 0, borderWidth: 2,
        })),
      },
      options: {
        responsive: true, maintainAspectRatio: false, parsing: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { type: 'linear', title: { display: true, text: xTitle } },
          ...Object.fromEntries([...used].map((axis, index) => [axis, {
            position: index === 0 ? 'left' : 'right',
            title: { display: true, text: titles[axis] ?? '' },
            grid: { drawOnChartArea: index === 0 },
          }])),
        },
      },
    } as ChartConfiguration;
  }

  private depthConfig(series: AnnexProfileSeries[], xTitle: string,
    limits: AnnexReferenceLine[]): ChartConfiguration {
    const depth: DepthPressureSeries[] = series.map((entry, index) => ({
      label: `${entry.label} [${entry.unit}]`,
      color: COLORS[index % COLORS.length],
      points: entry.points.filter(point => point.value !== null)
        .map(point => ({ x: point.value as number, y: point.md })),
    }));
    const maxDepth = Math.max(0, ...series.flatMap(entry => entry.points.map(point => point.md)));
    // Autoscale inclui as linhas de referência da correlação.
    for (const limit of limits)
      depth.push({ label: limit.label, color: '#94a3b8', dashed: true,
        points: [{ x: limit.value, y: 0 }, { x: limit.value, y: maxDepth }] });
    return buildPressureDepthConfig(depth, { xTitle, depthUnit: this.depthUnit,
      maxDepth: maxDepth > 0 ? maxDepth : undefined });
  }
}
