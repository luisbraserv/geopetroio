import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import { forkJoin, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { MonitoramentoUnidadeService, MonitoramentoSerie, UnidadeDisponivel } from '../../services/monitoramento-unidade.service';
import { CardsUnidadeService } from '../../services/cards-unidade.service';
import { ConfiguracaoCards, GrandezaDeCard, grandezasDe } from '../../services/grandezas-de-card';
import { GraficoMonitoramentoComponent } from '../../components/grafico-monitoramento/grafico-monitoramento.component';
import { environment } from '../../../../../environments/environment';

/** Uma série pronta para desenhar, com a grandeza que a descreve. */
interface SerieExibida {
  chave: string;
  grandeza: GrandezaDeCard;
  serie: MonitoramentoSerie;
}

@Component({
  selector: 'app-monitoramento-unidade-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon, GraficoMonitoramentoComponent],
  templateUrl: './monitoramento-unidade-page.component.html',
  styleUrl: './monitoramento-unidade-page.component.css',
})
export class MonitoramentoUnidadePageComponent implements OnInit {
  private readonly service = inject(MonitoramentoUnidadeService);
  private readonly cardsService = inject(CardsUnidadeService);

  readonly unidades = signal<UnidadeDisponivel[]>([]);
  readonly unidadeSelecionada = signal<UnidadeDisponivel | null>(null);
  readonly periodo = signal<string>('1h');
  readonly inicioPeriodo = signal<string>('');
  readonly fimPeriodo = signal<string>('');
  readonly carregando = signal(false);
  readonly series = signal<SerieExibida[]>([]);
  readonly semDados = signal(false);
  readonly erro = signal<string | null>(null);

  readonly configuracao = signal<ConfiguracaoCards | null>(null);
  readonly carregandoCards = signal(false);

  /** Chaves das grandezas marcadas para consulta. Vazio antes de os cards chegarem. */
  private readonly selecionadas = signal<ReadonlySet<string>>(new Set());

  readonly demonstracaoAtiva = computed(() => {
    const demoId = environment.telemetriaDemoIdUnidade;
    return !!demoId && this.unidadeSelecionada()?.nome === demoId;
  });

  /**
   * O que esta unidade mede — vindo do documento de cards, não de uma lista fixa.
   *
   * ⚠️ Até 2026-09-07 esta lista era constante no código: cinco dispositivos iguais em toda a
   * frota. Com cards por unidade o conjunto varia, e um card de stroke traz **três** séries
   * (RN-098). Ver `specs/SDD/negocio/requisitos/cards-configuraveis.md`.
   */
  readonly grandezas = computed(() => grandezasDe(this.configuracao()?.cards));

  readonly unidadeSemCards = computed(
    () => !!this.configuracao() && this.grandezas().length === 0,
  );

  readonly periodos = [
    { value: '15m', label: 'Ultimos 15 minutos' },
    { value: '1h', label: 'Ultima 1 hora' },
    { value: '6h', label: 'Ultimas 6 horas' },
    { value: 'custom', label: 'Personalizado' },
  ];

  get unidadeSelecionadaValue() { return this.unidadeSelecionada(); }
  set unidadeSelecionadaValue(v: UnidadeDisponivel | null) { this.unidadeSelecionada.set(v); }

  get periodoValue() { return this.periodo(); }
  set periodoValue(v: string) { this.periodo.set(v); }

  get inicioPeriodoValue() { return this.inicioPeriodo(); }
  set inicioPeriodoValue(v: string) { this.inicioPeriodo.set(v); }

  get fimPeriodoValue() { return this.fimPeriodo(); }
  set fimPeriodoValue(v: string) { this.fimPeriodo.set(v); }

  readonly grandezasSelecionadas = computed(() =>
    this.grandezas().filter((grandeza) => this.selecionadas().has(grandeza.chave))
  );

  readonly podeconsultar = computed(() =>
    !!this.unidadeSelecionada() &&
    this.grandezasSelecionadas().length > 0 &&
    (this.periodo() !== 'custom' || (!!this.inicioPeriodo() && !!this.fimPeriodo()))
  );

  ngOnInit() {
    this.service.listarMinhas().subscribe({
      next: (unidades) => {
        this.unidades.set(unidades);
        const demoId = environment.telemetriaDemoIdUnidade;
        const unidadeDemo = demoId ? unidades.find((unidade) => unidade.nome === demoId) : undefined;
        if (unidadeDemo) {
          this.unidadeSelecionada.set(unidadeDemo);
          // Só há o que consultar depois de saber o que a unidade mede.
          this.carregarCards(unidadeDemo, () => this.consultar());
        }
      },
      error: () => this.erro.set('Erro ao carregar unidades disponíveis.'),
    });
  }

  onUnidadeChange() {
    this.series.set([]);
    this.semDados.set(false);
    this.erro.set(null);
    this.configuracao.set(null);
    this.selecionadas.set(new Set());

    const unidade = this.unidadeSelecionada();
    if (unidade) {
      this.carregarCards(unidade);
    }
  }

  estaSelecionada(chave: string): boolean {
    return this.selecionadas().has(chave);
  }

  alternarGrandeza(chave: string, checked: boolean) {
    this.selecionadas.update((atual) => {
      const proximo = new Set(atual);
      if (checked) proximo.add(chave);
      else proximo.delete(chave);
      return proximo;
    });
    this.series.update((series) => checked ? series : series.filter((item) => item.chave !== chave));
    this.semDados.set(false);
    this.erro.set(null);
  }

  private calcularPeriodo(): { inicio: string; fim: string } {
    const fim = new Date();
    let inicio = new Date();
    const p = this.periodo();
    if (p === '15m') inicio = new Date(fim.getTime() - 15 * 60 * 1000);
    else if (p === '1h') inicio = new Date(fim.getTime() - 60 * 60 * 1000);
    else if (p === '6h') inicio = new Date(fim.getTime() - 6 * 60 * 60 * 1000);
    else return {
      inicio: new Date(this.inicioPeriodo()).toISOString(),
      fim: new Date(this.fimPeriodo()).toISOString(),
    };
    return { inicio: inicio.toISOString(), fim: fim.toISOString() };
  }

  consultar() {
    const unidade = this.unidadeSelecionada();
    const grandezas = this.grandezasSelecionadas();
    if (!unidade || grandezas.length === 0) return;

    this.carregando.set(true);
    this.series.set([]);
    this.semDados.set(false);
    this.erro.set(null);

    const { inicio, fim } = this.calcularPeriodo();

    forkJoin(
      grandezas.map((grandeza) =>
        this.service
          // `grandeza.serie` separa as três de um card de stroke; é `null` nos demais tipos, e aí
          // o parâmetro não é enviado.
          .consultarSerie(unidade.id, grandeza.dispositivoId, inicio, fim, grandeza.serie)
          .pipe(
            catchError(() => of({
              idUnidade: unidade.nome,
              dispositivoId: grandeza.dispositivoId,
              serie: grandeza.serie,
              pontos: [],
            } as MonitoramentoSerie))
          )
      )
    ).subscribe({
      next: (resultados) => {
        this.carregando.set(false);
        // O índice casa resultado com grandeza: `forkJoin` preserva a ordem das entradas, e
        // casar por `dispositivoId` juntaria as três séries de um mesmo contador de stroke.
        const comDados = resultados
          .map((serie, indice) => ({ chave: grandezas[indice].chave, grandeza: grandezas[indice], serie }))
          .filter((item) => item.serie.pontos?.length);

        if (comDados.length === 0) {
          this.semDados.set(true);
        } else {
          this.series.set(comDados);
        }
      },
      error: (err) => {
        this.carregando.set(false);
        if (err.status === 403) {
          this.erro.set('Você não tem permissão para acessar esta unidade.');
        } else if (err.status === 502) {
          this.erro.set('Servico de telemetria indisponivel no momento.');
        } else {
          this.erro.set('Erro ao consultar dados de telemetria.');
        }
      },
    });
  }

  /**
   * Lê o documento de cards da unidade e marca tudo como selecionado.
   *
   * Marcar tudo preserva o comportamento anterior — a tela abria com as cinco variáveis ligadas —
   * agora sobre o conjunto que a unidade declara.
   */
  private carregarCards(unidade: UnidadeDisponivel, aoConcluir?: () => void): void {
    this.carregandoCards.set(true);
    this.cardsService.ler(unidade.id).subscribe({
      next: (configuracao) => {
        // Resposta atrasada de uma unidade que já não é a selecionada não pode sobrescrever a atual.
        if (this.unidadeSelecionada()?.id !== unidade.id) return;
        this.configuracao.set(configuracao);
        this.selecionadas.set(new Set(grandezasDe(configuracao.cards).map((g) => g.chave)));
        this.carregandoCards.set(false);
        aoConcluir?.();
      },
      error: () => {
        if (this.unidadeSelecionada()?.id !== unidade.id) return;
        this.carregandoCards.set(false);
        this.erro.set('Nao foi possivel ler a configuracao de cards desta unidade.');
      },
    });
  }
}
