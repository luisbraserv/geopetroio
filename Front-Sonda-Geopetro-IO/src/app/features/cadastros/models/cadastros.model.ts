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
 * Tipo de equipamento cadastrado como Unidade/Sonda — RN-065.
 *
 * Espelha o enum do backend. E classificacao apenas (RN-074): a telemetria segue exclusiva de
 * SONDA, e uma unidade de outro tipo existe no cadastro sem monitoramento.
 */
export const TIPOS_UNIDADE_SONDA = [
  'SONDA',
  'UNIDADE_BOMBEIO',
  'SLICKLINE_WIRELINE',
  'CIMENTACAO',
  'UCAQ',
] as const;

export type TipoUnidadeSonda = (typeof TIPOS_UNIDADE_SONDA)[number];

export const ROTULO_TIPO_UNIDADE_SONDA: Record<TipoUnidadeSonda, string> = {
  SONDA: 'Sonda',
  UNIDADE_BOMBEIO: 'Unidade de bombeio',
  SLICKLINE_WIRELINE: 'Slickline / Wireline',
  CIMENTACAO: 'Cimentação',
  UCAQ: 'UCAQ',
};

export interface UnidadeSonda {
  id: number;
  nome: string;
  apelido?: string | null;
  tipo: TipoUnidadeSonda;
  setorId: number;
  setorNome: string;
  regionalId: number;
  regionalNome: string;
}

export interface UnidadeSondaPayload {
  nome: string;
  apelido?: string | null;
  tipo: TipoUnidadeSonda;
  setorId: number;
}
