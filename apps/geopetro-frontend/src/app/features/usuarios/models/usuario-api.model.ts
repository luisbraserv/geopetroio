import { UserRole } from '../../auth/models/user.model';

export interface UnidadeVinculo {
  id: number;
  nome: string;
  apelido: string | null;
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
  /** Unidades que o CLIENTE pode visualizar no monitoramento. */
  unidades?: UnidadeVinculo[] | null;
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
  /** Ids das Unidades concedidas a este cliente. */
  unidadeIds: number[];
}

export interface CriarUsuarioInternoPayload extends UsuarioContatoPayload {
  matricula: number;
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
  /** Omitido = mantém o vínculo atual. Array vazio = revoga todas as unidades. */
  unidadeIds?: number[];
}

export interface AlterarSenhaPayload {
  senhaAtual: string;
  novaSenha: string;
  confirmacaoSenha: string;
}
