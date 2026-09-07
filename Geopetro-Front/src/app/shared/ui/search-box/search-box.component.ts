import { Component, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';

/**
 * Campo de busca com debounce. Emite (busca) com o termo já "trimado".
 * <app-search-box placeholder="Buscar..." (busca)="aoBuscar($event)"></app-search-box>
 */
@Component({
  selector: 'app-search-box',
  imports: [FormsModule],
  template: `
    <div class="search-box">
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
        <circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" />
      </svg>
      <input type="search" [placeholder]="placeholder()" [(ngModel)]="termo" (ngModelChange)="aoDigitar($event)" />
      @if (termo) {
        <button type="button" class="search-box__clear" aria-label="Limpar" (click)="limpar()">×</button>
      }
    </div>
  `,
  styles: [`
    :host { display: inline-flex; max-width: 100%; }
    .search-box {
      display: inline-flex; align-items: center; gap: 0.5rem; width: 100%;
      min-height: 40px; padding: 0 0.75rem;
      border: 1px solid #cbd5e1; border-radius: 10px; background: #fff;
      color: #64748b; width: min(360px, 100%);
    }
    .search-box:focus-within { border-color: rgba(31,111,235,.6); box-shadow: 0 0 0 3px rgba(31,111,235,.14); }
    .search-box input {
      border: 0 !important; outline: 0; background: transparent !important; flex: 1;
      min-height: auto !important; padding: 0 !important; color: #1f2937; font: inherit;
    }
    .search-box__clear {
      border: 0 !important; background: transparent !important; color: #94a3b8 !important;
      font-size: 1.2rem; line-height: 1; cursor: pointer; padding: 0 0.2rem !important; min-height: auto !important;
    }
  `],
})
export class SearchBoxComponent {
  readonly placeholder = input('Buscar...');
  readonly busca = output<string>();

  protected termo = '';
  private timer: ReturnType<typeof setTimeout> | null = null;

  protected aoDigitar(valor: string): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => this.busca.emit(valor.trim()), 350);
  }

  protected limpar(): void {
    this.termo = '';
    if (this.timer) clearTimeout(this.timer);
    this.busca.emit('');
  }
}
