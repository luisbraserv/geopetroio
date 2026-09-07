/**
 * Cliente STOMP mínimo sobre WebSocket nativo.
 *
 * **Por que não usar `@stomp/stompjs`:** o projeto tem um conflito de peer dependencies
 * pré-existente no Taiga UI, e instalar a biblioteca exigiria `--legacy-peer-deps` — mexendo no
 * lockfile de um projeto já frágil nesse ponto. Este cliente precisa de CONNECT, SUBSCRIBE,
 * UNSUBSCRIBE e DISCONNECT; escrever isso direto custa menos que o risco.
 *
 * Frame STOMP: `COMANDO\nheader:valor\n\ncorpo\0`
 */

const NULO = '\0';

export type StompMensagemHandler = (corpo: string) => void;

interface Assinatura {
  id: string;
  destino: string;
  handler: StompMensagemHandler;
}

export class StompClient {
  private socket: WebSocket | null = null;
  private readonly assinaturas = new Map<string, Assinatura>();
  private proximoId = 0;
  private conectado = false;

  constructor(
    private readonly url: string,
    private readonly token: string,
  ) {}

  /** Resolve no frame CONNECTED; rejeita se o servidor recusar (token inválido, por exemplo). */
  conectar(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.socket = new WebSocket(this.url);
      } catch (e) {
        reject(e);
        return;
      }

      const timeout = setTimeout(() => reject(new Error('Tempo esgotado ao conectar.')), 10000);

      this.socket.onopen = () => {
        // O token vai no frame CONNECT, não no handshake: o navegador não permite headers
        // customizados no handshake do WebSocket.
        this.enviarFrame('CONNECT', {
          'accept-version': '1.2',
          'heart-beat': '10000,10000',
          Authorization: `Bearer ${this.token}`,
        });
      };

      this.socket.onmessage = (evento) => {
        const frame = String(evento.data);

        if (frame.startsWith('CONNECTED')) {
          clearTimeout(timeout);
          this.conectado = true;
          resolve();
          return;
        }

        if (frame.startsWith('ERROR')) {
          clearTimeout(timeout);
          this.conectado = false;
          reject(new Error(this.extrairHeader(frame, 'message') ?? 'Conexão recusada.'));
          return;
        }

        if (frame.startsWith('MESSAGE')) {
          this.despachar(frame);
        }
      };

      this.socket.onerror = () => {
        clearTimeout(timeout);
        this.conectado = false;
        reject(new Error('Falha na conexão WebSocket.'));
      };

      this.socket.onclose = () => {
        clearTimeout(timeout);
        this.conectado = false;
        this.aoFechar?.();
      };
    });
  }

  /** Chamado quando a conexão cai — usado pelo serviço para disparar a reconexão. */
  aoFechar?: () => void;

  assinar(destino: string, handler: StompMensagemHandler): string {
    const id = `sub-${this.proximoId++}`;
    this.assinaturas.set(id, { id, destino, handler });
    this.enviarFrame('SUBSCRIBE', { id, destination: destino, ack: 'auto' });
    return id;
  }

  cancelarAssinatura(id: string): void {
    if (!this.assinaturas.has(id)) return;
    this.assinaturas.delete(id);
    if (this.conectado) {
      this.enviarFrame('UNSUBSCRIBE', { id });
    }
  }

  desconectar(): void {
    this.aoFechar = undefined;
    this.assinaturas.clear();
    if (this.socket) {
      if (this.conectado) {
        this.enviarFrame('DISCONNECT', {});
      }
      this.socket.close();
      this.socket = null;
    }
    this.conectado = false;
  }

  get estaConectado(): boolean {
    return this.conectado;
  }

  private despachar(frame: string): void {
    const id = this.extrairHeader(frame, 'subscription');
    if (!id) return;

    const assinatura = this.assinaturas.get(id);
    if (!assinatura) return;

    const corpo = this.extrairCorpo(frame);
    if (corpo) {
      assinatura.handler(corpo);
    }
  }

  private enviarFrame(comando: string, headers: Record<string, string>, corpo = ''): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) return;

    const linhas = Object.entries(headers).map(([k, v]) => `${k}:${v}`);
    const frame = `${comando}\n${linhas.join('\n')}\n\n${corpo}${NULO}`;
    this.socket.send(frame);
  }

  private extrairHeader(frame: string, nome: string): string | null {
    const linhas = frame.split('\n');
    for (const linha of linhas) {
      if (linha === '') break; // fim dos headers
      if (linha.startsWith(`${nome}:`)) {
        return linha.substring(nome.length + 1).trim();
      }
    }
    return null;
  }

  private extrairCorpo(frame: string): string | null {
    const separador = frame.indexOf('\n\n');
    if (separador < 0) return null;
    return frame.substring(separador + 2).replace(/\0+$/, '');
  }
}
