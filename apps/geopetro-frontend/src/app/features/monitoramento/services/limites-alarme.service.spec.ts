import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';

import { environment } from '../../../../environments/environment';
import { LimiteAlarme, LimitesAlarmeService, validarLimite } from './limites-alarme.service';

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

describe('LimitesAlarmeService', () => {
  let service: LimitesAlarmeService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), LimitesAlarmeService],
    });
    service = TestBed.inject(LimitesAlarmeService);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('endereça a rota pelo id numérico da unidade, não pelo nome da sonda', () => {
    // ⚠️ /api/sondas/{id}/configuracao usa o id do cadastro; o histórico usa o nome como chave no
    // InfluxDB. Trocar os dois devolve 403.
    service.ler(7).subscribe();
    http.expectOne(`${environment.apiUrl}/api/sondas/7/configuracao`).flush({
      schemaVersion: 1, unidadeSondaId: 7, revisao: 0, limites: [],
      atualizadoPor: null, atualizadoEm: null,
    });
  });

  it('envia a revisão lida junto da lista, porque o PUT substitui tudo', () => {
    service.salvar(7, 4, [limite()]).subscribe();

    const requisicao = http.expectOne(`${environment.apiUrl}/api/sondas/7/configuracao`);
    expect(requisicao.request.method).toBe('PUT');
    expect(requisicao.request.body.revisao).toBe(4);
    expect(requisicao.request.body.limites).toHaveLength(1);
    requisicao.flush({
      schemaVersion: 1, unidadeSondaId: 7, revisao: 5, limites: [limite()],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-09T12:00:00Z',
    });
  });

  it('a série viaja no corpo — sem ela dois limites do mesmo contador colidiriam', () => {
    // RN-098: as três séries de um card de stroke compartilham o dispositivoId.
    service.salvar(7, 0, [
      limite({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'vazao', maximoAtencao: 8, maximoCritico: 10 }),
      limite({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'volumeAcumulado', maximoAtencao: 500, maximoCritico: 600 }),
    ]).subscribe();

    const requisicao = http.expectOne(`${environment.apiUrl}/api/sondas/7/configuracao`);
    expect(requisicao.request.body.limites.map((l: LimiteAlarme) => l.serie))
      .toEqual(['vazao', 'volumeAcumulado']);
    requisicao.flush({
      schemaVersion: 1, unidadeSondaId: 7, revisao: 1, limites: [],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-09T12:00:00Z',
    });
  });
});

/**
 * As mesmas regras do servidor, para o erro aparecer antes da ida ao servidor.
 *
 * O servidor continua sendo a autoridade — isto evita descobrir um limite invertido só depois de
 * clicar em salvar.
 */
describe('validarLimite', () => {
  it('aceita um limite bem formado', () => {
    expect(validarLimite(limite())).toBeNull();
  });

  it('recusa vigiar uma grandeza sem nenhum limiar informado', () => {
    const vazio = limite({ maximoAtencao: null, maximoCritico: null, ativo: true });
    expect(validarLimite(vazio)).toContain('ao menos um limite');
  });

  it('aceita a linha toda vazia enquanto ela não estiver marcada para vigiar', () => {
    // É assim que se apaga um limite: zerar os quatro campos e salvar.
    expect(validarLimite(limite({ maximoAtencao: null, maximoCritico: null, ativo: false }))).toBeNull();
  });

  it('exige que o crítico fique fora do de atenção, nos dois lados', () => {
    expect(validarLimite(limite({ maximoAtencao: 130, maximoCritico: 120 })))
      .toContain('críticos devem ficar fora');
    expect(validarLimite(limite({ minimoCritico: 50, minimoAtencao: 40, maximoAtencao: 100, maximoCritico: 120 })))
      .toContain('críticos devem ficar fora');
  });

  it('exige que todo mínimo seja menor que todo máximo', () => {
    expect(validarLimite(limite({ minimoAtencao: 150, maximoAtencao: 100, maximoCritico: 120 })))
      .toContain('menor que todo limite máximo');
  });

  it('recusa tempo negativo ou fracionário', () => {
    expect(validarLimite(limite({ segundosParaAbrir: -1 }))).toContain('inteiros de segundos');
    expect(validarLimite(limite({ segundosParaFechar: 1.5 }))).toContain('inteiros de segundos');
  });

  it('tempo zero é válido: quem configurou assim quer o alarme na primeira leitura', () => {
    expect(validarLimite(limite({ segundosParaAbrir: 0, segundosParaFechar: 0 }))).toBeNull();
  });

  it('um lado só da faixa é válido — nem toda grandeza tem mínimo', () => {
    expect(validarLimite(limite({ minimoAtencao: null, minimoCritico: null }))).toBeNull();
  });
});
