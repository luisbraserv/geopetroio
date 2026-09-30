// Resposta paginada padrão da API (espelha PaginaResponse/PaginaOutput do backend).
export interface Pagina<T> {
  conteudo: T[];
  pagina: number;
  tamanho: number;
  totalElementos: number;
  totalPaginas: number;
  primeira: boolean;
  ultima: boolean;
}
