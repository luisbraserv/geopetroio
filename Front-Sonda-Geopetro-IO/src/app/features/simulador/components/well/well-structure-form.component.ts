import { DepthUnit, formatDepthNumber } from '../../models/depth-unit';
import { DepthInputDirective } from './depth-input.directive';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormArray, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TuiButton } from '@taiga-ui/core';
import { WellGeometry, WellGeometryIssue, WellPhaseType } from '../../models/well-geometry.model';
import { ApiTubular } from '../../models/api-tubulares';

/** Rótulos dos tipos de fase, na ordem em que aparecem no poço. */
export const WELL_PHASE_TYPES: { value: WellPhaseType; label: string }[] = [
  { value: 'CONDUCTOR', label: 'Condutor' },
  { value: 'SURFACE', label: 'Superfície' },
  { value: 'INTERMEDIATE', label: 'Intermediária' },
  { value: 'PRODUCTION', label: 'Produção' },
  { value: 'OPEN_HOLE', label: 'Poço aberto' },
];

/**
 * Cadastro da estrutura física do poço: uma linha por fase, com revestimento e
 * sapata. Não corrige nada em silêncio — os problemas encontrados pelo
 * `WellGeometryService` chegam por `issues` e são exibidos ao usuário.
 */
@Component({
  selector: 'app-well-structure-form',
  standalone: true,
  imports: [DepthInputDirective, CommonModule, ReactiveFormsModule, TuiButton],
  template: `
    <p class="acc-hint">
      Estrutura física do poço. A base de uma fase deve coincidir com o topo da seguinte —
      a operação (tampão/squeeze) é posicionada dentro dessa estrutura, não a define.
    </p>

    @if (issues.length) {
      <div class="wsf-issues">
        @for (issue of issues; track issue.code + issue.message) {
          <div class="wsf-issue" [class.wsf-issue--warn]="issue.level === 'warning'">
            <span class="wsf-issue-dot"></span>{{ issue.message }}
          </div>
        }
      </div>
    }

    <div class="wsf-list">
      @for (phase of phases.controls; track phase; let i = $index) {
        <div class="wsf-phase" [formGroup]="asGroup(phase)">
          <div class="wsf-phase-head">
            <span class="wsf-phase-index">{{ i + 1 }}</span>
            <input type="text" formControlName="name" class="wsf-name" placeholder="Nome da fase">
            <button tuiButton type="button" class="btn-rm" (click)="remove.emit(i)"
              [disabled]="phases.length <= 1" title="Remover fase">✕</button>
          </div>

          <div class="g2">
            <div class="col-span-2">
              <label>Tipo</label>
              <select formControlName="type">
                @for (t of phaseTypes; track t.value) {
                  <option [value]="t.value">{{ t.label }}</option>
                }
              </select>
            </div>
            <div><label>Topo (MD, {{ depthUnit }})</label><input type="number" step="1" formControlName="topMD" [appDepthInput]="depthUnit"></div>
            <div><label>Base (MD, {{ depthUnit }})</label><input type="number" step="1" formControlName="bottomMD" [appDepthInput]="depthUnit"></div>
            <div><label>Topo (TVD, {{ depthUnit }})</label>
              @if (derivedGeometry) { <output>{{ depth(derivedGeometry.phases[i]?.topTVD) }}</output> }
              @else { <input type="number" step="1" formControlName="topTVD" [appDepthInput]="depthUnit"> }
            </div>
            <div><label>Base (TVD, {{ depthUnit }})</label>
              @if (derivedGeometry) { <output>{{ depth(derivedGeometry.phases[i]?.bottomTVD) }}</output> }
              @else { <input type="number" step="1" formControlName="bottomTVD" [appDepthInput]="depthUnit"> }
            </div>
            <div class="col-span-2"><label>Diâmetro do poço (pol)</label><input type="number" step="0.001" formControlName="holeDiameterIn"></div>
            @if (casingOptions.length) {
              <div class="col-span-2">
                <label>Revestimento (API)</label>
                <select (change)="onCasingSelect(i, $any($event.target).value)">
                  <option value="">— sem revestimento —</option>
                  @for (c of casingOptions; track $index) {
                    <option [value]="$index"
                      [selected]="c.odIn === phase.value.casingOD && c.idIn === phase.value.casingID">
                      {{ c.odIn }}" — {{ c.weightLbFt }} lb/ft &nbsp;(ID {{ c.idIn }}")
                    </option>
                  }
                </select>
              </div>
            }
            <div><label>OD revestimento (pol)</label><input type="number" step="0.001" formControlName="casingOD" placeholder="—"></div>
            <div><label>ID revestimento (pol)</label><input type="number" step="0.001" formControlName="casingID" placeholder="—"></div>
            <div><label>Sapata (MD, {{ depthUnit }})</label><input type="number" step="1" formControlName="shoeMD" [appDepthInput]="depthUnit" placeholder="—"></div>
            <div><label>Sapata (TVD, {{ depthUnit }})</label>
              @if (derivedGeometry) { <output>{{ depth(derivedGeometry.phases[i]?.shoe?.tvd) }}</output> }
              @else { <input type="number" step="1" formControlName="shoeTVD" [appDepthInput]="depthUnit" placeholder="—"> }
            </div>
          </div>
        </div>
      }
    </div>

    <button tuiButton type="button" class="btn btn--ghost btn--sm" (click)="add.emit()">
      + Adicionar fase
    </button>
  `,
  styles: [`
    .acc-hint { margin: 0 0 10px; font-size: 11px; line-height: 1.4; color: #64748b; background: #f1f5f9; border-radius: 6px; padding: 7px 9px; }
    .wsf-list { display: flex; flex-direction: column; gap: 10px; margin-bottom: 8px; }
    .wsf-phase { border: 1px solid rgba(77, 87, 97, .18); border-radius: 8px; padding: 9px; background: rgba(255,255,255,.6); }
    .wsf-phase-head { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
    .wsf-phase-index { flex-shrink: 0; width: 20px; height: 20px; border-radius: 50%; background: #e2e8f0; color: #475569; font-size: .68rem; font-weight: 800; display: inline-flex; align-items: center; justify-content: center; }
    .wsf-name { flex: 1; min-width: 0; }
    .btn-rm { flex-shrink: 0; }

    .g2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
    .col-span-2 { grid-column: span 2; }
    label { display: block; margin-bottom: 4px; color: var(--color-text-body); font-size: .7rem; font-weight: 750; line-height: 1.25; }
    input[type="number"], input[type="text"], select {
      width: 100%; min-height: 30px; box-sizing: border-box; padding: 5px 7px;
      border: 1px solid rgba(77, 87, 97, .22); border-radius: 8px; background: rgba(255,255,255,.86);
      color: var(--color-text-strong); font: inherit; font-size: .76rem; line-height: 1.25;
    }
    input:focus, select:focus { outline: none; border-color: var(--color-focus); background: #fff; box-shadow: 0 0 0 3px rgba(66,145,225,.15); }

    .wsf-issues { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; }
    .wsf-issue { display: flex; align-items: flex-start; gap: 6px; font-size: .69rem; line-height: 1.35; color: #991b1b; background: #fee2e2; border: 1px solid #fecaca; border-radius: 6px; padding: 6px 8px; }
    .wsf-issue--warn { color: #854d0e; background: #fef9c3; border-color: #fde68a; }
    .wsf-issue-dot { flex-shrink: 0; width: 6px; height: 6px; margin-top: 5px; border-radius: 50%; background: currentColor; }
  `],
})
export class WellStructureFormComponent {
  @Input() depthUnit: DepthUnit = 'm';
  depth(value: number | null | undefined): string { return formatDepthNumber(value, this.depthUnit, 2); }
  @Input({ required: true }) phases!: FormArray;
  @Input() derivedGeometry: WellGeometry | null = null;
  @Input() issues: WellGeometryIssue[] = [];
  /** Catálogo API para preencher OD/ID do revestimento da fase. */
  @Input() casingOptions: ApiTubular[] = [];
  @Output() add = new EventEmitter<void>();
  @Output() remove = new EventEmitter<number>();

  readonly phaseTypes = WELL_PHASE_TYPES;

  asGroup(control: unknown): FormGroup { return control as FormGroup; }

  /** Preenche OD/ID da fase a partir do catálogo; vazio limpa o revestimento. */
  onCasingSelect(index: number, option: string): void {
    const group = this.asGroup(this.phases.at(index));
    if (option === '') {
      group.patchValue({ casingOD: null, casingID: null });
      return;
    }
    const casing = this.casingOptions[+option];
    if (casing) group.patchValue({ casingOD: casing.odIn, casingID: casing.idIn });
  }
}
