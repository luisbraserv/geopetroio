import { Component, computed, input, output } from '@angular/core';

/**
 * Paginador simples (página 0-based). Emite (mudarPagina) com o índice da página.
 * <app-paginator [pagina]="p()" [totalPaginas]="tp()" [totalElementos]="te()" (mudarPagina)="irPara($event)" />
 */
@Component({
  selector: 'app-paginator',
  template: `
    @if (totalElementos() > 0) {
      <div class="paginator">
        <span class="paginator__info">
          {{ totalElementos() }} registro(s) · página {{ pagina() + 1 }} de {{ Math.max(totalPaginas(), 1) }}
        </span>
        <div class="paginator__nav">
          <button type="button" class="pg-btn" [disabled]="pagina() <= 0" (click)="ir(pagina() - 1)" aria-label="Anterior">‹</button>
          @for (p of paginasVisiveis(); track p) {
            <button type="button" class="pg-btn" [class.pg-btn--active]="p === pagina()" (click)="ir(p)">{{ p + 1 }}</button>
          }
          <button type="button" class="pg-btn" [disabled]="pagina() + 1 >= totalPaginas()" (click)="ir(pagina() + 1)" aria-label="Próxima">›</button>
        </div>
      </div>
    }
  `,
  styles: [`
    .paginator { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; margin-top: 0.75rem; }
    .paginator__info { font-size: 0.8rem; color: var(--text-secondary); }
    .paginator__nav { display: flex; gap: 0.3rem; }
    .pg-btn {
      min-width: 36px; min-height: 36px; padding: 0 0.5rem !important;
      border: 1px solid var(--border-default) !important; border-radius: var(--radius-md) !important;
      background: #fff !important; color: var(--text-primary) !important;
      font: inherit; font-weight: 600; cursor: pointer;
    }
    .pg-btn:hover:not(:disabled) { border-color: var(--border-strong) !important; background: var(--surface-subtle) !important; }
    .pg-btn--active { background: var(--brand-blue-600) !important; border-color: var(--brand-blue-600) !important; color: #fff !important; }
    .pg-btn:disabled { opacity: 0.5; cursor: default; }
  `],
})
export class PaginatorComponent {
  readonly pagina = input(0);
  readonly totalPaginas = input(0);
  readonly totalElementos = input(0);
  readonly mudarPagina = output<number>();

  protected readonly Math = Math;

  // Mostra até 5 páginas ao redor da atual
  protected readonly paginasVisiveis = computed(() => {
    const total = this.totalPaginas();
    const atual = this.pagina();
    const inicio = Math.max(0, Math.min(atual - 2, total - 5));
    const fim = Math.min(total, inicio + 5);
    const paginas: number[] = [];
    for (let i = inicio; i < fim; i += 1) paginas.push(i);
    return paginas;
  });

  protected ir(p: number): void {
    if (p < 0 || p >= this.totalPaginas() || p === this.pagina()) return;
    this.mudarPagina.emit(p);
  }
}
