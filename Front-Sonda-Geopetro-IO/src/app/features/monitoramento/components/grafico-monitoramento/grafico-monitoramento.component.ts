import { ChangeDetectionStrategy, Component, Input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MonitoramentoSerie } from '../../services/monitoramento-sonda.service';

@Component({
  selector: 'app-grafico-monitoramento',
  standalone: true,
  imports: [CommonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <article class="grafico-card">
      <header class="grafico-header">
        <div>
          <span class="grafico-title">{{ titulo || serie.dispositivoId }}</span>
          <span class="grafico-meta">{{ serie.pontos.length }} pontos</span>
        </div>

        <div class="line-controls">
          <label>
            <input type="checkbox" [checked]="mostrarOriginal()" (change)="mostrarOriginal.set($any($event.target).checked)" />
            <span>Original</span>
          </label>
          <label>
            <input type="checkbox" [checked]="mostrarSuavizada()" (change)="mostrarSuavizada.set($any($event.target).checked)" />
            <span>Suavizada</span>
          </label>
        </div>
      </header>

      <div class="grafico-area">
        <svg [attr.viewBox]="'0 0 ' + W + ' ' + H" class="grafico-svg" preserveAspectRatio="none">
          @for (linha of gridLinhas(); track linha.y) {
            <line [attr.x1]="pad" [attr.x2]="W - pad" [attr.y1]="linha.y" [attr.y2]="linha.y"
                  stroke="#e2e8f0" stroke-width="1" />
            <text [attr.x]="pad - 8" [attr.y]="linha.y + 4" text-anchor="end"
                  font-size="10" fill="#64748b">{{ linha.label }}</text>
          }

          @for (linha of gridX(); track linha.x) {
            <line [attr.x1]="linha.x" [attr.x2]="linha.x" [attr.y1]="pad" [attr.y2]="H - pad"
                  stroke="#f1f5f9" stroke-width="1" />
          }

          <line [attr.x1]="pad" [attr.x2]="W - pad" [attr.y1]="H - pad" [attr.y2]="H - pad" stroke="#334155" stroke-width="1" />
          <line [attr.x1]="pad" [attr.x2]="pad" [attr.y1]="pad" [attr.y2]="H - pad" stroke="#334155" stroke-width="1" />

          @if (mostrarOriginal()) {
            <polygon [attr.points]="areaOriginalSvg()" fill="rgba(37,99,235,0.08)" />
            <polyline [attr.points]="originalSvg()" fill="none" stroke="#1d4ed8" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" />
          }

          @if (mostrarSuavizada()) {
            <polyline [attr.points]="suavizadaSvg()" fill="none" stroke="#f97316" stroke-width="3" stroke-linejoin="round" stroke-linecap="round" />
          }

          <text [attr.x]="pad" y="22" font-size="11" fill="#475569">Variavel: {{ titulo || serie.dispositivoId }}{{ unidade ? ' (' + unidade + ')' : '' }}</text>
          <text [attr.x]="W - pad" [attr.y]="H - 12" text-anchor="end" font-size="10" fill="#64748b">Eixo X: hora</text>
          <text [attr.x]="pad + 8" [attr.y]="pad + 14" font-size="10" fill="#64748b">Eixo Y{{ unidade ? ': ' + unidade : '' }}</text>
        </svg>

        <div class="eixo-x">
          @for (label of labelsX(); track label) {
            <span>{{ label }}</span>
          }
        </div>
      </div>
    </article>
  `,
  styles: [`
    .grafico-card {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
      min-height: 360px;
      background: #fff;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      padding: 1rem;
      box-shadow: var(--shadow-card);
    }
    .grafico-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 1rem;
    }
    .grafico-header > div:first-child {
      display: flex;
      flex-direction: column;
      gap: 0.15rem;
    }
    .grafico-title { font-size: 0.92rem; font-weight: 800; color: var(--color-text-strong); }
    .grafico-meta { font-size: 0.75rem; color: var(--color-text-secondary); }
    .line-controls {
      display: flex;
      flex-wrap: wrap;
      justify-content: flex-end;
      gap: 0.55rem;
    }
    .line-controls label {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      color: #334155;
      font-size: 0.76rem;
      font-weight: 700;
      white-space: nowrap;
    }
    .line-controls input {
      width: 0.9rem;
      height: 0.9rem;
      accent-color: #2563eb;
    }
    .grafico-area { position: relative; flex: 1; min-height: 0; }
    .grafico-svg { width: 100%; height: 300px; display: block; }
    .eixo-x {
      display: flex;
      justify-content: space-between;
      padding: 0 48px;
      font-size: 0.7rem;
      color: #64748b;
    }
  `],
})
export class GraficoMonitoramentoComponent {
  @Input({ required: true }) set serie(valor: MonitoramentoSerie) {
    this.serieSig.set(valor);
  }
  get serie(): MonitoramentoSerie {
    return this.serieSig();
  }

  @Input() titulo = '';
  @Input() unidade = '';

  /**
   * A serie como signal, para que os `computed` abaixo reajam a troca de consulta.
   *
   * <p>Setter em vez de `input()` apenas para manter a API `[serie]` que a pagina ja usa.
   */
  private readonly serieSig = signal<MonitoramentoSerie>({
    idSondaUnidade: '',
    dispositivoId: '',
    pontos: [],
  });

  readonly mostrarOriginal = signal(true);
  readonly mostrarSuavizada = signal(true);

  readonly W = 800;
  readonly H = 300;
  readonly pad = 48;

  /** Janela da media movel, em pontos. */
  private static readonly JANELA_SUAVIZACAO = 8;

  private readonly valoresSig = computed(() =>
    this.serieSig().pontos.map((p) => Number(p.valor ?? 0)),
  );

  /**
   * Minimo e amplitude calculados numa passada so.
   *
   * <p><b>Era aqui o travamento.</b> `minV`/`maxV` eram getters que refaziam `.map()` sobre a serie
   * inteira e aplicavam `Math.min(...)` com spread. Como `toY()` os consultava, e `originalSvg()`
   * chamava `toY()` por ponto, montar uma unica polyline custava O(n²): com 2000 pontos e seis
   * graficos, cerca de 1 segundo de thread principal bloqueada — repetido a cada ciclo de deteccao,
   * porque tudo eram metodos chamados do template.
   *
   * <p>O spread tambem era um risco a parte: `Math.min(...array)` estoura a pilha em series grandes.
   */
  private readonly escala = computed(() => {
    const valores = this.valoresSig();
    let min = Infinity;
    let max = -Infinity;
    for (const valor of valores) {
      if (valor < min) min = valor;
      if (valor > max) max = valor;
    }
    if (!Number.isFinite(min)) {
      return { min: 0, range: 1 };
    }
    return { min, range: max - min || 1 };
  });

  get minV(): number { return this.escala().min; }
  get rangeV(): number { return this.escala().range; }
  get maxV(): number { return this.escala().min + this.escala().range; }

  toX(i: number): number {
    const n = this.serieSig().pontos.length;
    if (n < 2) return this.pad;
    return this.pad + (i / (n - 1)) * (this.W - this.pad * 2);
  }

  toY(v: number): number {
    const { min, range } = this.escala();
    return this.H - this.pad - ((v - min) / range) * (this.H - this.pad * 2);
  }

  /**
   * Coordenadas da curva bruta.
   *
   * <p>`computed` e nao metodo: o template le isto a cada ciclo de deteccao, e sem memoizacao a
   * string inteira era remontada toda vez, mesmo sem os dados terem mudado.
   */
  readonly originalSvg = computed(() => {
    const valores = this.valoresSig();
    const partes = new Array<string>(valores.length);
    for (let i = 0; i < valores.length; i++) {
      partes[i] = `${this.toX(i)},${this.toY(valores[i])}`;
    }
    return partes.join(' ');
  });

  readonly suavizadaSvg = computed(() => {
    const suavizados = this.mediaMovel(this.valoresSig(), GraficoMonitoramentoComponent.JANELA_SUAVIZACAO);
    const partes = new Array<string>(suavizados.length);
    for (let i = 0; i < suavizados.length; i++) {
      partes[i] = `${this.toX(i)},${this.toY(suavizados[i])}`;
    }
    return partes.join(' ');
  });

  readonly areaOriginalSvg = computed(() => {
    const n = this.serieSig().pontos.length - 1;
    if (n < 1) return '';
    return `${this.pad},${this.H - this.pad} ${this.originalSvg()} ${this.toX(n)},${this.H - this.pad}`;
  });

  readonly gridLinhas = computed(() => {
    const { min, range } = this.escala();
    const passos = 5;
    return Array.from({ length: passos + 1 }, (_, i) => {
      const v = min + (range * i) / passos;
      return { y: this.toY(v), label: this.formatarValor(v) };
    });
  });

  readonly gridX = computed(() => this.indicesLabelsX().map((i) => ({ x: this.toX(i) })));

  readonly labelsX = computed(() => {
    const pontos = this.serieSig().pontos;
    return this.indicesLabelsX().map((i) => {
      const d = new Date(pontos[i].dataHora);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    });
  });

  private indicesLabelsX(): number[] {
    const pts = this.serieSig().pontos;
    if (pts.length < 2) return [];
    return [
      0,
      Math.floor(pts.length / 4),
      Math.floor(pts.length / 2),
      Math.floor((3 * pts.length) / 4),
      pts.length - 1,
    ];
  }

  /**
   * Media movel por janela deslizante: uma passada, soma incremental.
   *
   * <p>A versao anterior fazia `slice()` e `reduce()` a cada ponto, alocando um array por iteracao.
   * O resultado numerico e identico — ha teste cobrindo isso.
   */
  private mediaMovel(values: number[], window: number): number[] {
    const saida = new Array<number>(values.length);
    let soma = 0;
    for (let i = 0; i < values.length; i++) {
      soma += values[i];
      if (i >= window) soma -= values[i - window];
      saida[i] = soma / Math.min(i + 1, window);
    }
    return saida;
  }

  private formatarValor(value: number): string {
    if (Math.abs(value) >= 100) return value.toFixed(0);
    if (Math.abs(value) >= 10) return value.toFixed(1);
    return value.toFixed(2);
  }
}
