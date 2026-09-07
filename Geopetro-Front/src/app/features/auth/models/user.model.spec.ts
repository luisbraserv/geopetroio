import { describe, expect, it } from 'vitest';

import {
  ROLES_ADMINISTRACAO,
  ROLES_CONFIGURACAO,
  normalizarRoles,
  possuiAlgumaRole,
  rotaInicialPara,
} from './user.model';

/**
 * RN-086 — o SUPORTE configura o sistema, mas não administra cadastro.
 *
 * A fronteira entre `ROLES_CONFIGURACAO` e `ROLES_ADMINISTRACAO` é o que impede a role oitava de
 * virar um segundo ADMIN por descuido, e ela não é óbvia lendo as duas constantes lado a lado.
 */
describe('papéis do sistema', () => {
  describe('SUPORTE', () => {
    it('entra nas configurações', () => {
      expect(possuiAlgumaRole(['SUPORTE'], ROLES_CONFIGURACAO)).toBe(true);
    });

    it('não entra nos cadastros administrativos', () => {
      expect(possuiAlgumaRole(['SUPORTE'], ROLES_ADMINISTRACAO)).toBe(false);
    });

    it('cai nas configurações ao entrar, por não ter dashboard nem monitoramento', () => {
      expect(rotaInicialPara(['SUPORTE'])).toBe('/app/configuracoes');
    });

    it('não rouba o destino de quem também é ADMIN', () => {
      // ADMIN tem dashboard; a ordem em rotaInicialPara precisa preservar isso.
      expect(rotaInicialPara(['ADMIN', 'SUPORTE'])).toBe('/app/dashboard');
    });

    it('é reconhecida vinda do backend com o prefixo do Spring Security', () => {
      expect(normalizarRoles(['ROLE_SUPORTE'])).toEqual(['SUPORTE']);
    });
  });

  describe('as outras roles não mudaram de destino', () => {
    it.each([
      [['ADMIN'], '/app/dashboard'],
      [['CIMENTACAO'], '/app/simulador'],
      [['SONDA'], '/app/monitoramento-sondas'],
      [['CLIENTE'], '/app/monitoramento-sondas'],
      [['INTERNO'], '/app/meu-usuario'],
    ])('%s vai para %s', (roles, destino) => {
      expect(rotaInicialPara(roles as never)).toBe(destino);
    });

    it('sem nenhuma role reconhecida, acesso negado', () => {
      expect(rotaInicialPara([])).toBe('/acesso-negado');
    });
  });
});
