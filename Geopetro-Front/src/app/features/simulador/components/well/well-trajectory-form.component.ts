import { DepthUnit } from '../../models/depth-unit';
import { DepthInputDirective } from './depth-input.directive';
import { Component, Input, inject } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';

@Component({
  selector: 'app-well-trajectory-form',
  standalone: true,
  imports: [DepthInputDirective, ReactiveFormsModule],
  template: `
    <fieldset [formGroup]="form">
      <legend>Trajetória do poço</legend>
      <label><input type="checkbox" formControlName="enabled"> Usar survey por mínima curvatura</label>
      @if (form.value.enabled) {
        <p>Digite as estações em ordem de MD, desde zero até o fundo do poço.
          Inclinação medida a partir da vertical; azimute de 0 a 360°. Os TVDs serão calculados.</p>
        <div class="survey-scroll">
          <table>
            <thead><tr><th>MD ({{ depthUnit }})</th><th>Inclinação (°)</th><th>Azimute (°)</th><th></th></tr></thead>
            <tbody>
              @for (station of stations.controls; track station; let i = $index) {
                <tr [formGroup]="asGroup(station)">
                  <td><input type="number" formControlName="md" [appDepthInput]="depthUnit" step="any" [attr.aria-label]="'MD da estação ' + (i + 1)"></td>
                  <td><input type="number" formControlName="inclinationDeg" step="any" [attr.aria-label]="'Inclinação da estação ' + (i + 1)"></td>
                  <td><input type="number" formControlName="azimuthDeg" step="any" [attr.aria-label]="'Azimute da estação ' + (i + 1)"></td>
                  <td><button type="button" (click)="stations.removeAt(i)" [attr.aria-label]="'Remover estação ' + (i + 1)">✕</button></td>
                </tr>
              }
            </tbody>
          </table>
        </div>
        <button type="button" (click)="addStation()">+ Adicionar estação</button>
      } @else {
        <p>Sem survey, são usados os TVDs manuais das fases.</p>
      }
    </fieldset>
  `,
  styles: [`
    fieldset { margin: 0 0 12px; padding: 10px; border: 1px solid #cbd5e1; border-radius: 6px; }
    legend, label, th { font-size: .75rem; }
    p { font-size: .7rem; color: #475569; line-height: 1.5; }
    .survey-scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 8px; }
    td, th { padding: 3px; text-align: left; }
    input[type=number] { width: 100%; min-width: 60px; box-sizing: border-box; }
    button, input[type=number] { padding: 5px; border: 1px solid #cbd5e1; border-radius: 4px; font: inherit; font-size: .75rem; }
    button { cursor: pointer; background: #f1f5f9; }
  `],
})
export class WellTrajectoryFormComponent {
  @Input() depthUnit: DepthUnit = 'm';
  @Input({ required: true }) form!: FormGroup;
  private readonly fb = inject(FormBuilder);
  get stations(): FormArray { return this.form.get('stations') as FormArray; }
  asGroup(value: unknown): FormGroup { return value as FormGroup; }
  addStation(): void {
    this.stations.push(this.fb.group({
      md: [this.stations.length ? null : 0], inclinationDeg: [null], azimuthDeg: [null],
    }));
  }
}
