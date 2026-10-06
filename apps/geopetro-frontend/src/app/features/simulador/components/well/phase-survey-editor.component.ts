import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { DepthUnit } from '../../models/depth-unit';
import { formatDepthNumber } from '../../models/depth-unit';
import type { WellGeometry } from '../../models/well-geometry.model';
import { MinimumCurvature } from '../../services/minimum-curvature';
import { PHASE_SURVEY_MAX_STATIONS } from '../../services/phase-survey';

@Component({
  selector: 'app-phase-survey-editor', standalone: true,
  imports: [CommonModule, ReactiveFormsModule],
  template: `
    <section class="survey-editor">
      <header><div><strong>Survey direcional por fase</strong>
        <p>Opcional. Informe MD, inclinação e azimute; a TVD é calculada por mínima curvatura.</p></div></header>
      @for (phase of phases.controls; track phase; let i = $index) {
        <details class="phase" [open]="surveyGroup(i).get('enabled')?.value === true">
          <summary>{{ phase.value.name || ('Fase ' + (i + 1)) }}
            <span>MD {{ depth(phase.value.topMD) }}–{{ depth(phase.value.bottomMD) }} {{ depthUnit }}</span>
          </summary>
          <div [formGroup]="asGroup(phase)" class="body">
            <div formGroupName="survey">
              <label class="toggle"><input type="checkbox" formControlName="enabled" (change)="changed.emit()">
                Usar survey nesta fase</label>
              @if (surveyGroup(i).get('enabled')?.value) {
                <p class="summary">TVD calculada: topo {{ phaseTvd(i, true) }} {{ depthUnit }} · base {{ phaseTvd(i, false) }} {{ depthUnit }}</p>
                <div class="table-wrap"><table><thead><tr><th>MD ({{ depthUnit }})</th><th>Inclinação (°)</th><th>Azimute (°)</th><th>TVD calc. ({{ depthUnit }})</th><th></th></tr></thead>
                  <tbody formArrayName="stations">
                    @for (station of stations(i).controls; track station; let j = $index) {
                      <tr [formGroupName]="j">
                        <td><input type="number" step="0.001" formControlName="md" (change)="changed.emit()"></td>
                        <td><input type="number" step="0.01" min="0" max="180" formControlName="inclinationDeg" (change)="changed.emit()"></td>
                        <td><input type="number" step="0.01" min="0" max="360" formControlName="azimuthDeg" (change)="changed.emit()"></td>
                        <td><output>{{ stationTvd(station.value.md) }}</output></td>
                        <td><button type="button" (click)="removeStation(i, j)" aria-label="Remover estação">×</button></td>
                      </tr>
                    }
                  </tbody>
                </table></div>
                <div class="actions"><button type="button" (click)="addStation(i)" [disabled]="stations(i).length >= maxStations">Adicionar estação</button>
                  <span>{{ stations(i).length }}/{{ maxStations }}</span></div>
              }
            </div>
          </div>
        </details>
      }
    </section>`,
  styles: [`
    .survey-editor{margin-top:12px;border-top:1px solid #dbe4f0;padding-top:10px}.survey-editor>header strong{font-size:.78rem}.survey-editor p{font-size:.7rem;color:#64748b;margin:3px 0 8px;line-height:1.35}.phase{border:1px solid #d6deeb;border-radius:7px;margin:7px 0;background:#fff}.phase summary{cursor:pointer;padding:8px;font-weight:700;font-size:.72rem;display:flex;justify-content:space-between;gap:8px}.phase summary span{font-weight:400;color:#64748b}.body{padding:0 8px 8px}.toggle{display:flex;align-items:center;gap:6px;font-size:.72rem}.summary{background:#eff6ff;padding:6px;border-radius:5px}.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:.68rem}th,td{padding:3px;text-align:left;white-space:nowrap}input[type=number]{width:88px;box-sizing:border-box;padding:5px;border:1px solid #cbd5e1;border-radius:4px;font:inherit}output{display:block;min-width:65px}.actions{display:flex;align-items:center;gap:8px;margin-top:6px}.actions button,td button{border:1px solid #bfdbfe;background:#eff6ff;border-radius:5px;padding:5px 8px;font:inherit;cursor:pointer}.actions span{font-size:.68rem;color:#64748b}button:disabled{opacity:.5;cursor:default}
  `],
})
export class PhaseSurveyEditorComponent {
  readonly maxStations = PHASE_SURVEY_MAX_STATIONS;
  @Input({ required: true }) phases!: FormArray;
  @Input() geometry: WellGeometry | null = null;
  @Input() depthUnit: DepthUnit = 'm';
  @Output() changed = new EventEmitter<void>();
  private readonly fb = inject(FormBuilder);
  asGroup(value: unknown): FormGroup { return value as FormGroup; }
  surveyGroup(index: number): FormGroup { return this.phases.at(index).get('survey') as FormGroup; }
  stations(index: number): FormArray { return this.surveyGroup(index).get('stations') as FormArray; }
  addStation(index: number): void {
    const rows = this.stations(index); if (rows.length >= this.maxStations) return;
    const phase = this.phases.at(index).value;
    const previous = rows.at(-1)?.value;
    rows.push(this.fb.group({ md: [previous?.md ?? phase.topMD], inclinationDeg: [previous?.inclinationDeg ?? 0], azimuthDeg: [previous?.azimuthDeg ?? 0] }));
    this.changed.emit();
  }
  removeStation(phaseIndex: number, stationIndex: number): void { this.stations(phaseIndex).removeAt(stationIndex); this.changed.emit(); }
  depth(value: number | null): string { return formatDepthNumber(value, this.depthUnit, 1); }
  stationTvd(value: unknown): string {
    const md = Number(value); if (!Number.isFinite(md) || !this.geometry?.trajectory) return '—';
    try { return formatDepthNumber(new MinimumCurvature(this.geometry.trajectory).at(md).tvd, this.depthUnit, 2); } catch { return '—'; }
  }
  phaseTvd(index: number, top: boolean): string {
    const phase = this.geometry?.phases[index];
    return phase ? formatDepthNumber(top ? phase.topTVD : phase.bottomTVD, this.depthUnit, 2) : '—';
  }
}

