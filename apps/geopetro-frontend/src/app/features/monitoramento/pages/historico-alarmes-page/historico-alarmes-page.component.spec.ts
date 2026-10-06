import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { CardUnidade } from '../../services/grandezas-de-card';
import { EpisodioAlarme } from '../../services/historico-alarmes.service';
import { SondaDisponivel } from '../../services/monitoramento-sonda.service';
import { HistoricoAlarmesPageComponent } from './historico-alarmes-page.component';

const SONDA: SondaDisponivel = { id: 7, idSondaUnidade: 'SPT-145', nome: 'SPT-145', apelido: 'Sonda 7' };

function card(parcial: Partial<CardUnidade> = {}): CardUnidade {
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

function episodio(parcial: Partial<EpisodioAlarme> = {}): EpisodioAlarme {
  return {
    episodioId: 'ep-1',
    unidadeSondaId: 7,
    dispositivoId: 'PRESSAO_01',
    serie: null,
    severidadeMaxima: 'CRITICO',
    limiteViolado: 'MAX',
    abertoEm: '2026-09-09T12:00:00Z',
    fechadoEm: '2026-09-09T12:05:00Z',
    valorExtremo: 130,
    fatos: [
      { tipo: 'ABRIU', severidade: 'ATENCAO', ocorridoEm: '2026-09-09T12:00:00Z', valor: 105 },
      { tipo: 'ESCALOU', severidade: 'CRITICO', ocorridoEm: '2026-09-09T12:01:00Z', valor: 130 },
      { tipo: 'FECHOU', severidade: 'CRITICO', ocorridoEm: '2026-09-09T12:05:00Z', valor: 90 },
    ],
    ...parcial,
  };
}

/**
 * A tela lista excursões, não linhas de log. O resumo responde "o que aconteceu no turno?"; a
 * sequência de fatos, recolhida, explica como.
 */
describe('HistoricoAlarmesPageComponent', () => {
  let fixture: ComponentFixture<HistoricoAlarmesPageComponent>;
  let componente: HistoricoAlarmesPageComponent;
  let http: HttpTestingController;

  const urlSondas = `${environment.apiUrl}/api/sondas/minhas`;
  const urlCards = `${environment.apiUrl}/api/sondas/7/cards`;
  const urlHistorico = `${environment.apiUrl}/api/sondas/7/alarmes/historico`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoricoAlarmesPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(HistoricoAlarmesPageComponent);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);

    fixture.detectChanges();
    http.expectOne(urlSondas).flush([SONDA]);
  });

  afterEach(() => http.verify());

  function selecionar(cards: CardUnidade[] = [card()]) {
    componente.sondaSelecionadaValue = SONDA;
    componente.onSondaChange();
    http.expectOne(urlCards).flush({
      schemaVersion: 1, unidadeSondaId: 7, revisao: 3, conexao: null, cards,
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });
  }

  function consultar(episodios: EpisodioAlarme[], truncado = false) {
    componente.consultar();
    const requisicao = http.expectOne((r) => r.url === urlHistorico);
    requisicao.flush({ episodios, truncado });
    return requisicao;
  }

  it('manda o período como janela ISO, que o servidor exige', () => {
    selecionar();
    const requisicao = consultar([]);

    expect(requisicao.request.params.get('inicio')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(requisicao.request.params.get('fim')).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('usa o nome do card como rótulo da grandeza', () => {
    selecionar();
    consultar([episodio()]);

    expect(componente.episodios()).toHaveLength(1);
    expect(componente.episodios()[0].rotulo).toBe('Pressão da bomba');
    expect(componente.episodios()[0].unidade).toBe('psi');
  });

  /**
   * ⚠️ O histórico não depende dos cards: uma excursão gravada continua sendo verdade mesmo que o
   * documento não possa ser lido. Esconder a linha seria pior que mostrá-la com o id cru.
   */
  it('sem card que a descreva, a grandeza aparece com o id em vez de sumir', () => {
    componente.sondaSelecionadaValue = SONDA;
    componente.onSondaChange();
    http.expectOne(urlCards).flush({}, { status: 500, statusText: 'Server Error' });

    consultar([episodio()]);

    expect(componente.episodios()[0].rotulo).toBe('PRESSAO_01');
  });

  it('a série entra no rótulo de um card de stroke — RN-098', () => {
    selecionar([card({ dispositivoId: 'CONTADOR_STROKE_01', tipo: 'CONTADOR_STROKE', nome: 'Bomba 1' })]);
    consultar([episodio({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'vazao' })]);

    expect(componente.episodios()[0].rotulo).toBe('Bomba 1 — Vazão');
    expect(componente.episodios()[0].unidade).toBe('bbl/min');
  });

  it('período sem excursão é resposta normal, e a tela diz o que significa', () => {
    selecionar();
    consultar([]);
    fixture.detectChanges();

    expect(componente.semEpisodios()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain('sonda sem limite configurado');
  });

  /** Uma lista incompleta que se apresenta como completa é pior que uma lista curta. */
  it('quando o servidor corta, a tela avisa', () => {
    selecionar();
    consultar([episodio()], true);
    fixture.detectChanges();

    expect(componente.truncado()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('mais excursões');
  });

  it('episódio aberto não tem duração fechada, e a tela o diz', () => {
    expect(componente.duracao(episodio({ fechadoEm: null }))).toBe('em curso');
    expect(componente.duracao(episodio())).toBe('5 min 0 s');
    expect(componente.duracao(episodio({ fechadoEm: '2026-09-09T12:00:42Z' }))).toBe('42 s');
    expect(componente.duracao(episodio({ fechadoEm: '2026-09-09T14:30:00Z' }))).toBe('2 h 30 min');
  });

  it('o detalhe começa recolhido e abre por episódio', () => {
    selecionar();
    consultar([episodio(), episodio({ episodioId: 'ep-2' })]);

    expect(componente.expandido('ep-1')).toBe(false);
    componente.alternarDetalhe('ep-1');
    expect(componente.expandido('ep-1')).toBe(true);
    expect(componente.expandido('ep-2')).toBe(false);

    componente.alternarDetalhe('ep-1');
    expect(componente.expandido('ep-1')).toBe(false);
  });

  it('não consulta sem sonda selecionada', () => {
    expect(componente.podeConsultar()).toBe(false);
    componente.consultar();
    http.expectNone((r) => r.url === urlHistorico);
  });

  it('período personalizado invertido não vai ao servidor', () => {
    selecionar();
    componente.periodoValue = 'custom';
    componente.inicioValue = '2026-09-09T13:00';
    componente.fimValue = '2026-09-09T11:00';

    componente.consultar();

    http.expectNone((r) => r.url === urlHistorico);
    expect(componente.erro()).toContain('início anterior ao fim');
  });
});
