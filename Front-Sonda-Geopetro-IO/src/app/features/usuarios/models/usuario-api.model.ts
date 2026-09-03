import { UserRole } from '../../auth/models/user.model';

export interface RegionalVinculo {
  id: number;
  nome: string;
}

export interface UnidadeSondaVinculo {
  id: number;
  nome: string;
  apelido: string | null;
}

export interface SetorVinculo {
  id: number;
  nome: string;
  regionalId: number | null;
  regionalNome: string | null;
}

export interface UsuarioResponse {
  username: string;
  nome: string;
  email: string;
  telefone: string;
  endereco: string | null;
  role: UserRole;
  roles: UserRole[];
  status: 'ATIVO' | 'INATIVO';
  cep?: string | null;
  logradouro?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  estado?: string | null;
  numero?: string | null;
  complemento?: string | null;
  id?: number | null;
  empresa?: string | null;
  empresaId?: number | null;
  empresaNome?: string | null;
  matricula?: number | null;
  regionalId?: number | null;
  regionalNome?: string | null;
  regionais?: RegionalVinculo[] | null;
  setores?: SetorVinculo[] | null;
  /** Unidades/Sondas que o CLIENTE pode visualizar no monitoramento. */
  unidadesSondas?: UnidadeSondaVinculo[] | null;
}

export interface UsuarioPaginadoResponse {
  conteudo: UsuarioResponse[];
  pagina: number;
  tamanho: number;
  totalElementos: number;
  totalPaginas: number;
  primeira: boolean;
  ultima: boolean;
}

export interface EnderecoPayload {
  cep: string;
  logradouro: string;
  bairro: string;
  cidade: string;
  estado: string;
  numero: string;
  complemento: string;
}

export interface UsuarioContatoPayload extends EnderecoPayload {
  nome: string;
  telefone: string;
  email: string;
}

export interface CriarUsuarioClientePayload extends UsuarioContatoPayload {
  id: number;
  empresa?: string;
  empresaId: number;
  username: string;
  password: string;
  roles: UserRole[];
  /** Ids das Unidades/Sondas concedidas a este cliente. */
  unidadeSondaIds: number[];
}

export interface CriarUsuarioInternoPayload extends UsuarioContatoPayload {
  matricula: number;
  regionalId: number;
  regionalIds: number[];
  setorIds: number[];
  username: string;
  password: string;
  roles: UserRole[];
}

export interface AtualizarUsuarioPayload extends UsuarioContatoPayload {
  roles: UserRole[];
  id?: number;
  empresa?: string;
  empresaId?: number;
  matricula?: number;
  regionalId?: number;
  regionalIds?: number[];
  setorIds?: number[];
  /** Omitido = mantem o vinculo atual. Array vazio = revoga todas as sondas. */
  unidadeSondaIds?: number[];
}

export interface AlterarSenhaPayload {
  senhaAtual: string;
  novaSenha: string;
  confirmacaoSenha: string;
}
