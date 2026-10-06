import { describe, expect, it } from 'vitest';

import {
  ACESSO_ADMINISTRACAO,
  ACESSO_CONFIGURACAO,
  ACESSO_MONITORAMENTO,
  ACESSO_MONITORAMENTO_REAL,
  ACESSO_SIMULADOR_CIMENTACAO,
  normalizarRoles,
  rotaInicialPara,
  satisfazAcesso,
} from './user.model';

/**
 * O modelo de acesso: tipo de conta (CLIENTE/INTERNO) **somado** a permissão de módulo.
 *
 * O que estes casos defendem é justamente o que uma lista de roles não expressava: uma permissão
 * de módulo sozinha não abre nada, e ter a tela de séries não dá o tempo real.
 *
 * ⚠️ Isto espelha `RegrasDeAcesso` no backend. Divergir não abre brecha — quem decide é o
 * servidor —, mas produz o pior sintoma para o usuário: um item de menu que leva a "acesso negado".
 */
describe('regras de acesso', () => {
  describe('combinação, e não lista', () => {
    it('permissão de módulo sozinha não concede nada', () => {
      expect(satisfazAcesso(['MONITORAMENTO'], ACESSO_MONITORAMENTO)).toBe(false);
      expect(satisfazAcesso(['MONITORAMENTO_REAL'], ACESSO_MONITORAMENTO_REAL)).toBe(false);
      expect(satisfazAcesso(['SIMULADOR', 'CIMENTACAO'], ACESSO_SIMULADOR_CIMENTACAO)).toBe(false);
    });

    it('tipo de conta sozinho não concede nada', () => {
      expect(satisfazAcesso(['CLIENTE'], ACESSO_MONITORAMENTO)).toBe(false);
      expect(satisfazAcesso(['INTERNO'], ACESSO_MONITORAMENTO)).toBe(false);
    });

    it('cliente e funcionário entram pelo mesmo par', () => {
      expect(satisfazAcesso(['CLIENTE', 'MONITORAMENTO'], ACESSO_MONITORAMENTO)).toBe(true);
      expect(satisfazAcesso(['INTERNO', 'MONITORAMENTO'], ACESSO_MONITORAMENTO)).toBe(true);
    });

    it('ADMIN atravessa tudo sem permissão de módulo', () => {
      for (const regra of [
        ACESSO_MONITORAMENTO,
        ACESSO_MONITORAMENTO_REAL,
        ACESSO_SIMULADOR_CIMENTACAO,
        ACESSO_ADMINISTRACAO,
        ACESSO_CONFIGURACAO,
      ]) {
        expect(satisfazAcesso(['ADMIN'], regra)).toBe(true);
      }
    });

    it('roles a mais não atrapalham', () => {
      expect(
        satisfazAcesso(['CLIENTE', 'MONITORAMENTO', 'SIMULADOR', 'CIMENTACAO'], ACESSO_MONITORAMENTO),
      ).toBe(true);
    });

    it('sem role nenhuma, nada passa', () => {
      expect(satisfazAcesso([], ACESSO_MONITORAMENTO)).toBe(false);
    });
  });

  /**
   * ⚠️ São concessões independentes. Se uma passar a implicar a outra, conceder apenas uma das
   * telas deixa de ser possível — e era esse o motivo de separá-las.
   */
  describe('monitoramento e tempo real não se implicam', () => {
    it('quem vê séries não entra no tempo real', () => {
      expect(satisfazAcesso(['CLIENTE', 'MONITORAMENTO'], ACESSO_MONITORAMENTO_REAL)).toBe(false);
    });

    it('quem tem tempo real não ganha a tela de séries', () => {
      expect(satisfazAcesso(['CLIENTE', 'MONITORAMENTO_REAL'], ACESSO_MONITORAMENTO)).toBe(false);
    });
  });

  describe('simulador de cimentação exige a área e o domínio', () => {
    it('área sem domínio não entra', () => {
      expect(satisfazAcesso(['INTERNO', 'SIMULADOR'], ACESSO_SIMULADOR_CIMENTACAO)).toBe(false);
    });

    it('domínio sem área não entra', () => {
      expect(satisfazAcesso(['CLIENTE', 'CIMENTACAO'], ACESSO_SIMULADOR_CIMENTACAO)).toBe(false);
    });

    it('os dois juntos entram, seja cliente ou funcionário', () => {
      expect(satisfazAcesso(['INTERNO', 'SIMULADOR', 'CIMENTACAO'], ACESSO_SIMULADOR_CIMENTACAO)).toBe(true);
      expect(satisfazAcesso(['CLIENTE', 'SIMULADOR', 'CIMENTACAO'], ACESSO_SIMULADOR_CIMENTACAO)).toBe(true);
    });
  });

  /**
   * RN-086 — o SUPORTE configura o sistema, mas não administra cadastro.
   *
   * A fronteira entre `ACESSO_CONFIGURACAO` e `ACESSO_ADMINISTRACAO` é o que impede o suporte de
   * virar um segundo ADMIN por descuido.
   */
  describe('SUPORTE', () => {
    it('entra nas configurações', () => {
      expect(satisfazAcesso(['SUPORTE'], ACESSO_CONFIGURACAO)).toBe(true);
    });

    it('não entra nos cadastros administrativos nem no monitoramento', () => {
      expect(satisfazAcesso(['SUPORTE'], ACESSO_ADMINISTRACAO)).toBe(false);
      expect(satisfazAcesso(['SUPORTE'], ACESSO_MONITORAMENTO)).toBe(false);
    });

    it('é reconhecida vinda do backend com o prefixo do Spring Security', () => {
      expect(normalizarRoles(['ROLE_SUPORTE'])).toEqual(['SUPORTE']);
    });
  });
});

describe('primeira tela após o login', () => {
  it.each([
    [['ADMIN'], '/app/dashboard'],
    [['ADMIN', 'SUPORTE'], '/app/dashboard'],
    [['INTERNO', 'SIMULADOR', 'CIMENTACAO'], '/app/simulador'],
    [['CLIENTE', 'SIMULADOR', 'CIMENTACAO'], '/app/simulador'],
    [['CLIENTE', 'MONITORAMENTO'], '/app/monitoramento-unidades'],
    [['INTERNO', 'MONITORAMENTO'], '/app/monitoramento-unidades'],
    [['SUPORTE'], '/app/configuracoes'],
    [['INTERNO'], '/app/meu-usuario'],
    [['CLIENTE'], '/app/meu-usuario'],
  ])('%s vai para %s', (roles, destino) => {
    expect(rotaInicialPara(roles as never)).toBe(destino);
  });

  /**
   * ⚠️ Quem recebeu só `MONITORAMENTO_REAL` não tem a tela de séries. Mandá-lo para
   * `/app/monitoramento-unidades` daria "acesso negado" no próprio login.
   */
  it('quem só tem tempo real cai no tempo real, não na tela de séries', () => {
    expect(rotaInicialPara(['CLIENTE', 'MONITORAMENTO_REAL'])).toBe('/app/tempo-real');
  });

  it('sem nenhuma role reconhecida, acesso negado', () => {
    expect(rotaInicialPara([])).toBe('/acesso-negado');
  });
});
