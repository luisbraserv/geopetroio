import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ComponentFixture, TestBed } from '@angular/core/testing';

import { environment } from '../../../../../environments/environment';
import { ProntidaoDaUnidade } from '../../services/prontidao.service';
import { ProntidaoFrotaPageComponent } from './prontidao-frota-page.component';

function unidade(parcial: Partial<ProntidaoDaUnidade> = {}): ProntidaoDaUnidade {
  return {
    unidadeSondaId: 7,
    nome: 'SPT-145',
    apelido: 'Sonda 7',
    revisaoCards: 4,
    cardsAtivos: 3,
    cardsDeclarados: 3,
    cardsAtualizadosPor: 'ana',
    cardsAtualizadosEm: '2026-09-08T10:00:00Z',
    revisaoLimites: 2,
    limitesAtivos: 2,
    limitesDeclarados: 2,
    limitesAtualizadosPor: 'bruno',
    limitesAtualizadosEm: '2026-09-09T10:00:00Z',
    ...parcial,
  };
}

/**
 * A tela existe para encontrar a unidade que a migração esqueceu. Se ela não aparecer — ou aparecer
 * no fim de uma lista alfabética de trinta — a tela não cumpriu o que OQ-049 pedia.
 */
describe('ProntidaoFrotaPageComponent', () => {
  let fixture: ComponentFixture<ProntidaoFrotaPageComponent>;
  let componente: ProntidaoFrotaPageComponent;
  let http: HttpTestingController;

  const url = `${environment.apiUrl}/api/sondas/prontidao`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ProntidaoFrotaPageComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ProntidaoFrotaPageComponent);
    componente = fixture.componentInstance;
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  function carregar(unidades: ProntidaoDaUnidade[]) {
    fixture.detectChanges();
    http.expectOne(url).flush(unidades);
    fixture.detectChanges();
  }

  function estados(): string[] {
    return componente.unidades().map((item) => item.estado);
  }

  it('classifica as quatro situações a partir dos contadores', () => {
    carregar([
      unidade({ unidadeSondaId: 1, nome: 'A-pronta' }),
      unidade({ unidadeSondaId: 2, nome: 'B-nunca', revisaoCards: 0, cardsAtivos: 0, cardsDeclarados: 0 }),
      unidade({ unidadeSondaId: 3, nome: 'C-muda', cardsAtivos: 0, cardsDeclarados: 4 }),
      unidade({ unidadeSondaId: 4, nome: 'D-sem-alarme', revisaoLimites: 0, limitesAtivos: 0, limitesDeclarados: 0 }),
    ]);

    // ⚠️ O que falta vem primeiro: em ordem alfabética, a esquecida ficaria escondida no meio.
    expect(estados()).toEqual(['NUNCA_CONFIGURADA', 'MUDA', 'SEM_ALARME', 'PRONTA']);
    expect(componente.unidades().map((i) => i.unidade.nome))
      .toEqual(['B-nunca', 'C-muda', 'D-sem-alarme', 'A-pronta']);
  });

  /**
   * ⚠️ Ter documento não basta. Uma unidade com todos os cards desativados não lê nada — fica tão
   * muda quanto uma nunca configurada, mas exige outra ação: reativar, não visitar.
   */
  it('separa a nunca configurada da que ficou sem card ativo', () => {
    carregar([
      unidade({ unidadeSondaId: 2, nome: 'B', revisaoCards: 0, cardsAtivos: 0, cardsDeclarados: 0 }),
      unidade({ unidadeSondaId: 3, nome: 'C', cardsAtivos: 0, cardsDeclarados: 4 }),
    ]);

    expect(componente.acaoDe('NUNCA_CONFIGURADA')).toContain('Configure os cards');
    expect(componente.acaoDe('MUDA')).toContain('Reative');
    expect(componente.semTelemetria()).toBe(2);
  });

  it('conta o resumo por situação', () => {
    carregar([
      unidade({ unidadeSondaId: 1 }),
      unidade({ unidadeSondaId: 2, revisaoCards: 0, cardsAtivos: 0 }),
      unidade({ unidadeSondaId: 3, revisaoLimites: 0, limitesAtivos: 0 }),
    ]);

    expect(componente.total()).toBe(3);
    expect(componente.prontas()).toBe(1);
    expect(componente.nuncaConfiguradas()).toBe(1);
    expect(componente.semAlarme()).toBe(1);
    expect(componente.frotaCompleta()).toBe(false);
  });

  /**
   * ⚠️ A única afirmação segura é sobre configuração. Um CLP desligado aparece como pronto, e a
   * tela precisa dizer isso — senão vira um monitor de disponibilidade que ela não é.
   */
  it('com a frota inteira lendo, avisa que isso não garante publicação', () => {
    carregar([unidade({ unidadeSondaId: 1 }), unidade({ unidadeSondaId: 2 })]);

    expect(componente.frotaCompleta()).toBe(true);
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain('não garante que estejam publicando');
  });

  it('sonda sem card não mostra contagem inventada', () => {
    carregar([unidade({ revisaoCards: 0, cardsAtivos: 0, cardsDeclarados: 0, cardsAtualizadosEm: null, cardsAtualizadosPor: null })]);

    const texto = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(texto).toContain('nunca');
    expect(texto).not.toContain('0 ativos');
  });

  it('usuário sem sonda nenhuma vê o motivo, não uma tabela vazia', () => {
    carregar([]);

    expect(componente.total()).toBe(0);
    expect((fixture.nativeElement as HTMLElement).textContent)
      .toContain('Nenhuma Unidade/Sonda disponível');
  });

  it('falha na consulta aparece como erro', () => {
    fixture.detectChanges();
    http.expectOne(url).flush({ message: 'Falha' }, { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();

    expect(componente.erro()).toBeTruthy();
  });
});
