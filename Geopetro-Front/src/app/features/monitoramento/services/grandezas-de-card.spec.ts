import {
  CardUnidade,
  SERIE_STROKE,
  SERIE_VAZAO,
  SERIE_VOLUME,
  chaveGrandeza,
  grandezasDe,
} from './grandezas-de-card';

/**
 * Este módulo é a fronteira entre "o que a unidade declara medir" e "o que a tela desenha".
 * Errar aqui produz gráfico com rótulo trocado ou unidade errada — e o relatório de telemetria sai
 * da empresa com esses números.
 */
describe('grandezasDe', () => {
  function card(parcial: Partial<CardUnidade>): CardUnidade {
    return {
      dispositivoId: 'PESO_01',
      nome: 'Peso da Coluna',
      tipo: 'PESO',
      byteInicial: 4,
      ativo: true,
      visivel: true,
      ordem: 0,
      parametros: null,
      ...parcial,
    };
  }

  it('unidade sem cards não produz grandeza nenhuma', () => {
    // RN-088: a frota nasce vazia, e isso é estado normal — não erro.
    expect(grandezasDe([])).toEqual([]);
    expect(grandezasDe(null)).toEqual([]);
    expect(grandezasDe(undefined)).toEqual([]);
  });

  it('um card de grandeza única vira uma série, sem campo `serie`', () => {
    const [grandeza] = grandezasDe([card({})]);

    expect(grandeza.chave).toBe('PESO_01');
    expect(grandeza.serie).toBeNull();
    expect(grandeza.rotulo).toBe('Peso da Coluna');
    expect(grandeza.unidade).toBe('lbf');
  });

  it('cada tipo traz a unidade que a borda publica', () => {
    const unidades = grandezasDe([
      card({ dispositivoId: 'PESO_01', tipo: 'PESO', ordem: 0 }),
      card({ dispositivoId: 'TORQUE_01', tipo: 'TORQUE', ordem: 1 }),
      card({ dispositivoId: 'PRESSAO_01', tipo: 'PRESSAO', ordem: 2 }),
      card({ dispositivoId: 'NIVEL_TANQUE_01', tipo: 'NIVEL_TANQUE', ordem: 3 }),
    ]).map((g) => g.unidade);

    // O tanque publica volume, não nível: o sensor fica no topo e mede distância (RN-084/085).
    expect(unidades).toEqual(['lbf', 'lbf.ft', 'psi', 'bbl']);
  });

  it('a escala da temperatura vem do documento, com °C como padrão', () => {
    const [comEscala] = grandezasDe([
      card({ dispositivoId: 'TEMPERATURA_01', tipo: 'TEMPERATURA', parametros: { unidade: '°F' } }),
    ]);
    const [semEscala] = grandezasDe([
      card({ dispositivoId: 'TEMPERATURA_01', tipo: 'TEMPERATURA', parametros: {} }),
    ]);

    expect(comEscala.unidade).toBe('°F');
    expect(semEscala.unidade).toBe('°C');
  });

  it('um contador de stroke produz três séries sob o mesmo dispositivoId', () => {
    // RN-098: é o campo `serie` que as distingue — não três ids diferentes.
    const grandezas = grandezasDe([
      card({ dispositivoId: 'CONTADOR_STROKE_01', nome: 'Bomba 1', tipo: 'CONTADOR_STROKE' }),
    ]);

    expect(grandezas).toHaveLength(3);
    expect(grandezas.map((g) => g.dispositivoId)).toEqual([
      'CONTADOR_STROKE_01',
      'CONTADOR_STROKE_01',
      'CONTADOR_STROKE_01',
    ]);
    expect(grandezas.map((g) => g.serie)).toEqual([SERIE_STROKE, SERIE_VAZAO, SERIE_VOLUME]);
    expect(grandezas.map((g) => g.unidade)).toEqual(['stroke', 'bbl/min', 'bbl']);
    expect(grandezas.map((g) => g.rotulo)).toEqual([
      'Bomba 1 — Stroke',
      'Bomba 1 — Vazão',
      'Bomba 1 — Volume acumulado',
    ]);
  });

  it('as três séries de um stroke têm chaves distintas', () => {
    // Sem isto, vazão sobrescreveria stroke na indexação da tela.
    const chaves = grandezasDe([
      card({ dispositivoId: 'CONTADOR_STROKE_01', tipo: 'CONTADOR_STROKE' }),
    ]).map((g) => g.chave);

    expect(new Set(chaves).size).toBe(3);
    expect(chaves).toContain('CONTADOR_STROKE_01|vazao');
  });

  it('duas bombas na mesma unidade não se misturam', () => {
    const grandezas = grandezasDe([
      card({ dispositivoId: 'CONTADOR_STROKE_01', nome: 'Bomba 1', tipo: 'CONTADOR_STROKE', ordem: 0 }),
      card({ dispositivoId: 'CONTADOR_STROKE_02', nome: 'Bomba 2', tipo: 'CONTADOR_STROKE', ordem: 1 }),
    ]);

    expect(grandezas).toHaveLength(6);
    expect(new Set(grandezas.map((g) => g.chave)).size).toBe(6);
  });

  it('card desativado não produz série', () => {
    // RN-091: desativar para de ler e de publicar; o card permanece no documento.
    expect(grandezasDe([card({ ativo: false })])).toEqual([]);
  });

  it('card invisível não produz série', () => {
    // RN-037: visibilidade controla publicação. Nada dele chega por nenhum dos dois canais.
    expect(grandezasDe([card({ visivel: false })])).toEqual([]);
  });

  it('respeita a ordem configurada, não a ordem do array', () => {
    const rotulos = grandezasDe([
      card({ dispositivoId: 'PRESSAO_01', nome: 'Terceiro', tipo: 'PRESSAO', ordem: 3 }),
      card({ dispositivoId: 'PESO_01', nome: 'Primeiro', tipo: 'PESO', ordem: 1 }),
      card({ dispositivoId: 'TORQUE_01', nome: 'Segundo', tipo: 'TORQUE', ordem: 2 }),
    ]).map((g) => g.rotulo);

    expect(rotulos).toEqual(['Primeiro', 'Segundo', 'Terceiro']);
  });

  it('dois cards do mesmo tipo recebem cores distintas', () => {
    // Duas chaves hidráulicas na mesma tela precisam ser distinguíveis no gráfico.
    const [primeiro, segundo] = grandezasDe([
      card({ dispositivoId: 'TORQUE_01', tipo: 'TORQUE', ordem: 0 }),
      card({ dispositivoId: 'TORQUE_02', tipo: 'TORQUE', ordem: 1 }),
    ]);

    expect(primeiro.cor).not.toBe(segundo.cor);
  });

  it('a mesma grandeza mantém a cor entre unidades diferentes', () => {
    // Cor por tipo, não por posição: acrescentar um card não repinta os outros.
    const [soPressao] = grandezasDe([card({ dispositivoId: 'PRESSAO_01', tipo: 'PRESSAO', ordem: 0 })]);
    const comOutros = grandezasDe([
      card({ dispositivoId: 'PESO_01', tipo: 'PESO', ordem: 0 }),
      card({ dispositivoId: 'PRESSAO_01', tipo: 'PRESSAO', ordem: 1 }),
    ]);

    expect(comOutros[1].cor).toBe(soPressao.cor);
  });
});

describe('chaveGrandeza', () => {
  it('sem série, a chave é o próprio dispositivoId', () => {
    expect(chaveGrandeza('PESO_01')).toBe('PESO_01');
    expect(chaveGrandeza('PESO_01', null)).toBe('PESO_01');
    // Série vazia é ausência, não uma série chamada "".
    expect(chaveGrandeza('PESO_01', '')).toBe('PESO_01');
  });

  it('com série, a chave as separa', () => {
    expect(chaveGrandeza('CONTADOR_STROKE_01', 'vazao')).toBe('CONTADOR_STROKE_01|vazao');
  });
});
