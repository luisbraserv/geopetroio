import { CommonModule } from '@angular/common';
import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnChanges, Output, SimpleChanges, ViewChild } from '@angular/core';

@Component({
  selector: 'app-rich-text-editor',
  imports: [CommonModule],
  template: `
    <div class="editor">
      <div class="toolbar" aria-label="Editor de texto">
        <button type="button" title="Negrito" (mousedown)="evitarPerdaFoco($event)" (click)="executar('bold')"><strong>B</strong></button>
        <button type="button" title="Sublinhado" (mousedown)="evitarPerdaFoco($event)" (click)="executar('underline')"><u>U</u></button>
        <label title="Cor do texto">
          <span>A</span>
          <input type="color" [value]="textColor" (mousedown)="salvarSelecao()" (change)="aplicarCor('foreColor', $event)" />
        </label>
        <label title="Cor de fundo">
          <span class="mark">A</span>
          <input type="color" [value]="backgroundColor" (mousedown)="salvarSelecao()" (change)="aplicarCor('hiliteColor', $event)" />
        </label>
        <button type="button" title="Lista" (mousedown)="evitarPerdaFoco($event)" (click)="executar('insertUnorderedList')">Lista</button>
      </div>

      <div
        #editable
        class="editable"
        contenteditable="true"
        role="textbox"
        aria-multiline="true"
        [attr.data-placeholder]="placeholder"
        (input)="atualizarValor()"
        (keyup)="salvarSelecao()"
        (mouseup)="salvarSelecao()"
        (focus)="salvarSelecao()"
        (paste)="colarComoTexto($event)"
      ></div>
    </div>
  `,
  styles: [`
    .editor { display: grid; gap: 0; border: 1px solid #cbd5e1; border-radius: 8px; overflow: hidden; background: #fff; }
    .toolbar { display: flex; gap: .35rem; flex-wrap: wrap; align-items: center; padding: .45rem; border-bottom: 1px solid var(--color-card-border); background: var(--color-surface-muted); }
    button, label { min-height: 30px; display: inline-flex; align-items: center; justify-content: center; gap: .35rem; padding: 0 .55rem; border: 1px solid var(--color-border); border-radius: 6px; background: #fff; color: var(--color-text-strong); font: inherit; font-size: .78rem; font-weight: 800; cursor: pointer; }
    label input { width: 22px; height: 22px; padding: 0; border: 0; background: transparent; cursor: pointer; }
    .mark { padding: 0 .2rem; background: #fff2a8; border-radius: 3px; }
    .editable { min-height: 150px; max-height: 340px; overflow: auto; padding: .75rem; color: var(--color-text-strong); line-height: 1.5; outline: 0; }
    .editable:focus { box-shadow: inset 0 0 0 2px rgba(82, 140, 156, .22); }
    .editable:empty::before { content: attr(data-placeholder); color: var(--color-text-body); pointer-events: none; }
    .editable ul { margin: .35rem 0 .35rem 1.2rem; padding: 0; }
  `],
})
export class RichTextEditorComponent implements AfterViewInit, OnChanges {
  @Input() value = '';
  @Input() placeholder = 'Digite o texto...';
  @Output() valueChange = new EventEmitter<string>();
  @ViewChild('editable') private readonly editable?: ElementRef<HTMLDivElement>;

  protected readonly textColor = '#212F33';
  protected readonly backgroundColor = '#fff2a8';
  private range: Range | null = null;

  ngAfterViewInit(): void {
    this.atualizarEditor(this.value);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['value'] && this.editable && this.editable.nativeElement.innerHTML !== this.value) {
      this.atualizarEditor(this.value);
    }
  }

  protected executar(comando: string): void {
    this.focarEditor();
    document.execCommand(comando, false);
    this.atualizarValor();
  }

  protected aplicarCor(comando: string, event: Event): void {
    const color = (event.target as HTMLInputElement).value;
    this.restaurarSelecao();
    this.focarEditor();
    document.execCommand(comando, false, color);
    this.atualizarValor();
  }

  protected evitarPerdaFoco(event: MouseEvent): void {
    event.preventDefault();
    this.salvarSelecao();
  }

  protected salvarSelecao(): void {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);
    if (this.editable?.nativeElement.contains(range.commonAncestorContainer)) {
      this.range = range.cloneRange();
    }
  }

  protected colarComoTexto(event: ClipboardEvent): void {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') ?? '';
    document.execCommand('insertText', false, text);
    this.atualizarValor();
  }

  protected atualizarValor(): void {
    const html = this.sanitizar(this.editable?.nativeElement.innerHTML ?? '');
    this.value = html;
    this.valueChange.emit(html);
    this.salvarSelecao();
  }

  private focarEditor(): void {
    this.editable?.nativeElement.focus();
    this.restaurarSelecao();
  }

  private restaurarSelecao(): void {
    if (!this.range) return;
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(this.range);
  }

  private atualizarEditor(value: string): void {
    if (!this.editable) return;
    this.editable.nativeElement.innerHTML = this.sanitizar(value ?? '');
  }

  private sanitizar(value: string): string {
    return value
      .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?>[\s\S]*?<\/style>/gi, '')
      .replace(/\son\w+="[^"]*"/gi, '')
      .replace(/\son\w+='[^']*'/gi, '')
      .replace(/javascript:/gi, '');
  }
}
