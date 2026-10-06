import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Store } from '@ngxs/store';

import { environment } from '../../../../../environments/environment';
import { AlarmeAtivo } from '../../services/alarme-ativo';
import { CardUnidade } from '../../services/grandezas-de-card';
import { EstadoRealtime, RealtimeService } from '../../services/realtime.service';
import { SondaDisponivel } from '../../services/monitoramento-sonda.service';
import { TempoRealPageComponent } from './tempo-real-page.component';

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

function alarme(parcial: Partial<AlarmeAtivo> = {}): AlarmeAtivo {
  return {
    unidadeSondaId: 7,
    dispositivoId: 'PRESSAO_01',
    serie: null,
    episodioId: 'ep-1',
    severidadeAtual: 'CRITICO',
    desde: '2026-09-09T12:00:00Z',
    valorExtremo: 130,
    limiteViolado: 'MAX',
    ...parcial,
  };
}

/**
 * O alarme na tela de tempo real.
 *
 * ⚠️ A parte delicada é a passagem do REST para o canal: enquanto nenhuma mensagem chegou vale o
 * snapshot lido por HTTP, e a partir da primeira vale a projeção que veio junto das leituras. Se o
 * REST continuasse mandando, um alarme ficaria aceso sobre um valor que já voltou à faixa.
 */
describe('TempoRealPageComponent — alarmes', () => {
  let fixture: ComponentFixture<TempoRealPageComponent>;
  let http: HttpTestingController;
  let realtime: RealtimeService;

  const urlSondas = `${environment.apiUrl}/api/sondas/minhas`;
  const urlCards = `${environment.apiUrl}/api/sondas/7/cards`;
  const urlAlarmes = `${environment.apiUrl}/api/sondas/7/alarmes`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [TempoRealPageComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Store, useValue: { selectSnapshot: () => null } },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(TempoRealPageComponent);
    http = TestBed.inject(HttpTestingController);
    realtime = TestBed.inject(RealtimeService);

    fixture.detectChanges();
    http.expectOne(urlSondas).flush([SONDA]);
  });

  afterEach(() => {
    fixture.destroy();
    http.verify();
  });

  /** Seleciona a sonda e responde os dois GETs que a seleção dispara. */
  function selecionar(alarmes: AlarmeAtivo[], cards: CardUnidade[] = [card()]) {
    const componente = fixture.componentInstance as unknown as {
      sondaSelecionadaValue: SondaDisponivel | null;
    };
    componente.sondaSelecionadaValue = SONDA;

    http.expectOne(urlCards).flush({
      schemaVersion: 1, unidadeSondaId: 7, revisao: 3, conexao: null, cards,
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });
    http.expectOne(urlAlarmes).flush(alarmes);
    fixture.detectChanges();
  }

  function texto(): string {
    return (fixture.nativeElement as HTMLElement).textContent ?? '';
  }

  function cardsCriticos(): number {
    return (fixture.nativeElement as HTMLElement).querySelectorAll('.card--critico').length;
  }

  it('mostra o alarme aberto antes de qualquer mensagem chegar', () => {
    // O caso da sonda que caiu: o episódio continua sendo verdade e ficaria invisível sem o REST.
    selecionar([alarme()]);

    expect(texto()).toContain('1 grandeza fora da faixa');
    expect(texto()).toContain('Crítico');
    expect(texto()).toContain('Pressão da bomba');
    expect(cardsCriticos()).toBe(1);
  });

  it('sonda dentro dos limites não mostra aviso nenhum', () => {
    selecionar([]);

    expect(texto()).not.toContain('fora da faixa');
    expect(cardsCriticos()).toBe(0);
  });

  it('a partir da primeira mensagem, quem manda é a projeção do canal', () => {
    selecionar([alarme()]);
    expect(cardsCriticos()).toBe(1);

    // O valor voltou à faixa e o episódio fechou: o servidor manda a lista já vazia.
    const estado: EstadoRealtime = {
      unidadeSondaId: 7,
      timestamp: '2026-09-09T12:01:00Z',
      leituras: [{ dispositivoId: 'PRESSAO_01', tipo: 'PRESSAO', unidade: 'psi', valor: 90 }],
      alarmes: [],
    };
    realtime.estado.set(estado);
    fixture.detectChanges();

    expect(cardsCriticos()).toBe(0);
    expect(texto()).not.toContain('fora da faixa');
  });

  it('o destaque acompanha a série certa de um contador de stroke', () => {
    // RN-098: sem a série na chave, o alarme da vazão acenderia o card do volume acumulado.
    selecionar(
      [alarme({ dispositivoId: 'CONTADOR_STROKE_01', serie: 'vazao', severidadeAtual: 'ATENCAO' })],
      [card({ dispositivoId: 'CONTADOR_STROKE_01', tipo: 'CONTADOR_STROKE', nome: 'Bomba 1' })],
    );

    const html = fixture.nativeElement as HTMLElement;
    const marcados = [...html.querySelectorAll('.card--atencao')]
      .map((el) => el.querySelector('.card__rotulo')?.textContent?.trim());

    expect(marcados).toEqual(['Bomba 1 — Vazão']);
    expect(html.querySelectorAll('.card--critico')).toHaveLength(0);
  });

  it('falha ao ler os alarmes não vira erro na tela', () => {
    const componente = fixture.componentInstance as unknown as {
      sondaSelecionadaValue: SondaDisponivel | null;
    };
    componente.sondaSelecionadaValue = SONDA;

    http.expectOne(urlCards).flush({
      schemaVersion: 1, unidadeSondaId: 7, revisao: 3, conexao: null, cards: [card()],
      atualizadoPor: 'ana', atualizadoEm: '2026-09-08T10:00:00Z',
    });
    http.expectOne(urlAlarmes).flush({}, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    // É informação complementar: o canal traz a projeção de qualquer forma, e um alerta vermelho
    // aqui esconderia os erros que realmente impedem a tela de funcionar.
    expect(texto()).toContain('Pressão da bomba');
    expect(texto()).not.toContain('fora da faixa');
  });
});
