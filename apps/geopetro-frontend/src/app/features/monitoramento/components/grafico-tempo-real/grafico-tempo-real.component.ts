import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

/**
 * Gráfico de linha para a janela deslizante do tempo real.
 *
 * **Por que não reusar `GraficoMonitoramentoComponent`:** aquele serve ao histórico consultado —
 * traz controles de suavização e curva original/suavizada, que só fazem sentido sobre séries
 * longas. Numa janela de 2 minutos, a média móvel de 8 pontos achataria justamente a variação que
 * se quer enxergar, e os toggles seriam ruído numa tela de acompanhamento.
 *
 * Desenhado em SVG puro, sem biblioteca: são poucas dezenas de pontos redesenhados a cada segundo.
 */
@Component({
  selector: 'app-grafico-tempo-real',
  imports: [CommonModule],
  template: `
    <article class="grafico">
      <header class="grafico__header">
        <span class="grafico__titulo">{{ titulo() }}</span>
        <span class="grafico__atual">
          {{ valorFormatado() }}
          @if (unidade()) {
            <small>{{ unidade() }}</small>
          }
        </span>
      </header>

      @if (pontos().length < 2) {
        <div class="grafico__vazio">Aguardando leituras…</div>
      } @else {
        <svg
          class="grafico__svg"
          [attr.viewBox]="'0 0 ' + LARGURA + ' ' + ALTURA"
          preserveAspectRatio="none"
          role="img"
          [attr.aria-label]="'Gráfico de ' + titulo()"
        >
          <!-- Linhas de referência: dão noção de escala sem poluir com eixos numerados. -->
          @for (y of linhasGrade; track y) {
            <line class="grade" [attr.x1]="0" [attr.y1]="y" [attr.x2]="LARGURA" [attr.y2]="y" />
          }

          <path class="area" [attr.d]="caminhoArea()" [attr.fill]="cor()" />
          <path class="linha" [attr.d]="caminhoLinha()" [attr.stroke]="cor()" />

          <!-- Marca o ponto mais recente: ancora o olho no "agora". -->
          <circle class="ponta" [attr.cx]="pontaX()" [attr.cy]="pontaY()" r="3" [attr.fill]="cor()" />
        </svg>

        <footer class="grafico__rodape">
          <span>mín {{ formatar(minimo()) }}</span>
          <span>máx {{ formatar(maximo()) }}</span>
        </footer>
      }
    </article>
  `,
  styles: [
    `
      .grafico {
        display: flex;
        flex-direction: column;
        gap: 8px;
        padding: 16px 18px;
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        box-shadow: 0 1px 2px rgb(15 23 42 / 6%);
      }

      .grafico__header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 8px;
      }

      .grafico__titulo {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.04em;
        color: #64748b;
      }

      .grafico__atual {
        font-size: 18px;
        font-weight: 700;
        color: #0f172a;
        font-variant-numeric: tabular-nums;
      }

      .grafico__atual small {
        font-size: 11px;
        font-weight: 500;
        color: #94a3b8;
        margin-left: 3px;
      }

      .grafico__svg {
        width: 100%;
        height: 90px;
        display: block;
      }

      .grade {
        stroke: #f1f5f9;
        stroke-width: 1;
      }

      .linha {
        fill: none;
        stroke-width: 2;
        stroke-linejoin: round;
        stroke-linecap: round;
      }

      .area {
        opacity: 0.12;
        stroke: none;
      }

      .grafico__vazio {
        height: 90px;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #94a3b8;
        font-size: 13px;
        background: #f8fafc;
        border-radius: 8px;
      }

      .grafico__rodape {
        display: flex;
        justify-content: space-between;
        font-size: 11px;
        color: #94a3b8;
        font-variant-numeric: tabular-nums;
      }
    `,
  ],
})
export class GraficoTempoRealComponent {
  readonly titulo = input.required<string>();
  readonly valores = input.required<(number | null)[]>();
  readonly unidade = input('');
  readonly casas = input(1);
  readonly cor = input('#2563eb');

  protected readonly LARGURA = 300;
  protected readonly ALTURA = 90;
  protected readonly linhasGrade = [0, 22.5, 45, 67.5, 90];

  /** Só os pontos numéricos: um `null` no meio não deve virar zero e falsear a curva. */
  protected readonly pontos = computed(() =>
    this.valores().filter((v): v is number => v !== null && v !== undefined && Number.isFinite(v)),
  );

  protected readonly minimo = computed(() => Math.min(...this.pontos()));
  protected readonly maximo = computed(() => Math.max(...this.pontos()));

  protected readonly valorAtual = computed(() => {
    const p = this.pontos();
    return p.length > 0 ? p[p.length - 1] : null;
  });

  protected readonly valorFormatado = computed(() => {
    const v = this.valorAtual();
    return v === null ? '—' : this.formatar(v);
  });

  protected readonly caminhoLinha = computed(() => {
    const coords = this.coordenadas();
    if (coords.length === 0) return '';
    return coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c.x},${c.y}`).join(' ');
  });

  /** Área sob a curva: dá peso visual à linha sem exigir eixo Y rotulado. */
  protected readonly caminhoArea = computed(() => {
    const coords = this.coordenadas();
    if (coords.length === 0) return '';
    const inicio = coords[0];
    const fim = coords[coords.length - 1];
    const linha = coords.map((c) => `L${c.x},${c.y}`).join(' ');
    return `M${inicio.x},${this.ALTURA} ${linha} L${fim.x},${this.ALTURA} Z`;
  });

  protected readonly pontaX = computed(() => {
    const coords = this.coordenadas();
    return coords.length > 0 ? coords[coords.length - 1].x : 0;
  });

  protected readonly pontaY = computed(() => {
    const coords = this.coordenadas();
    return coords.length > 0 ? coords[coords.length - 1].y : 0;
  });

  protected formatar(valor: number): string {
    return valor.toLocaleString('pt-BR', {
      minimumFractionDigits: this.casas(),
      maximumFractionDigits: this.casas(),
    });
  }

  /**
   * Converte os valores em coordenadas do SVG.
   *
   * A escala Y é recalculada a cada render sobre a janela visível — não é fixa. Assim uma variação
   * pequena continua legível: com escala fixa a partir de zero, uma pressão oscilando entre 1450 e
   * 1455 psi apareceria como linha reta.
   */
  private readonly coordenadas = computed(() => {
    const valores = this.pontos();
    if (valores.length < 2) return [];

    const min = Math.min(...valores);
    const max = Math.max(...valores);
    // Série constante não tem amplitude: centraliza em vez de dividir por zero.
    const amplitude = max - min || 1;
    const passoX = this.LARGURA / (valores.length - 1);
    const margem = 6;
    const alturaUtil = this.ALTURA - margem * 2;

    return valores.map((valor, i) => ({
      x: i * passoX,
      y: margem + alturaUtil - ((valor - min) / amplitude) * alturaUtil,
    }));
  });
}
