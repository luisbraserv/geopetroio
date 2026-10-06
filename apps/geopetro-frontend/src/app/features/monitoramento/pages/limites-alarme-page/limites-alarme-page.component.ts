import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';

import { parseApiError } from '../../../../core/http/api-error';
import { CardsUnidadeService } from '../../services/cards-unidade.service';
import { GrandezaVigiavel, grandezasVigiaveis } from '../../services/grandezas-de-card';
import {
  ConfiguracaoLimites,
  LimiteAlarme,
  LimitesAlarmeService,
  validarLimite,
} from '../../services/limites-alarme.service';
import { MonitoramentoUnidadeService, UnidadeDisponivel } from '../../services/monitoramento-unidade.service';

/** Uma linha do formulário: a grandeza e os seis números que a vigiam. */
interface LinhaLimite {
  grandeza: GrandezaVigiavel;
  ativo: boolean;
  minimoCritico: number | null;
  minimoAtencao: number | null;
  maximoAtencao: number | null;
  maximoCritico: number | null;
  segundosParaAbrir: number;
  segundosParaFechar: number;
}

/** Um limite gravado para grandeza que a unidade não declara mais. */
interface LimiteOrfao {
  chave: string;
  limite: LimiteAlarme;
}

const LINHA_VAZIA = {
  ativo: false,
  minimoCritico: null,
  minimoAtencao: null,
  maximoAtencao: null,
  maximoCritico: null,
  segundosParaAbrir: 0,
  segundosParaFechar: 0,
} as const;

/**
 * Ajuste dos limites de alarme de uma Unidade — passo 2 de `specs/SDD/negocio/requisitos/alarmes.md`.
 *
 * <h2>Por que a tela pergunta os cards antes de tudo</h2>
 * Um limite só existe para uma grandeza que a unidade **declara** ([RN-101]). Não há mais lista
 * fixa de cinco dispositivos: uma unidade com dois cards de torque e um de tanque oferece coisas
 * diferentes de outra, e o servidor recusa limite de grandeza não declarada.
 *
 * <h2>⚠️ Três estados que a tela precisa distinguir, e o servidor não distingue</h2>
 * <ul>
 *   <li><b>Vigiada</b> — card ativo e visível. É o caso normal.</li>
 *   <li><b>Não avaliada</b> — card ativo mas invisível. O limite salva e <b>nunca dispara</b>,
 *       porque a avaliação roda sobre o tempo real e o tempo real só carrega cards visíveis
 *       (RN-037 encontrando RN-102). Ver OQ-050 — a tela avisa, e não recusa.</li>
 *   <li><b>Hibernando</b> — card desativado. O limite continua gravado e volta a valer quando o
 *       card for reativado (RN-091).</li>
 * </ul>
 */
@Component({
  selector: 'app-limites-alarme-page',
  standalone: true,
  imports: [CommonModule, FormsModule, TuiButton, TuiIcon],
  templateUrl: './limites-alarme-page.component.html',
  styleUrl: './limites-alarme-page.component.css',
})
export class LimitesAlarmePageComponent implements OnInit {
  private readonly unidadesService = inject(MonitoramentoUnidadeService);
  private readonly cardsService = inject(CardsUnidadeService);
  private readonly limitesService = inject(LimitesAlarmeService);

  readonly unidades = signal<UnidadeDisponivel[]>([]);
  readonly unidadeSelecionada = signal<UnidadeDisponivel | null>(null);

  readonly carregando = signal(false);
  readonly salvando = signal(false);
  readonly erro = signal<string | null>(null);
  readonly aviso = signal<string | null>(null);
  readonly salvo = signal<string | null>(null);

  readonly documento = signal<ConfiguracaoLimites | null>(null);
  readonly linhas = signal<LinhaLimite[]>([]);
  readonly orfaos = signal<LimiteOrfao[]>([]);
  /** `null` enquanto os cards não chegaram; distingue "carregando" de "unidade sem cards". */
  readonly cardsLidos = signal(false);

  /**
   * Qual seleção está valendo agora.
   *
   * ⚠️ **Comparar o id da unidade não basta.** A sequência A → B → A devolve o mesmo id de uma
   * requisição que já não é a atual, e a resposta velha passaria pela guarda como se fosse a nova.
   * O contador cresce a cada troca e a cada recarga, então cada resposta sabe de qual ciclo veio.
   */
  private ciclo = 0;

  readonly unidadeSemCards = computed(() => this.cardsLidos() && this.linhas().length === 0);

  readonly autoria = computed(() => {
    const doc = this.documento();
    return doc?.atualizadoPor && doc?.atualizadoEm
      ? { por: doc.atualizadoPor, em: new Date(doc.atualizadoEm) }
      : null;
  });

  /** Erros por linha, na mesma ordem — o botão de salvar só libera com todas limpas. */
  readonly errosPorLinha = computed(() =>
    this.linhas().map((linha) => validarLimite(paraLimite(linha))),
  );

  readonly podeSalvar = computed(() =>
    !!this.unidadeSelecionada()
    && !!this.documento()
    && !this.salvando()
    && this.errosPorLinha().every((erro) => erro === null),
  );

  get unidadeSelecionadaValue() { return this.unidadeSelecionada(); }
  set unidadeSelecionadaValue(valor: UnidadeDisponivel | null) { this.unidadeSelecionada.set(valor); }

  ngOnInit(): void {
    this.unidadesService.listarMinhas().subscribe({
      next: (unidades) => this.unidades.set(unidades),
      error: (falha) => this.erro.set(parseApiError(falha)),
    });
  }

  onUnidadeChange(): void {
    this.limparMensagens();
    this.documento.set(null);
    this.linhas.set([]);
    this.orfaos.set([]);
    this.cardsLidos.set(false);
    // Abandona o ciclo anterior antes de qualquer coisa: o que estiver em voo ja nao vale.
    this.ciclo += 1;
    this.carregando.set(false);

    const unidade = this.unidadeSelecionada();
    if (unidade) {
      this.carregar(unidade);
    }
  }

  /**
   * Lê os dois documentos e cruza um com o outro.
   *
   * ⚠️ **Sequencial, não em paralelo**: os cards decidem quais linhas existem, e os limites só
   * preenchem o que aquelas linhas comportam. Em paralelo, uma resposta atrasada de cards
   * reconstruiria as linhas e apagaria os valores já preenchidos pelos limites.
   */
  private carregar(unidade: UnidadeDisponivel): void {
    const meu = (this.ciclo += 1);
    this.carregando.set(true);
    this.cardsService.ler(unidade.id).subscribe({
      next: (configuracao) => {
        // Resposta atrasada de um ciclo que ja nao e o atual nao pode sobrescrever a tela.
        if (!this.atual(meu)) return;
        const grandezas = grandezasVigiaveis(configuracao.cards);
        this.cardsLidos.set(true);
        this.carregarLimites(unidade, grandezas, meu);
      },
      error: (falha) => {
        if (!this.atual(meu)) return;
        this.carregando.set(false);
        this.erro.set(parseApiError(falha));
      },
    });
  }

  private carregarLimites(unidade: UnidadeDisponivel, grandezas: GrandezaVigiavel[], meu: number): void {
    this.limitesService.ler(unidade.id).subscribe({
      next: (documento) => {
        if (!this.atual(meu)) return;
        this.carregando.set(false);
        this.aplicar(documento, grandezas);
      },
      error: (falha) => {
        if (!this.atual(meu)) return;
        this.carregando.set(false);
        this.erro.set(parseApiError(falha));
      },
    });
  }

  /**
   * A resposta veio do ciclo que ainda está na tela?
   *
   * ⚠️ Quem descarta uma resposta velha **não pode** mexer nos sinais da tela — nem para desligar o
   * `carregando`. Era o que travava a tela: o ciclo velho ligava `carregando` e o ciclo novo, que
   * não sabia dele, nunca o desligava.
   */
  private atual(ciclo: number): boolean {
    return this.ciclo === ciclo;
  }

  private aplicar(documento: ConfiguracaoLimites, grandezas: GrandezaVigiavel[]): void {
    const gravados = new Map(documento.limites.map((limite) => [chaveDe(limite), limite]));

    this.linhas.set(grandezas.map((grandeza) => {
      const limite = gravados.get(grandeza.chave);
      gravados.delete(grandeza.chave);
      return limite ? { grandeza, ...semIdentidade(limite) } : { grandeza, ...LINHA_VAZIA };
    }));

    // O que sobrou nao tem card que o explique — tipicamente um id do vocabulario fixo antigo.
    this.orfaos.set([...gravados].map(([chave, limite]) => ({ chave, limite })));
    this.documento.set(documento);
  }

  salvar(): void {
    const unidade = this.unidadeSelecionada();
    const documento = this.documento();
    if (!unidade || !documento || !this.podeSalvar()) return;

    this.limparMensagens();
    this.salvando.set(true);

    // Linha sem limiar nenhum nao vira limite: e assim que se apaga um.
    const limites = this.linhas().map(paraLimite).filter(temAlgumLimiar);

    // O salvamento pertence ao ciclo em que foi disparado: trocar de unidade no meio o invalida.
    const meu = this.ciclo;

    this.limitesService.salvar(unidade.id, documento.revisao, limites).subscribe({
      next: (atualizado) => {
        // `salvando` sai do ar em qualquer caso: e o estado do botao, nao o da unidade.
        this.salvando.set(false);
        if (!this.atual(meu)) return;
        this.aplicar(atualizado, this.linhas().map((linha) => linha.grandeza));
        this.salvo.set(`Limites salvos. Revisão ${atualizado.revisao}.`);
      },
      error: (falha) => {
        this.salvando.set(false);
        // ⚠️ O erro precisa da MESMA guarda do sucesso. Sem ela, um 409 atrasado da unidade anterior
        // mandava recarregar aquela unidade: `carregar` ligava o indicador de espera, a resposta
        // caia fora do ciclo atual e ninguem o desligava — a unidade selecionada ficava escondida
        // atras de um "carregando" que nao terminava.
        if (!this.atual(meu)) return;
        if (falha?.status === 409) {
          this.recarregarPorConflito(unidade);
          return;
        }
        this.erro.set(parseApiError(falha));
      },
    });
  }

  /**
   * Conflito de revisão: recarrega e **descarta** o que estava digitado.
   *
   * ⚠️ Manter o formulário e apenas atualizar a revisão faria o próximo clique sobrescrever, sem
   * ver, o ajuste que a outra pessoa acabou de fazer — que é exatamente o que a revisão existe
   * para impedir.
   */
  private recarregarPorConflito(unidade: UnidadeDisponivel): void {
    this.aviso.set(
      'Outra pessoa alterou os limites desta unidade enquanto você editava. '
      + 'O que estava na tela foi descartado e os valores atuais foram recarregados.',
    );
    this.carregar(unidade);
  }

  private limparMensagens(): void {
    this.erro.set(null);
    this.aviso.set(null);
    this.salvo.set(null);
  }

  /** Marcar como ativa uma grandeza sem limiar nenhum é o erro mais fácil de cometer aqui. */
  atualizar(indice: number, campo: keyof Omit<LinhaLimite, 'grandeza'>, valor: unknown): void {
    this.salvo.set(null);
    this.linhas.update((linhas) => linhas.map((linha, posicao) =>
      posicao === indice ? { ...linha, [campo]: normalizar(campo, valor) } : linha,
    ));
  }
}

function normalizar(campo: keyof Omit<LinhaLimite, 'grandeza'>, valor: unknown): unknown {
  if (campo === 'ativo') return !!valor;
  if (campo === 'segundosParaAbrir' || campo === 'segundosParaFechar') {
    const numero = Number(valor);
    return Number.isFinite(numero) ? Math.trunc(numero) : 0;
  }
  if (valor === null || valor === undefined || valor === '') return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
}

function chaveDe(limite: LimiteAlarme): string {
  return limite.serie ? `${limite.dispositivoId}|${limite.serie}` : limite.dispositivoId;
}

function semIdentidade(limite: LimiteAlarme) {
  const { dispositivoId, serie, ...resto } = limite;
  return resto;
}

function paraLimite(linha: LinhaLimite): LimiteAlarme {
  return {
    dispositivoId: linha.grandeza.dispositivoId,
    serie: linha.grandeza.serie,
    minimoAtencao: linha.minimoAtencao,
    maximoAtencao: linha.maximoAtencao,
    minimoCritico: linha.minimoCritico,
    maximoCritico: linha.maximoCritico,
    segundosParaAbrir: linha.segundosParaAbrir,
    segundosParaFechar: linha.segundosParaFechar,
    ativo: linha.ativo,
  };
}

function temAlgumLimiar(limite: LimiteAlarme): boolean {
  return [limite.minimoAtencao, limite.maximoAtencao, limite.minimoCritico, limite.maximoCritico]
    .some((valor) => valor !== null && valor !== undefined);
}
