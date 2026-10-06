import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { WellPhaseFormValue } from '../../models/well-geometry.form';
import { DepthUnit, formatDepthNumber } from '../../models/depth-unit';

@Component({
  selector: 'app-operation-phase-selector', standalone: true,
  template: `
    <label>Fase da operação
      <select aria-label="Fase da operação" [value]="selectedPhaseId ?? ''"
        (change)="selectedPhaseIdChange.emit($any($event.target).value || null)">
        <option value="">Selecione a fase da operação</option>
        @if (selectedPhaseId && !exists) {
          <option [value]="selectedPhaseId">Fase indisponível — selecione novamente</option>
        }
        @for (phase of phases; track phase.id) {
          <option [value]="phase.id">{{ phase.name }} · {{ depth(phase.topMD) }}–{{ depth(phase.bottomMD) }} {{ depthUnit }} MD</option>
        }
      </select>
    </label>
    <small>Cadastre as fases acima e selecione onde esta operação será realizada.</small>
  `,
  styles: [`:host{display:block;margin-top:12px}label{display:flex;flex-direction:column;gap:5px;font-size:.75rem;font-weight:650}select{width:100%;min-height:36px;padding:6px;border:1px solid var(--color-card-border);border-radius:6px;background:var(--color-card-bg,#fff);color:var(--color-text-strong);font:inherit}small{display:block;margin-top:5px;font-size:.7rem;color:var(--color-text-body)}`],
})
export class OperationPhaseSelectorComponent {
  @Input() phases: WellPhaseFormValue[] = [];
  @Input() selectedPhaseId: string | null = null;
  @Input() depthUnit: DepthUnit = 'm';
  @Output() selectedPhaseIdChange = new EventEmitter<string | null>();
  get exists(): boolean { return this.phases.some(phase => phase.id === this.selectedPhaseId); }
  depth(value: number | null): string { return formatDepthNumber(value, this.depthUnit, 1); }
}
