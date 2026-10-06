import { AlarmeAtivo, alarmesPorGrandeza, ordenarPorGravidade } from './alarme-ativo';

function alarme(parcial: Partial<AlarmeAtivo> = {}): AlarmeAtivo {
  return {
    unidadeSondaId: 7,
    dispositivoId: 'PRESSAO_01',
    serie: null,
    episodioId: 'ep-1',
    severidadeAtual: 'ATENCAO',
    desde: '2026-09-09T12:00:00Z',
    valorExtremo: 105,
    limiteViolado: 'MAX',
    ...parcial,
  };
}

describe('alarmesPorGrandeza', () => {
  it('indexa pela chave, com a série', () => {
    const mapa = alarmesPorGrandeza([
      alarme({ dispositivoId: 'PRESSAO_01' }),
      alarme({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'vazao', episodioId: 'ep-2' }),
    ]);

    expect([...mapa.keys()]).toEqual(['PRESSAO_01', 'CONTADOR_STROKE_01|vazao']);
  });

  /**
   * ⚠️ Indexar só pelo `dispositivoId` acenderia o destaque da vazão em cima do card de volume
   * acumulado — as três séries de um contador compartilham o id (RN-098).
   */
  it('duas séries do mesmo contador não colidem', () => {
    const mapa = alarmesPorGrandeza([
      alarme({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'vazao', episodioId: 'ep-1' }),
      alarme({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'volumeAcumulado', episodioId: 'ep-2' }),
    ]);

    expect(mapa.size).toBe(2);
    expect(mapa.get('CONTADOR_STROKE_01|vazao')?.episodioId).toBe('ep-1');
    expect(mapa.get('CONTADOR_STROKE_01|volumeAcumulado')?.episodioId).toBe('ep-2');
  });

  it('sem alarme, mapa vazio — que é o estado normal', () => {
    expect(alarmesPorGrandeza([]).size).toBe(0);
    expect(alarmesPorGrandeza(null).size).toBe(0);
    expect(alarmesPorGrandeza(undefined).size).toBe(0);
  });
});

describe('ordenarPorGravidade', () => {
  it('crítico antes de atenção, e entre iguais o mais antigo primeiro', () => {
    const ordenados = ordenarPorGravidade([
      alarme({ episodioId: 'atencao-nova', desde: '2026-09-09T12:10:00Z' }),
      alarme({ episodioId: 'critico', severidadeAtual: 'CRITICO', desde: '2026-09-09T12:05:00Z' }),
      alarme({ episodioId: 'atencao-antiga', desde: '2026-09-09T12:00:00Z' }),
    ]);

    expect(ordenados.map((a) => a.episodioId)).toEqual(['critico', 'atencao-antiga', 'atencao-nova']);
  });

  it('não altera a lista recebida', () => {
    const original = [alarme({ episodioId: 'a' }), alarme({ episodioId: 'b', severidadeAtual: 'CRITICO' })];
    ordenarPorGravidade(original);
    expect(original.map((a) => a.episodioId)).toEqual(['a', 'b']);
  });
});
