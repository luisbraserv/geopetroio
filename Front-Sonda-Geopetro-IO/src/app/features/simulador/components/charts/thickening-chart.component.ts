import { Component, Input, OnChanges, ViewChild, ElementRef, AfterViewInit } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';
import { ThickeningResult } from '../../models/reologia.model';

Chart.register(...registerables);

@Component({
  selector: 'app-thickening-chart',
  standalone: true,
  template: `
    <div class="chart-wrap">
      <div class="chart-toolbar">
        <button class="save-btn" type="button" (click)="save()" title="Salvar imagem">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          Salvar
        </button>
      </div>
      <div class="chart-box"><canvas #canvas></canvas></div>
    </div>
  `,
  styles: [`
    .chart-wrap { display: flex; flex-direction: column; gap: 6px; }
    .chart-toolbar { display: flex; justify-content: flex-end; }
    .chart-box { position: relative; height: clamp(220px, 34vh, 300px); min-height: 0; overflow: hidden; }
    .chart-box canvas { display: block; width: 100% !important; height: 100% !important; }
    .save-btn { display: inline-flex; align-items: center; gap: 5px; padding: 5px 10px; border: 1px solid var(--color-card-border, #e2e8f0); border-radius: 6px; background: #f8fafc; color: var(--color-text-body, #64748b); font: inherit; font-size: .72rem; font-weight: 650; cursor: pointer; transition: background .15s, color .15s; }
    .save-btn:hover { background: #eef6ff; color: var(--color-primary, #4291e1); border-color: rgba(66,145,225,.3); }
  `],
})
export class ThickeningChartComponent implements AfterViewInit, OnChanges {
  @Input() data: ThickeningResult | null = null;
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;
  private chart?: Chart;

  ngAfterViewInit(): void { this.build(); }
  ngOnChanges(): void { if (this.chart) this.update(); }

  save(): void {
    const url = this.canvasRef.nativeElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'consistencia-tempo.png';
    a.click();
  }

  private build(): void {
    if (!this.canvasRef) return;
    const ctx = this.canvasRef.nativeElement.getContext('2d')!;
    this.chart = new Chart(ctx, this.config());
  }

  private update(): void {
    if (!this.chart || !this.data) return;
    const d = this.data;
    this.chart.data.labels = d.t.map(v => v.toFixed(2));
    (this.chart.data.datasets[0] as any).data = d.bc;
    (this.chart.data.datasets[1] as any).data = d.temp;
    (this.chart.data.datasets[2] as any).data = d.pressure.map(v => v / 100);
    this.chart.update();
  }

  private config(): ChartConfiguration {
    const d = this.data;
    return {
      type: 'line',
      data: {
        labels: d ? d.t.map(v => v.toFixed(2)) : [],
        datasets: [
          { label: 'Consistência (Bc)', data: d?.bc ?? [], borderColor: '#3b82f6', backgroundColor: 'rgba(59,130,246,0.08)', yAxisID: 'y', tension: 0.3, pointRadius: 0 },
          { label: 'Temperatura (°F)', data: d?.temp ?? [], borderColor: '#ef4444', backgroundColor: 'transparent', yAxisID: 'y1', tension: 0.3, pointRadius: 0, borderDash: [4,2] },
          { label: 'Pressão (×100 psi)', data: d ? d.pressure.map(v => v / 100) : [], borderColor: '#10b981', backgroundColor: 'transparent', yAxisID: 'y2', tension: 0.3, pointRadius: 0, borderDash: [2,4] },
        ],
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: {
          x: { title: { display: true, text: 'Tempo (h)' } },
          y: { title: { display: true, text: 'Bc' }, min: 0, max: 100 },
          y1: { position: 'right', title: { display: true, text: '°F' }, grid: { drawOnChartArea: false } },
          y2: { position: 'right', title: { display: true, text: 'psi ×100' }, grid: { drawOnChartArea: false } },
        },
      },
    };
  }
}
