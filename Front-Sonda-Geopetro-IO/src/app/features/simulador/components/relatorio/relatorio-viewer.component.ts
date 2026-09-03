import { Component, Input, Output, EventEmitter, OnChanges, ElementRef, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';

@Component({
  selector: 'app-relatorio-viewer',
  standalone: true,
  imports: [CommonModule],
  template: `
    @if (visivel) {
      <div class="relatorio-overlay" (click)="fechar()">
        <div class="relatorio-modal" (click)="$event.stopPropagation()">
          <div class="relatorio-header">
            <h2>{{ titulo }}</h2>
            <div class="relatorio-header-actions">
              <button class="btn-print" (click)="imprimir()" type="button">🖨 Imprimir</button>
              <button class="btn-close" (click)="fechar()" type="button">✕</button>
            </div>
          </div>
          <iframe #frame class="relatorio-frame" [srcdoc]="conteudo" sandbox="allow-same-origin allow-popups"></iframe>
        </div>
      </div>
    }
  `,
  styles: [`
    .relatorio-overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,0.55); z-index: 1000;
      display: flex; align-items: center; justify-content: center; padding: 24px;
    }
    .relatorio-modal {
      background: #fff; border-radius: 12px; width: 100%; max-width: 960px;
      height: 90vh; display: flex; flex-direction: column; box-shadow: 0 8px 40px rgba(0,0,0,0.25);
    }
    .relatorio-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid #e5e7eb; flex-shrink: 0;
    }
    .relatorio-header h2 { margin: 0; font-size: 16px; font-weight: 700; color: #1e293b; }
    .relatorio-header-actions { display: flex; gap: 8px; }
    .btn-print { background: #3b82f6; color: #fff; border: none; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 13px; }
    .btn-close { background: #f1f5f9; color: #374151; border: 1px solid #e2e8f0; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 13px; }
    .relatorio-frame { flex: 1; border: none; border-radius: 0 0 12px 12px; }
  `],
})
export class RelatorioViewerComponent implements OnChanges {
  @Input() titulo = 'Relatório';
  @Input() conteudo = '';
  @Input() visivel = false;
  @Output() closed = new EventEmitter<void>();
  @ViewChild('frame') frame?: ElementRef<HTMLIFrameElement>;

  constructor(private sanitizer: DomSanitizer) {}

  ngOnChanges(): void {}

  fechar(): void {
    this.closed.emit();
  }

  imprimir(): void {
    const win = this.frame?.nativeElement?.contentWindow;
    if (win) win.print();
  }
}
