import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { ModalComponent } from '../../../../shared/ui/modal/modal.component';
import { PaginatorComponent } from '../../../../shared/ui/paginator/paginator.component';
import { SearchBoxComponent } from '../../../../shared/ui/search-box/search-box.component';
import { ToastService } from '../../../../shared/toast/toast.service';
import { Setor, UnidadeSonda, UnidadeSondaPayload } from '../../models/cadastros.model';
import { SetorService } from '../../services/setor.service';
import { UnidadeSondaService } from '../../services/unidade-sonda.service';

@Component({
  selector: 'app-unidades-sondas-page',
  imports: [FormsModule, ModalComponent, SearchBoxComponent, PaginatorComponent],
  template: `
    <section class="page">
      <header class="page__header">
        <div><p>Cadastros</p><h1>Unidades/Sondas</h1></div>
        <div class="header-actions">
          <app-search-box placeholder="Buscar unidade/sonda..." (busca)="aoBuscar($event)" />
          <button type="button" (click)="abrirNovo()">Novo</button>
        </div>
      </header>

      <app-modal [open]="modalAberto()" [title]="editandoId() ? 'Editar unidade/sonda' : 'Nova unidade/sonda'" (close)="fecharModal()">
        @if (error()) { <p class="error">{{ error() }}</p> }
        <form id="form-unidade" class="form" (ngSubmit)="salvar()">
          <label>Nome <input name="nome" [(ngModel)]="form.nome" required /></label>
          <label>Apelido <input name="apelido" [(ngModel)]="form.apelido" /></label>
          <label>Setor
            <select name="setorId" [(ngModel)]="form.setorId" required>
              <option [ngValue]="0">Selecione</option>
              @for (setor of setores(); track setor.id) {
                <option [ngValue]="setor.id">{{ setor.nome }} — {{ setor.regionalNome }}</option>
              }
            </select>
          </label>
        </form>
        <ng-container modal-footer>
          <button type="button" class="ghost" (click)="fecharModal()">Cancelar</button>
          <button type="submit" form="form-unidade">{{ editandoId() ? 'Atualizar' : 'Cadastrar' }}</button>
        </ng-container>
      </app-modal>

      <table>
        <thead>
          <tr><th>Nome</th><th>Apelido</th><th>Setor</th><th>Regional</th><th>Acoes</th></tr>
        </thead>
        <tbody>
          @for (unidade of unidades(); track unidade.id) {
            <tr>
              <td>{{ unidade.nome }}</td>
              <td>{{ unidade.apelido || '-' }}</td>
              <td>{{ unidade.setorNome }}</td>
              <td>{{ unidade.regionalNome }}</td>
              <td class="row-actions">
                <button type="button" (click)="editar(unidade)">Editar</button>
                <button type="button" class="danger" (click)="excluir(unidade)">Excluir</button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="5" class="empty">Nenhuma unidade/sonda cadastrada.</td></tr>
          }
        </tbody>
      </table>

      <app-paginator [pagina]="pagina()" [totalPaginas]="totalPaginas()" [totalElementos]="totalElementos()" (mudarPagina)="irParaPagina($event)" />
    </section>
  `,
  styles: [`
    .page { display: grid; gap: 1rem; color: var(--color-text-strong); padding: 1.5rem; width: min(100%, 1440px); margin: 0 auto; }
    .page__header { display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap; }
    .header-actions { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
    h1 { margin: 0; font-size: 1.65rem; } p { margin: 0; color: var(--color-text-body); font-size: .8rem; }
    .form { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: .85rem; padding: 1rem; background: #fff; border: 1px solid var(--color-card-border); border-radius: 8px; }
    label { display: grid; gap: .35rem; font-size: .82rem; color: var(--color-text-body); }
    input, select { min-height: 38px; padding: .55rem .65rem; border: 1px solid #cbd5e1; border-radius: 6px; background: #fff; color: var(--color-text-strong); }
    button { min-height: 36px; padding: 0 .85rem; border: 0; border-radius: 6px; background: var(--color-primary); color: #fff; cursor: pointer; font-size: .82rem; font-weight: 600; }
    .ghost { background: var(--color-surface-muted); color: #263040; } .danger { background: #d92d20; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--color-card-border); border-radius: 8px; overflow: hidden; }
    th, td { padding: .75rem; border-bottom: 1px solid var(--color-surface-muted); text-align: left; color: var(--color-text-strong); }
    th { background: var(--color-surface-muted); color: var(--color-text-body); font-size: .78rem; font-weight: 700; text-transform: uppercase; }
    .row-actions, .actions { display: flex; gap: .4rem; flex-wrap: wrap; align-items: end; }
    .error { color: #b42318; font-size: .82rem; }
    .empty { text-align: center; color: var(--color-text-secondary); }
  `],
})
export class UnidadesSondasPageComponent {
  private readonly service = inject(UnidadeSondaService);
  private readonly setorService = inject(SetorService);
  private readonly toast = inject(ToastService);

  protected readonly unidades = signal<UnidadeSonda[]>([]);
  protected readonly setores = signal<Setor[]>([]);
  protected readonly editandoId = signal<number | null>(null);
  protected readonly modalAberto = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly pagina = signal(0);
  protected readonly totalPaginas = signal(0);
  protected readonly totalElementos = signal(0);
  private busca = '';
  protected form: UnidadeSondaPayload = { nome: '', apelido: '', setorId: 0 };

  constructor() {
    this.carregar();
    this.setorService.listar().subscribe({
      next: (setores) => this.setores.set(setores),
      error: (err: Error) => this.notificarErro(err),
    });
  }

  protected abrirNovo(): void { this.novo(); this.modalAberto.set(true); }
  protected fecharModal(): void { this.modalAberto.set(false); this.novo(); }

  protected aoBuscar(termo: string): void { this.busca = termo; this.pagina.set(0); this.carregar(); }
  protected irParaPagina(p: number): void { this.pagina.set(p); this.carregar(); }

  protected salvar(): void {
    if (!this.form.setorId) { this.toast.warning('Selecione um setor.'); return; }
    const id = this.editandoId();
    (id ? this.service.atualizar(id, this.form) : this.service.criar(this.form)).subscribe({
      next: () => { this.toast.success(id ? 'Unidade/Sonda atualizada com sucesso.' : 'Unidade/Sonda cadastrada com sucesso.'); this.modalAberto.set(false); this.novo(); this.carregar(); },
      error: (err: Error) => this.notificarErro(err),
    });
  }

  protected editar(unidade: UnidadeSonda): void {
    this.editandoId.set(unidade.id);
    this.form = { nome: unidade.nome, apelido: unidade.apelido ?? '', setorId: unidade.setorId };
    this.error.set(null);
    this.modalAberto.set(true);
  }

  protected excluir(unidade: UnidadeSonda): void {
    if (!confirm(`Excluir unidade/sonda "${unidade.nome}"?`)) return;
    this.service.excluir(unidade.id).subscribe({
      next: () => { this.toast.success('Unidade/Sonda excluida com sucesso.'); this.carregar(); },
      error: (err: Error) => this.notificarErro(err),
    });
  }

  protected novo(): void {
    this.editandoId.set(null);
    this.form = { nome: '', apelido: '', setorId: 0 };
    this.error.set(null);
  }

  private carregar(): void {
    this.service.listarPaginado(this.pagina(), 10, this.busca).subscribe({
      next: (p) => {
        this.unidades.set(p.conteudo);
        this.totalPaginas.set(p.totalPaginas);
        this.totalElementos.set(p.totalElementos);
      },
      error: (err: Error) => this.notificarErro(err),
    });
  }

  private notificarErro(err: Error): void {
    const message = err?.message || 'Nao foi possivel concluir a operacao.';
    this.error.set(message);
    this.toast.error(message);
  }
}
