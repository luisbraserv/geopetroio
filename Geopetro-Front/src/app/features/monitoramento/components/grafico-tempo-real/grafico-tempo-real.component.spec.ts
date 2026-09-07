import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GraficoTempoRealComponent } from './grafico-tempo-real.component';

/**
 * O gráfico redesenha a cada segundo com dados vindos da rede — precisa aguentar série constante,
 * valores nulos e janela curta sem quebrar a tela.
 */
describe('GraficoTempoRealComponent', () => {
  let fixture: ComponentFixture<GraficoTempoRealComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraficoTempoRealComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GraficoTempoRealComponent);
    fixture.componentRef.setInput('titulo', 'Pressão');
    fixture.componentRef.setInput('unidade', 'psi');
  });

  function render(valores: (number | null)[]): HTMLElement {
    fixture.componentRef.setInput('valores', valores);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('desenha a curva com dados suficientes', () => {
    const el = render([10, 20, 15, 30]);

    const linha = el.querySelector('path.linha');
    expect(linha).toBeTruthy();
    expect(linha!.getAttribute('d')).toContain('M');
    expect(linha!.getAttribute('d')).toContain('L');
  });

  it('mostra aviso enquanto não há pontos suficientes', () => {
    const el = render([42]);

    expect(el.querySelector('path.linha')).toBeNull();
    expect(el.textContent).toContain('Aguardando');
  });

  it('não quebra com série constante', () => {
    // Amplitude zero: sem tratamento, a normalização dividiria por zero e produziria NaN no path,
    // que o navegador descarta silenciosamente — o gráfico simplesmente sumiria.
    const el = render([100, 100, 100, 100]);

    const d = el.querySelector('path.linha')!.getAttribute('d')!;
    expect(d).not.toContain('NaN');
    expect(d.length).toBeGreaterThan(0);
  });

  it('ignora valores nulos em vez de tratá-los como zero', () => {
    // Um null virando 0 criaria um mergulho falso na curva, sugerindo queda de pressão.
    const el = render([50, null, 52, 51]);

    const d = el.querySelector('path.linha')!.getAttribute('d')!;
    expect(d).not.toContain('NaN');
    // 3 pontos válidos = 3 comandos de caminho.
    expect(d.split(/[ML]/).length - 1).toBe(3);
  });

  it('exibe o valor mais recente da série', () => {
    const el = render([10, 20, 33]);

    expect(el.querySelector('.grafico__atual')!.textContent).toContain('33');
  });

  it('exibe mínimo e máximo da janela', () => {
    const el = render([10, 45, 22]);

    const rodape = el.querySelector('.grafico__rodape')!.textContent!;
    expect(rodape).toContain('10');
    expect(rodape).toContain('45');
  });
});
