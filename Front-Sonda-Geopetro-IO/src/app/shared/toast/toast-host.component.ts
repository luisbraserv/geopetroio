import { CommonModule } from '@angular/common';
import { Component, inject } from '@angular/core';
import { TuiIcon } from '@taiga-ui/core';

import { AppToast, ToastKind, ToastService } from './toast.service';

@Component({
  selector: 'app-toast-host',
  imports: [CommonModule, TuiIcon],
  template: `
    <div class="toast-stack" aria-live="polite" aria-atomic="true">
      @for (toast of toastService.toasts(); track toast.id) {
        <article class="app-toast" [class]="toastClass(toast)" role="status">
          <tui-icon class="app-toast__icon" [icon]="icon(toast.kind)"></tui-icon>
          <div class="app-toast__content">
            <strong>{{ toast.title }}</strong>
            <span>{{ toast.message }}</span>
          </div>
          <button type="button" class="app-toast__close" (click)="toastService.dismiss(toast.id)" aria-label="Fechar mensagem">
            <tui-icon icon="@tui.x"></tui-icon>
          </button>
        </article>
      }
    </div>
  `,
  styles: [`
    .toast-stack {
      position: fixed;
      inset: 18px 18px auto auto;
      z-index: 2000;
      display: grid;
      gap: 10px;
      width: min(420px, calc(100vw - 32px));
      pointer-events: none;
    }

    .app-toast {
      display: grid;
      grid-template-columns: 36px minmax(0, 1fr) 30px;
      gap: 10px;
      align-items: start;
      padding: 12px;
      border: 1px solid var(--toast-border);
      border-left: 4px solid var(--toast-accent);
      border-radius: 8px;
      background: #ffffff;
      color: var(--color-text-primary);
      box-shadow: 0 18px 45px rgba(15, 23, 42, 0.18);
      pointer-events: auto;
    }

    .app-toast__icon {
      display: grid;
      width: 36px;
      height: 36px;
      place-items: center;
      border-radius: 8px;
      background: var(--toast-bg);
      color: var(--toast-accent);
      font-size: 18px;
    }

    .app-toast__content {
      min-width: 0;
      display: grid;
      gap: 3px;
    }

    .app-toast__content strong {
      font-size: 13px;
      font-weight: 800;
    }

    .app-toast__content span {
      color: var(--color-text-secondary);
      font-size: 13px;
      line-height: 1.4;
    }

    .app-toast__close {
      width: 30px;
      height: 30px;
      display: grid;
      place-items: center;
      border: 0;
      border-radius: 6px;
      background: transparent;
      color: var(--color-text-secondary);
      cursor: pointer;
    }

    .app-toast__close:hover {
      background: var(--color-surface-muted);
      color: var(--color-text-primary);
    }

    .app-toast--success { --toast-accent: var(--color-success); --toast-bg: var(--color-success-soft); --toast-border: rgba(22, 163, 74, 0.24); }
    .app-toast--error { --toast-accent: var(--color-error); --toast-bg: var(--color-error-soft); --toast-border: rgba(220, 38, 38, 0.24); }
    .app-toast--warning { --toast-accent: var(--color-warning); --toast-bg: var(--color-warning-soft); --toast-border: rgba(217, 119, 6, 0.26); }
    .app-toast--info { --toast-accent: var(--color-info); --toast-bg: var(--color-info-soft); --toast-border: rgba(37, 99, 235, 0.22); }

    @media (max-width: 640px) {
      .toast-stack {
        inset: auto 12px 12px 12px;
        width: auto;
      }
    }
  `],
})
export class ToastHostComponent {
  protected readonly toastService = inject(ToastService);

  protected icon(kind: ToastKind): string {
    return {
      success: '@tui.circle-check',
      error: '@tui.circle-x',
      warning: '@tui.triangle-alert',
      info: '@tui.info',
    }[kind];
  }

  protected toastClass(toast: AppToast): string {
    return `app-toast app-toast--${toast.kind}`;
  }
}
