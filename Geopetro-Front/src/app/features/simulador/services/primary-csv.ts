/**
 * Leitura de CSV para medições. O separador é **sugestão**: a prévia mostra o
 * resultado antes de incorporar. Texto continua texto — nada aqui interpreta
 * fórmula nem HTML.
 */
export type CsvDecimal = ',' | '.';

export interface CsvOptions {
  delimiter?: string;
  decimal?: CsvDecimal;
}

export interface CsvTable {
  delimiter: string;
  decimal: CsvDecimal;
  headers: string[];
  /** Linhas de dados; o número da linha no arquivo é `index + 2`. */
  rows: string[][];
}

const CANDIDATES = [';', '\t', ','] as const;

/** Separador sugerido pelo cabeçalho. Com decimal vírgula, a vírgula não concorre. */
export function detectDelimiter(text: string, decimal: CsvDecimal = '.'): string {
  const header = text.split(/\r?\n/).find(line => line.trim().length) ?? '';
  const allowed = CANDIDATES.filter(candidate => !(candidate === ',' && decimal === ','));
  let best = allowed[0] ?? ';';
  let bestCount = -1;
  for (const candidate of allowed) {
    const count = countOutsideQuotes(header, candidate);
    if (count > bestCount) { best = candidate; bestCount = count; }
  }
  return bestCount > 0 ? best : (allowed[0] ?? ';');
}

function countOutsideQuotes(line: string, delimiter: string): number {
  let count = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') { quoted = !quoted; continue; }
    if (!quoted && char === delimiter) count++;
  }
  return count;
}

function splitLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      // Aspas duplas dentro de campo com aspas representam uma aspa literal.
      if (quoted && line[i + 1] === '"') { current += '"'; i++; continue; }
      quoted = !quoted;
      continue;
    }
    if (!quoted && char === delimiter) { cells.push(current); current = ''; continue; }
    current += char;
  }
  cells.push(current);
  return cells.map(cell => cell.trim());
}

export function parseCsv(text: string, options: CsvOptions = {}): CsvTable {
  const decimal = options.decimal ?? '.';
  const delimiter = options.delimiter ?? detectDelimiter(text, decimal);
  const lines = text.split(/\r?\n/).filter(line => line.trim().length);
  if (!lines.length) return { delimiter, decimal, headers: [], rows: [] };
  return {
    delimiter, decimal,
    headers: splitLine(lines[0], delimiter),
    rows: lines.slice(1).map(line => splitLine(line, delimiter)),
  };
}

/**
 * Número de uma célula. Vazio devolve `null` — ausência não vira zero. Valor
 * não finito devolve `null` para o chamador registrar o motivo.
 */
export function parseCsvNumber(raw: string | undefined, decimal: CsvDecimal): number | null {
  const text = (raw ?? '').trim();
  if (!text) return null;
  // Com decimal vírgula, o ponto é separador de milhar, e vice-versa.
  const normalized = decimal === ','
    ? text.replace(/\./g, '').replace(',', '.')
    : text.replace(/,/g, '');
  if (!/^[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?$/.test(normalized)) return null;
  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}
