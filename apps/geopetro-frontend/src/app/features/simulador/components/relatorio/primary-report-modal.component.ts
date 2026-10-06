import { Component, EventEmitter, Input, Output } from '@angular/core';
import { CdkTrapFocus } from '@angular/cdk/a11y';
import type { PrimaryReport } from '../../services/primary-report';
import type { PrimaryReportVisual } from '../../services/primary-well-visuals';

@Component({
  selector: 'app-primary-report-modal', standalone: true, imports: [CdkTrapFocus],
  template: `@if (open && report) {
    <div class="backdrop" (click)="closed.emit()">
      <section role="dialog" aria-modal="true" aria-label="Relat&oacute;rio de cimenta&ccedil;&atilde;o prim&aacute;ria"
        cdkTrapFocus [cdkTrapFocusAutoCapture]="true" (click)="$event.stopPropagation()" (keydown.escape)="closed.emit()">
        <header><h2>Relat&oacute;rio de cimenta&ccedil;&atilde;o prim&aacute;ria</h2><button type="button" aria-label="Fechar" (click)="closed.emit()">&#10005;</button></header>
        <p>{{ report.canIssue ? 'Relatorio disponivel para emissao.' : 'Previa em rascunho. Corrija os itens abaixo para emitir o relatorio final.' }}</p>
        @if (report.blockingReasons.length) { <ul role="status">@for (reason of report.blockingReasons; track reason) {<li>{{ reason }}</li>}</ul> }
        <p>A pr&eacute;via inclui identifica&ccedil;&atilde;o, fase, sequ&ecirc;ncia operacional e receitas por pasta e est&aacute;gio.</p>
        @if (visuals.length) {
          <label class="phase-select">Fase dos desenhos e gr&aacute;ficos
            <select [value]="selectedPhaseId" (change)="phaseChanged.emit($any($event.target).value)">
              @for (phase of phaseOptions; track phase.id) { <option [value]="phase.id">{{ phase.name }}</option> }
            </select>
          </label>
          <fieldset><legend>Desenhos e gr&aacute;ficos opcionais</legend>
            @for (visual of visuals; track visual.id) {
              <label><input type="checkbox" [checked]="selection[visual.id] !== false"
                (change)="visualChanged.emit({ id: visual.id, checked: $any($event.target).checked })"> {{ visual.title }}</label>
            }
          </fieldset>
        }
        <footer><button type="button" (click)="preview.emit()">Visualizar {{ report.canIssue ? 'relatorio' : 'rascunho' }}</button>
          <button type="button" [disabled]="!report.canIssue" (click)="print.emit()">Imprimir / PDF final</button>
          <button type="button" [disabled]="!report.canIssue" (click)="download.emit()">Baixar .doc final</button></footer>
      </section>
    </div>
  }`,
  styles: [`.backdrop{position:fixed;inset:0;z-index:350;background:#05183380;display:grid;place-items:center;padding:20px}section{background:white;border-radius:12px;padding:24px;width:min(720px,100%);max-height:85vh;overflow:auto;color:#051833;box-sizing:border-box}header,footer{display:flex;gap:12px;justify-content:space-between;align-items:center}h2{font-size:1.1rem}p,li,label,legend{font-size:.85rem;line-height:1.6}ul{background:#fff7ed;border:1px solid #fed7aa;border-radius:8px;padding:14px 14px 14px 32px}.phase-select{display:grid;gap:4px;font-weight:700;margin:12px 0}.phase-select select{padding:8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;color:inherit;font:inherit}fieldset{border:1px solid #cbd5e1;border-radius:8px;margin:12px 0;padding:10px;display:grid;gap:5px}fieldset label{display:flex;align-items:center;gap:7px}button{padding:9px 14px;border:1px solid #cbd5e1;border-radius:6px;background:#f8fafc;cursor:pointer;color:inherit;font:inherit;font-size:.8rem}button:disabled{opacity:.45;cursor:not-allowed}footer{flex-wrap:wrap;justify-content:flex-start}`],
})
export class PrimaryReportModalComponent {
  @Input() open = false;
  @Input() report: PrimaryReport | null = null;
  @Input() visuals: PrimaryReportVisual[] = [];
  @Input() selection: Record<string, boolean> = {};
  @Input() phaseOptions: { id: string; name: string }[] = [];
  @Input() selectedPhaseId = 'all';
  @Output() closed = new EventEmitter<void>();
  @Output() preview = new EventEmitter<void>();
  @Output() print = new EventEmitter<void>();
  @Output() download = new EventEmitter<void>();
  @Output() visualChanged = new EventEmitter<{ id: string; checked: boolean }>();
  @Output() phaseChanged = new EventEmitter<string>();
}
