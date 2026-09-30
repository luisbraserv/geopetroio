import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, SimpleChanges } from '@angular/core';
import type { PrimaryWellVisualModel } from '../../services/primary-well-visuals';

export interface PrimaryWellVisualView { id: string; name: string; model: PrimaryWellVisualModel }
type VisualKind = 'profile' | 'plan' | 'caliper';

@Component({
  selector: 'app-primary-well-2d', standalone: true, imports: [CommonModule],
  template: `@if (views.length) {
    <div class="toolbar">
      <label>Visualizar
        <select [value]="activeViewId" (change)="selectView($any($event.target).value)">
          @for (view of views; track view.id) { <option [value]="view.id">{{ view.name }}</option> }
        </select>
      </label>
      @if (activeView; as view) { <span>MD {{ view.model.bounds.topMD.toFixed(1) }}&ndash;{{ view.model.bounds.bottomMD.toFixed(1) }} m</span> }
    </div>
    @if (activeView; as view) {
      <h3 class="phase-title">{{ view.name }}</h3>
      <div class="grid">
        <figure [class.zoomed]="zoomed === 'profile'">
          <figcaption><span>Perfil direcional e cimenta&ccedil;&atilde;o</span><span class="zoom-actions">@if (zoomed === 'profile') { <button type="button" (click)="changeScale('profile', -.25)" [disabled]="scale.profile <= 1">&minus;</button><output>{{ zoomPercent('profile') }}%</output><button type="button" (click)="changeScale('profile', .25)" [disabled]="scale.profile >= 3">+</button><button type="button" (click)="resetScale('profile')">100%</button> }<button type="button" (click)="toggleZoom('profile')">{{ zoomed === 'profile' ? 'Fechar' : 'Ampliar' }}</button></span></figcaption>
          <svg viewBox="0 0 720 460" [style.width.%]="svgWidth('profile')" role="img" [attr.aria-label]="view.model.showCaliper ? 'Perfil direcional do poço com caliper, cimento e revestimento' : 'Perfil direcional do poço com cimento e revestimento'">
            <rect width="720" height="460" fill="#fff"/>
            @for (tick of view.model.profile.xTicks; track tick.position) {
              <line [attr.x1]="tick.position" y1="48" [attr.x2]="tick.position" y2="408" class="grid-line"/><text [attr.x]="tick.position" y="429" text-anchor="middle">{{ tick.label }}</text>
            }
            @for (tick of view.model.profile.yTicks; track tick.position) {
              <line x1="76" [attr.y1]="tick.position" x2="692" [attr.y2]="tick.position" class="grid-line"/><text x="66" [attr.y]="tick.position + 4" text-anchor="end">{{ tick.label }}</text>
            }
            <rect x="76" y="48" width="616" height="360" class="plot-frame"/>
            @for (line of view.model.profile.hole; track $index) { <line [attr.x1]="line.x1" [attr.y1]="line.y1" [attr.x2]="line.x2" [attr.y2]="line.y2" [attr.stroke]="line.measured ? '#f2c94c' : '#eadcc4'" [attr.stroke-width]="line.width" stroke-linecap="butt"/> }
            @for (line of view.model.profile.cement; track $index) { <line [attr.x1]="line.x1" [attr.y1]="line.y1" [attr.x2]="line.x2" [attr.y2]="line.y2" stroke="#39b86b" [attr.stroke-width]="line.width" stroke-linecap="butt"/> }
            @for (line of view.model.profile.casing; track $index) { <line [attr.x1]="line.x1" [attr.y1]="line.y1" [attr.x2]="line.x2" [attr.y2]="line.y2" stroke="#334155" stroke-width="10" stroke-linecap="butt"/> }
            @for (line of view.model.profile.casing; track $index) { <line [attr.x1]="line.x1" [attr.y1]="line.y1" [attr.x2]="line.x2" [attr.y2]="line.y2" stroke="#f8fafc" stroke-width="6" stroke-linecap="butt"/> }
            <path [attr.d]="view.model.profile.center" fill="none" stroke="#0f4c81" stroke-width="2"/>
            @for (marker of view.model.profile.markers; track marker.label) { <circle [attr.cx]="marker.x" [attr.cy]="marker.y" r="4" fill="#fff" stroke="#d97706" stroke-width="2"/><line [attr.x1]="marker.x + 5" [attr.y1]="marker.y" [attr.x2]="marker.x + 34" [attr.y2]="marker.y" stroke="#d97706"/><text [attr.x]="marker.x + 38" [attr.y]="marker.y + 4" class="marker">{{ marker.label }}</text> }
            <text x="384" y="454" text-anchor="middle" class="axis-title">Afastamento horizontal (m)</text><text x="17" y="228" text-anchor="middle" class="axis-title" transform="rotate(-90 17 228)">TVD (m)</text>
            @if (view.model.showCaliper) {
            <g class="legend" transform="translate(82 17)"><circle cx="0" cy="0" r="5" fill="#eadcc4"/><text x="10" y="4">Furo</text><circle cx="70" cy="0" r="5" fill="#f2c94c"/><text x="80" y="4">Caliper</text><circle cx="158" cy="0" r="5" fill="#39b86b"/><text x="168" y="4">Cimento</text><line x1="244" y1="0" x2="264" y2="0" stroke="#334155" stroke-width="7"/><line x1="244" y1="0" x2="264" y2="0" stroke="#fff" stroke-width="3"/><text x="274" y="4">Revestimento</text></g>
            } @else {
            <g class="legend" transform="translate(82 17)"><circle cx="0" cy="0" r="5" fill="#eadcc4"/><text x="10" y="4">Furo</text><circle cx="70" cy="0" r="5" fill="#39b86b"/><text x="80" y="4">Cimento</text><line x1="156" y1="0" x2="176" y2="0" stroke="#334155" stroke-width="7"/><line x1="156" y1="0" x2="176" y2="0" stroke="#fff" stroke-width="3"/><text x="186" y="4">Revestimento</text></g>
            }
          </svg>
        </figure>

        <figure [class.zoomed]="zoomed === 'plan'">
          <figcaption><span>Planta da trajet&oacute;ria</span><span class="zoom-actions">@if (zoomed === 'plan') { <button type="button" (click)="changeScale('plan', -.25)" [disabled]="scale.plan <= 1">&minus;</button><output>{{ zoomPercent('plan') }}%</output><button type="button" (click)="changeScale('plan', .25)" [disabled]="scale.plan >= 3">+</button><button type="button" (click)="resetScale('plan')">100%</button> }<button type="button" (click)="toggleZoom('plan')">{{ zoomed === 'plan' ? 'Fechar' : 'Ampliar' }}</button></span></figcaption>
          <svg viewBox="0 0 720 460" [style.width.%]="svgWidth('plan')" role="img" aria-label="Planta da trajetoria nos eixos Norte e Leste">
            <rect width="720" height="460" fill="#fff"/>
            @for (tick of view.model.plan.xTicks; track tick.position) { <line [attr.x1]="tick.position" y1="48" [attr.x2]="tick.position" y2="408" class="grid-line"/><text [attr.x]="tick.position" y="429" text-anchor="middle">{{ tick.label }}</text> }
            @for (tick of view.model.plan.yTicks; track tick.position) { <line x1="76" [attr.y1]="tick.position" x2="692" [attr.y2]="tick.position" class="grid-line"/><text x="66" [attr.y]="tick.position + 4" text-anchor="end">{{ tick.label }}</text> }
            <rect x="76" y="48" width="616" height="360" class="plot-frame"/><path [attr.d]="view.model.plan.center" fill="none" stroke="#dbeafe" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/><path [attr.d]="view.model.plan.center" fill="none" stroke="#0f4c81" stroke-width="3"/>
            @for (point of view.model.plan.stations; track $index) { <circle [attr.cx]="point.x" [attr.cy]="point.y" r="2.5" fill="#fff" stroke="#0f4c81"/> }
            <text x="384" y="454" text-anchor="middle" class="axis-title">Leste (m)</text><text x="17" y="228" text-anchor="middle" class="axis-title" transform="rotate(-90 17 228)">Norte (m)</text><g transform="translate(660 20)" class="compass"><path d="M0 18 L8 0 L16 18 L8 14 Z"/><text x="8" y="32" text-anchor="middle">N</text></g><text x="82" y="28">Esta&ccedil;&otilde;es do survey</text>
          </svg>
        </figure>

        @if (view.model.showCaliper) {
        @if (view.model.caliper; as chart) {
          <figure class="wide" [class.zoomed]="zoomed === 'caliper'">
            <figcaption><span>Caliper por profundidade</span><span class="zoom-actions">@if (zoomed === 'caliper') { <button type="button" (click)="changeScale('caliper', -.25)" [disabled]="scale.caliper <= 1">&minus;</button><output>{{ zoomPercent('caliper') }}%</output><button type="button" (click)="changeScale('caliper', .25)" [disabled]="scale.caliper >= 3">+</button><button type="button" (click)="resetScale('caliper')">100%</button> }<button type="button" (click)="toggleZoom('caliper')">{{ zoomed === 'caliper' ? 'Fechar' : 'Ampliar' }}</button></span></figcaption>
            <svg viewBox="0 0 720 460" [style.width.%]="svgWidth('caliper')" role="img" aria-label="Curvas EHD1 e EHD2 do caliper por profundidade medida">
              <defs><pattern id="caliper-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#c98245" fill-opacity=".72"/><line x1="0" y1="0" x2="0" y2="8" stroke="#5f3a1f" stroke-width="1.4"/></pattern></defs>
              <rect width="720" height="460" fill="#fff"/>
              @for (tick of chart.xTicks; track tick.position) { <line [attr.x1]="tick.position" y1="48" [attr.x2]="tick.position" y2="408" class="grid-line"/><text [attr.x]="tick.position" y="429" text-anchor="middle">{{ tick.label }}</text> }
              @for (tick of chart.yTicks; track tick.position) { <line x1="76" [attr.y1]="tick.position" x2="692" [attr.y2]="tick.position" class="grid-line"/><text x="66" [attr.y]="tick.position + 4" text-anchor="end">{{ tick.label }}</text> }
              <rect x="76" y="48" width="616" height="360" class="plot-frame"/><path [attr.d]="chart.envelope" fill="url(#caliper-hatch)"/><line x1="384" y1="48" x2="384" y2="408" stroke="#334155" stroke-width="1.2"/><path [attr.d]="chart.d1" fill="none" stroke="#06b6d4" stroke-width="2.5"/><path [attr.d]="chart.d2" fill="none" stroke="#2563eb" stroke-width="2.5"/><path [attr.d]="chart.nominal" fill="none" stroke="#f59e0b" stroke-width="1.7" stroke-dasharray="7 5"/>
              <text x="384" y="454" text-anchor="middle" class="axis-title">Di&acirc;metro indicado por eixo (pol)</text><text x="17" y="228" text-anchor="middle" class="axis-title" transform="rotate(-90 17 228)">MD (m)</text><text x="384" y="43" text-anchor="middle" font-size="10" fill="#475569">Centro do po&ccedil;o</text>
              <g class="legend" transform="translate(82 20)"><line x1="0" y1="0" x2="24" y2="0" stroke="#06b6d4" stroke-width="3"/><text x="30" y="4">EHD1 (esquerda)</text><line x1="132" y1="0" x2="156" y2="0" stroke="#2563eb" stroke-width="3"/><text x="162" y="4">EHD2 (direita)</text><line x1="260" y1="0" x2="284" y2="0" stroke="#f59e0b" stroke-width="2" stroke-dasharray="6 4"/><text x="290" y="4">Nominal</text><rect x="352" y="-6" width="18" height="12" fill="url(#caliper-hatch)"/><text x="376" y="4">Abertura do furo</text></g>
            </svg>
          </figure>
        } @else { <p class="empty">Esta fase n&atilde;o possui amostras de caliper.</p> }
        }
      </div>
    }
    @if (zoomed) { <div class="zoom-backdrop" (click)="zoomed = null"></div> }
    @if (activeView?.model?.showCaliper === false) {
      <p class="note">Escala radial ampliada apenas para leitura. O furo usa o di&acirc;metro da fase; o revestimento permanece centralizado.</p>
    } @else {
      <p class="note">Escala radial ampliada apenas para leitura. Os volumes usam EHD1 e EHD2 reais; o revestimento permanece centralizado.</p>
    }
  }`,
  styles: [`
    .toolbar{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:10px}.toolbar label{font-size:.74rem;font-weight:700;color:#334155}.toolbar select{display:block;min-width:250px;margin-top:4px;padding:7px 9px;border:1px solid #cbd5e1;border-radius:6px;background:#fff}.toolbar span{font-size:.72rem;color:#64748b}.phase-title{margin:4px 0 10px;font-size:.84rem;color:#0b2b50}.grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.wide{grid-column:1/-1}figure{margin:0;border:1px solid #d6deeb;border-radius:9px;padding:10px;background:#fff;overflow:hidden}figcaption{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:.78rem;font-weight:800;margin-bottom:7px;color:#0b2b50}figcaption button{border:1px solid #bfdbfe;border-radius:5px;background:#eff6ff;color:#154a7a;padding:5px 9px;font:inherit;font-size:.68rem;cursor:pointer}figcaption button:disabled{opacity:.45;cursor:default}.zoom-actions{display:flex;align-items:center;gap:5px}.zoom-actions output{min-width:42px;text-align:center;font-size:.68rem;color:#475569}svg{display:block;width:100%;height:auto;aspect-ratio:720/460;border-radius:6px;background:#fff;transform-origin:top left}.grid-line{stroke:#e5e7eb;stroke-width:1}.plot-frame{fill:none;stroke:#94a3b8;stroke-width:1}text{font:11px Arial;fill:#475569}.axis-title{font-weight:700;fill:#334155}.legend text{font-size:10px}.marker{font-size:10px;font-weight:700;fill:#9a5a08}.compass path{fill:#0f4c81}.compass text{font-weight:800;fill:#0f4c81}.empty{grid-column:1/-1;padding:18px;border:1px dashed #cbd5e1;border-radius:8px;color:#64748b;font-size:.76rem}.note{font-size:.72rem;color:#64748b;line-height:1.5;margin-bottom:0}.zoom-backdrop{position:fixed;inset:0;background:#07182c99;z-index:499}.zoomed{position:fixed;inset:24px;z-index:500;display:block;padding:16px;box-shadow:0 22px 70px #02061766;overflow:auto}.zoomed figcaption{position:sticky;top:-16px;z-index:2;background:#fff;padding:10px 0}.zoomed svg{max-width:none;max-height:none;flex:none}@media(max-width:900px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}.toolbar{align-items:stretch;flex-direction:column}.toolbar select{width:100%}.zoomed{inset:8px}}
  `],
})
export class PrimaryWell2dComponent implements OnChanges {
  @Input() views: PrimaryWellVisualView[] = [];
  @Input() selectedPhaseId: string | null = null;
  activeViewId = 'all';
  zoomed: VisualKind | null = null;
  scale: Record<VisualKind, number> = { profile: 1, plan: 1, caliper: 1 };
  get activeView(): PrimaryWellVisualView | null {
    return this.views.find(view => view.id === this.activeViewId) ?? this.views[0] ?? null;
  }
  ngOnChanges(changes: SimpleChanges): void {
    if (!this.views.some(view => view.id === this.activeViewId))
      this.activeViewId = this.views.some(view => view.id === this.selectedPhaseId) ? this.selectedPhaseId! : 'all';
    if (changes['selectedPhaseId']?.firstChange && this.selectedPhaseId && this.views.some(view => view.id === this.selectedPhaseId))
      this.activeViewId = this.selectedPhaseId;
  }
  selectView(id: string): void { this.activeViewId = id; this.zoomed = null; }
  toggleZoom(kind: VisualKind): void { this.zoomed = this.zoomed === kind ? null : kind; }
  changeScale(kind: VisualKind, delta: number): void {
    this.scale = { ...this.scale, [kind]: Math.min(3, Math.max(1, this.scale[kind] + delta)) };
  }
  resetScale(kind: VisualKind): void { this.scale = { ...this.scale, [kind]: 1 }; }
  zoomPercent(kind: VisualKind): number { return Math.round(this.scale[kind] * 100); }
  svgWidth(kind: VisualKind): number { return this.zoomed === kind ? this.scale[kind] * 100 : 100; }
}
