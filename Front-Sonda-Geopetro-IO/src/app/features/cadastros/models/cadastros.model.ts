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

export interface UnidadeSonda {
  id: number;
  nome: string;
  apelido?: string | null;
  setorId: number;
  setorNome: string;
  regionalId: number;
  regionalNome: string;
}

export interface UnidadeSondaPayload {
  nome: string;
  apelido?: string | null;
  setorId: number;
}
