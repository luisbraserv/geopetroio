/**
 * Papéis do sistema.
 *
 * Espelha exatamente `com.geopetro.usuario.domain.model.Role` no backend.
 * Manter os dois em sincronia: uma role declarada só aqui nunca teria efeito,
 * porque toda decisão de autorização real acontece no servidor.
 */
export type UserRole =
  | 'ADMIN'
  | 'CLIENTE'
  | 'INTERNO'
  | 'CIMENTACAO'
  | 'SONDA'
  | 'GERENCIA'
  | 'DIRETORIA';

/**
 * Perfis que acessam o Monitoramento de Sondas.
 *
 * `CLIENTE` entra aqui, mas com escopo reduzido: o backend devolve apenas as
 * Unidades/Sondas concedidas no cadastro dele. Os demais enxergam a frota inteira.
 */
export const ROLES_MONITORAMENTO: readonly UserRole[] = [
  'ADMIN',
  'SONDA',
  'CIMENTACAO',
  'GERENCIA',
  'DIRETORIA',
  'CLIENTE',
];

/** Perfis que acessam o Simulador de Cimentação. */
export const ROLES_SIMULADOR: readonly UserRole[] = ['ADMIN', 'CIMENTACAO', 'GERENCIA', 'DIRETORIA'];

/** Perfis que acessam os cadastros administrativos. */
export const ROLES_ADMINISTRACAO: readonly UserRole[] = ['ADMIN'];

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

/** True se o usuário tiver ao menos uma das roles exigidas. */
export function possuiAlgumaRole(
  rolesDoUsuario: readonly UserRole[],
  rolesExigidas: readonly UserRole[],
): boolean {
  return rolesExigidas.some((role) => rolesDoUsuario.includes(role));
}

/**
 * Primeira tela do usuário, conforme o que ele pode acessar.
 *
 * A ordem importa: vai da visão mais ampla para a mais restrita, para que um ADMIN caia no
 * Dashboard e um CLIENTE — que só tem Monitoramento — caia direto nele em vez de bater em
 * "acesso negado".
 *
 * Usado tanto no pós-login quanto no redirecionamento de `/app`, para que os dois nunca divirjam.
 */
export function rotaInicialPara(rolesDoUsuario: readonly UserRole[]): string {
  if (possuiAlgumaRole(rolesDoUsuario, ROLES_ADMINISTRACAO)) return '/app/dashboard';
  if (possuiAlgumaRole(rolesDoUsuario, ROLES_SIMULADOR)) return '/app/simulador';
  if (possuiAlgumaRole(rolesDoUsuario, ROLES_MONITORAMENTO)) return '/app/monitoramento-sondas';
  // Sem acesso a nenhum módulo: resta o autoatendimento do próprio perfil.
  if (rolesDoUsuario.includes('INTERNO')) return '/app/meu-usuario';

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
  regionalId?: number | null;
  regionalNome?: string | null;
}
