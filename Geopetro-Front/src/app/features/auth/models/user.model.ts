/**
 * Papéis do sistema.
 *
 * Espelha exatamente `com.geopetro.usuario.domain.model.Role` no backend.
 * Manter os dois em sincronia: uma role declarada só aqui nunca teria efeito,
 * porque toda decisão de autorização real acontece no servidor.
 *
 * São duas famílias, e a diferença importa:
 * - **Tipo de conta** — `CLIENTE` ou `INTERNO`, aplicada pelo backend conforme o cadastro.
 * - **Permissão de módulo** — `MONITORAMENTO`, `MONITORAMENTO_REAL`, `SIMULADOR`, `CIMENTACAO`.
 *   Sozinhas não abrem nada: valem **somadas** a um tipo de conta.
 *
 * `SONDA`, `GERENCIA` e `DIRETORIA` saíram em 2026-09-17: existiam só dentro de listas de
 * permissão, sem regra própria.
 */
export type UserRole =
  | 'ADMIN'
  | 'CLIENTE'
  | 'INTERNO'
  | 'MONITORAMENTO'
  | 'MONITORAMENTO_REAL'
  | 'SIMULADOR'
  | 'CIMENTACAO'
  | 'SUPORTE';

/**
 * Uma regra de acesso: lista de combinações, **qualquer uma** suficiente, cada uma exigindo
 * **todas** as suas roles.
 *
 * Uma lista simples de roles não dá conta do modelo atual: `MONITORAMENTO` sozinha não concede
 * nada, e `CLIENTE` sozinha também não. Espelha `RegraDeAcesso`/`RegrasDeAcesso` no backend.
 */
export type RegraDeAcesso = readonly (readonly UserRole[])[];

/** Monitoramento da Unidade/Sonda — a tela de séries. */
export const ACESSO_MONITORAMENTO: RegraDeAcesso = [
  ['ADMIN'],
  ['CLIENTE', 'MONITORAMENTO'],
  ['INTERNO', 'MONITORAMENTO'],
];

/**
 * Tempo real, limites de alarme e histórico de alarmes.
 *
 * ⚠️ **Não exige `MONITORAMENTO`**, de propósito: são concessões independentes, e quem recebe só o
 * ao vivo entra aqui sem passar pela tela de séries. Os três andam juntos por RN-069 — ver o
 * histórico e ajustar o limite é a mesma autoridade que acompanhar o ao vivo.
 */
export const ACESSO_MONITORAMENTO_REAL: RegraDeAcesso = [
  ['ADMIN'],
  ['CLIENTE', 'MONITORAMENTO_REAL'],
  ['INTERNO', 'MONITORAMENTO_REAL'],
];

/**
 * Simulador de Cimentação.
 *
 * `SIMULADOR` abre a área; `CIMENTACAO` diz qual simulador. A separação existe porque outros
 * simuladores estão previstos — o próximo nasce exigindo `SIMULADOR` mais o seu próprio domínio.
 */
export const ACESSO_SIMULADOR_CIMENTACAO: RegraDeAcesso = [
  ['ADMIN'],
  ['CLIENTE', 'SIMULADOR', 'CIMENTACAO'],
  ['INTERNO', 'SIMULADOR', 'CIMENTACAO'],
];

/** Cadastros administrativos — usuários, empresas, regionais, setores. */
export const ACESSO_ADMINISTRACAO: RegraDeAcesso = [['ADMIN']];

/**
 * Configurações do sistema — RN-086.
 *
 * Separado de `ACESSO_ADMINISTRACAO` de propósito: `SUPORTE` **configura** o sistema, mas não
 * administra cadastro. Juntar os dois faria o suporte virar um segundo `ADMIN` por descuido.
 */
export const ACESSO_CONFIGURACAO: RegraDeAcesso = [['ADMIN'], ['SUPORTE']];

/** Normaliza roles vindas do backend, removendo o prefixo `ROLE_` do Spring Security. */
export function normalizarRoles(roles: readonly (string | undefined | null)[] | undefined): UserRole[] {
  return Array.from(
    new Set(
      (roles ?? [])
        .filter((role): role is string => Boolean(role))
        .map((role) => role.replace(/^ROLE_/i, '').toUpperCase()),
    ),
  ) as UserRole[];
}

/** True se as roles do usuário contemplarem **alguma** das combinações da regra. */
export function satisfazAcesso(
  rolesDoUsuario: readonly UserRole[],
  regra: RegraDeAcesso | undefined,
): boolean {
  if (!regra || regra.length === 0) return false;

  return regra.some(
    (combinacao) =>
      combinacao.length > 0 && combinacao.every((role) => rolesDoUsuario.includes(role)),
  );
}

/**
 * Primeira tela do usuário, conforme o que ele pode acessar.
 *
 * A ordem importa: vai da visão mais ampla para a mais restrita, para que um ADMIN caia no
 * Dashboard e um CLIENTE — que só tem Monitoramento — caia direto nele em vez de bater em
 * "acesso negado".
 *
 * ⚠️ O tempo real vem **depois** do monitoramento e é um destino próprio: quem recebeu só
 * `MONITORAMENTO_REAL` não tem a tela de séries, e mandá-lo para ela daria "acesso negado" no
 * login.
 *
 * Usado tanto no pós-login quanto no redirecionamento de `/app`, para que os dois nunca divirjam.
 */
export function rotaInicialPara(rolesDoUsuario: readonly UserRole[]): string {
  if (satisfazAcesso(rolesDoUsuario, ACESSO_ADMINISTRACAO)) return '/app/dashboard';
  if (satisfazAcesso(rolesDoUsuario, ACESSO_SIMULADOR_CIMENTACAO)) return '/app/simulador';
  if (satisfazAcesso(rolesDoUsuario, ACESSO_MONITORAMENTO)) return '/app/monitoramento-sondas';
  if (satisfazAcesso(rolesDoUsuario, ACESSO_MONITORAMENTO_REAL)) return '/app/tempo-real';
  // SUPORTE sozinho não tem dashboard nem monitoramento: cai nas configurações, que é o que ele faz.
  if (satisfazAcesso(rolesDoUsuario, ACESSO_CONFIGURACAO)) return '/app/configuracoes';
  // Sem acesso a nenhum módulo: resta o autoatendimento do próprio perfil.
  if (rolesDoUsuario.includes('INTERNO') || rolesDoUsuario.includes('CLIENTE')) return '/app/meu-usuario';

  return '/acesso-negado';
}

export interface User {
  id: string;
  username?: string;
  nome: string;
  email: string;
  endereco?: string;
  telefone?: string;
  senha: string;
  role: UserRole;
  roles?: UserRole[];
}

export interface AuthenticatedUser {
  token: string;
  username: string;
  nome: string;
  email: string;
  endereco: string | null;
  telefone: string;
  role: UserRole;
  roles: UserRole[];
  cep?: string | null;
  logradouro?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  numero?: string | null;
  complemento?: string | null;
}
