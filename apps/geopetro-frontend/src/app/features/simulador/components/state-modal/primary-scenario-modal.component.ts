import { CommonModule } from '@angular/common';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import { Component, EventEmitter, Input, Output, OnChanges, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import type { PrimaryImportSummary } from '../../services/primary-scenario-portable';
import type { PrimarySaveState } from '../../services/primary-scenario-store.service';
import { SimuladorStateApiService, type CenarioApi, type PastaApi } from '../../services/simulador-state-api.service';

/** Navegação por pastas; a página mantém o codec e a gravação tipada da primária. */
@Component({
  selector: 'app-primary-scenario-modal', standalone: true, imports: [CommonModule, FormsModule, CdkTrapFocus],
  template: `
    @if (open) {
      <div class="psm-backdrop" (click)="closed.emit()">
        <section class="psm-modal" role="dialog" aria-modal="true" aria-label="Cenários da cimentação primária"
          cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()" (keydown.escape)="closed.emit()">
          <header class="psm-head"><div><span class="psm-eyebrow">Cimentação Primária</span><h2>Cenários</h2></div>
            <button class="psm-icon" type="button" aria-label="Fechar" (click)="closed.emit()">✕</button></header>
          <div class="psm-layout">
            <nav class="psm-folders" aria-label="Pastas dos cenários">
              <button type="button" [class.active]="folder() === 'all'" (click)="navigate('all')">Todos os cenários</button>
              <button type="button" [class.active]="folder() === null" (click)="navigate(null)">Sem pasta</button>
              @for (item of folders(); track item.id) {
                <div class="psm-folder-row"><button type="button" [class.active]="folder() === item.id" (click)="navigate(item.id)">{{ item.nome }} ({{ item.totalCenarios }})</button>
                  <button type="button" [attr.aria-label]="'Renomear pasta ' + item.nome" (click)="editFolder(item)">✎</button>
                  <button type="button" [disabled]="busy()" [attr.aria-label]="'Excluir pasta ' + item.nome" (click)="prepareFolderDelete(item)">✕</button></div>
              }
              <label class="psm-field">{{ editingFolderId === null ? 'Nova pasta' : 'Renomear pasta' }}<input [(ngModel)]="folderName"></label>
              <button class="psm-btn" type="button" [disabled]="busy() || !folderName.trim()" (click)="saveFolder()">{{ editingFolderId === null ? 'Criar pasta' : 'Salvar nome' }}</button>
              @if (editingFolderId !== null) { <button type="button" (click)="editingFolderId = null; folderName = ''">Cancelar renomeação</button> }
            </nav>
            <div class="psm-body">
              <div class="psm-row"><label class="psm-field">Nome do cenário<input type="text" [value]="scenarioName" (change)="nomeChange.emit($any($event.target).value)"></label>
                <label class="psm-field">Salvar na pasta<select [(ngModel)]="destinationId"><option [ngValue]="null">Sem pasta</option>@for (item of folders(); track item.id) {<option [ngValue]="item.id">{{ item.nome }}</option>}</select></label>
                <span class="psm-badge" [class.psm-badge--saved]="saveState?.status === 'saved'" [class.psm-badge--failed]="saveState?.status === 'failed'">
                  {{ saveState?.status === 'saved' ? 'Salvo' : saveState?.status === 'saving' ? 'Salvando…' : 'Não salvo' }}
                </span>
              </div>
              <p class="psm-hint">Para renomear ou mover um cenário, abra-o, ajuste o nome ou a pasta de destino e salve.</p>
              <div class="psm-row">
                <button class="psm-btn psm-btn--primary" type="button" [disabled]="saving || !scenarioName.trim()" (click)="save(false)">Salvar no banco</button>
                <button class="psm-btn" type="button" [disabled]="saving || !scenarioName.trim()" (click)="save(true)">Salvar como novo</button>
                <button class="psm-btn" type="button" [disabled]="busy()" (click)="refresh()">Atualizar lista</button>
                <button class="psm-btn" type="button" (click)="exportar.emit()">Exportar arquivo</button>
                <label class="psm-file">Importar arquivo<input type="file" accept=".json,application/json" [disabled]="saving" (change)="arquivo.emit($event)"></label>
              </div>
              @if (saveState?.savedAt) {<p class="psm-hint">Última gravação: {{ saveState?.savedAt | date:'dd/MM/yyyy HH:mm' }}</p>}
              @if (saveState?.message) {<p class="psm-warn" role="alert">{{ saveState?.message }}</p>}
              @if (message || error()) {<p class="psm-warn" role="alert">{{ message || error() }}</p>}
              @if (busy()) {<p role="status">Carregando…</p>}
              <table class="psm-table"><thead><tr><th>Cenário</th><th>Pasta</th><th>Atualizado</th><th>Ações</th></tr></thead><tbody>
                @for (item of rows(); track item.id) {
                  <tr><td>{{ item.nome }}</td><td>{{ item.pastaNome || 'Sem pasta' }}</td><td>{{ item.atualizadoEm | date:'dd/MM/yyyy HH:mm' }}</td>
                    <td><button class="psm-btn" type="button" [disabled]="saving" (click)="abrir.emit(item.id)">Abrir</button>
                    <button class="psm-btn" type="button" [disabled]="busy() || saving" (click)="deletion.set({ kind: 'scenario', id: item.id, name: item.nome, count: 1 })">Excluir</button></td></tr>
                } @empty { @if (!busy()) {<tr><td colspan="4">Nenhum cenário nesta pasta.</td></tr>} }
              </tbody></table>
              @if (deletion(); as item) {
                <div class="psm-import" role="alert"><strong>Excluir {{ item.kind === 'folder' ? 'a pasta' : 'o cenário' }} “{{ item.name }}”?</strong>
                  <p>{{ item.kind === 'folder' ? 'A pasta e seus ' + item.count + ' cenário(s) serão excluídos.' : 'O cenário será excluído do banco.' }}</p>
                  <div class="psm-row"><button class="psm-btn" type="button" [disabled]="busy()" (click)="confirmDelete()">Confirmar exclusão</button>
                    <button class="psm-btn" type="button" [disabled]="busy()" (click)="deletion.set(null)">Cancelar</button></div></div>
              }
              @if (importSummary; as summary) {
                <div class="psm-import"><strong>Arquivo lido. Confira antes de adotar.</strong>
                  <p>{{ summary.stages }} estágio(s) · {{ summary.fluids }} fluido(s) · {{ summary.steps }} passo(s) · {{ summary.measurements }} conjunto(s) de medição · {{ summary.samples }} amostra(s).</p>
                  <p>Origem: cenário {{ summary.provenance.scenarioName || summary.provenance.scenarioId || '—' }}. A importação cria um rascunho sem vínculo com o banco.</p>
                  <div class="psm-row"><button class="psm-btn psm-btn--primary" type="button" [disabled]="saving" (click)="adotar.emit()">Adotar cenário</button>
                    <button class="psm-btn" type="button" (click)="cancelar.emit()">Cancelar importação</button></div></div>
              }
            </div>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .psm-backdrop { position: fixed; inset: 0; z-index: 200; display: flex; align-items: center;
      justify-content: center; padding: 24px; background: rgba(5, 24, 51, .45); }
    .psm-modal { width: min(760px, 100%); max-height: 88vh; overflow: auto; border-radius: 10px;
      background: #fff; box-shadow: 0 18px 48px rgba(0, 0, 0, .28); }
    .psm-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px;
      padding: 16px 18px; border-bottom: 1px solid var(--color-card-border, #d6deeb); }
    .psm-head h2 { margin: 2px 0 0; font-size: 1.05rem; color: var(--color-text-strong, #051833); }
    .psm-eyebrow { font-size: .68rem; font-weight: 800; letter-spacing: .12em;
      text-transform: uppercase; color: var(--color-text-body, #64748b); }
    .psm-icon { width: 28px; height: 28px; border: 1px solid var(--color-card-border, #d6deeb);
      border-radius: 6px; background: #f8fafc; cursor: pointer; font-size: .85rem; line-height: 1; }
    .psm-body { padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
    .psm-row { display: flex; flex-wrap: wrap; align-items: flex-end; gap: 8px; }
    .psm-field, .psm-file { display: flex; flex-direction: column; gap: 3px; font-size: .72rem;
      color: var(--color-text-body, #475569); }
    .psm-field input, .psm-file input { padding: 6px 8px; border-radius: 6px; font: inherit;
      font-size: .82rem; border: 1px solid var(--color-card-border, #d6deeb); }
    .psm-btn { padding: 7px 14px; border: 1px solid var(--color-card-border, #d6deeb);
      border-radius: 6px; background: #f8fafc; font: inherit; font-size: .78rem; font-weight: 650;
      cursor: pointer; }
    .psm-btn--primary { background: var(--color-primary, #154a7a); color: #fff;
      border-color: transparent; }
    .psm-badge { padding: 5px 10px; border-radius: 999px; font-size: .72rem; font-weight: 700;
      background: #f1f5f9; color: var(--color-text-body, #64748b); }
    .psm-badge--saved { background: rgba(15, 118, 110, .12); color: #0f766e; }
    .psm-badge--failed { background: rgba(217, 45, 32, .12); color: #b42318; }
    .psm-warn { margin: 0; font-size: .76rem; color: #b45309; }
    .psm-table { width: 100%; border-collapse: collapse; font-size: .78rem; }
    .psm-table th, .psm-table td { padding: 6px 8px; text-align: left;
      border-bottom: 1px solid var(--color-card-border, #e2e8f0); }
    .psm-import { border: 1px dashed var(--brand-orange-600, #d4852f); border-radius: 8px;
      padding: 10px 12px; display: flex; flex-direction: column; gap: 6px; font-size: .78rem; }
    .psm-import p { margin: 0; color: var(--color-text-body, #475569); }
  
    .psm-modal{width:min(1100px,100%)}.psm-layout{display:grid;grid-template-columns:240px minmax(0,1fr)}.psm-folders{padding:16px;border-right:1px solid #d6deeb;display:flex;flex-direction:column;gap:9px;background:#f8fafc}.psm-folders button{border:0;background:transparent;text-align:left;padding:7px;border-radius:5px;cursor:pointer;color:#334155}.psm-folders button.active{background:#e2e8f0;color:#051833;font-weight:700}.psm-folder-row{display:flex;gap:3px}.psm-folder-row button:first-child{flex:1;overflow-wrap:anywhere}.psm-field select{padding:7px;border:1px solid #d6deeb;border-radius:6px;max-width:220px}.psm-hint{font-size:.72rem;color:#64748b;margin:0}.psm-body{min-width:0;overflow:auto}.psm-btn:disabled{opacity:.45;cursor:not-allowed}@media(max-width:700px){.psm-layout{grid-template-columns:1fr}.psm-folders{max-height:180px;overflow:auto;border-right:0;border-bottom:1px solid #d6deeb}.psm-backdrop{padding:10px}}
  `],
})
export class PrimaryScenarioModalComponent implements OnChanges {
  private readonly api = inject(SimuladorStateApiService);
  @Input() open = false;
  @Input() scenarioName = '';
  @Input() currentFolderId: number | null = null;
  @Input() saveState: PrimarySaveState | null = null;
  @Input() savedList: CenarioApi[] = [];
  @Input() importSummary: PrimaryImportSummary | null = null;
  @Input() message = '';
  @Output() closed = new EventEmitter<void>();
  @Output() nomeChange = new EventEmitter<string>();
  @Output() salvar = new EventEmitter<{ nome: string; pastaId: number | null; asNew: boolean }>();
  @Output() listar = new EventEmitter<void>();
  @Output() abrir = new EventEmitter<number>();
  @Output() exportar = new EventEmitter<void>();
  @Output() relatorioDoc = new EventEmitter<void>();
  @Output() arquivo = new EventEmitter<Event>();
  @Output() adotar = new EventEmitter<void>();
  @Output() cancelar = new EventEmitter<void>();
  @Output() scenarioDeleted = new EventEmitter<number>();
  @Output() folderDeleted = new EventEmitter<number>();
  readonly folders = signal<PastaApi[]>([]);
  readonly rows = signal<CenarioApi[]>([]);
  readonly folder = signal<number | null | 'all'>('all');
  readonly busy = signal(false);
  readonly error = signal('');
  readonly deletion = signal<{kind: 'folder' | 'scenario'; id: number; name: string; count: number} | null>(null);
  destinationId: number | null = null;
  folderName = '';
  editingFolderId: number | null = null;
  private loadVersion = 0;
  get saving(): boolean { return this.saveState?.status === 'saving'; }
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['currentFolderId'] || changes['open']?.currentValue) this.destinationId = this.currentFolderId;
    if (this.open && (changes['open'] || (changes['saveState'] && this.saveState?.status === 'saved'))) void this.refresh();
  }
  async refresh(): Promise<void> {
    const version = ++this.loadVersion;
    this.busy.set(true); this.error.set('');
    const folder = this.folder();
    try {
      const [folders, rows] = await Promise.all([firstValueFrom(this.api.listarPastas('primaria')),
        firstValueFrom(folder === null ? this.api.listarSemPasta('primaria') : this.api.listarCenarios('primaria', folder === 'all' ? undefined : folder))]);
      if (version === this.loadVersion) { this.folders.set(folders); this.rows.set(rows); }
    } catch { if (version === this.loadVersion) this.error.set('Não foi possível carregar as pastas e os cenários. Tente atualizar a lista.'); }
    finally { if (version === this.loadVersion) this.busy.set(false); }
  }
  navigate(folder: number | null | 'all'): void { this.folder.set(folder); this.deletion.set(null); void this.refresh(); }
  save(asNew: boolean): void { if (!this.saving && this.scenarioName.trim()) this.salvar.emit({ nome: this.scenarioName.trim(), pastaId: this.destinationId, asNew }); }
  editFolder(folder: PastaApi): void { this.editingFolderId = folder.id; this.folderName = folder.nome; }
  async saveFolder(): Promise<void> {
    if (this.busy() || !this.folderName.trim()) return;
    this.busy.set(true); this.error.set('');
    try {
      const folder = await firstValueFrom(this.editingFolderId === null
        ? this.api.criarPasta(this.folderName.trim(), 'primaria') : this.api.renomearPasta(this.editingFolderId, this.folderName.trim(), 'primaria'));
      this.editingFolderId = null; this.folderName = ''; this.folder.set(folder.id); this.destinationId = folder.id;
      await this.refresh();
    } catch { this.error.set('Não foi possível salvar a pasta.'); }
    finally { this.busy.set(false); }
  }
  async prepareFolderDelete(folder: PastaApi): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set('');
    try { const rows = await firstValueFrom(this.api.listarCenarios('primaria', folder.id));
      this.deletion.set({ kind: 'folder', id: folder.id, name: folder.nome, count: rows.length });
    } catch { this.error.set('Não foi possível conferir o conteúdo da pasta.'); }
    finally { this.busy.set(false); }
  }
  async confirmDelete(): Promise<void> {
    const item = this.deletion(); if (!item || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      await firstValueFrom(item.kind === 'folder' ? this.api.excluirPasta(item.id) : this.api.excluirCenario(item.id));
      if (item.kind === 'folder') {
        if (this.folder() === item.id) this.folder.set('all');
        if (this.destinationId === item.id) this.destinationId = null;
        this.folderDeleted.emit(item.id);
      } else this.scenarioDeleted.emit(item.id);
      this.deletion.set(null); await this.refresh();
    } catch { this.error.set('Não foi possível excluir. Nenhuma alteração local foi descartada.'); }
    finally { this.busy.set(false); }
  }
}
