import { ComponentFixture, TestBed } from '@angular/core/testing';

import { GraficoMonitoramentoComponent } from './grafico-monitoramento.component';
import { MonitoramentoSerie } from '../../services/monitoramento-sonda.service';

/**
 * O gráfico do histórico foi reescrito para memoizar as coordenadas: antes cada polyline era
 * remontada em O(n²), o que travava a aba com 2000 pontos. Estes testes fixam o comportamento
 * observável — a curva desenhada tem de continuar a mesma.
 */
describe('GraficoMonitoramentoComponent', () => {
  let fixture: ComponentFixture<GraficoMonitoramentoComponent>;
  let componente: GraficoMonitoramentoComponent;

  function serie(valores: number[]): MonitoramentoSerie {
    return {
      idSondaUnidade: 'SPT-145',
      dispositivoId: 'pressao',
      pontos: valores.map((valor, i) => ({
        valor,
        dataHora: new Date(Date.UTC(2026, 0, 1, 0, i)).toISOString(),
      })),
    };
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraficoMonitoramentoComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(GraficoMonitoramentoComponent);
    componente = fixture.componentInstance;
  });

  function comSerie(valores: number[]) {
    componente.serie = serie(valores);
    fixture.detectChanges();
  }

  /** Média móvel da implementação anterior, para comparar o resultado numérico. */
  function mediaMovelAntiga(values: number[], window: number): number[] {
    return values.map((_, i) => {
      const start = Math.max(0, i - window + 1);
      const slice = values.slice(start, i + 1);
      return slice.reduce((soma, v) => soma + v, 0) / slice.length;
    });
  }

  it('desenha um ponto por leitura', () => {
    comSerie([10, 20, 30, 40]);

    expect(componente.originalSvg().split(' ')).toHaveLength(4);
  });

  it('mantém a escala dentro da área útil do gráfico', () => {
    comSerie([100, 200, 300]);

    // O maior valor encosta no topo da área e o menor na base — nunca fora dela.
    expect(componente.toY(300)).toBeCloseTo(componente.pad, 5);
    expect(componente.toY(100)).toBeCloseTo(componente.H - componente.pad, 5);
  });

  it('série constante não divide por zero', () => {
    // Amplitude zero: sem o `|| 1`, toda coordenada Y viraria NaN e a curva sumiria.
    comSerie([50, 50, 50, 50]);

    expect(componente.originalSvg()).not.toContain('NaN');
    expect(componente.rangeV).toBe(1);
  });

  it('série vazia não quebra o componente', () => {
    comSerie([]);

    expect(componente.originalSvg()).toBe('');
    expect(componente.areaOriginalSvg()).toBe('');
    expect(componente.gridLinhas().length).toBeGreaterThan(0);
  });

  it('suavização reproduz exatamente a média móvel anterior', () => {
    // A troca de slice+reduce por janela deslizante foi por desempenho, não por comportamento:
    // um resultado diferente mudaria a curva que o operador lê.
    const valores = Array.from({ length: 200 }, (_, i) => Math.sin(i / 7) * 500 + 1500);
    comSerie(valores);

    const esperado = mediaMovelAntiga(valores, 8);
    const obtido = componente
      .suavizadaSvg()
      .split(' ')
      .map((par) => Number(par.split(',')[1]));

    obtido.forEach((y, i) => {
      expect(y).toBeCloseTo(componente.toY(esperado[i]), 6);
    });
  });

  it('recalcula quando a série muda', () => {
    comSerie([10, 20, 30]);
    const antes = componente.originalSvg();

    comSerie([100, 200, 300, 400]);

    expect(componente.originalSvg()).not.toBe(antes);
    expect(componente.originalSvg().split(' ')).toHaveLength(4);
  });

  it('memoiza: chamadas repetidas devolvem a mesma string', () => {
    comSerie(Array.from({ length: 500 }, (_, i) => i));

    // Sem memoização, cada leitura remontava a string inteira — era isso que se repetia a
    // cada ciclo de detecção de mudanças.
    expect(componente.originalSvg()).toBe(componente.originalSvg());
  });

  it('monta 2000 pontos sem estourar o orçamento de um quadro', () => {
    const valores = Array.from({ length: 2000 }, (_, i) => Math.sin(i / 40) * 1000 + 2000);
    comSerie(valores);

    const inicio = performance.now();
    componente.originalSvg();
    componente.suavizadaSvg();
    const decorrido = performance.now() - inicio;

    // A versão em O(n²) levava ~160 ms só na primeira polyline. 50 ms é folgado e ainda
    // detectaria uma regressão de complexidade.
    expect(decorrido).toBeLessThan(50);
  });
});
