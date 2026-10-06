import { TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';

import { EstadoRealtime, LeituraRealtime, RealtimeService } from './realtime.service';

/**
 * A indexação das leituras é o que substitui os campos fixos removidos em 2026-09-08.
 * Um erro de alinhamento aqui desloca a curva inteira de um gráfico em relação aos outros — e nada
 * na tela denuncia isso.
 */
describe('RealtimeService — leituras e séries', () => {
  let service: RealtimeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RealtimeService,
        // O canal só consulta o token ao abrir conexão; estes testes não conectam.
        { provide: Store, useValue: { selectSnapshot: () => null } },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  function leitura(parcial: Partial<LeituraRealtime>): LeituraRealtime {
    return {
      dispositivoId: 'PESO_01',
      tipo: 'PESO',
      unidade: 'lbf',
      valor: 1,
      ...parcial,
    };
  }

  function estado(leituras: LeituraRealtime[], timestamp = '2026-09-08T16:00:00Z'): EstadoRealtime {
    return { unidadeId: 7, timestamp, leituras };
  }

  it('indexa as leituras da última mensagem pela chave da grandeza', () => {
    service.estado.set(estado([
      leitura({ dispositivoId: 'PESO_01', valor: 184300 }),
      leitura({ dispositivoId: 'PRESSAO_01', tipo: 'PRESSAO', unidade: 'psi', valor: 1450 }),
    ]));

    expect(service.leituras().get('PESO_01')?.valor).toBe(184300);
    expect(service.leituras().get('PRESSAO_01')?.unidade).toBe('psi');
  });

  it('as três séries de um stroke não se sobrescrevem', () => {
    // RN-098: mesmo dispositivoId, séries diferentes. Indexar só pelo id perderia duas delas.
    service.estado.set(estado([
      leitura({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'stroke', tipo: 'CONTADOR_STROKE', unidade: 'stroke', valor: 42 }),
      leitura({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'vazao', tipo: 'CONTADOR_STROKE', unidade: 'bbl/min', valor: 1.52 }),
      leitura({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'volumeAcumulado', tipo: 'CONTADOR_STROKE', unidade: 'bbl', valor: 900 }),
    ]));

    expect(service.leituras().size).toBe(3);
    expect(service.leituras().get('CONTADOR_STROKE_01|stroke')?.valor).toBe(42);
    expect(service.leituras().get('CONTADOR_STROKE_01|vazao')?.valor).toBe(1.52);
    expect(service.leituras().get('CONTADOR_STROKE_01|volumeAcumulado')?.valor).toBe(900);
  });

  it('monta uma série por grandeza ao longo da janela', () => {
    service.historico.set([
      estado([leitura({ valor: 10 })]),
      estado([leitura({ valor: 20 })]),
      estado([leitura({ valor: 30 })]),
    ]);

    expect(service.series().get('PESO_01')).toEqual([10, 20, 30]);
  });

  it('grandeza ausente num ciclo vira lacuna, não ponto omitido', () => {
    // RN-099: card sem calibração não publica naquele ciclo. Comprimir a lacuna deslocaria o
    // restante da curva como se o tempo não tivesse passado.
    service.historico.set([
      estado([leitura({ valor: 10 }), leitura({ dispositivoId: 'PRESSAO_01', valor: 1400 })]),
      estado([leitura({ valor: 20 })]),
      estado([leitura({ valor: 30 }), leitura({ dispositivoId: 'PRESSAO_01', valor: 1402 })]),
    ]);

    expect(service.series().get('PRESSAO_01')).toEqual([1400, null, 1402]);
  });

  it('grandeza que só aparece no meio da janela é preenchida à esquerda', () => {
    // Um card ativado com a tela aberta não pode alinhar seu primeiro valor no início da janela.
    service.historico.set([
      estado([leitura({ valor: 10 })]),
      estado([leitura({ valor: 20 })]),
      estado([leitura({ valor: 30 }), leitura({ dispositivoId: 'TEMPERATURA_01', valor: 55 })]),
    ]);

    expect(service.series().get('TEMPERATURA_01')).toEqual([null, null, 55]);
  });

  it('todas as séries têm o mesmo comprimento da janela', () => {
    service.historico.set([
      estado([leitura({ valor: 10 })]),
      estado([leitura({ dispositivoId: 'PRESSAO_01', valor: 1400 })]),
    ]);

    for (const valores of service.series().values()) {
      expect(valores).toHaveLength(2);
    }
  });

  it('valor não finito vira lacuna em vez de quebrar a escala do gráfico', () => {
    service.historico.set([
      estado([leitura({ valor: 10 })]),
      estado([leitura({ valor: Number.NaN })]),
    ]);

    expect(service.series().get('PESO_01')).toEqual([10, null]);
  });

  it('sem mensagem nenhuma, não há leitura nem série', () => {
    expect(service.leituras().size).toBe(0);
    expect(service.series().size).toBe(0);
  });
});

/**
 * A projeção do alarme viaja dentro da mesma mensagem das leituras, e é isso que garante que o
 * destaque descreva os números que estão na tela.
 */
describe('RealtimeService — alarmes na mensagem', () => {
  let service: RealtimeService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        RealtimeService,
        { provide: Store, useValue: { selectSnapshot: () => null } },
      ],
    });
    service = TestBed.inject(RealtimeService);
  });

  function comAlarmes(alarmes: EstadoRealtime['alarmes']): EstadoRealtime {
    return {
      unidadeId: 7,
      timestamp: '2026-09-09T12:00:00Z',
      leituras: [{ dispositivoId: 'PRESSAO_01', tipo: 'PRESSAO', unidade: 'psi', valor: 130 }],
      alarmes,
    };
  }

  it('indexa os alarmes da mensagem pela chave da grandeza', () => {
    service.estado.set(comAlarmes([{
      unidadeId: 7,
      dispositivoId: 'PRESSAO_01',
      serie: null,
      episodioId: 'ep-1',
      severidadeAtual: 'CRITICO',
      desde: '2026-09-09T11:59:00Z',
      valorExtremo: 130,
      limiteViolado: 'MAX',
    }]));

    expect(service.alarmes().get('PRESSAO_01')?.severidadeAtual).toBe('CRITICO');
  });

  it('mensagem sem o campo não quebra a tela — servidor anterior a 2026-09-09', () => {
    service.estado.set(comAlarmes(undefined));
    expect(service.alarmes().size).toBe(0);

    service.estado.set(comAlarmes(null));
    expect(service.alarmes().size).toBe(0);
  });

  it('sem mensagem nenhuma, nenhum alarme — quem responde então é o REST', () => {
    expect(service.alarmes().size).toBe(0);
  });
});
