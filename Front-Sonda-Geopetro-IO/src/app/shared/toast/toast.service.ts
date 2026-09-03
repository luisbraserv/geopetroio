import { Injectable, signal } from '@angular/core';

export type ToastKind = 'success' | 'error' | 'warning' | 'info';

export interface AppToast {
  id: number;
  kind: ToastKind;
  message: string;
  title: string;
}

const DEFAULT_TITLES: Record<ToastKind, string> = {
  success: 'Sucesso',
  error: 'Erro',
  warning: 'Atenção',
  info: 'Informação',
};

@Injectable({ providedIn: 'root' })
export class ToastService {
  readonly toasts = signal<AppToast[]>([]);
  private nextId = 1;

  success(message: string, title = DEFAULT_TITLES.success): void {
    this.show('success', message, title);
  }

  error(message: string, title = DEFAULT_TITLES.error): void {
    this.show('error', message, title);
  }

  warning(message: string, title = DEFAULT_TITLES.warning): void {
    this.show('warning', message, title);
  }

  info(message: string, title = DEFAULT_TITLES.info): void {
    this.show('info', message, title);
  }

  dismiss(id: number): void {
    this.toasts.update((items) => items.filter((item) => item.id !== id));
  }

  private show(kind: ToastKind, message: string, title: string): void {
    const toast: AppToast = {
      id: this.nextId++,
      kind,
      message: this.normalizeMessage(message),
      title,
    };

    this.toasts.update((items) => [...items, toast].slice(-4));
    window.setTimeout(() => this.dismiss(toast.id), kind === 'error' ? 6400 : 4200);
  }

  private normalizeMessage(message: string): string {
    const trimmed = String(message || '').trim();
    return trimmed || 'Não foi possível concluir a operação.';
  }
}
