import { CommonModule } from '@angular/common';
import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SimuladorStateApiService, PastaApi, CenarioApi } from '../../services/simulador-state-api.service';
import { finalize } from 'rxjs';
import { ToastService } from '../../../../shared/toast/toast.service';

type View = 'list' | 'nova-pasta' | 'novo-cenario';

@Component({
  selector: 'app-simulador-state-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open) {
      <div class="sm-backdrop" (click)="fechar()">
        <section class="sm-modal" (click)="$event.stopPropagation()">

          <!-- ── Header ── -->
          <header class="sm-head">
            <div>
              <span class="sm-eyebrow">{{ operacao === 'tampao' ? 'Tampão Balanceado' : 'Squeeze de Cimento' }}</span>
              <h2>Cenários</h2>
            </div>
            <button class="sm-icon-btn" type="button" (click)="fechar()" title="Fechar">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </header>

          @if (erro) {
            <div class="sm-erro">⚠ {{ erro }}</div>
          }

          <!-- ── Corpo: duas colunas ── -->
          <div class="sm-body">

            <!-- ─ Coluna esquerda: pastas ─ -->
            <aside class="sm-sidebar">
              <div class="sm-sidebar-head">
                <span class="sm-section-label">Pastas</span>
                <button class="sm-icon-btn sm-icon-btn--sm" type="button" (click)="iniciarNovaPasta()" title="Nova pasta">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                </button>
              </div>

              <!-- Input nova pasta -->
              @if (view === 'nova-pasta') {
                <div class="sm-inline-form">
                  <input
                    class="sm-input sm-input--sm"
                    [(ngModel)]="novaPastaNome"
                    placeholder="Nome da pasta"
                    (keydown.enter)="salvarPasta()"
                    (keydown.escape)="view = 'list'"
                    autofocus />
                  <button class="sm-btn sm-btn--primary sm-btn--xs" type="button" (click)="salvarPasta()" [disabled]="!novaPastaNome.trim() || loading">Ok</button>
                  <button class="sm-btn sm-btn--xs" type="button" (click)="view = 'list'">✕</button>
                </div>
              }

              <!-- Lista de pastas -->
              <div class="sm-pasta-list">
                <!-- "Sem pasta" sempre visível -->
                <button
                  class="sm-pasta-item"
                  [class.sm-pasta-item--active]="pastaAtiva === null"
                  type="button"
                  (click)="selecionarPasta(null)">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  <span>Sem pasta</span>
                  <span class="sm-badge">{{ semPastaCount }}</span>
                </button>

                @for (p of pastas; track p.id) {
                  <div class="sm-pasta-row">
                    @if (editandoPastaId === p.id) {
                      <input
                        class="sm-input sm-input--sm"
                        [(ngModel)]="editandoPastaNome"
                        (keydown.enter)="confirmarRenomear(p)"
                        (keydown.escape)="editandoPastaId = null"
                        [disabled]="busyPastaId === p.id"
                        style="flex:1;min-width:0" />
                      @if (busyPastaId === p.id) {
                        <span class="sm-spinner"></span>
                      } @else {
                        <button class="sm-btn sm-btn--primary sm-btn--xs" type="button" (click)="confirmarRenomear(p)">Ok</button>
                        <button class="sm-btn sm-btn--xs" type="button" (click)="editandoPastaId = null">✕</button>
                      }
                    } @else {
                      <button
                        class="sm-pasta-item"
                        [class.sm-pasta-item--active]="pastaAtiva?.id === p.id"
                        type="button"
                        (click)="selecionarPasta(p)">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                        <span class="sm-pasta-nome">{{ p.nome }}</span>
                        <span class="sm-badge">{{ p.totalCenarios }}</span>
                      </button>
                      @if (busyPastaId === p.id) {
                        <span class="sm-spinner"></span>
                      } @else {
                        <button class="sm-icon-btn sm-icon-btn--xs" type="button" (click)="iniciarRenomear(p)" title="Renomear">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                        </button>
                        <button class="sm-icon-btn sm-icon-btn--xs sm-icon-btn--danger" type="button" (click)="excluirPasta(p)" title="Excluir pasta">
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
                        </button>
                      }
                    }
                  </div>
                }
              </div>
            </aside>

            <!-- ─ Coluna direita: cenários ─ -->
            <main class="sm-content">
              <!-- Salvar novo cenário -->
              <div class="sm-save-row">
                <input
                  class="sm-input"
                  [(ngModel)]="novoCenarioNome"
                  [placeholder]="savePlaceholder"
                  (keydown.enter)="salvarCenario()" />
                <button
                  class="sm-btn sm-btn--primary"
                  type="button"
                  (click)="salvarCenario()"
                  [disabled]="!novoCenarioNome.trim() || loading">
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  Salvar
                </button>
              </div>

              <!-- Lista de cenários -->
              <div class="sm-cenario-list">
                @if (loading) {
                  <p class="sm-empty">Carregando...</p>
                } @else if (cenarios.length === 0) {
                  <p class="sm-empty">
                    {{ pastaAtiva ? 'Nenhum cenário nesta pasta.' : 'Nenhum cenário sem pasta.' }}
                  </p>
                }
                @for (c of cenarios; track c.id) {
                  <div class="sm-cenario-item" [class.sm-cenario-item--selected]="selectedId === c.id" (click)="selectedId = c.id">
                    <div class="sm-cenario-info">
                      <strong>{{ c.nome }}</strong>
                      <span>{{ formatDate(c.atualizadoEm) }} · {{ c.criadoPor }}</span>
                    </div>
                    <div class="sm-cenario-actions">
                      @if (busyId === c.id) {
                        <span class="sm-spinner" title="Processando..."></span>
                      } @else {
                        <button class="sm-btn sm-btn--primary sm-btn--xs" type="button" (click)="carregar(c); $event.stopPropagation()">
                          Carregar
                        </button>
                        <button class="sm-icon-btn sm-icon-btn--xs sm-icon-btn--blue" type="button" title="Atualizar com dados atuais" (click)="atualizarCenario(c); $event.stopPropagation()">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                        </button>
                        <button class="sm-icon-btn sm-icon-btn--xs sm-icon-btn--danger" type="button" title="Excluir" (click)="excluirCenario(c); $event.stopPropagation()">
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                        </button>
                      }
                    </div>
                  </div>
                }
              </div>
            </main>

          </div>

        </section>
      </div>
    }
  `,
  styles: [`
    .sm-backdrop {
      position: fixed; inset: 0; background: rgba(15,23,42,.5);
      backdrop-filter: blur(4px); z-index: 400;
      display: flex; align-items: center; justify-content: center; padding: 16px;
    }
    .sm-modal {
      background: #fff; border-radius: 14px;
      box-shadow: 0 24px 64px rgba(0,0,0,.2);
      width: min(780px, 96vw); max-height: 82vh;
      display: flex; flex-direction: column; overflow: hidden;
    }

    /* Head */
    .sm-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 20px 24px 14px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
    }
    .sm-eyebrow {
      display: block; font-size: .7rem; font-weight: 700;
      text-transform: uppercase; letter-spacing: .08em; color: #4291e1; margin-bottom: 2px;
    }
    .sm-head h2 { margin: 0; font-size: 1.05rem; font-weight: 700; color: #1e293b; }

    /* Body (2 colunas) */
    .sm-body { display: flex; flex: 1; overflow: hidden; }

    /* Sidebar pastas */
    .sm-sidebar {
      width: 210px; flex-shrink: 0; border-right: 1px solid #e2e8f0;
      display: flex; flex-direction: column; overflow: hidden;
    }
    .sm-sidebar-head {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 14px 8px; flex-shrink: 0;
    }
    .sm-section-label {
      font-size: .7rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .08em; color: #94a3b8;
    }
    .sm-pasta-list { flex: 1; overflow-y: auto; padding: 4px 8px 12px; display: flex; flex-direction: column; gap: 4px; }
    .sm-pasta-row {
      display: flex; align-items: center; gap: 2px;
      border-radius: 8px; overflow: hidden;
    }
    .sm-pasta-row:hover .sm-icon-btn--xs { opacity: 1; }
    .sm-pasta-item {
      flex: 1; display: flex; align-items: center; gap: 7px;
      padding: 10px 10px; border: none; border-radius: 8px;
      background: transparent; color: #475569; font: inherit;
      font-size: .82rem; cursor: pointer; text-align: left;
      transition: background .12s, color .12s; min-width: 0;
    }
    .sm-pasta-item:hover { background: #f1f5f9; }
    .sm-pasta-item--active { background: #eff6ff; color: #2563eb; font-weight: 600; }
    .sm-pasta-nome { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .sm-badge {
      font-size: .68rem; font-weight: 700; color: #94a3b8;
      background: #f1f5f9; border-radius: 99px; padding: 1px 6px; flex-shrink: 0;
    }
    .sm-pasta-item--active .sm-badge { background: #dbeafe; color: #2563eb; }

    .sm-inline-form {
      display: flex; gap: 4px; align-items: center;
      padding: 4px 8px 8px; flex-shrink: 0;
    }

    /* Content */
    .sm-content { flex: 1; display: flex; flex-direction: column; overflow: hidden; min-width: 0; }
    .sm-save-row {
      display: flex; gap: 8px; align-items: center;
      padding: 12px 16px; border-bottom: 1px solid #f1f5f9; flex-shrink: 0;
    }
    .sm-cenario-list { flex: 1; overflow-y: auto; padding: 10px 16px 16px; display: flex; flex-direction: column; gap: 6px; }
    .sm-empty { color: #94a3b8; font-size: .85rem; text-align: center; padding: 28px 0; margin: 0; }
    .sm-cenario-item {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      padding: 10px 12px; border: 1.5px solid #e2e8f0; border-radius: 10px;
      cursor: pointer; transition: border-color .12s, background .12s;
    }
    .sm-cenario-item:hover { border-color: #93c5fd; background: #f8fbff; }
    .sm-cenario-item--selected { border-color: #3b82f6; background: #eff6ff; }
    .sm-cenario-info { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .sm-cenario-info strong { font-size: .875rem; color: #1e293b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sm-cenario-info span { font-size: .72rem; color: #94a3b8; }
    .sm-cenario-actions { display: flex; gap: 4px; flex-shrink: 0; align-items: center; }

    /* Buttons */
    .sm-btn {
      display: inline-flex; align-items: center; gap: 5px; padding: 7px 14px;
      border: 1px solid #e2e8f0; border-radius: 7px; background: #f8fafc;
      color: #475569; font: inherit; font-size: .82rem; font-weight: 600;
      cursor: pointer; white-space: nowrap; transition: background .12s, color .12s;
    }
    .sm-btn:disabled { opacity: .45; cursor: not-allowed; }
    .sm-btn--primary { background: #4291e1; color: #fff; border-color: #4291e1; }
    .sm-btn--primary:hover:not(:disabled) { background: #2563eb; border-color: #2563eb; }
    .sm-btn--xs { padding: 4px 9px; font-size: .75rem; border-radius: 5px; }

    .sm-icon-btn {
      display: flex; align-items: center; justify-content: center;
      width: 30px; height: 30px; border: none; border-radius: 7px;
      background: transparent; color: #94a3b8; cursor: pointer;
      transition: background .12s, color .12s; flex-shrink: 0;
    }
    .sm-icon-btn:hover { background: #f1f5f9; color: #475569; }
    .sm-icon-btn--sm { width: 24px; height: 24px; border-radius: 5px; }
    .sm-icon-btn--xs { width: 22px; height: 22px; border-radius: 5px; opacity: 0; transition: opacity .12s; }
    .sm-cenario-item .sm-icon-btn--xs,
    .sm-pasta-row:hover .sm-icon-btn--xs { opacity: 1; }
    .sm-icon-btn--blue { color: #3b82f6; }
    .sm-icon-btn--blue:hover { background: #eff6ff; color: #2563eb; }
    .sm-icon-btn--danger { color: #ef4444; }
    .sm-icon-btn--danger:hover { background: #fef2f2; color: #dc2626; }

    .sm-input {
      flex: 1; padding: 8px 11px; border: 1.5px solid #cbd5e1; border-radius: 7px;
      font: inherit; font-size: .85rem; outline: none; min-width: 0;
      transition: border-color .15s;
    }
    .sm-input:focus { border-color: #4291e1; }
    .sm-input--sm { padding: 5px 8px; font-size: .8rem; }
    .sm-erro { background:#fef2f2; color:#dc2626; font-size:.8rem; padding:8px 20px; border-bottom:1px solid #fecaca; flex-shrink:0; }

    .sm-spinner {
      width: 16px; height: 16px; border-radius: 50%;
      border: 2px solid #dbeafe; border-top-color: #4291e1;
      animation: sm-spin .6s linear infinite; flex-shrink: 0; margin: 5px;
    }
    @keyframes sm-spin { to { transform: rotate(360deg); } }
  `],
})
export class SimuladorStateModalComponent implements OnChanges {
  @Input() open = false;
  @Input() operacao: 'tampao' | 'squeeze' = 'tampao';
  @Output() closed = new EventEmitter<void>();
  @Output() carregar$ = new EventEmitter<Record<string, unknown>>();

  pastas: PastaApi[] = [];
  cenarios: CenarioApi[] = [];
  pastaAtiva: PastaApi | null = null;
  semPastaCount = 0;

  novaCenarioNome_legacy = '';
  novoCenarioNome = '';
  novaPastaNome = '';
  editandoPastaId: number | null = null;
  editandoPastaNome = '';
  selectedId: number | null = null;
  view: View = 'list';
  loading = false;
  busyId: number | null = null;
  busyPastaId: number | null = null;
  erro = '';

  private pendingFormValue: Record<string, unknown> = {};

  get savePlaceholder(): string {
    return this.pastaAtiva ? `Salvar em "${this.pastaAtiva.nome}"...` : 'Nome do cenário...';
  }

  constructor(
    private api: SimuladorStateApiService,
    private cdr: ChangeDetectorRef,
    private toast: ToastService,
  ) {}

  ngOnChanges(): void {
    if (this.open) {
      this.novoCenarioNome = '';
      this.novaPastaNome = '';
      this.selectedId = null;
      this.view = 'list';
      this.editandoPastaId = null;
      this.carregarPastas();
    }
  }

  setCurrentForm(value: Record<string, unknown>): void {
    this.pendingFormValue = value;
  }

  private setErro(msg: string): void {
    this.erro = msg;
    this.toast.error(msg);
    setTimeout(() => this.erro = '', 5000);
  }

  private carregarPastas(): void {
    this.loading = true;
    this.erro = '';
    this.api.listarPastas(this.operacao).pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: pastas => {
        this.pastas = pastas;
        this.cdr.detectChanges();
        this.carregarCenarios();
      },
      error: (e) => { this.setErro(`Erro ao carregar pastas (${e?.status ?? 'sem conexão'}). Verifique se o backend está rodando.`); this.cdr.detectChanges(); },
    });
  }

  private carregarCenarios(): void {
    this.loading = true;
    const req = this.pastaAtiva
      ? this.api.listarCenarios(this.operacao, this.pastaAtiva.id)
      : this.api.listarSemPasta(this.operacao);

    req.pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); })).subscribe({
      next: cenarios => {
        this.cenarios = cenarios;
        if (!this.pastaAtiva) this.semPastaCount = cenarios.length;
        this.cdr.detectChanges();
      },
      error: (e) => { this.setErro(`Erro ao carregar cenários (${e?.status ?? 'sem conexão'})`); this.cdr.detectChanges(); },
    });

    // Atualiza contagem "sem pasta" sempre
    if (this.pastaAtiva) {
      this.api.listarSemPasta(this.operacao).subscribe({ next: c => { this.semPastaCount = c.length; this.cdr.detectChanges(); } });
    }
  }

  selecionarPasta(pasta: PastaApi | null): void {
    this.pastaAtiva = pasta;
    this.selectedId = null;
    this.carregarCenarios();
  }

  // ── Pastas ──
  iniciarNovaPasta(): void {
    this.novaPastaNome = '';
    this.view = 'nova-pasta';
  }

  salvarPasta(): void {
    if (!this.novaPastaNome.trim()) return;
    this.loading = true;
    this.api.criarPasta(this.novaPastaNome.trim(), this.operacao)
      .pipe(finalize(() => { this.loading = false; this.cdr.detectChanges(); }))
      .subscribe({
        next: pasta => {
          this.pastas = [...this.pastas, pasta].sort((a, b) => a.nome.localeCompare(b.nome));
          this.novaPastaNome = '';
        this.view = 'list';
        this.cdr.detectChanges();
        this.toast.success('Pasta criada com sucesso.');
        this.selecionarPasta(pasta);
      },
        error: (e) => { this.setErro(`Erro ao criar pasta (${e?.status ?? 'sem conexão'})`); this.cdr.detectChanges(); },
      });
  }

  iniciarRenomear(pasta: PastaApi): void {
    this.editandoPastaId = pasta.id;
    this.editandoPastaNome = pasta.nome;
  }

  confirmarRenomear(pasta: PastaApi): void {
    if (!this.editandoPastaNome.trim()) return;
    this.busyPastaId = pasta.id;
    this.cdr.detectChanges();
    this.api.renomearPasta(pasta.id, this.editandoPastaNome.trim(), this.operacao)
      .pipe(finalize(() => { this.busyPastaId = null; this.cdr.detectChanges(); }))
      .subscribe({
        next: updated => {
          this.pastas = this.pastas.map(p => p.id === pasta.id ? updated : p).sort((a, b) => a.nome.localeCompare(b.nome));
          if (this.pastaAtiva?.id === pasta.id) this.pastaAtiva = updated;
          this.editandoPastaId = null;
          this.toast.success('Pasta renomeada com sucesso.');
          this.cdr.detectChanges();
        },
        error: (e) => { this.setErro(`Erro ao renomear pasta (${e?.status ?? 'sem conexão'})`); this.cdr.detectChanges(); },
      });
  }

  excluirPasta(pasta: PastaApi): void {
    if (!confirm(`Excluir pasta "${pasta.nome}" e todos os cenários dentro?`)) return;
    this.busyPastaId = pasta.id;
    this.cdr.detectChanges();
    this.api.excluirPasta(pasta.id).pipe(finalize(() => { this.busyPastaId = null; this.cdr.detectChanges(); })).subscribe({
      next: () => {
        this.pastas = this.pastas.filter(p => p.id !== pasta.id);
        if (this.pastaAtiva?.id === pasta.id) this.selecionarPasta(null);
        this.toast.success('Pasta excluída com sucesso.');
        this.cdr.detectChanges();
      },
      error: (e) => { this.setErro(`Erro ao excluir pasta (${e?.status ?? 'sem conexão'})`); this.cdr.detectChanges(); },
    });
  }

  // ── Cenários ──
  salvarCenario(): void {
    if (!this.novoCenarioNome.trim()) return;
    this.loading = true;
    this.api.criarCenario({
      nome: this.novoCenarioNome.trim(),
      operacao: this.operacao,
      pastaId: this.pastaAtiva?.id ?? null,
      formValue: JSON.stringify(this.pendingFormValue),
      dadosRelatorio: null,
    }).pipe(finalize(() => this.loading = false)).subscribe({
      error: (e) => { this.setErro(`Erro ao salvar cenário (${e?.status ?? 'sem conexão'})`); this.cdr.detectChanges(); },
      next: cenario => {
        this.cenarios = [cenario, ...this.cenarios];
        this.novoCenarioNome = '';
        // Atualiza contagem da pasta
        if (this.pastaAtiva) {
          const idx = this.pastas.findIndex(p => p.id === this.pastaAtiva!.id);
          if (idx >= 0) this.pastas = this.pastas.map((p, i) => i === idx ? { ...p, totalCenarios: p.totalCenarios + 1 } : p);
        } else {
          this.semPastaCount++;
        }
        this.toast.success('Cenário salvo com sucesso.');
        this.cdr.detectChanges();
      },
    });
  }

  carregar(c: CenarioApi): void {
    try {
      const formValue = JSON.parse(c.formValue) as Record<string, unknown>;
      this.carregar$.emit(formValue);
      this.toast.success('Cenário carregado com sucesso.');
      this.fechar();
    } catch {
      this.setErro('Não foi possível carregar o cenário selecionado.');
    }
  }

  atualizarCenario(c: CenarioApi): void {
    if (!confirm(`Atualizar o cenário "${c.nome}" com os dados atuais? Os dados salvos serão substituídos.`)) return;
    this.busyId = c.id;
    this.cdr.detectChanges();
    this.api.atualizarCenario(c.id, {
      nome: c.nome,
      operacao: this.operacao,
      pastaId: c.pastaId,
      formValue: JSON.stringify(this.pendingFormValue),
      dadosRelatorio: c.dadosRelatorio,
    }).pipe(finalize(() => { this.busyId = null; this.cdr.detectChanges(); })).subscribe({
      next: updated => {
        this.cenarios = this.cenarios.map(x => x.id === c.id ? updated : x);
        this.toast.success('Cenário atualizado com sucesso.');
        this.cdr.detectChanges();
      },
      error: (e) => { this.setErro(`Erro ao atualizar cenário (${e?.status ?? 'sem conexão'})`); this.cdr.detectChanges(); },
    });
  }

  excluirCenario(c: CenarioApi): void {
    if (!confirm(`Excluir o cenário "${c.nome}"? Esta ação não pode ser desfeita.`)) return;
    this.busyId = c.id;
    this.cdr.detectChanges();
    this.api.excluirCenario(c.id).pipe(finalize(() => { this.busyId = null; this.cdr.detectChanges(); })).subscribe({
      next: () => {
        this.cenarios = this.cenarios.filter(x => x.id !== c.id);
        if (this.selectedId === c.id) this.selectedId = null;
        if (!this.pastaAtiva) this.semPastaCount = Math.max(0, this.semPastaCount - 1);
        else {
          this.pastas = this.pastas.map(p => p.id === this.pastaAtiva!.id
            ? { ...p, totalCenarios: Math.max(0, p.totalCenarios - 1) } : p);
        }
        this.toast.success('Cenário excluído com sucesso.');
        this.cdr.detectChanges();
      },
      error: (e) => { this.setErro(`Erro ao excluir cenário (${e?.status ?? 'sem conexão'})`); this.cdr.detectChanges(); },
    });
  }

  fechar(): void { this.closed.emit(); }

  formatDate(iso: string): string {
    try {
      return new Date(iso).toLocaleString('pt-BR', {
        day: '2-digit', month: '2-digit', year: '2-digit',
        hour: '2-digit', minute: '2-digit',
      });
    } catch { return iso; }
  }
}
