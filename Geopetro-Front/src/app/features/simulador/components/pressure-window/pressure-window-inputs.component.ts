import { Component, Input } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import type { PressureGradientUnit, PressureProfileMode } from '../../models/pressure-profile.model';
import { DEFAULT_MARGIN_CLASSES } from '../../models/pressure-profile.model';
import { fromPpg, toPpg } from '../../services/pressure-profile';

/** Campos da janela operacional no formulário do squeeze e do tampão (além de `fracGrad` e `poreGrad`). */
export const PRESSURE_WINDOW_FORM_DEFAULTS = {
  gradUnit: 'ppg' as PressureGradientUnit, gradMode: 'constant' as PressureProfileMode,
  margemAtencaoPpg: DEFAULT_MARGIN_CLASSES.atencaoPpg, margemAlertaPpg: DEFAULT_MARGIN_CLASSES.alertaPpg,
  margemCriticoPpg: DEFAULT_MARGIN_CLASSES.criticoPpg,
};

export function pressurePointGroup(fb: FormBuilder, p: { tvd?: unknown; poro?: unknown; fratura?: unknown } = {}): FormGroup {
  return fb.group({ tvd: [p.tvd ?? null], poro: [p.poro ?? null], fratura: [p.fratura ?? null] });
}

/** Refaz a tabela por TVD ao abrir um cenário (a lista não vem no `patchValue`). */
export function setPressurePoints(form: FormGroup, fb: FormBuilder, points: unknown): void {
  const rows = Array.isArray(points) ? points as { tvd?: unknown; poro?: unknown; fratura?: unknown }[] : [];
  form.setControl('gradPoints', fb.array(rows.map(row => pressurePointGroup(fb, row))), { emitEvent: false });
}

/**
 * Entrada da janela operacional (SPEC janela-operacional §3.1): unidade, poro e fratura
 * constantes ou por TVD, e as classes de margem do cenário.
 */
@Component({
  selector: 'app-pressure-window-inputs',
  standalone: true,
  imports: [ReactiveFormsModule],
  template: `
    <div [formGroup]="form" class="pw-inputs" data-inputs="janela-operacional">
      <div class="g2">
        <div><label>Unidade</label>
          <select data-grad-unit [value]="unit" (change)="setUnit($any($event.target).value)">
            <option value="ppg">EMW (ppg)</option><option value="psi/ft">psi/ft</option>
          </select></div>
        <div><label>Poro e fratura</label>
          <select data-grad-mode [value]="mode" (change)="setMode($any($event.target).value)">
            <option value="constant">Constantes</option><option value="table">Por TVD</option>
          </select></div>
        @if (mode === 'constant') {
          <div><label>Fratura ({{ unitLabel }})</label><input type="number" [step]="step" formControlName="fracGrad"></div>
          <div><label>Poro ({{ unitLabel }})</label><input type="number" [step]="step" formControlName="poreGrad"></div>
        }
      </div>
      @if (mode === 'table') {
        <div class="pw-points" formArrayName="gradPoints">
          <div class="pw-row pw-row--head"><span>TVD (m)</span><span>Poro ({{ unitLabel }})</span><span>Fratura ({{ unitLabel }})</span><span></span></div>
          @for (point of points.controls; track $index; let i = $index) {
            <div class="pw-row" [formGroupName]="i">
              <input type="number" step="10" min="0" formControlName="tvd" aria-label="TVD (m)">
              <input type="number" [step]="step" formControlName="poro" aria-label="Poro">
              <input type="number" [step]="step" formControlName="fratura" aria-label="Fratura">
              <button type="button" class="pw-remove" [disabled]="points.length <= 2" (click)="remove(i)" aria-label="Remover ponto" title="Remover ponto">×</button>
            </div>
          }
          <button type="button" class="pw-add" (click)="add()">+ Ponto</button>
        </div>
        <p class="pw-hint">Linear em TVD entre os pontos; acima do primeiro e abaixo do último, o valor do ponto mais próximo.</p>
      }
      <p class="pw-hint">Vale onde há formação exposta (poço aberto e canhoneados); atrás de revestimento cimentado, o limite é a ruptura do revestimento.</p>
      <label class="pw-sub">Classes de margem (ppg de folga)</label>
      <div class="g3">
        <div><label>Atenção &lt;</label><input type="number" step="0.05" min="0" formControlName="margemAtencaoPpg"></div>
        <div><label>Alerta &lt;</label><input type="number" step="0.05" min="0" formControlName="margemAlertaPpg"></div>
        <div><label>Crítico &lt;</label><input type="number" step="0.05" min="0" formControlName="margemCriticoPpg"></div>
      </div>
      <p class="pw-hint">Margem negativa é fratura (acima da fratura) ou influxo (abaixo do poro).</p>
    </div>
  `,
  styles: [`
    .g2, .g3 { display: grid; gap: 8px; }
    .g2 { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .g3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
    label { display: block; margin-bottom: 4px; color: var(--color-text-body, #475569); font-size: .7rem; font-weight: 750; line-height: 1.25; }
    input[type="number"], select { width: 100%; min-height: 32px; box-sizing: border-box; padding: 6px 8px;
      border: 1px solid rgba(77, 87, 97, .22); border-radius: 8px; background: rgba(255, 255, 255, .86);
      color: var(--color-text-strong, #0f172a); font: inherit; font-size: .8rem; line-height: 1.25; }
    input:focus, select:focus { outline: none; border-color: var(--color-focus, #4291e1); background: #fff; box-shadow: 0 0 0 3px rgba(66, 145, 225, .15); }
    .pw-points { display: grid; gap: 6px; margin-top: 8px; }
    .pw-row { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) 28px; gap: 6px; align-items: center; }
    .pw-row--head span { color: var(--color-text-body, #475569); font-size: .66rem; font-weight: 750; }
    .pw-remove { width: 28px; height: 28px; padding: 0; border: 1px solid #fecaca; border-radius: 6px; background: #fff; color: #b91c1c; font-size: 16px; line-height: 1; cursor: pointer; }
    .pw-remove:disabled { border-color: #e2e8f0; color: #cbd5e1; cursor: default; }
    .pw-add { justify-self: start; padding: 4px 10px; border: 1px solid #bfdbfe; border-radius: 6px; background: #eff6ff; color: #1d4ed8; font: inherit; font-size: .72rem; font-weight: 700; cursor: pointer; }
    .pw-sub { margin-top: 10px; }
    .pw-hint { margin: 6px 0 0; color: #64748b; font-size: .66rem; line-height: 1.35; }
  `],
})
export class PressureWindowInputsComponent {
  @Input({ required: true }) form!: FormGroup;
  /** TVD final do poço, para o segundo ponto quando a tabela começa vazia. */
  @Input() wellFinalTVD: number | null = null;

  constructor(private fb: FormBuilder) {}

  get unit(): PressureGradientUnit { return this.form.value.gradUnit === 'psi/ft' ? 'psi/ft' : 'ppg'; }
  get mode(): PressureProfileMode { return this.form.value.gradMode === 'table' ? 'table' : 'constant'; }
  get points(): FormArray { return this.form.get('gradPoints') as FormArray; }
  get unitLabel(): string { return this.unit; }
  get step(): number { return this.unit === 'psi/ft' ? 0.001 : 0.1; }

  /** Troca a unidade convertendo o que foi digitado, para não mudar a janela. */
  setUnit(unit: PressureGradientUnit): void {
    const from = this.unit;
    if (unit === from) return;
    const convert = (value: unknown) => {
      const n = Number(value);
      return value === null || value === '' || !Number.isFinite(n) ? value : +fromPpg(toPpg(n, from), unit).toFixed(unit === 'psi/ft' ? 4 : 3);
    };
    for (const point of this.points.controls)
      point.patchValue({ poro: convert(point.value.poro), fratura: convert(point.value.fratura) }, { emitEvent: false });
    this.form.patchValue({ gradUnit: unit, fracGrad: convert(this.form.value.fracGrad), poreGrad: convert(this.form.value.poreGrad) });
  }

  /** Por TVD sem pontos: começa com os constantes na superfície e no fundo. */
  setMode(mode: PressureProfileMode): void {
    if (mode === 'table' && this.points.length < 2) {
      const { poreGrad, fracGrad } = this.form.value;
      while (this.points.length) this.points.removeAt(0, { emitEvent: false });
      for (const tvd of [0, Math.max(1, Math.round(this.wellFinalTVD ?? 1000))])
        this.points.push(pressurePointGroup(this.fb, { tvd, poro: poreGrad, fratura: fracGrad }), { emitEvent: false });
    }
    this.form.patchValue({ gradMode: mode });
  }

  add(): void {
    const last = this.points.at(this.points.length - 1)?.value as { tvd?: number; poro?: number; fratura?: number } | undefined;
    this.points.push(pressurePointGroup(this.fb, { tvd: (Number(last?.tvd) || 0) + 100, poro: last?.poro, fratura: last?.fratura }));
  }

  remove(index: number): void {
    if (this.points.length > 2) this.points.removeAt(index);
  }
}
