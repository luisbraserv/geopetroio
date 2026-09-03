import {
  AfterViewInit, Component, ElementRef, EventEmitter, HostListener,
  Input, OnDestroy, Output, ViewChild,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

/**
 * Modal de ampliação de gráfico: recebe a configuração Chart.js do gráfico
 * original e o re-renderiza em tela cheia (clone raso — os dados são
 * compartilhados em leitura, as opções são clonadas para não interferir
 * no gráfico de origem).
 */
@Component({
  selector: 'app-chart-zoom-modal',
  standalone: true,
  imports: [CommonModule],
  template: `
    <div class="czm-backdrop" (click)="close.emit()">
      <div class="czm-dialog" (click)="$event.stopPropagation()">
        <div class="czm-head">
          <div class="czm-title">{{ title }}</div>
          <button class="czm-close" type="button" (click)="close.emit()" aria-label="Fechar">✕</button>
        </div>
        <div class="czm-body"><canvas #canvas></canvas></div>
      </div>
    </div>
  `,
  styles: [`
    .czm-backdrop {
      position: fixed;
      inset: 0;
      z-index: 1000;
      background: rgba(15, 23, 42, .55);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
    }
    .czm-dialog {
      width: min(1280px, 94vw);
      height: min(820px, 88vh);
      display: flex;
      flex-direction: column;
      background: var(--color-card, #fff);
      border-radius: 12px;
      box-shadow: 0 24px 64px rgba(15, 23, 42, .35);
      overflow: hidden;
    }
    .czm-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 14px 18px;
      border-bottom: 1px solid var(--color-card-border, #e2e8f0);
    }
    .czm-title { font-size: 1rem; font-weight: 800; color: var(--color-text-strong, #1e293b); }
    .czm-close {
      border: 1px solid var(--color-card-border, #e2e8f0);
      background: #f8fafc;
      color: var(--color-text-body, #64748b);
      border-radius: 6px;
      width: 30px;
      height: 30px;
      font-size: .85rem;
      cursor: pointer;
    }
    .czm-close:hover { background: #fee2e2; color: #b91c1c; border-color: #fecaca; }
    .czm-body { flex: 1; position: relative; padding: 12px 16px 16px; min-height: 0; }
    .czm-body canvas { display: block; width: 100% !important; height: 100% !important; }
  `],
})
export class ChartZoomModalComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) title = '';
  @Input({ required: true }) config!: ChartConfiguration;
  @Output() close = new EventEmitter<void>();
  @ViewChild('canvas') canvasRef!: ElementRef<HTMLCanvasElement>;

  private chart?: Chart;

  ngAfterViewInit(): void {
    if (!this.config || !this.canvasRef) return;
    const cfg = this.config;
    const cloned = {
      type: (cfg as any).type,
      data: {
        labels: [...(cfg.data?.labels ?? [])],
        datasets: (cfg.data?.datasets ?? []).map(d => ({ ...d })),
      },
      // opções destes gráficos são dados puros (sem funções) — clone profundo seguro
      options: cfg.options ? JSON.parse(JSON.stringify(cfg.options)) : undefined,
    } as ChartConfiguration;
    this.chart = new Chart(this.canvasRef.nativeElement.getContext('2d')!, cloned);
  }

  ngOnDestroy(): void { this.chart?.destroy(); }

  @HostListener('document:keydown.escape')
  onEscape(): void { this.close.emit(); }
}
