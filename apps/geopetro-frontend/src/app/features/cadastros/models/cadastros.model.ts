export interface Empresa {
  id: number;
  nome: string;
  telefone?: string | null;
  cnpj?: string | null;
  email?: string | null;
  cep?: string | null;
  logradouro?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  numero?: string | null;
  complemento?: string | null;
}

export type EmpresaPayload = Omit<Empresa, 'id'>;

export interface Regional {
  id: number;
  nome: string;
  centroCusto?: string | null;
}

export interface RegionalPayload {
  nome: string;
  centroCusto?: string | null;
}

export interface Setor {
  id: number;
  nome: string;
  centroCusto?: string | null;
  regionalId: number;
  regionalNome: string;
}

export interface SetorPayload {
  nome: string;
  centroCusto?: string | null;
  regionalId: number;
}

/**
 * Tipo de equipamento cadastrado como Unidade — RN-065.
 *
 * Espelha o enum do backend. E classificacao apenas (RN-074): a telemetria segue exclusiva de
 * SONDA, e uma unidade de outro tipo existe no cadastro sem monitoramento.
 */
export const TIPOS_UNIDADE = [
  'SONDA',
  'UNIDADE_BOMBEIO',
  'SLICKLINE_WIRELINE',
  'CIMENTACAO',
  'UCAQ',
] as const;

export type TipoUnidade = (typeof TIPOS_UNIDADE)[number];

export const ROTULO_TIPO_UNIDADE: Record<TipoUnidade, string> = {
  SONDA: 'Sonda',
  UNIDADE_BOMBEIO: 'Unidade de bombeio',
  SLICKLINE_WIRELINE: 'Slickline / Wireline',
  CIMENTACAO: 'Cimentação',
  UCAQ: 'UCAQ',
};

export type StatusUnidade = 'ATIVA' | 'INATIVA';

export interface Unidade {
  id: number;
  nome: string;
  apelido?: string | null;
  tipo: TipoUnidade;
  status: StatusUnidade;
  setorId: number;
  setorNome: string;
  regionalId: number;
  regionalNome: string;
}

export interface UnidadePayload {
  nome: string;
  apelido?: string | null;
  tipo: TipoUnidade;
  setorId: number;
}
