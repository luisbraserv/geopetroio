import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';

import { ToastService } from '../../../shared/toast/toast.service';
import { ModalComponent } from '../../../shared/ui/modal/modal.component';
import {
  SegredoGerado,
  ServicoCliente,
  ServicosClientesService,
} from './servicos-clientes.service';

const ESCOPOS = [
  { valor: 'acesso:ler', rotulo: 'Consultar acesso de usuários' },
  { valor: 'unidades:ler', rotulo: 'Consultar unidades' },
] as const;

@Component({
  selector: 'app-servicos-clientes',
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon, ModalComponent],
  template: `
    <section class="page">
      <header class="page__header">
        <div>
          <p class="eyebrow">Segurança</p>
          <h2>Clientes de serviço</h2>
          <p class="subtitle">Sistemas autorizados a acessar as APIs internas do Braserv-Core.</p>
        </div>
        <button tuiButton type="button" (click)="abrirNovo()"><tui-icon icon="@tui.plus" /> Novo cliente</button>
      </header>

      @if (erro()) { <p class="feedback feedback--erro">{{ erro() }}</p> }
      @if (carregando()) { <p class="feedback">Carregando clientes de serviço…</p> }

      <div class="table-wrap">
        <table>
          <thead><tr><th>ID</th><th>Nome</th><th>Escopos</th><th>Status</th><th>Último uso</th><th>Ações</th></tr></thead>
          <tbody>
            @for (cliente of clientes(); track cliente.id) {
              <tr>
                <td><code>{{ cliente.id }}</code></td>
                <td>{{ cliente.nome }}</td>
                <td><div class="chips">@for (escopo of cliente.escopos; track escopo) { <code>{{ escopo }}</code> }</div></td>
                <td><span class="status" [class.status--inativo]="!cliente.ativo">{{ cliente.ativo ? 'Ativo' : 'Inativo' }}</span></td>
                <td>{{ cliente.ultimoUsoEm ? (cliente.ultimoUsoEm | date:'dd/MM/yyyy HH:mm') : 'Nunca' }}</td>
                <td class="actions">
                  <button tuiButton type="button" appearance="secondary" size="s" (click)="rotacionar(cliente)">Novo segredo</button>
                  @if (cliente.ativo) {
                    <button tuiButton type="button" appearance="secondary-destructive" size="s" (click)="desativar(cliente)">Desativar</button>
                  } @else {
                    <button tuiButton type="button" appearance="secondary" size="s" (click)="ativar(cliente)">Ativar</button>
                  }
                </td>
              </tr>
            } @empty {
              @if (!carregando()) { <tr><td colspan="6" class="empty">Nenhum cliente de serviço cadastrado.</td></tr> }
            }
          </tbody>
        </table>
      </div>

      <app-modal [open]="modalNovo()" title="Novo cliente de serviço" (close)="fecharNovo()">
        <form id="form-servico" class="form" (ngSubmit)="criar()">
          <label>ID <input name="id" [(ngModel)]="form.id" pattern="[a-z0-9][a-z0-9._-]*" maxlength="64" required placeholder="meu-sistema" /></label>
          <label>Nome <input name="nome" [(ngModel)]="form.nome" maxlength="255" required /></label>
          <fieldset>
            <legend>Escopos</legend>
            @for (escopo of escopos; track escopo.valor) {
              <label class="check"><input type="checkbox" [checked]="escopoSelecionado(escopo.valor)" (change)="alternarEscopo(escopo.valor, $any($event.target).checked)" /> {{ escopo.rotulo }} <code>{{ escopo.valor }}</code></label>
            }
          </fieldset>
        </form>
        <ng-container modal-footer>
          <button tuiButton type="button" appearance="secondary" (click)="fecharNovo()">Cancelar</button>
          <button tuiButton type="submit" form="form-servico" [disabled]="salvando()">Autorizar sistema</button>
        </ng-container>
      </app-modal>

      <app-modal [open]="!!segredo()" title="Copie o segredo agora" (close)="fecharSegredo()">
        @if (segredo(); as gerado) {
          <div class="segredo">
            <p>Este segredo do cliente <strong>{{ gerado.id }}</strong> não será exibido novamente.</p>
            <div class="segredo__valor"><code>{{ gerado.segredo }}</code><button tuiButton type="button" appearance="secondary" size="s" (click)="copiarSegredo(gerado)">Copiar</button></div>
            <p class="feedback">{{ gerado.aviso }}</p>
          </div>
        }
        <ng-container modal-footer><button tuiButton type="button" (click)="fecharSegredo()">Já copiei</button></ng-container>
      </app-modal>
    </section>
  `,
  styles: [`
    .page { display:grid; gap:18px; }
    .page__header { display:flex; justify-content:space-between; align-items:flex-start; gap:16px; flex-wrap:wrap; }
    h2 { margin:0; font-size:1.45rem; color:var(--color-text-primary); }
    .eyebrow { margin:0 0 4px; color:var(--color-secondary); font-size:.72rem; font-weight:800; text-transform:uppercase; }
    .subtitle,.feedback { margin:6px 0 0; color:var(--color-text-secondary); }
    .feedback--erro { color:#b42318; }
    .table-wrap { overflow:auto; border:1px solid var(--color-border); border-radius:8px; }
    table { width:100%; border-collapse:collapse; background:#fff; }
    th,td { padding:12px; text-align:left; border-bottom:1px solid var(--color-border); vertical-align:middle; }
    th { background:var(--color-surface-muted); color:var(--color-text-secondary); font-size:.75rem; text-transform:uppercase; }
    .chips,.actions { display:flex; flex-wrap:wrap; gap:6px; }
    .chips code { padding:3px 6px; border-radius:4px; background:var(--color-surface-muted); }
    .status { color:#067647; font-weight:800; } .status--inativo { color:#b42318; }
    .empty { text-align:center; color:var(--color-text-secondary); }
    .form { display:grid; gap:14px; padding:4px; }
    .form>label { display:grid; gap:6px; }
    input { min-height:40px; padding:0 10px; border:1px solid var(--color-border); border-radius:6px; }
    fieldset { display:grid; gap:10px; border:1px solid var(--color-border); border-radius:8px; padding:12px; }
    .check { display:flex; align-items:center; gap:8px; }
    .check input { min-height:auto; }
    .segredo { display:grid; gap:12px; }
    .segredo__valor { display:flex; align-items:center; gap:10px; padding:12px; border:1px solid #fdb022; border-radius:8px; background:#fffaeb; }
    .segredo__valor code { flex:1; overflow-wrap:anywhere; user-select:all; }
  `],
})
export class ServicosClientesComponent {
  private readonly service = inject(ServicosClientesService);
  private readonly toast = inject(ToastService);

  protected readonly escopos = ESCOPOS;
  protected readonly clientes = signal<ServicoCliente[]>([]);
  protected readonly carregando = signal(false);
  protected readonly salvando = signal(false);
  protected readonly erro = signal<string | null>(null);
  protected readonly modalNovo = signal(false);
  protected readonly segredo = signal<SegredoGerado | null>(null);
  protected readonly escoposSelecionados = signal<string[]>([]);
  protected form = { id: '', nome: '' };

  constructor() { this.listar(); }

  protected abrirNovo(): void {
    this.form = { id: '', nome: '' };
    this.escoposSelecionados.set([]);
    this.erro.set(null);
    this.modalNovo.set(true);
  }

  protected fecharNovo(): void { this.modalNovo.set(false); }
  protected escopoSelecionado(escopo: string): boolean { return this.escoposSelecionados().includes(escopo); }

  protected alternarEscopo(escopo: string, selecionado: boolean): void {
    this.escoposSelecionados.update((atuais) => selecionado
      ? [...new Set([...atuais, escopo])]
      : atuais.filter((item) => item !== escopo));
  }

  protected criar(): void {
    if (!this.form.id.trim() || !this.form.nome.trim()) return;
    this.salvando.set(true);
    this.service.criar({ id: this.form.id.trim(), nome: this.form.nome.trim(), escopos: this.escoposSelecionados() }).subscribe({
      next: (segredo) => { this.salvando.set(false); this.modalNovo.set(false); this.segredo.set(segredo); this.listar(); },
      error: (error: Error) => this.falhou(error),
    });
  }

  protected rotacionar(cliente: ServicoCliente): void {
    if (!confirm(`Gerar um novo segredo para "${cliente.nome}"? O segredo atual será invalidado imediatamente.`)) return;
    this.service.gerarNovoSegredo(cliente.id).subscribe({
      next: (segredo) => this.segredo.set(segredo),
      error: (error: Error) => this.falhou(error),
    });
  }

  protected ativar(cliente: ServicoCliente): void { this.alterarStatus(cliente, true); }
  protected desativar(cliente: ServicoCliente): void {
    if (!confirm(`Desativar "${cliente.nome}"? Novos tokens serão recusados imediatamente.`)) return;
    this.alterarStatus(cliente, false);
  }

  protected async copiarSegredo(gerado: SegredoGerado): Promise<void> {
    try { await navigator.clipboard.writeText(gerado.segredo); this.toast.success('Segredo copiado.'); }
    catch { this.toast.warning('Não foi possível copiar automaticamente. Selecione e copie o valor.'); }
  }

  protected fecharSegredo(): void { this.segredo.set(null); }

  private alterarStatus(cliente: ServicoCliente, ativo: boolean): void {
    const chamada = ativo ? this.service.ativar(cliente.id) : this.service.desativar(cliente.id);
    chamada.subscribe({
      next: () => { this.toast.success(ativo ? 'Cliente ativado.' : 'Cliente desativado.'); this.listar(); },
      error: (error: Error) => this.falhou(error),
    });
  }

  private listar(): void {
    this.carregando.set(true);
    this.service.listar().subscribe({
      next: (clientes) => { this.clientes.set(clientes); this.carregando.set(false); },
      error: (error: Error) => this.falhou(error),
    });
  }

  private falhou(error: Error): void {
    this.carregando.set(false);
    this.salvando.set(false);
    this.erro.set(error.message || 'Não foi possível concluir a operação.');
    this.toast.error(this.erro()!);
  }
}
