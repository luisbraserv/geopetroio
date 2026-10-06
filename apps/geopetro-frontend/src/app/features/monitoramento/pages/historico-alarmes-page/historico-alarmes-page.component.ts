import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';

import { parseApiError } from '../../../../core/http/api-error';
import { CardsUnidadeService } from '../../services/cards-unidade.service';
import { GrandezaVigiavel, chaveGrandeza, grandezasVigiaveis } from '../../services/grandezas-de-card';
import { EpisodioAlarme, HistoricoAlarmesService } from '../../services/historico-alarmes.service';
import { MonitoramentoSondaService, SondaDisponivel } from '../../services/monitoramento-sonda.service';

/** Um episódio já com o rótulo e a unidade que a tela mostra. */
export interface EpisodioExibido {
  episodio: EpisodioAlarme;
  rotulo: string;
  unidade: string;
}

const PERIODOS = [
  { value: '24h', label: 'Últimas 24 horas', horas: 24 },
  { value: '7d', label: 'Últimos 7 dias', horas: 24 * 7 },
  { value: '30d', label: 'Últimos 30 dias', horas: 24 * 30 },
  { value: 'custom', label: 'Personalizado', horas: 0 },
] as const;

/**
 * Histórico de alarmes — passo 4 de `specs/SDD/negocio/requisitos/alarmes.md`.
 *
 * <h2>A tela lista excursões, não linhas de log</h2>
 * A pergunta é "o que aconteceu no turno?". Um episódio que abriu em atenção, escalou e fechou é
 * <b>uma</b> excursão — o servidor já agrupa (RN-056), e aqui a sequência de fatos fica recolhida
 * atrás de cada linha, porque o resumo responde a pergunta e o detalhe explica.
 *
 * <h2>⚠️ O período é obrigatório, e o resultado pode vir cortado</h2>
 * O log cresce sem política de retenção. Quando o servidor corta, a tela <b>diz</b> — uma lista
 * incompleta que se apresenta como completa é pior que uma lista curta.
 */
@Component({
  selector: 'app-historico-alarmes-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon],
  templateUrl: './historico-alarmes-page.component.html',
  styleUrl: './historico-alarmes-page.component.css',
})
export class HistoricoAlarmesPageComponent implements OnInit {
  private readonly sondasService = inject(MonitoramentoSondaService);
  private readonly cardsService = inject(CardsUnidadeService);
  private readonly historicoService = inject(HistoricoAlarmesService);

  readonly periodos = PERIODOS;

  readonly sondas = signal<SondaDisponivel[]>([]);
  readonly sondaSelecionada = signal<SondaDisponivel | null>(null);
  readonly periodo = signal<string>('24h');
  readonly inicioPersonalizado = signal<string>('');
  readonly fimPersonalizado = signal<string>('');

  readonly carregando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly consultou = signal(false);
  readonly truncado = signal(false);
  readonly episodios = signal<EpisodioExibido[]>([]);

  /** Episódios com a sequência de fatos aberta. Fechados por padrão: o resumo é o que se lê. */
  private readonly expandidos = signal<ReadonlySet<string>>(new Set());

  private readonly grandezas = signal<GrandezaVigiavel[]>([]);

  readonly semEpisodios = computed(() => this.consultou() && this.episodios().length === 0);

  readonly podeConsultar = computed(() =>
    !!this.sondaSelecionada()
    && !this.carregando()
    && (this.periodo() !== 'custom' || (!!this.inicioPersonalizado() && !!this.fimPersonalizado())),
  );

  get sondaSelecionadaValue() { return this.sondaSelecionada(); }
  set sondaSelecionadaValue(valor: SondaDisponivel | null) { this.sondaSelecionada.set(valor); }

  get periodoValue() { return this.periodo(); }
  set periodoValue(valor: string) { this.periodo.set(valor); }

  get inicioValue() { return this.inicioPersonalizado(); }
  set inicioValue(valor: string) { this.inicioPersonalizado.set(valor); }

  get fimValue() { return this.fimPersonalizado(); }
  set fimValue(valor: string) { this.fimPersonalizado.set(valor); }

  ngOnInit(): void {
    this.sondasService.listarMinhas().subscribe({
      next: (sondas) => this.sondas.set(sondas),
      error: (falha) => this.erro.set(parseApiError(falha)),
    });
  }

  onSondaChange(): void {
    this.erro.set(null);
    this.consultou.set(false);
    this.episodios.set([]);
    this.truncado.set(false);
    this.grandezas.set([]);
    this.expandidos.set(new Set());

    const sonda = this.sondaSelecionada();
    if (sonda) {
      this.carregarCards(sonda);
    }
  }

  /**
   * Os cards só dão o **rótulo** da grandeza; o histórico não depende deles.
   *
   * ⚠️ Por isso a falha aqui não bloqueia a consulta: uma excursão gravada continua sendo verdade
   * mesmo que o documento de cards não possa ser lido, e escondê-la seria pior que mostrá-la com o
   * `dispositivoId` cru no lugar do nome.
   */
  private carregarCards(sonda: SondaDisponivel): void {
    this.cardsService.ler(sonda.id).subscribe({
      next: (configuracao) => {
        if (this.sondaSelecionada()?.id !== sonda.id) return;
        this.grandezas.set(grandezasVigiaveis(configuracao.cards));
      },
      error: () => {
        if (this.sondaSelecionada()?.id !== sonda.id) return;
        this.grandezas.set([]);
      },
    });
  }

  consultar(): void {
    const sonda = this.sondaSelecionada();
    if (!sonda || !this.podeConsultar()) return;

    const janela = this.calcularPeriodo();
    if (!janela) {
      this.erro.set('Informe um período com início anterior ao fim.');
      return;
    }

    this.carregando.set(true);
    this.erro.set(null);

    this.historicoService.consultar(sonda.id, janela.inicio, janela.fim).subscribe({
      next: (pagina) => {
        this.carregando.set(false);
        if (this.sondaSelecionada()?.id !== sonda.id) return;
        this.episodios.set(pagina.episodios.map((episodio) => this.exibir(episodio)));
        this.truncado.set(pagina.truncado);
        this.consultou.set(true);
        this.expandidos.set(new Set());
      },
      error: (falha) => {
        this.carregando.set(false);
        if (this.sondaSelecionada()?.id !== sonda.id) return;
        this.erro.set(parseApiError(falha));
      },
    });
  }

  private exibir(episodio: EpisodioAlarme): EpisodioExibido {
    const chave = chaveGrandeza(episodio.dispositivoId, episodio.serie);
    const grandeza = this.grandezas().find((g) => g.chave === chave);
    return {
      episodio,
      // Sem card que a descreva, o id cru. Esconder uma excursão real seria pior.
      rotulo: grandeza?.rotulo ?? chave,
      unidade: grandeza?.unidade ?? '',
    };
  }

  private calcularPeriodo(): { inicio: string; fim: string } | null {
    if (this.periodo() === 'custom') {
      const inicio = new Date(this.inicioPersonalizado());
      const fim = new Date(this.fimPersonalizado());
      if (Number.isNaN(inicio.getTime()) || Number.isNaN(fim.getTime()) || inicio >= fim) {
        return null;
      }
      return { inicio: inicio.toISOString(), fim: fim.toISOString() };
    }

    const horas = PERIODOS.find((p) => p.value === this.periodo())?.horas ?? 24;
    const fim = new Date();
    return {
      inicio: new Date(fim.getTime() - horas * 3600 * 1000).toISOString(),
      fim: fim.toISOString(),
    };
  }

  expandido(episodioId: string): boolean {
    return this.expandidos().has(episodioId);
  }

  alternarDetalhe(episodioId: string): void {
    this.expandidos.update((atual) => {
      const proximo = new Set(atual);
      if (!proximo.delete(episodioId)) proximo.add(episodioId);
      return proximo;
    });
  }

  /** Quanto durou a excursão. Episódio aberto não tem duração fechada — e a tela diz isso. */
  duracao(episodio: EpisodioAlarme): string {
    if (!episodio.fechadoEm) return 'em curso';
    const segundos = Math.max(
      0,
      Math.round((new Date(episodio.fechadoEm).getTime() - new Date(episodio.abertoEm).getTime()) / 1000),
    );
    if (segundos < 60) return `${segundos} s`;
    const minutos = Math.floor(segundos / 60);
    if (minutos < 60) return `${minutos} min ${segundos % 60} s`;
    return `${Math.floor(minutos / 60)} h ${minutos % 60} min`;
  }

  rotuloFato(tipo: string): string {
    switch (tipo) {
      case 'ABRIU': return 'Abriu';
      case 'ESCALOU': return 'Escalou';
      case 'REDUZIU': return 'Reduziu';
      default: return 'Fechou';
    }
  }
}
