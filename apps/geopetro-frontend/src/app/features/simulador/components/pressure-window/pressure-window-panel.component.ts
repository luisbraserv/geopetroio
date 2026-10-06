import { Component, Input } from '@angular/core';
import { MARGIN_STATUS_LABELS, type MarginStatus } from '../../models/pressure-profile.model';
import type { CriticalPointView, OperationCriticalPoints } from '../../services/operation-critical-points';

/**
 * Janela operacional — ponto crítico (SPEC janela-operacional §3.3): o ponto mais crítico da
 * operação e, por etapa, a menor margem até a fratura e sobre o poro.
 */
@Component({
  selector: 'app-pressure-window-panel',
  standalone: true,
  template: `
    @if (data) {
      <section class="pw-card" data-panel="janela-operacional">
        <header>
          <h3>Janela operacional &mdash; ponto cr&iacute;tico</h3>
          <p>Em cada etapa, onde a press&atilde;o do po&ccedil;o chega mais perto da fratura e do poro, na forma&ccedil;&atilde;o exposta.
            Classes do cen&aacute;rio: aten&ccedil;&atilde;o abaixo de {{ n(data.classes.atencaoPpg, 2) }} ppg de folga, alerta abaixo de
            {{ n(data.classes.alertaPpg, 2) }}, cr&iacute;tico abaixo de {{ n(data.classes.criticoPpg, 2) }}.</p>
        </header>
        @if (data.worst; as w) {
          <div class="pw-worst" [attr.data-status]="w.status">
            <div class="pw-badge" [attr.data-status]="w.status">{{ label(w.status) }}</div>
            <dl>
              <div><dt>Etapa</dt><dd>{{ w.etapa }}</dd></div>
              <div><dt>Elemento</dt><dd>{{ w.elemento }}</dd></div>
              <div><dt>MD / TVD</dt><dd>{{ n(w.md, 1) }} / {{ n(w.tvd, 1) }} m</dd></div>
              <div><dt>Press&atilde;o de poros</dt><dd>{{ psi(w.porePsi) }}</dd></div>
              <div><dt>Press&atilde;o do po&ccedil;o</dt><dd>{{ psi(w.pressurePsi) }}</dd></div>
              <div><dt>Press&atilde;o de fratura</dt><dd>{{ psi(w.fracturePsi) }}</dd></div>
              <div><dt>ECD</dt><dd>{{ n(w.ecdPpg, 3) }} ppg</dd></div>
              <div><dt>Margem de fratura</dt><dd>{{ margin(w.fractureMarginPsi, w.fractureMarginPpg) }}</dd></div>
              <div><dt>Margem para influxo</dt><dd>{{ margin(w.poreMarginPsi, w.poreMarginPpg) }}</dd></div>
            </dl>
          </div>
        } @else {
          <p class="pw-empty">Sem forma&ccedil;&atilde;o exposta no trecho calculado: n&atilde;o h&aacute; poro nem fratura a comparar.</p>
        }
        @if (data.steps.length) {
          <div class="pw-table-wrap">
            <table data-table="ponto-critico">
              <thead><tr><th>Etapa</th><th>At&eacute; a fratura</th><th>Sobre o poro</th><th>Situa&ccedil;&atilde;o</th></tr></thead>
              <tbody>
                @for (step of data.steps; track $index) {
                  <tr [class.pw-row--worst]="step.etapa === data.worst?.etapa">
                    <td>{{ step.etapa }}</td>
                    <td>{{ where(step.fracture, 'fracture') }}</td>
                    <td>{{ where(step.pore, 'pore') }}</td>
                    <td><span class="pw-badge" [attr.data-status]="step.status">{{ label(step.status) }}</span></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (data.casing; as c) {
          <p class="pw-casing" [class.pw-casing--bad]="c.exceeded" data-casing>
            Revestimento: press&atilde;o interna m&aacute;x. {{ psi(c.pressurePsi) }} a {{ n(c.md, 1) }} m MD, contra ruptura de
            {{ psi(c.burstPsi) }} &mdash; {{ c.exceeded ? 'passa da ruptura' : 'folga de ' + psi(c.marginPsi) }}.
          </p>
        }
      </section>
    }
  `,
  styles: [`
    .pw-card { padding: 16px; border: 1px solid var(--color-card-border, #d6deeb); border-radius: 9px; background: var(--color-card, #fff); }
    header h3 { margin: 0; color: var(--color-text-strong, #051833); font-size: .94rem; }
    header p { margin: 4px 0 10px; color: var(--color-text-body, #64748b); font-size: .73rem; }
    .pw-worst { display: grid; grid-template-columns: auto 1fr; gap: 12px; align-items: start; padding: 10px 12px; border: 1px solid #dbe5f1; border-radius: 8px; background: #f8fafc; margin-bottom: 10px; }
    dl { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 14px; margin: 0; }
    dt { color: #64748b; font-size: .66rem; }
    dd { margin: 0; color: #0f172a; font-size: .8rem; font-weight: 700; }
    .pw-badge { display: inline-block; padding: 3px 9px; border-radius: 999px; font-size: .7rem; font-weight: 800; white-space: nowrap; }
    .pw-badge[data-status="normal"] { background: #dcfce7; color: #166534; }
    .pw-badge[data-status="atencao"] { background: #fef9c3; color: #854d0e; }
    .pw-badge[data-status="alerta"] { background: #ffedd5; color: #9a3412; }
    .pw-badge[data-status="critico"] { background: #fee2e2; color: #b91c1c; }
    .pw-badge[data-status="fratura"] { background: #b91c1c; color: #fff; }
    .pw-badge[data-status="influxo"] { background: #0369a1; color: #fff; }
    .pw-table-wrap { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; font-size: .74rem; }
    th, td { padding: 6px 8px; border-bottom: 1px solid #e2e8f0; text-align: left; vertical-align: top; }
    th { color: #475569; font-weight: 750; background: #f8fafc; }
    .pw-row--worst td { background: #fff7ed; }
    .pw-empty { color: #64748b; font-size: .75rem; }
    .pw-casing { margin: 10px 0 0; padding: 7px 9px; border-left: 3px solid #64748b; border-radius: 4px; background: #f8fafc; color: #475569; font-size: .72rem; }
    .pw-casing--bad { border-left-color: #b91c1c; background: #fef2f2; color: #991b1b; }
    @media (max-width: 760px) { dl { grid-template-columns: repeat(2, minmax(0, 1fr)); } .pw-worst { grid-template-columns: 1fr; } }
  `],
})
export class PressureWindowPanelComponent {
  @Input() data: OperationCriticalPoints | null = null;

  label(status: MarginStatus): string { return MARGIN_STATUS_LABELS[status]; }
  n(value: number | null | undefined, digits: number): string {
    return value == null || !Number.isFinite(value) ? '—'
      : value.toLocaleString('pt-BR', { minimumFractionDigits: digits, maximumFractionDigits: digits });
  }
  psi(value: number | null | undefined): string { return value == null ? '—' : `${this.n(value, 0)} psi`; }
  margin(psi: number | null, ppg: number | null): string { return psi === null ? '—' : `${this.n(psi, 0)} psi · ${this.n(ppg, 2)} ppg`; }
  /** Margem e onde: "320 psi · 0,41 ppg — Canhoneado 1508–1513,5 m, 1510 m MD". */
  where(point: CriticalPointView | null, kind: 'fracture' | 'pore'): string {
    if (!point) return '—';
    const m = kind === 'fracture' ? this.margin(point.fractureMarginPsi, point.fractureMarginPpg) : this.margin(point.poreMarginPsi, point.poreMarginPpg);
    return `${m} — ${point.elemento}, ${this.n(point.md, 1)} m MD`;
  }
}
