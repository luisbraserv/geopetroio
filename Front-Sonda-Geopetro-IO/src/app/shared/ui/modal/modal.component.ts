import { Component, booleanAttribute, input, output } from '@angular/core';

/**
 * Modal reutilizável para formulários de cadastro/edição.
 * Uso:
 *   <app-modal [open]="aberto()" title="Cadastrar" (close)="fechar()">
 *     ...conteúdo...
 *     <ng-container modal-footer> ...botões... </ng-container>
 *   </app-modal>
 */
@Component({
  selector: 'app-modal',
  template: `
    @if (open()) {
      <div class="modal-backdrop" (click)="onBackdrop($event)">
        <div class="modal" role="dialog" aria-modal="true" [style.--modal-width]="width()">
          <header class="modal__header">
            <div class="modal__titles">
              <h2>{{ title() }}</h2>
              @if (subtitle()) { <p>{{ subtitle() }}</p> }
            </div>
            <button type="button" class="modal__close" aria-label="Fechar" (click)="close.emit()">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            </button>
          </header>
          <div class="modal__body">
            <ng-content></ng-content>
          </div>
          <footer class="modal__footer">
            <ng-content select="[modal-footer]"></ng-content>
          </footer>
        </div>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 1000;
      background: rgba(15, 23, 42, .55); backdrop-filter: blur(2px);
      display: flex; align-items: flex-start; justify-content: center;
      padding: 5vh 16px; overflow-y: auto;
      animation: fade .15s ease;
    }
    .modal {
      width: min(var(--modal-width, 640px), 100%);
      background: #fff; border-radius: 16px;
      box-shadow: 0 24px 60px rgba(15, 23, 42, .28);
      display: flex; flex-direction: column; overflow: hidden;
      animation: pop .18s cubic-bezier(.2, .8, .25, 1);
    }
    .modal__header {
      display: flex; align-items: flex-start; justify-content: space-between; gap: 16px;
      padding: 20px 24px; border-bottom: 1px solid #eef2f7;
    }
    .modal__titles h2 { margin: 0; font-size: 1.2rem; font-weight: 800; color: #0f172a; }
    .modal__titles p { margin: 4px 0 0; font-size: .82rem; color: #64748b; }
    .modal__close {
      flex: none; width: 36px; height: 36px; display: grid; place-items: center;
      border: 1px solid #e2e8f0; border-radius: 10px; background: #fff; color: #475569; cursor: pointer;
      transition: background .15s, color .15s;
    }
    .modal__close:hover { background: #f1f5f9; color: #0f172a; }
    .modal__body { padding: 24px; overflow-y: auto; max-height: 70vh; }
    .modal__footer {
      display: flex; justify-content: flex-end; gap: 10px;
      padding: 16px 24px; border-top: 1px solid #eef2f7; background: #f8fafc;
    }
    .modal__footer:empty { display: none; }
    @keyframes fade { from { opacity: 0; } to { opacity: 1; } }
    @keyframes pop { from { opacity: 0; transform: translateY(8px) scale(.98); } to { opacity: 1; transform: none; } }
    @media (max-width: 640px) { .modal__body { padding: 16px; } .modal__header { padding: 16px; } }
  `],
})
export class ModalComponent {
  readonly open = input(false, { transform: booleanAttribute });
  readonly title = input('');
  readonly subtitle = input('');
  readonly width = input('640px');
  readonly closeOnBackdrop = input(true, { transform: booleanAttribute });

  readonly close = output<void>();

  protected onBackdrop(event: MouseEvent): void {
    if (this.closeOnBackdrop() && event.target === event.currentTarget) {
      this.close.emit();
    }
  }
}
