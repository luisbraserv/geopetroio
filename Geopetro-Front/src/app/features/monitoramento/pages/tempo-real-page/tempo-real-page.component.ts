import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton } from '@taiga-ui/core';

import { ToastService } from '../../../../shared/toast/toast.service';
import { GraficoTempoRealComponent } from '../../components/grafico-tempo-real/grafico-tempo-real.component';
import { MonitoramentoSondaService, SondaDisponivel } from '../../services/monitoramento-sonda.service';
import { RealtimeService } from '../../services/realtime.service';

type ChaveGrandeza =
  | 'pesoColuna'
  | 'torqueTubos'
  | 'torqueFlutuante'
  | 'pressaoBomba'
  | 'vazao'
  | 'strokeAtual';

/** Um card do painel, com rótulo, unidade e casas decimais próprias. */
interface CardTempoReal {
  chave: ChaveGrandeza;
  rotulo: string;
  unidade: string;
  casas: number;
  /** Cor da curva no gráfico correspondente. */
  cor: string;
}

/** Acima disto, o dado deixa de representar o "agora" e a tela avisa. */
const LIMITE_DEFASAGEM_MS = 5000;

@Component({
  selector: 'app-tempo-real-page',
  imports: [CommonModule, FormsModule, TuiButton, GraficoTempoRealComponent],
  templateUrl: './tempo-real-page.component.html',
  styleUrl: './tempo-real-page.component.css',
})
export class TempoRealPageComponent implements OnDestroy {
  private readonly sondaService = inject(MonitoramentoSondaService);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(ToastService);

  protected readonly sondas = signal<SondaDisponivel[]>([]);
  protected readonly sondaSelecionada = signal<SondaDisponivel | null>(null);
  protected readonly carregandoSondas = signal(false);

  protected readonly status = this.realtime.status;
  protected readonly estado = this.realtime.estado;
  protected readonly erro = this.realtime.erro;

  /** Instante da última mensagem, para calcular defasagem. */
  private readonly agora = signal(Date.now());
  private readonly relogio: ReturnType<typeof setInterval>;

  protected readonly cards: CardTempoReal[] = [
    { chave: 'pesoColuna', rotulo: 'Peso da Coluna', unidade: 'lbf', casas: 0, cor: '#2563eb' },
    { chave: 'torqueTubos', rotulo: 'Torque Ch. Hid. Tubos', unidade: 'lbf.ft', casas: 0, cor: '#7c3aed' },
    { chave: 'torqueFlutuante', rotulo: 'Torque Ch. Flutuante', unidade: 'lbf.ft', casas: 0, cor: '#c026d3' },
    { chave: 'pressaoBomba', rotulo: 'P. Bomba de Lama', unidade: 'psi', casas: 1, cor: '#dc2626' },
    { chave: 'vazao', rotulo: 'Vazão', unidade: 'bbl/min', casas: 3, cor: '#0891b2' },
    { chave: 'strokeAtual', rotulo: 'Stroke Atual', unidade: '', casas: 0, cor: '#059669' },
  ];

  /**
   * Série de cada grandeza para os gráficos, derivada da janela deslizante.
   *
   * Um único `computed` por grandeza, calculado sob demanda: os seis gráficos leem daqui em vez de
   * cada um percorrer o histórico por conta própria.
   */
  protected readonly series = computed(() => {
    const historico = this.realtime.historico();
    const mapa = {} as Record<ChaveGrandeza, (number | null)[]>;
    for (const card of this.cards) {
      mapa[card.chave] = historico.map((estado) => estado[card.chave]);
    }
    return mapa;
  });

  protected serieDe(card: CardTempoReal): (number | null)[] {
    return this.series()[card.chave] ?? [];
  }

  protected readonly conectado = computed(() => this.status() === 'Online');
  protected readonly podeConectar = computed(
    () => !!this.sondaSelecionada() && this.status() !== 'Conectando',
  );

  /**
   * Defasagem do último dado recebido.
   *
   * Estar "Online" não garante dado fresco: se a sonda parar de publicar, a conexão permanece
   * aberta e os cards congelariam sem aviso. Este indicador torna isso visível.
   */
  protected readonly defasagemMs = computed(() => {
    const estado = this.estado();
    if (!estado?.timestamp) return null;
    return this.agora() - new Date(estado.timestamp).getTime();
  });

  protected readonly dadoDefasado = computed(() => {
    const defasagem = this.defasagemMs();
    return defasagem !== null && defasagem > LIMITE_DEFASAGEM_MS;
  });

  constructor() {
    this.carregarSondas();
    this.relogio = setInterval(() => this.agora.set(Date.now()), 1000);
  }

  ngOnDestroy(): void {
    clearInterval(this.relogio);
    // Sair da tela encerra o canal: manter a assinatura viva consumiria banda por nada.
    this.realtime.desconectar();
  }

  protected get sondaSelecionadaValue(): SondaDisponivel | null {
    return this.sondaSelecionada();
  }

  protected set sondaSelecionadaValue(sonda: SondaDisponivel | null) {
    this.sondaSelecionada.set(sonda);
  }

  protected async conectar(): Promise<void> {
    const sonda = this.sondaSelecionada();
    if (!sonda) return;

    await this.realtime.conectar(sonda.id);

    if (this.realtime.status() === 'Online') {
      this.toast.success(`Conectado a ${sonda.nome}.`);
    } else if (this.realtime.erro()) {
      this.toast.error(this.realtime.erro()!);
    }
  }

  protected desconectar(): void {
    this.realtime.desconectar();
  }

  protected valorCard(card: CardTempoReal): string {
    const estado = this.estado();
    if (!estado) return '—';

    const valor = estado[card.chave];
    if (valor === null || valor === undefined) return '—';

    return Number(valor).toLocaleString('pt-BR', {
      minimumFractionDigits: card.casas,
      maximumFractionDigits: card.casas,
    });
  }

  protected classeStatus(): string {
    switch (this.status()) {
      case 'Online':
        return 'status--online';
      case 'Conectando':
        return 'status--conectando';
      case 'Reconectando':
        return 'status--reconectando';
      default:
        return 'status--offline';
    }
  }

  protected horaUltimaLeitura(): string {
    const estado = this.estado();
    if (!estado?.timestamp) return '—';
    return new Date(estado.timestamp).toLocaleTimeString('pt-BR');
  }

  private carregarSondas(): void {
    this.carregandoSondas.set(true);
    this.sondaService.listarMinhas().subscribe({
      next: (sondas) => {
        this.sondas.set(sondas);
        this.carregandoSondas.set(false);
      },
      error: (e: Error) => {
        this.toast.error(e.message || 'Não foi possível listar as sondas.');
        this.carregandoSondas.set(false);
      },
    });
  }
}
