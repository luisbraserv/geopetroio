/**
 * Documento de cards de uma Unidade/Sonda e as grandezas que ele produz.
 *
 * Contrato em `specs/contracts/configuracao-sonda.md §5`; o que cada tipo significa está em
 * `specs/features/cards-configuraveis.md`.
 *
 * **Por que este módulo existe:** desde 2026-09-08 o conjunto de grandezas **varia por unidade**
 * ([RN-080](../../../../../../specs/business-rules.md)). As telas não podem mais partir de uma
 * lista fixa de cinco dispositivos — precisam perguntar à unidade o que ela mede. Este arquivo é o
 * único lugar do front que sabe traduzir *card* em *série de tela*.
 *
 * Espelha `LeituraDeCards` do Geopetro-Desktop: é lá que a regra nasce. Aqui só interessa **quantas
 * séries** um card produz e **como rotulá-las** — a conversão do sinal acontece na borda.
 */

export type TipoCard =
  | 'PESO'
  | 'TORQUE'
  | 'PRESSAO'
  | 'TEMPERATURA'
  | 'NIVEL_TANQUE'
  | 'CONTADOR_STROKE';

export type FormaTanque = 'CILINDRICO_VERTICAL' | 'CILINDRICO_HORIZONTAL' | 'RETANGULAR';

/** Escala do sinal declarada no documento. Campos não usados pelo tipo vêm nulos. */
export interface ParametrosCard {
  rangeSensorBar?: number | null;
  minimoEscala?: number | null;
  maximoEscala?: number | null;
  unidade?: string | null;
  forma?: FormaTanque | null;
  raio?: number | null;
  altura?: number | null;
  comprimento?: number | null;
  largura?: number | null;
  distanciaMinima?: number | null;
  distanciaMaxima?: number | null;
  constanteBomba?: number | null;
}

export interface CardUnidade {
  /** Gerado pelo servidor no formato `<TIPO>_<NN>` e imutável — RN-081. */
  dispositivoId: string;
  /** Rótulo de tela, editável. Não entra no histórico (RN-097): vive só aqui. */
  nome: string;
  tipo: TipoCard;
  byteInicial: number;
  /** Card desativado não é lido nem publicado. Nunca é excluído — RN-091. */
  ativo: boolean;
  /** Invisível é lido e gravado na borda, mas não publicado — RN-037. */
  visivel: boolean;
  ordem: number;
  parametros?: ParametrosCard | null;
}

export interface ConexaoCards {
  ip: string;
  rack: number;
  slot: number;
  dbNumero: number;
  intervaloLeituraMs: number;
}

export interface ConfiguracaoCards {
  schemaVersion: number;
  unidadeSondaId: number;
  /** `0` quando a unidade ainda não foi configurada — e aí ela não lê nada (RN-088). */
  revisao: number;
  conexao?: ConexaoCards | null;
  cards: CardUnidade[];
  atualizadoPor?: string | null;
  atualizadoEm?: string | null;
}

/** As três séries de um card de stroke — RN-090, RN-098. */
export const SERIE_STROKE = 'stroke';
export const SERIE_VAZAO = 'vazao';
export const SERIE_VOLUME = 'volumeAcumulado';

/**
 * Uma grandeza que a unidade publica: o que vira um card e um gráfico na tela.
 *
 * Um `CONTADOR_STROKE` produz **três** delas com o mesmo `dispositivoId`, distinguidas por `serie`
 * (RN-098). Todo outro tipo produz uma, com `serie` nula.
 */
export interface GrandezaDeCard {
  /** Identidade na tela e nas coleções — `dispositivoId` ou `dispositivoId|serie`. */
  chave: string;
  dispositivoId: string;
  serie: string | null;
  tipo: TipoCard;
  rotulo: string;
  unidade: string;
  casas: number;
  cor: string;
}

/**
 * Identidade de uma grandeza.
 *
 * Precisa incluir a série porque as três de um contador de stroke **compartilham o
 * `dispositivoId`** — chavear só por ele faria vazão sobrescrever stroke na mesma tela.
 */
export function chaveGrandeza(dispositivoId: string, serie?: string | null): string {
  return serie ? `${dispositivoId}|${serie}` : dispositivoId;
}

/**
 * Unidade de engenharia por tipo.
 *
 * ⚠️ **Só serve ao histórico.** No tempo real a unidade **vem na mensagem**, porque cada leitura se
 * descreve (RN-097). Já a resposta REST de série devolve apenas `{dataHora, valor}`, sem nada que
 * diga em que unidade o número está — e aí o rótulo do eixo depende desta tabela.
 *
 * Os textos espelham `LeituraDeCards` do Desktop; divergir aqui faria a mesma grandeza aparecer
 * com unidades diferentes nas duas telas.
 */
function unidadeDe(tipo: TipoCard, serie: string | null, parametros?: ParametrosCard | null): string {
  switch (tipo) {
    case 'PESO':
      return 'lbf';
    case 'TORQUE':
      return 'lbf.ft';
    case 'PRESSAO':
      return 'psi';
    case 'TEMPERATURA':
      // A escala é decisão de projeto e vive no documento; °C é o padrão do Desktop.
      return parametros?.unidade?.trim() || '°C';
    case 'NIVEL_TANQUE':
      // O sensor mede distância até o líquido; o que se publica é volume — RN-084/RN-085.
      return 'bbl';
    case 'CONTADOR_STROKE':
      if (serie === SERIE_VAZAO) return 'bbl/min';
      if (serie === SERIE_VOLUME) return 'bbl';
      return 'stroke';
  }
}

function casasDe(tipo: TipoCard, serie: string | null): number {
  switch (tipo) {
    case 'PESO':
    case 'TORQUE':
      return 0;
    case 'PRESSAO':
    case 'TEMPERATURA':
    case 'NIVEL_TANQUE':
      return 1;
    case 'CONTADOR_STROKE':
      if (serie === SERIE_VAZAO) return 3;
      if (serie === SERIE_VOLUME) return 2;
      return 0;
  }
}

/**
 * Cores por tipo, com variantes para quando a unidade tem mais de um card do mesmo tipo.
 *
 * Cor por **tipo**, não por posição na lista: assim um torque continua roxo em qualquer unidade, e
 * acrescentar um card não repinta os outros. As variantes existem porque duas chaves hidráulicas
 * na mesma tela precisam ser distinguíveis.
 */
const CORES: Record<TipoCard, string[]> = {
  PESO: ['#2563eb', '#1d4ed8'],
  TORQUE: ['#7c3aed', '#c026d3'],
  PRESSAO: ['#dc2626', '#ea580c'],
  TEMPERATURA: ['#d97706', '#b45309'],
  NIVEL_TANQUE: ['#0d9488', '#0f766e'],
  CONTADOR_STROKE: ['#059669', '#0891b2', '#4f46e5'],
};

const SUFIXO_SERIE: Record<string, string> = {
  [SERIE_STROKE]: 'Stroke',
  [SERIE_VAZAO]: 'Vazão',
  [SERIE_VOLUME]: 'Volume acumulado',
};

/** Um card de stroke vira três linhas; os demais, uma. */
function seriesDe(tipo: TipoCard): (string | null)[] {
  return tipo === 'CONTADOR_STROKE' ? [SERIE_STROKE, SERIE_VAZAO, SERIE_VOLUME] : [null];
}

/**
 * As grandezas que a unidade publica, na ordem em que devem aparecer.
 *
 * Duas filtragens, e são regras diferentes — as mesmas do Desktop:
 * - **`ativo`**: card desativado não é lido do CLP (RN-091), então nem existe série.
 * - **`visivel`**: card ativo mas invisível é lido e gravado na borda, e **não publicado**
 *   (RN-037). Nada dele chega aqui por nenhum dos dois canais.
 *
 * Uma unidade sem cards devolve lista vazia — e isso é estado normal, não erro: ela ainda não foi
 * configurada e por isso não lê nada (RN-088).
 */
/**
 * Uma grandeza na tela de limites, com o motivo de ela poder não estar sendo vigiada.
 *
 * A tela de gráficos pergunta "o que desenhar?" e a de limites pergunta "o que **existe** para
 * vigiar?" — e as respostas são diferentes. Um card desativado ou invisível some da primeira e
 * precisa aparecer na segunda, porque o limite dele continua no documento.
 */
export interface GrandezaVigiavel extends GrandezaDeCard {
  /** Card desativado não é lido: o limite **hiberna** junto, sem ser apagado (RN-091). */
  cardAtivo: boolean;
  /**
   * ⚠️ Card invisível não chega ao servidor pelo tempo real (RN-037), e é por ali que a avaliação
   * roda (RN-102) — então o limite fica salvo e **nunca dispara**. Ver OQ-050.
   */
  cardVisivel: boolean;
}

/**
 * Tudo o que a unidade declara, ativo ou não — o vocabulário de limites (RN-101).
 *
 * ⚠️ **Não reaproveita `grandezasDe`** de propósito. Aquela função escolhe a variante de cor pelo
 * índice do card **entre os publicados**; incluir os desativados aqui deslocaria esse índice e
 * repintaria os gráficos da outra tela.
 */
export function grandezasVigiaveis(
  cards: readonly CardUnidade[] | null | undefined,
): GrandezaVigiavel[] {
  if (!cards?.length) return [];

  const declarados = cards
    .filter((card) => card?.tipo && card?.dispositivoId)
    .slice()
    .sort((a, b) => a.ordem - b.ordem || a.dispositivoId.localeCompare(b.dispositivoId));

  const grandezas: GrandezaVigiavel[] = [];
  for (const card of declarados) {
    const paleta = CORES[card.tipo];
    for (const [posicao, serie] of seriesDe(card.tipo).entries()) {
      const sufixo = serie ? SUFIXO_SERIE[serie] : null;
      grandezas.push({
        chave: chaveGrandeza(card.dispositivoId, serie),
        dispositivoId: card.dispositivoId,
        serie,
        tipo: card.tipo,
        rotulo: sufixo ? `${card.nome} — ${sufixo}` : card.nome,
        unidade: unidadeDe(card.tipo, serie, card.parametros),
        casas: casasDe(card.tipo, serie),
        cor: paleta[posicao % paleta.length],
        cardAtivo: !!card.ativo,
        cardVisivel: !!card.visivel,
      });
    }
  }
  return grandezas;
}

export function grandezasDe(cards: readonly CardUnidade[] | null | undefined): GrandezaDeCard[] {
  if (!cards?.length) return [];

  const publicados = cards
    .filter((card) => card?.ativo && card?.visivel && card?.tipo)
    // `ordem` é única no documento (o backend recusa duas iguais); o desempate por id só protege
    // contra um documento gravado antes dessa validação existir.
    .sort((a, b) => a.ordem - b.ordem || a.dispositivoId.localeCompare(b.dispositivoId));

  const vistosPorTipo = new Map<TipoCard, number>();
  const grandezas: GrandezaDeCard[] = [];

  for (const card of publicados) {
    const indice = vistosPorTipo.get(card.tipo) ?? 0;
    vistosPorTipo.set(card.tipo, indice + 1);

    const paleta = CORES[card.tipo];

    for (const [posicao, serie] of seriesDe(card.tipo).entries()) {
      // Para stroke a variante identifica a série; para os demais, o card entre os do mesmo tipo.
      const variante = card.tipo === 'CONTADOR_STROKE' ? posicao : indice;
      const sufixo = serie ? SUFIXO_SERIE[serie] : null;

      grandezas.push({
        chave: chaveGrandeza(card.dispositivoId, serie),
        dispositivoId: card.dispositivoId,
        serie,
        tipo: card.tipo,
        rotulo: sufixo ? `${card.nome} — ${sufixo}` : card.nome,
        unidade: unidadeDe(card.tipo, serie, card.parametros),
        casas: casasDe(card.tipo, serie),
        cor: paleta[variante % paleta.length],
      });
    }
  }

  return grandezas;
}
