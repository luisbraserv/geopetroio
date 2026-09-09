import { Injectable, computed, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';

import { environment } from '../../../../environments/environment';
import { AuthState } from '../../auth/state/auth.state';
import { AlarmeAtivo, alarmesPorGrandeza } from './alarme-ativo';
import { TipoCard, chaveGrandeza } from './grandezas-de-card';
import { StompClient } from './stomp-client';

/**
 * Uma leitura, na mesma forma do MQTT (`mqtt-telemetria.md §3`).
 *
 * **A mensagem se descreve** (RN-097): tipo e unidade viajam junto do valor. É isso que permite um
 * card de um tipo novo aparecer na tela sem que o front conheça a unidade de antemão.
 */
export interface LeituraRealtime {
  dispositivoId: string;
  /** Distingue as três grandezas de um card de stroke — RN-098. Ausente nas demais. */
  serie?: string | null;
  tipo: TipoCard;
  unidade: string;
  /** Onde foi lido neste ciclo, como `DBW10`. Rastreabilidade, não exibição. */
  enderecoDb?: string;
  valor: number;
  valorBruto?: number;
}

/**
 * Estado instantâneo de uma Unidade/Sonda, recebido pelo canal de tempo real.
 *
 * ⚠️ **Reescrito em 2026-09-08.** Os campos fixos — `pesoColuna`, `torqueTubos`, `torqueFlutuante`,
 * `pressaoBomba`, `vazao`, `strokeAtual` — deixaram de existir. Com cards por unidade, o conjunto
 * varia de sonda para sonda: uma unidade com dois torques e uma temperatura não cabia neles, e
 * campos fixos seriam uma verdade parcial se passando por completa
 * (`specs/contracts/websocket-realtime.md §3`).
 *
 * **Só vêm grandezas com valor.** Um card sem calibração não publica nada naquele ciclo (RN-099):
 * a ausência é lacuna honesta, e zero seria um número que passaria por medição real.
 */
export interface EstadoRealtime {
  unidadeSondaId: number;
  timestamp: string;
  leituras: LeituraRealtime[];
  /**
   * Episódios abertos depois deste ciclo — acrescentado **pelo servidor**, não pela sonda.
   *
   * ⚠️ **Viaja junto das leituras de propósito.** O destaque descreve *estes* números; num canal
   * separado os dois chegariam em ordens diferentes e a tela mostraria um valor com o destaque do
   * ciclo anterior — um alarme aceso sobre um número que já voltou à faixa.
   *
   * Ausente em mensagem de um servidor anterior a 2026-09-09; a tela trata como lista vazia.
   */
  alarmes?: AlarmeAtivo[] | null;
}

export type StatusConexao = 'Offline' | 'Conectando' | 'Online' | 'Reconectando';

const BACKOFF_INICIAL_MS = 2000;
const BACKOFF_MAXIMO_MS = 30000;

/**
 * Tamanho da janela deslizante dos gráficos.
 *
 * A 1 leitura/s, 120 pontos = 2 minutos — o suficiente para enxergar tendência sem acumular
 * memória indefinidamente numa tela que pode ficar aberta o dia todo.
 */
const JANELA_GRAFICO = 120;

/**
 * Canal de tempo real com o Geopetro-Backend.
 *
 * **Responsabilidade:** apenas o "agora". O histórico vem por REST
 * (`MonitoramentoSondaService`), que consulta o InfluxDB via backend.
 *
 * A autorização é do backend: assinar um tópico de uma Unidade/Sonda sem permissão é recusado no
 * servidor, mesmo que o id seja trocado à mão aqui.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly store = inject(Store);

  readonly status = signal<StatusConexao>('Offline');
  readonly estado = signal<EstadoRealtime | null>(null);
  readonly erro = signal<string | null>(null);

  /**
   * Janela deslizante dos últimos estados, para os gráficos.
   *
   * Existe só no cliente e só enquanto a tela está aberta — este canal não tem histórico
   * (ver `websocket-realtime.md`). Para série histórica de verdade, use o Monitoramento.
   */
  readonly historico = signal<EstadoRealtime[]>([]);

  /**
   * Leituras da última mensagem, indexadas pela chave da grandeza.
   *
   * A chave inclui a série porque as três de um contador de stroke compartilham o
   * `dispositivoId` (RN-098) — indexar só por ele faria vazão sobrescrever stroke.
   */
  readonly leituras = computed(() => {
    const mapa = new Map<string, LeituraRealtime>();
    for (const leitura of this.estado()?.leituras ?? []) {
      mapa.set(chaveGrandeza(leitura.dispositivoId, leitura.serie), leitura);
    }
    return mapa;
  });

  /**
   * Alarmes abertos na última mensagem, indexados pela chave da grandeza.
   *
   * Vazio enquanto nenhuma mensagem chegou — e aí quem responde é a rota REST, porque um episódio
   * aberto de sonda que parou de publicar continua sendo verdade.
   */
  readonly alarmes = computed(() => alarmesPorGrandeza(this.estado()?.alarmes));

  /**
   * Série de cada grandeza ao longo da janela, para os gráficos.
   *
   * Um ciclo sem determinada grandeza vira `null` na posição, não um ponto omitido: a leitura pode
   * faltar por falta de calibração (RN-099), e comprimir a lacuna deslocaria todo o resto da curva
   * como se o tempo não tivesse passado.
   *
   * As chaves saem das próprias mensagens, não de uma lista fixa — é o que permite a tela
   * acompanhar um documento de cards que mudou enquanto ela estava aberta.
   */
  readonly series = computed(() => {
    const janela = this.historico();
    const mapa = new Map<string, (number | null)[]>();

    for (const [posicao, estado] of janela.entries()) {
      for (const leitura of estado.leituras ?? []) {
        const chave = chaveGrandeza(leitura.dispositivoId, leitura.serie);
        let valores = mapa.get(chave);
        if (!valores) {
          // Chave vista pela primeira vez: os ciclos anteriores não a tinham.
          valores = new Array<number | null>(posicao).fill(null);
          mapa.set(chave, valores);
        }
        // Posição fixa em vez de `push`: uma chave repetida no mesmo ciclo sobrescreve o valor,
        // em vez de deslocar a série inteira em relação às demais.
        valores[posicao] = Number.isFinite(leitura.valor) ? leitura.valor : null;
      }
      // Completa quem não veio neste ciclo, para todas as séries manterem o mesmo comprimento.
      for (const valores of mapa.values()) {
        while (valores.length <= posicao) valores.push(null);
      }
    }

    return mapa;
  });

  private client: StompClient | null = null;
  private assinaturaId: string | null = null;
  private unidadeAtual: number | null = null;
  private backoffMs = BACKOFF_INICIAL_MS;
  private reconexaoTimer: ReturnType<typeof setTimeout> | null = null;
  private encerradoPeloUsuario = false;

  /**
   * Conecta e assina a Unidade/Sonda informada.
   *
   * Trocar de unidade cancela a assinatura anterior — sem isso, a tela receberia dois fluxos
   * misturados e os cards piscariam entre sondas diferentes.
   */
  async conectar(unidadeSondaId: number): Promise<void> {
    this.encerradoPeloUsuario = false;
    this.cancelarReconexaoPendente();

    if (this.unidadeAtual === unidadeSondaId && this.status() === 'Online') {
      return;
    }

    // Estado da sonda anterior não vale para a nova: limpar evita exibir dado de outra unidade
    // durante o intervalo até a primeira mensagem chegar.
    this.estado.set(null);
    this.historico.set([]);
    this.unidadeAtual = unidadeSondaId;
    this.erro.set(null);

    if (this.client?.estaConectado) {
      this.trocarAssinatura(unidadeSondaId);
      return;
    }

    await this.abrirConexao(unidadeSondaId);
  }

  desconectar(): void {
    this.encerradoPeloUsuario = true;
    this.cancelarReconexaoPendente();
    this.assinaturaId = null;
    this.unidadeAtual = null;
    this.client?.desconectar();
    this.client = null;
    this.estado.set(null);
    this.historico.set([]);
    this.status.set('Offline');
  }

  private async abrirConexao(unidadeSondaId: number): Promise<void> {
    const token = this.store.selectSnapshot(AuthState.token);
    if (!token) {
      this.erro.set('Sessão expirada. Faça login novamente.');
      this.status.set('Offline');
      return;
    }

    this.status.set(this.backoffMs === BACKOFF_INICIAL_MS ? 'Conectando' : 'Reconectando');

    const client = new StompClient(this.urlWebSocket(), token);
    client.aoFechar = () => this.aoPerderConexao();

    try {
      await client.conectar();
      this.client = client;
      this.backoffMs = BACKOFF_INICIAL_MS;
      this.trocarAssinatura(unidadeSondaId);
      this.status.set('Online');
      this.erro.set(null);
    } catch (e) {
      this.client = null;
      const mensagem = e instanceof Error ? e.message : 'Falha ao conectar.';
      this.erro.set(mensagem);
      this.agendarReconexao();
    }
  }

  private trocarAssinatura(unidadeSondaId: number): void {
    if (!this.client) return;

    if (this.assinaturaId) {
      this.client.cancelarAssinatura(this.assinaturaId);
      this.assinaturaId = null;
    }

    this.assinaturaId = this.client.assinar(
      `/topic/realtime/unidades-sondas/${unidadeSondaId}`,
      (corpo) => this.aoReceber(corpo),
    );
  }

  private aoReceber(corpo: string): void {
    try {
      const estado = JSON.parse(corpo) as EstadoRealtime;
      // Descarta mensagem de outra unidade: pode chegar no intervalo entre trocar de sonda e o
      // servidor processar o UNSUBSCRIBE.
      if (this.unidadeAtual !== null && estado.unidadeSondaId !== this.unidadeAtual) {
        return;
      }
      // Mensagem sem a lista é de um produtor no formato antigo (campos fixos, até 2026-09-07).
      // Aceitá-la produziria uma tela sem nenhum card e sem explicar por quê.
      if (!Array.isArray(estado.leituras)) {
        this.erro.set('A sonda está publicando num formato que esta versão não entende.');
        return;
      }
      this.estado.set(estado);
      this.historico.update((atual) => {
        const proximo = [...atual, estado];
        // Janela deslizante: descarta o mais antigo ao exceder o limite.
        return proximo.length > JANELA_GRAFICO ? proximo.slice(-JANELA_GRAFICO) : proximo;
      });
    } catch {
      // Payload malformado não deve derrubar o canal — a próxima mensagem vem em 1s.
    }
  }

  private aoPerderConexao(): void {
    if (this.encerradoPeloUsuario) return;

    this.client = null;
    this.assinaturaId = null;
    this.agendarReconexao();
  }

  /**
   * Reconecta com backoff exponencial.
   *
   * Ao voltar, recebe o **estado mais recente** — não uma fila de estados antigos. Isso é
   * propriedade do desenho: o produtor sobrescreve o estado em vez de enfileirá-lo.
   */
  private agendarReconexao(): void {
    if (this.encerradoPeloUsuario || this.unidadeAtual === null) return;

    this.status.set('Reconectando');
    const unidade = this.unidadeAtual;
    const espera = this.backoffMs;

    this.reconexaoTimer = setTimeout(() => {
      this.reconexaoTimer = null;
      void this.abrirConexao(unidade);
    }, espera);

    this.backoffMs = Math.min(this.backoffMs * 2, BACKOFF_MAXIMO_MS);
  }

  private cancelarReconexaoPendente(): void {
    if (this.reconexaoTimer !== null) {
      clearTimeout(this.reconexaoTimer);
      this.reconexaoTimer = null;
    }
    this.backoffMs = BACKOFF_INICIAL_MS;
  }

  private urlWebSocket(): string {
    const base = environment.apiUrl || window.location.origin;
    const url = new URL(base, window.location.origin);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    url.pathname = '/ws';
    return url.toString();
  }
}
