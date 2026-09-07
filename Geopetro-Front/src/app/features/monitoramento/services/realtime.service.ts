import { Injectable, inject, signal } from '@angular/core';
import { Store } from '@ngxs/store';

import { environment } from '../../../../environments/environment';
import { AuthState } from '../../auth/state/auth.state';
import { StompClient } from './stomp-client';

/** Estado instantâneo de uma Unidade/Sonda, recebido pelo canal de tempo real. */
export interface EstadoRealtime {
  unidadeSondaId: number;
  timestamp: string;
  pesoColuna: number | null;
  torqueTubos: number | null;
  torqueFlutuante: number | null;
  pressaoBomba: number | null;
  vazao: number | null;
  strokeAtual: number | null;
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
 * Canal de tempo real com o Backend-Sonda.
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
