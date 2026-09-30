import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Input, Output } from '@angular/core';
import type { WellCaliperProfile } from '../../models/caliper.model';
import type { WellPhaseFormValue } from '../../models/well-geometry.form';
import { LasCaliperError, parseCaliperLas } from '../../services/caliper-las';

@Component({
  selector: 'app-caliper-las-import', standalone: true, imports: [CommonModule],
  template: `
    <section class="caliper">
      <header><div><strong>Caliper do poço</strong><p>Opcional. Um LAS válido substitui o caliper anterior e recalcula as fases.</p></div></header>
      <div class="actions">
        <label class="file">{{ profile ? 'Substituir caliper (.LAS)' : 'Importar caliper (.LAS)' }}
          <input type="file" accept=".las,text/plain" (change)="selectFile($event)">
        </label>
        @if (profile) { <button type="button" (click)="removed.emit()">Remover caliper</button> }
      </div>
      @if (message) { <p class="message" role="status">{{ message }}</p> }
      @if (error) { <p class="error" role="alert">{{ error }}</p> }
      @if (profile) {
        <dl><div><dt>Arquivo</dt><dd>{{ profile.fileName }}</dd></div>
          <div><dt>Intervalo</dt><dd>{{ fmt(profile.startMD, 3) }}–{{ fmt(profile.stopMD, 3) }} m</dd></div>
          <div><dt>Amostras</dt><dd>{{ profile.sampleCount }}</dd></div>
          <div><dt>Volume EHD</dt><dd>{{ fmt(profile.calculatedHoleVolumeM3, 3) }} m³</dd></div>
          <div><dt>IHV do LAS</dt><dd>{{ profile.reportedHoleVolumeM3 === null ? '—' : fmt(profile.reportedHoleVolumeM3, 3) + ' m³' }}</dd></div>
          <div><dt>Diferença</dt><dd [class.warn]="differenceWarning">{{ profile.volumeDifferencePct === null ? '—' : fmt(profile.volumeDifferencePct, 2) + '%' }}</dd></div></dl>
        @if (differenceWarning) { <p class="warning">A conferência com IHV diverge mais de 5%. A importação foi mantida para revisão.</p> }
        <div class="coverage"><strong>Cobertura por fase</strong>
          @for (phase of phases; track phase.id) { <span>{{ phase.name }}: {{ count(phase) }} amostras</span> }
        </div>
        <details><summary>Consultar amostras</summary><div class="table"><table><thead><tr><th>MD (m)</th><th>EHD1 (pol)</th><th>EHD2 (pol)</th></tr></thead><tbody>
          @for (sample of profile.samples; track sample.md) { <tr><td>{{ fmt(sample.md, 3) }}</td><td>{{ fmt(sample.ehd1In, 3) }}</td><td>{{ fmt(sample.ehd2In, 3) }}</td></tr> }
        </tbody></table></div></details>
      }
    </section>`,
  styles: [`
    .caliper{margin-top:12px;border-top:1px solid #dbe4f0;padding-top:10px}.caliper strong{font-size:.78rem}.caliper p{font-size:.7rem;color:#64748b;margin:3px 0 8px;line-height:1.35}.actions{display:flex;flex-wrap:wrap;gap:6px}.file,button{display:inline-block;border:1px solid #bfdbfe;background:#eff6ff;border-radius:5px;padding:7px 9px;font:inherit;font-size:.7rem;cursor:pointer}.file input{display:none}dl{display:grid;grid-template-columns:1fr 1fr;gap:5px;margin:9px 0}dl div{background:#f8fafc;border-radius:5px;padding:5px}dt{font-size:.62rem;color:#64748b}dd{font-size:.7rem;font-weight:700;margin:1px 0}.coverage{display:grid;gap:3px;font-size:.68rem;margin:8px 0}.message{color:#166534!important}.error,.warning,.warn{color:#991b1b!important}.table{max-height:220px;overflow:auto}table{width:100%;border-collapse:collapse;font-size:.66rem}th,td{padding:3px;text-align:right;border-bottom:1px solid #e2e8f0}summary{font-size:.7rem;cursor:pointer}
  `],
})
export class CaliperLasImportComponent {
  @Input() profile: WellCaliperProfile | null = null;
  @Input() phases: WellPhaseFormValue[] = [];
  @Output() imported = new EventEmitter<WellCaliperProfile>();
  @Output() removed = new EventEmitter<void>();
  error = ''; message = '';
  get differenceWarning(): boolean { return Math.abs(this.profile?.volumeDifferencePct ?? 0) > 5; }
  async selectFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0]; input.value = '';
    if (!file) return;
    this.error = ''; this.message = '';
    try {
      const parsed = parseCaliperLas(await file.text(), file.name);
      this.imported.emit(parsed);
      this.message = `${parsed.sampleCount} amostras importadas. Todas as fases serão recalculadas.`;
    } catch (cause) {
      const detail = cause instanceof LasCaliperError || cause instanceof Error ? cause.message : 'Arquivo inválido.';
      this.error = `Nada foi importado. ${this.profile ? 'O último arquivo continua em uso. ' : ''}${detail}`;
    }
  }
  count(phase: WellPhaseFormValue): number {
    return this.profile?.samples.filter(sample => sample.md >= Number(phase.topMD) && sample.md <= Number(phase.bottomMD)).length ?? 0;
  }
  fmt(value: number, digits: number): string { return Number.isFinite(value) ? value.toFixed(digits) : '—'; }
}
