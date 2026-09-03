import {
  Component, Input, OnChanges, ViewChild, ElementRef, AfterViewInit,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { PressureProfile } from '../../models/tampao.model';
import { ChartZoomModalComponent } from './chart-zoom-modal.component';

Chart.register(...registerables);

@Component({
  selector: 'app-pressure-chart',
  standalone: true,
  imports: [CommonModule, ChartZoomModalComponent],
  template: `
    <div class="p-charts">

      <!-- 1. Envelope de Pressão -->
      <div class="p-chart-block">
        <div class="p-chart-head">
          <div>
            <div class="p-chart-title">Envelope de Pressão</div>
            <div class="p-chart-sub">Fratura, Poro, BHP coluna e BHP anular + ECD ao longo do poço</div>
          </div>
          <button class="zoom-btn" type="button" (click)="openZoom()" title="Ampliar gráfico">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/></svg>
            Ampliar
          </button>
        </div>
        <div class="p-chart-box"><canvas #cvEnvelope></canvas></div>
      </div>

      @if (zoom) {
        <app-chart-zoom-modal [title]="zoom.title" [config]="zoom.config" (close)="zoom = null"></app-chart-zoom-modal>
      }

      <!-- 2. Free Fall — indicador numérico -->
      @if (freeFallPct !== null) {
        <div class="p-chart-block ff-block">
          <div class="p-chart-title">Free Fall</div>
          <div class="p-chart-sub">Propensão de queda livre da pasta na zona de cimento</div>
          <div class="ff-row">
            <div class="ff-metric">
              <div class="ff-value" [class.ff-ok]="freeFallPct < 30" [class.ff-warn]="freeFallPct >= 30 && freeFallPct < 60" [class.ff-danger]="freeFallPct >= 60">
                {{ freeFallPct | number:'1.1-1' }} %
              </div>
              <div class="ff-label">Free Fall na zona de cimento</div>
            </div>
            <div class="ff-bar-wrap">
              <div class="ff-bar">
                <div class="ff-fill"
                  [style.width.%]="freeFallPct"
                  [class.ff-ok]="freeFallPct < 30"
                  [class.ff-warn]="freeFallPct >= 30 && freeFallPct < 60"
                  [class.ff-danger]="freeFallPct >= 60">
                </div>
              </div>
              <div class="ff-scale"><span>0%</span><span>30%</span><span>60%</span><span>100%</span></div>
            </div>
            <div class="ff-chips">
              @if (freeFallPct < 30) { <span class="chip chip--ok">Baixo risco de free fall</span> }
              @else if (freeFallPct < 60) { <span class="chip chip--warn">Risco moderado de free fall</span> }
              @else { <span class="chip chip--danger">Alto risco de free fall</span> }
            </div>
          </div>
        </div>
      }

    </div>
  `,
  styles: [`
    .p-charts { display: flex; flex-direction: column; gap: 20px; }
    .p-chart-block { background: #fff; border: 1px solid #e2e8f0; border-radius: 10px; padding: 16px; }
    .p-chart-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; }
    .p-chart-title { font-size: .88rem; font-weight: 600; color: #1e293b; margin-bottom: 2px; }
    .p-chart-sub { font-size: .72rem; color: #64748b; margin-bottom: 10px; }
    .zoom-btn { display: inline-flex; align-items: center; gap: 5px; flex-shrink: 0; padding: 5px 10px; border: 1px solid #e2e8f0; border-radius: 6px; background: #f8fafc; color: #64748b; font: inherit; font-size: .72rem; font-weight: 650; cursor: pointer; transition: background .15s, color .15s; }
    .zoom-btn:hover { background: #eef6ff; color: #4291e1; border-color: rgba(66,145,225,.3); }
    .p-chart-box { position: relative; height: clamp(260px, 42vh, 380px); min-height: 0; overflow: hidden; }
    .p-chart-box canvas { display: block; width: 100% !important; height: 100% !important; }

    /* Free Fall */
    .ff-block { }
    .ff-row { display: flex; flex-direction: column; gap: 12px; }
    .ff-metric { display: flex; align-items: center; gap: 14px; }
    .ff-value { font-size: 2.2rem; font-weight: 700; }
    .ff-value.ff-ok     { color: #16a34a; }
    .ff-value.ff-warn   { color: #d97706; }
    .ff-value.ff-danger { color: #dc2626; }
    .ff-label { font-size: .78rem; color: #64748b; }
    .ff-bar-wrap { display: flex; flex-direction: column; gap: 4px; }
    .ff-bar { height: 18px; background: #f1f5f9; border-radius: 99px; overflow: hidden; width: 100%; max-width: 500px; }
    .ff-fill { height: 100%; border-radius: 99px; transition: width .4s; }
    .ff-fill.ff-ok     { background: #16a34a; }
    .ff-fill.ff-warn   { background: #d97706; }
    .ff-fill.ff-danger { background: #dc2626; }
    .ff-scale { display: flex; justify-content: space-between; max-width: 500px; font-size: .65rem; color: #94a3b8; }
    .ff-chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { padding: 3px 10px; border-radius: 99px; font-size: .67rem; font-weight: 500; }
    .chip--ok     { background: #dcfce7; color: #166534; }
    .chip--warn   { background: #fef9c3; color: #854d0e; }
    .chip--danger { background: #fee2e2; color: #991b1b; }
  `],
})
export class PressureChartComponent implements AfterViewInit, OnChanges {
  @Input() data: PressureProfile | null = null;
  @ViewChild('cvEnvelope') cvEnvelope!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;
  private envelopeConfig: ChartConfiguration | null = null;

  /** Gráfico aberto no modal de ampliação (null = fechado). */
  zoom: { title: string; config: ChartConfiguration } | null = null;

  openZoom(): void {
    if (!this.envelopeConfig) return;
    this.zoom = { title: 'Envelope de Pressão', config: this.envelopeConfig };
  }

  get freeFallPct(): number | null {
    if (!this.data) return null;
    const vals = this.data.points.map(p => p.freeFallPct).filter(v => v > 0);
    return vals.length > 0 ? vals[0] : 0;
  }

  ngAfterViewInit(): void { this.build(); }
  ngOnChanges(): void { if (this.chart) { this.zoom = null; this.chart.destroy(); this.build(); } }

  getImageDataUrl(): string | null {
    return this.cvEnvelope?.nativeElement?.toDataURL('image/png') ?? null;
  }

  renderForReport(): Promise<string | null> {
    return new Promise(resolve => {
      requestAnimationFrame(() => resolve(this.getImageDataUrl()));
    });
  }

  private build(): void {
    if (!this.cvEnvelope) return;
    const pts = this.data?.points ?? [];
    const labels = pts.map(p => p.tvd.toFixed(0));

    this.envelopeConfig = {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Fratura (psi)', yAxisID: 'y',
              data: pts.map(p => p.fracPsi),
              borderColor: '#ef4444', backgroundColor: 'transparent',
              tension: 0.2, pointRadius: 0, borderWidth: 2, borderDash: [6, 3],
            },
            {
              label: 'Poro (psi)', yAxisID: 'y',
              data: pts.map(p => p.porePsi),
              borderColor: '#10b981', backgroundColor: 'transparent',
              tension: 0.2, pointRadius: 0, borderWidth: 2, borderDash: [6, 3],
            },
            {
              label: 'BHP coluna (psi)', yAxisID: 'y',
              data: pts.map(p => p.psiInside),
              borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.06)',
              tension: 0.2, pointRadius: 0, borderWidth: 2,
            },
            {
              label: 'BHP anular (psi)', yAxisID: 'y',
              data: pts.map(p => p.bhpAnn),
              borderColor: '#8b5cf6', backgroundColor: 'rgba(139,92,246,0.05)',
              tension: 0.2, pointRadius: 0, borderWidth: 2,
            },
            {
              label: 'ECD (ppg)', yAxisID: 'y1',
              data: pts.map(p => p.ecdPpg),
              borderColor: '#f59e0b', backgroundColor: 'transparent',
              tension: 0.2, pointRadius: 0, borderWidth: 1.5,
            },
          ],
        },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { title: { display: true, text: 'TVD (m)' } },
            y: { position: 'left', title: { display: true, text: 'Pressão (psi)' } },
            y1: {
              position: 'right',
              title: { display: true, text: 'ECD (ppg)' },
              grid: { drawOnChartArea: false },
              min: 8, max: 20,
            },
          },
        },
    } as ChartConfiguration;

    this.chart = new Chart(this.cvEnvelope.nativeElement.getContext('2d')!, this.envelopeConfig);
  }
}
