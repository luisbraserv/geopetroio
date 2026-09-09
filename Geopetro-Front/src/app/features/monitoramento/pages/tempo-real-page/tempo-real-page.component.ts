import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton } from '@taiga-ui/core';

import { ToastService } from '../../../../shared/toast/toast.service';
import { GraficoTempoRealComponent } from '../../components/grafico-tempo-real/grafico-tempo-real.component';
import { CardsUnidadeService } from '../../services/cards-unidade.service';
import { ConfiguracaoCards, GrandezaDeCard, chaveGrandeza, grandezasDe } from '../../services/grandezas-de-card';
import { MonitoramentoSondaService, SondaDisponivel } from '../../services/monitoramento-sonda.service';
import { RealtimeService } from '../../services/realtime.service';

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
  private readonly cardsService = inject(CardsUnidadeService);
  private readonly realtime = inject(RealtimeService);
  private readonly toast = inject(ToastService);

  protected readonly sondas = signal<SondaDisponivel[]>([]);
  protected readonly sondaSelecionada = signal<SondaDisponivel | null>(null);
  protected readonly carregandoSondas = signal(false);

  protected readonly configuracao = signal<ConfiguracaoCards | null>(null);
  protected readonly carregandoCards = signal(false);
  protected readonly erroCards = signal<string | null>(null);

  protected readonly status = this.realtime.status;
  protected readonly estado = this.realtime.estado;
  protected readonly erro = this.realtime.erro;

  /** Instante da última mensagem, para calcular defasagem. */
  private readonly agora = signal(Date.now());
  private readonly relogio: ReturnType<typeof setInterval>;

  /**
   * O que esta unidade mede, na ordem configurada.
   *
   * ⚠️ **Vem do documento de cards, não de uma lista fixa.** Até 2026-09-07 eram sempre as mesmas
   * cinco grandezas; hoje cada unidade declara as suas
   * (`specs/features/cards-configuraveis.md`), e uma unidade recém-cadastrada não declara nenhuma.
   */
  protected readonly grandezas = computed(() => grandezasDe(this.configuracao()?.cards));

  /**
   * Grandezas que chegaram pelo canal mas não estão no documento lido aqui.
   *
   * Acontece quando o Desktop publica a partir de um cache mais novo — ou mais velho — que o
   * documento vigente no servidor. Aparecem com o `dispositivoId` no lugar do rótulo: **esconder
   * uma leitura real seria pior que exibi-la sem nome bonito.**
   */
  protected readonly grandezasSemCard = computed<GrandezaDeCard[]>(() => {
    const conhecidas = new Set(this.grandezas().map((g) => g.chave));
    return (this.estado()?.leituras ?? [])
      .filter((leitura) => !conhecidas.has(chaveGrandeza(leitura.dispositivoId, leitura.serie)))
      .map((leitura) => ({
        chave: chaveGrandeza(leitura.dispositivoId, leitura.serie),
        dispositivoId: leitura.dispositivoId,
        serie: leitura.serie ?? null,
        tipo: leitura.tipo,
        rotulo: leitura.serie ? `${leitura.dispositivoId} — ${leitura.serie}` : leitura.dispositivoId,
        unidade: leitura.unidade ?? '',
        casas: 2,
        cor: '#64748b',
      }));
  });

  /** O que a tela desenha: o configurado, mais o que chegou sem estar configurado. */
  protected readonly grandezasVisiveis = computed(() => [
    ...this.grandezas(),
    ...this.grandezasSemCard(),
  ]);

  /**
   * Unidade nunca configurada: revisão `0` e nenhum card.
   *
   * Não é erro nem pendência sinalizada — é o estado normal de quem ainda não recebeu a visita de
   * configuração. Mas explica o que a tela vazia significa (RN-088).
   */
  protected readonly unidadeSemCards = computed(() => {
    const configuracao = this.configuracao();
    return !!configuracao && this.grandezas().length === 0;
  });

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
    this.aoTrocarSonda(sonda);
  }

  protected serieDe(grandeza: GrandezaDeCard): (number | null)[] {
    return this.realtime.series().get(grandeza.chave) ?? [];
  }

  /**
   * Unidade exibida.
   *
   * Prefere a que veio na mensagem — cada leitura se descreve (RN-097), e ela reflete o que a borda
   * realmente converteu. O documento de cards é a reserva para antes da primeira leitura chegar.
   */
  protected unidadeDe(grandeza: GrandezaDeCard): string {
    return this.realtime.leituras().get(grandeza.chave)?.unidade ?? grandeza.unidade;
  }

  protected valorCard(grandeza: GrandezaDeCard): string {
    const leitura = this.realtime.leituras().get(grandeza.chave);
    if (!leitura || !Number.isFinite(leitura.valor)) return '—';

    return leitura.valor.toLocaleString('pt-BR', {
      minimumFractionDigits: grandeza.casas,
      maximumFractionDigits: grandeza.casas,
    });
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

  /**
   * Trocar de sonda troca o conjunto de grandezas, não só os valores.
   *
   * Por isso a configuração anterior é descartada antes de a nova chegar: manter os cards da sonda
   * anterior na tela enquanto o documento novo carrega mostraria rótulos de uma unidade com
   * leituras de outra.
   */
  private aoTrocarSonda(sonda: SondaDisponivel | null): void {
    this.realtime.desconectar();
    this.configuracao.set(null);
    this.erroCards.set(null);

    if (!sonda) return;
    this.carregarCards(sonda);
  }

  private carregarCards(sonda: SondaDisponivel): void {
    this.carregandoCards.set(true);
    this.cardsService.ler(sonda.id).subscribe({
      next: (configuracao) => {
        // Resposta atrasada de uma sonda que já não é a selecionada não pode sobrescrever a atual.
        if (this.sondaSelecionada()?.id !== sonda.id) return;
        this.configuracao.set(configuracao);
        this.carregandoCards.set(false);
      },
      error: () => {
        if (this.sondaSelecionada()?.id !== sonda.id) return;
        this.erroCards.set('Não foi possível ler a configuração de cards desta unidade.');
        this.carregandoCards.set(false);
      },
    });
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
