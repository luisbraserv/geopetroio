import { ChangeDetectorRef, Component, EventEmitter, Input, OnChanges, Output, inject, DestroyRef } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Observable, finalize } from 'rxjs';
import { PocoApi, PocoGeometry, samePocoGeometry } from '../../models/poco.model';
import { PocoApiService } from '../../services/poco-api.service';
import { WellGeometryService } from '../../services/well-geometry.service';
import { buildWellGeometry } from '../../models/well-geometry.form';
import { trajectoryFromForm } from '../../models/well-trajectory.form';

@Component({
  selector: 'app-poco-selector',
  standalone: true,
  imports: [FormsModule],
  template: `
    <fieldset>
      <legend>Cadastro de poços</legend>
      @if (poco) {
        <p><strong>{{ poco.nome }}</strong> · versão {{ poco.version }} · {{ poco.atualizadoPor }}</p>
        @if (dirty) { <p class="warning">Geometria alterada na tela. Salve no poço antes de salvar o cenário vinculado.</p> }
        <p>Salvar a geometria neste poço atualiza todos os cenários vinculados, inclusive os relatórios.</p>
      } @else { <p>Geometria sem vínculo. Cadastre um poço ou carregue um existente para reutilizá-la.</p> }
      <div class="row">
        <button type="button" (click)="list()" [disabled]="busy">Buscar poços</button>
        <select aria-label="Poço cadastrado" [(ngModel)]="selectedId" [ngModelOptions]="{standalone:true}" [disabled]="busy">
          <option value="">Selecione um poço</option>
          @for (item of pocos; track item.id) { <option [value]="item.id">{{ item.nome }}</option> }
        </select>
        <button type="button" (click)="load()" [disabled]="busy || !selectedId">Carregar</button>
      </div>
      <label>Nome do poço
        <input type="text" maxlength="255" [(ngModel)]="nome" [ngModelOptions]="{standalone:true}" [disabled]="busy">
      </label>
      <div class="row">
        <button type="button" (click)="save(false)" [disabled]="busy || !nome.trim()">Cadastrar como novo poço</button>
        @if (poco) {
          <button type="button" (click)="save(true)" [disabled]="busy || !nome.trim()">Salvar alterações no poço</button>
          <button type="button" (click)="reload()" [disabled]="busy">Recarregar poço</button>
          <button type="button" (click)="changed.emit(null)" [disabled]="busy">Usar sem vínculo</button>
          <button type="button" (click)="remove()" [disabled]="busy">Excluir poço</button>
        }
      </div>
      @if (message) { <p role="status">{{ message }}</p> }
      @if (error) { <p role="alert" class="warning">{{ error }}</p> }
    </fieldset>
  `,
  styles: [`
    fieldset { border: 1px solid #cbd5e1; border-radius: 8px; margin: 8px 0 14px; padding: 10px; }
    legend { font-weight: 700; }
    p, label, legend { font-size: .75rem; line-height: 1.5; }
    .row { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
    input, select, button { font: inherit; font-size: .75rem; padding: 6px; border: 1px solid #cbd5e1; border-radius: 5px; max-width: 100%; }
    label, input { display: block; } input { width: 100%; box-sizing: border-box; }
    button { background: #eff6ff; cursor: pointer; } button:disabled { opacity: .5; cursor: default; }
    select { min-width: 0; flex: 1; } .warning { color: #991b1b; }
  `],
})
export class PocoSelectorComponent implements OnChanges {
  @Input({ required: true }) geometry!: PocoGeometry;
  @Input() poco: PocoApi | null = null;
  @Output() changed = new EventEmitter<PocoApi | null>();
  private readonly api = inject(PocoApiService);
  private readonly wellGeo = inject(WellGeometryService);
  private readonly cdr = inject(ChangeDetectorRef);
  private readonly destroyRef = inject(DestroyRef);
  pocos: PocoApi[] = [];
  selectedId = '';
  nome = '';
  busy = false;
  error = '';
  message = '';
  ngOnChanges(changes: import('@angular/core').SimpleChanges): void {
    if (changes['poco']) {
      this.nome = this.poco?.nome ?? '';
      this.selectedId = this.poco ? String(this.poco.id) : '';
      if (this.poco) this.remember(this.poco);
    }
  }
  get dirty(): boolean { return !!this.poco && !samePocoGeometry(this.geometry, this.poco.geometria); }
  private remember(poco: PocoApi): void {
    this.pocos = [...this.pocos.filter(p => p.id !== poco.id), poco].sort((a, b) => a.nome.localeCompare(b.nome));
  }
  private run<T>(request: Observable<T>, next: (result: T) => void): void {
    this.busy = true; this.error = ''; this.message = '';
    request.pipe(takeUntilDestroyed(this.destroyRef), finalize(() => { this.busy = false; this.cdr.markForCheck(); })).subscribe({
      next,
      error: e => { this.error = e.error?.message ?? 'Não foi possível acessar o cadastro de poços.'; },
    });
  }
  list(): void { if (!this.busy) this.run(this.api.list(), list => { this.pocos = list; }); }
  load(): void {
    if (this.busy || !this.selectedId) return;
    if (!confirm('Carregar este poço substituirá a geometria da tela. Continuar?')) return;
    this.fetch(Number(this.selectedId));
  }
  reload(): void {
    if (!this.poco || this.busy) return;
    if (this.dirty && !confirm('Descartar as alterações da geometria e recarregar o poço?')) return;
    this.fetch(this.poco.id);
  }
  private fetch(id: number): void {
    const snapshot = structuredClone(this.geometry);
    const currentId = this.poco?.id;
    this.run(this.api.get(id), poco => {
      this.remember(poco);
      if (this.poco?.id !== currentId || !samePocoGeometry(this.geometry, snapshot)) {
        this.error = 'A geometria mudou durante o carregamento. Carregue novamente para substituir os dados da tela.';
        return;
      }
      this.changed.emit(poco); this.message = 'Poço carregado.';
    });
  }
  save(update: boolean): void {
    if (this.busy || !this.nome.trim() || (update && !this.poco)) return;
    const g = buildWellGeometry(this.geometry.wellFinalMD, this.geometry.wellFinalTVD, this.geometry.fases);
    g.trajectory = trajectoryFromForm(this.geometry.trajectory);
    const errors = this.wellGeo.validate(this.wellGeo.deriveTrajectoryTvd(g)).filter(i => i.level === 'error');
    if (errors.length) { this.error = errors.map(e => e.message).join(' '); return; }
    if (update && !confirm('Salvar a geometria atualizará todos os cenários deste poço e seus relatórios. Continuar?')) return;
    const snapshot = structuredClone(this.geometry);
    const currentId = this.poco?.id;
    const request = update ? this.api.update(this.poco!, this.nome.trim(), snapshot) : this.api.create(this.nome.trim(), snapshot);
    this.run(request, poco => {
      this.remember(poco);
      if (this.poco?.id !== currentId || !samePocoGeometry(this.geometry, snapshot)) {
        this.error = 'O poço foi salvo, mas a geometria mudou durante o envio. Suas edições continuam na tela; recarregue o poço antes de salvar novamente.';
        return;
      }
      this.changed.emit(poco); this.message = 'Poço salvo.';
    });
  }
  remove(): void {
    if (!this.poco || this.busy || !confirm('Excluir este poço? A exclusão será bloqueada se houver cenários vinculados.')) return;
    const id = this.poco.id;
    this.run(this.api.delete(id), () => {
      this.pocos = this.pocos.filter(p => p.id !== id); this.changed.emit(null); this.message = 'Poço excluído.';
    });
  }
}
