import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { CardUnidade } from '../../services/grandezas-de-card';
import { LimiteAlarme } from '../../services/limites-alarme.service';
import { UnidadeDisponivel } from '../../services/monitoramento-unidade.service';
import { LimitesAlarmePageComponent } from './limites-alarme-page.component';

const UNIDADE: UnidadeDisponivel = { id: 7, nome: 'SPT-145', apelido: 'Unidade 7', tipo: 'SONDA' };
/** A segunda unidade existe para o caso de troca no meio de um salvamento — ver A06. */
const OUTRA: UnidadeDisponivel = { id: 8, nome: 'SPT-146', apelido: 'Unidade 8', tipo: 'SONDA' };

function card(parcial: Partial<CardUnidade>): CardUnidade {
  return {
    dispositivoId: 'PRESSAO_01',
    nome: 'Pressão da bomba',
    tipo: 'PRESSAO',
    byteInicial: 10,
    ativo: true,
    visivel: true,
    ordem: 0,
    parametros: null,
    ...parcial,
  };
}

function limite(parcial: Partial<LimiteAlarme> = {}): LimiteAlarme {
  return {
    dispositivoId: 'PRESSAO_01',
    serie: null,
    minimoAtencao: null,
    maximoAtencao: 100,
    minimoCritico: null,
    maximoCritico: 120,
    segundosParaAbrir: 3,
    segundosParaFechar: 5,
    ativo: true,
    ...parcial,
  };
}

/**
 * A tela cruza dois documentos com autoridades diferentes: os cards dizem o que existe para vigiar
 * (só o Desktop grava) e os limites dizem como (quem enxerga a unidade grava, RN-069). Errar o
 * cruzamento produz um limite que parece configurado e não vigia nada.
 */
describe('LimitesAlarmePageComponent', () => {
  let fixture: ComponentFixture<LimitesAlarmePageComponent>;
  let componente: LimitesAlarmePageComponent;
  let http: HttpTestingController;

  const urlUnidades = `${environment.apiUrl}/api/monitoramento/unidades/minhas`;
  const urlCards = `${environment.apiUrl}/api/monitoramento/unidades/7/cards`;
  const urlLimites = `${environment.apiUrl}/api/monitoramento/unidades/7/configuracao`;
  const urlCardsOito = `${environment.apiUrl}/api/monitoramento/unidades/8/cards`;
  const urlLimitesOito = `${environment.apiUrl}/api/monitoramento/unidades/8/configuracao`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LimitesAlarmePageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LimitesAlarmePageComponent);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
    http.expectOne(urlUnidades).flush([UNIDADE]);
  });

  afterEach(() => http.verify());

  /** Seleciona a unidade e responde os dois documentos, na ordem em que a tela os pede. */
  function selecionar(cards: CardUnidade[], limites: LimiteAlarme[], revisao = 1) {
    componente.unidadeSelecionadaValue = UNIDADE;
    componente.onUnidadeChange();

    http.expectOne(urlCards).flush({
      schemaVersion: 1, unidadeId: 7, revisao: 3, conexao: null, cards,
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });
    http.expectOne(urlLimites).flush({
      schemaVersion: 1, unidadeId: 7, revisao, limites,
      atualizadoPor: revisao > 0 ? 'ana' : null,
      atualizadoEm: revisao > 0 ? '2026-09-09T12:00:00Z' : null,
    });
  }

  it('monta uma linha por grandeza declarada e preenche o limite gravado', () => {
    selecionar([card({})], [limite()]);

    expect(componente.linhas()).toHaveLength(1);
    expect(componente.linhas()[0].maximoAtencao).toBe(100);
    expect(componente.linhas()[0].segundosParaFechar).toBe(5);
    expect(componente.linhas()[0].ativo).toBe(true);
  });

  it('um card de stroke rende três linhas, e cada série recebe o seu limite', () => {
    // RN-098: sem a série na chave, o limite de vazão cairia na linha de volume acumulado.
    selecionar(
      [card({ dispositivoId: 'CONTADOR_STROKE_01', tipo: 'CONTADOR_STROKE', nome: 'Bomba 1' })],
      [limite({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'vazao', maximoAtencao: 8, maximoCritico: 10 })],
    );

    const linhas = componente.linhas();
    expect(linhas.map((l) => l.grandeza.serie)).toEqual(['stroke', 'vazao', 'volumeAcumulado']);
    expect(linhas[1].maximoAtencao).toBe(8);
    expect(linhas[0].maximoAtencao).toBeNull();
    expect(linhas[2].maximoAtencao).toBeNull();
  });

  it('unidade sem cards não oferece limite, e diz por quê — RN-088', () => {
    selecionar([], [], 0);

    expect(componente.unidadeSemCards()).toBe(true);
    expect(componente.linhas()).toEqual([]);
  });

  it('limite gravado sem card que o explique aparece como órfão, e não some calado', () => {
    // O caso real: um id do vocabulário fixo antigo, gravado antes de o limite passar a valer
    // sobre a grandeza que a unidade declara (RN-101).
    selecionar([card({})], [limite(), limite({ dispositivoId: 'VAZAO_01', serie: null })]);

    expect(componente.orfaos().map((o) => o.chave)).toEqual(['VAZAO_01']);
    expect(componente.linhas()).toHaveLength(1);
  });

  it('não salva enquanto houver linha inválida', () => {
    selecionar([card({})], [limite()]);

    componente.atualizar(0, 'maximoCritico', 50);
    expect(componente.errosPorLinha()[0]).toContain('críticos devem ficar fora');
    expect(componente.podeSalvar()).toBe(false);

    componente.salvar();
    http.expectNone(urlLimites);
  });

  it('linha sem limiar nenhum não é enviada: é assim que se apaga um limite', () => {
    selecionar([card({})], [limite()]);

    for (const campo of ['maximoAtencao', 'maximoCritico'] as const) {
      componente.atualizar(0, campo, null);
    }
    componente.atualizar(0, 'ativo', false);
    componente.salvar();

    const requisicao = http.expectOne(urlLimites);
    expect(requisicao.request.body.limites).toEqual([]);
    requisicao.flush({
      schemaVersion: 1, unidadeId: 7, revisao: 2, limites: [],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-09T13:00:00Z',
    });
    expect(componente.salvo()).toContain('Revisão 2');
  });

  it('envia a revisão lida, que é o que impede sobrescrever o ajuste de outra pessoa', () => {
    selecionar([card({})], [limite()], 4);

    componente.atualizar(0, 'maximoAtencao', 90);
    componente.salvar();

    const requisicao = http.expectOne(urlLimites);
    expect(requisicao.request.body.revisao).toBe(4);
    expect(requisicao.request.body.limites[0].maximoAtencao).toBe(90);
    requisicao.flush({
      schemaVersion: 1, unidadeId: 7, revisao: 5, limites: [limite({ maximoAtencao: 90 })],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-09T13:00:00Z',
    });
  });

  /**
   * ⚠️ Conflito descarta o que estava digitado e recarrega.
   *
   * Manter o formulário e apenas atualizar a revisão faria o próximo clique sobrescrever, sem ver,
   * o ajuste que a outra pessoa acabou de fazer.
   */
  it('no conflito de revisão, recarrega do servidor e avisa que descartou', () => {
    selecionar([card({})], [limite()], 4);

    componente.atualizar(0, 'maximoAtencao', 90);
    componente.salvar();
    http.expectOne(urlLimites).flush(
      { message: 'A configuracao foi alterada. Recarregue antes de salvar.' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(componente.aviso()).toContain('descartado');

    http.expectOne(urlCards).flush({
      schemaVersion: 1, unidadeId: 7, revisao: 3, conexao: null, cards: [card({})],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });
    http.expectOne(urlLimites).flush({
      schemaVersion: 1, unidadeId: 7, revisao: 5, limites: [limite({ maximoAtencao: 70 })],
      atualizadoPor: 'bruno', atualizadoEm: '2026-09-09T13:05:00Z',
    });

    expect(componente.linhas()[0].maximoAtencao).toBe(70);
    expect(componente.documento()?.revisao).toBe(5);
  });

  /**
   * ⚠️ O achado A06: o callback de erro não tinha a guarda que o de sucesso já tinha.
   *
   * Salvar a unidade 7, trocar para a 8 e só então receber o 409 da 7 mandava recarregar a **7**:
   * `carregar` ligava o indicador de espera, a resposta caía fora do ciclo atual e ninguém o
   * desligava. A unidade 8, já carregada, ficava escondida atrás de um "carregando" permanente.
   */
  it('conflito atrasado da unidade anterior não deixa a tela presa carregando', () => {
    selecionar([card({})], [limite()], 4);

    componente.atualizar(0, 'maximoAtencao', 90);
    componente.salvar();
    const salvamentoDaSete = http.expectOne(urlLimites);

    componente.unidadeSelecionadaValue = OUTRA;
    componente.onUnidadeChange();
    http.expectOne(urlCardsOito).flush({
      schemaVersion: 1, unidadeId: 8, revisao: 2, conexao: null, cards: [card({})],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });
    http.expectOne(urlLimitesOito).flush({
      schemaVersion: 1, unidadeId: 8, revisao: 1, limites: [limite({ maximoAtencao: 55 })],
      atualizadoPor: 'bruno', atualizadoEm: '2026-09-09T13:00:00Z',
    });

    salvamentoDaSete.flush(
      { message: 'A configuracao foi alterada. Recarregue antes de salvar.' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(componente.carregando()).toBe(false);
    expect(componente.documento()?.unidadeId).toBe(8);
    expect(componente.linhas()[0].maximoAtencao).toBe(55);
    http.expectNone(urlCards);
  });

  /** A sequência A → B → A: o mesmo id volta, e a resposta velha continua sendo velha. */
  it('voltar para a unidade anterior não ressuscita a resposta antiga dela', () => {
    selecionar([card({})], [limite()], 4);

    componente.atualizar(0, 'maximoAtencao', 90);
    componente.salvar();
    const salvamentoDaSete = http.expectOne(urlLimites);

    componente.unidadeSelecionadaValue = OUTRA;
    componente.onUnidadeChange();
    http.expectOne(urlCardsOito).flush({
      schemaVersion: 1, unidadeId: 8, revisao: 2, conexao: null, cards: [card({})],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });
    http.expectOne(urlLimitesOito).flush({
      schemaVersion: 1, unidadeId: 8, revisao: 1, limites: [limite()],
      atualizadoPor: 'bruno', atualizadoEm: '2026-09-09T13:00:00Z',
    });

    selecionar([card({})], [limite({ maximoAtencao: 42 })], 9);

    salvamentoDaSete.flush(
      { message: 'A configuracao foi alterada. Recarregue antes de salvar.' },
      { status: 409, statusText: 'Conflict' },
    );

    expect(componente.carregando()).toBe(false);
    // A leitura mais recente da unidade 7 prevalece; o 409 do salvamento antigo nao a desfaz.
    expect(componente.documento()?.revisao).toBe(9);
    expect(componente.linhas()[0].maximoAtencao).toBe(42);
    expect(componente.aviso()).toBeNull();
  });

  it('resposta atrasada de outra unidade não sobrescreve a selecionada', () => {
    componente.unidadeSelecionadaValue = UNIDADE;
    componente.onUnidadeChange();
    const cardsAtrasado = http.expectOne(urlCards);

    componente.unidadeSelecionadaValue = null;
    componente.onUnidadeChange();

    cardsAtrasado.flush({
      schemaVersion: 1, unidadeId: 7, revisao: 3, conexao: null, cards: [card({})],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });

    expect(componente.linhas()).toEqual([]);
    http.expectNone(urlLimites);
  });
});
