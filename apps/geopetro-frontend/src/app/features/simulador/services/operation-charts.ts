import type { PrimaryFluid } from '../models/primary-cementing.model';
import { K } from './primary-hydraulics';
import type { PrimaryReportVisual } from './primary-well-visuals';

/**
 * Gráficos de operação comuns à primária, ao tampão e ao squeeze: ECD e hidrostática
 * numa referência, envelope de pressão e volume injetado × tempo. Cada simulador monta
 * estes dados a partir do seu resultado; tela e relatório só desenham.
 */
export type OperationKind = 'primaria' | 'tampao' | 'squeeze';

export interface OperationChartPhase { id: string; name: string; topMD: number; bottomMD: number }
export interface OperationHydroEcdPoint {
  volumeBbl: number;
  /** Instante do motor, para o eixo de tempo do squeeze. */
  timeMin: number;
  /** Pressao puramente hidrostatica no ponto de referencia, antes de atrito e contrapressao. */
  hydrostaticPsi: number | null;
  /** ESD na referencia: Ph/(K*TVD). Usa a TVD do proprio snapshot. */
  hydrostaticPpg: number | null;
  /** ECD calculado pelo motor. Pode ser null fora do dominio hidraulico. */
  ecdPpg: number | null;
  /** ECD - ESD sem a pressao aplicada: so o atrito, na mesma referencia de profundidade. */
  deltaEcdPpg: number | null;
  /** BHP - Ph - pressao aplicada: a perda por atrito ate a referencia. */
  dynamicPressurePsi: number | null;
  /** Pressao imposta na superficie (contrapressao da primaria, compressao do squeeze); 0 sem ela. */
  appliedPressurePsi: number;
  annularFrictionPsi: number | null;
  outletTVD: number | null;
  pumpRateBpm: number;
  circulating: boolean;
  unavailable: boolean;
}
export interface OperationHydroEcdSummary {
  maxHydrostaticPsi: number | null;
  maxEcdPpg: number | null;
  maxDeltaEcdPpg: number | null;
  maxDynamicPressurePsi: number | null;
  /** Maior pressao aplicada na superficie; 0 quando nao ha. */
  maxAppliedPressurePsi: number;
  circulatingSamples: number;
  unavailableSamples: number;
  freeFallUnavailable: boolean;
}
/** Uma profundidade em que o gráfico de ECD e hidrostática pode ser lido. */
export interface OperationHydroEcdReference {
  id: string;
  /** Nome curto no seletor, quando houver mais de uma referência. */
  label: string;
  /** Título do gráfico na tela; o SVG usa a mesma frase sem acento. */
  title: string;
  /** Texto de apoio abaixo do título. */
  description: string;
  /** TVD que amarra as escalas de psi e ppg. */
  tvd: number;
  points: OperationHydroEcdPoint[];
  summary: OperationHydroEcdSummary;
  /** Eixo horizontal: volume injetado (padrao) ou tempo (squeeze, com a compressao). */
  axis?: 'volume' | 'time';
  /** Estado parado marcado como ponto, fora da linha: a coluna depois da retirada. */
  marker?: OperationHydroEcdMarker | null;
  /** Trechos destacados no eixo horizontal, como a compressao. */
  bands?: { label: string; from: number; to: number }[];
}
export interface OperationHydroEcdMarker {
  label: string; volumeBbl: number; timeMin: number; hydrostaticPsi: number; ecdPpg: number;
}
export interface OperationPressureEnvelopePoint {
  md: number; tvd: number;
  /** Poro e fratura só onde há formação exposta (poço aberto ou canhoneado). */
  porePpg: number | null;
  /** Menor hidrostática nesta profundidade ao longo do job (perfil). */
  minHydrostaticPpg: number | null;
  /** Menor gradiente hidrostático do poço inteiro: uma linha só, em todas as profundidades. */
  minHydrostaticWellPpg: number | null;
  maxEcdPpg: number | null; fracturePpg: number | null;
  /** ECD da compressão do squeeze, só nos canhoneados; fora do ECD máximo do bombeio. */
  compressionEcdPpg?: number | null;
}
/** Squeeze: um instante do gráfico de risco de fratura, na referência dos canhoneados. */
export interface OperationFractureRiskPoint {
  timeMin: number;
  /** Pressão no poço na referência dos canhoneados. */
  pressurePsi: number;
  /** Pressão de poros na referência. */
  porePsi: number;
  /**
   * Pressão na referência com que o ponto mais crítico do canhoneado chega à fratura: a
   * curva passa dela exatamente quando algum ponto do intervalo fratura.
   */
  fracturePsi: number;
  /** Pressão aplicada na superfície; 0 fora da compressão. */
  surfacePressurePsi: number;
  /** Maior pressão de superfície que não fratura; só na compressão. */
  maxSurfacePressurePsi: number | null;
}
/** Squeeze: pressão nos canhoneados contra a janela poro–fratura, do posicionamento ao fim da compressão. */
export interface OperationFractureRisk {
  md: number; tvd: number;
  points: OperationFractureRiskPoint[];
  /** Trecho da compressão no eixo do tempo. */
  compression: { from: number; to: number } | null;
  /** Primeiro instante acima da fratura (interpolado); null quando não fratura. */
  fractureStart: { timeMin: number; pressurePsi: number; surfacePressurePsi: number } | null;
  /** Menor "pressão máxima de superfície sem fraturar" da compressão. */
  surfaceLimitPsi: number | null;
  /** Maior pressão aplicada na superfície. */
  maxSurfacePressurePsi: number;
  /** Algum instante abaixo da pressão de poros (risco de influxo). */
  belowPore: boolean;
}
export interface OperationVolumePoint { timeMin: number; volumeBbl: number }
/** `extra` é série própria de uma operação, como o volume injetado na formação. */
export type OperationVolumeSeriesKind = 'total' | 'fluid' | 'extra';
export interface OperationVolumeSeries {
  id: string; label: string; color: string; kind: OperationVolumeSeriesKind; points: OperationVolumePoint[];
}
export interface OperationCharts {
  operation: OperationKind;
  /** A primeira é a padrão. */
  references: OperationHydroEcdReference[];
  envelope: OperationPressureEnvelopePoint[];
  /** Linha horizontal no envelope: sapata anterior na primária, topo da fase nas demais. */
  envelopeMarker: { label: string; md: number } | null;
  volumes: OperationVolumeSeries[];
  phases: OperationChartPhase[];
  operationPhaseId: string | null;
  /** Aviso sobre a reologia usada no ECD; a regra é de cada operação. */
  rheologyWarning: string | null;
  /** Só no squeeze: pressão nos canhoneados contra a fratura, pelo tempo. */
  fractureRisk?: OperationFractureRisk | null;
}

export const OPERATION_FLUID_COLORS: Record<PrimaryFluid['kind'], string> = {
  mud: '#64748b', wash: '#06b6d4', spacer: '#f59e0b', cement: '#0f766e', displacement: '#2563eb',
};

export const finite = (values: Array<number | null | undefined>): number[] =>
  values.filter((value): value is number => value !== null && value !== undefined && Number.isFinite(value));
const maxOrNull = (values: Array<number | null>): number | null => {
  const valid = finite(values);
  return valid.length ? Math.max(...valid) : null;
};

export function summarizeHydroEcd(points: OperationHydroEcdPoint[],
  freeFallUnavailable: boolean): OperationHydroEcdSummary {
  const circulating = points.filter(point => point.circulating);
  const validDynamic = circulating.filter(point => point.ecdPpg !== null);
  return {
    maxHydrostaticPsi: maxOrNull(points.map(point => point.hydrostaticPsi)),
    maxEcdPpg: maxOrNull(validDynamic.map(point => point.ecdPpg)),
    maxDeltaEcdPpg: maxOrNull(validDynamic.map(point => point.deltaEcdPpg)),
    maxDynamicPressurePsi: maxOrNull(validDynamic.map(point => point.dynamicPressurePsi)),
    maxAppliedPressurePsi: Math.max(0, ...finite(points.map(point => point.appliedPressurePsi))),
    circulatingSamples: circulating.length,
    unavailableSamples: circulating.filter(point => point.unavailable).length,
    freeFallUnavailable,
  };
}

/** Menor gradiente hidrostático do poço: o menor do perfil, repetido em toda profundidade válida. */
export function withWellMinimumHydrostatic(envelope: OperationPressureEnvelopePoint[]): OperationPressureEnvelopePoint[] {
  const values = finite(envelope.map(point => point.minHydrostaticPpg));
  const minimum = values.length ? Math.min(...values) : null;
  return envelope.map(point => ({ ...point, minHydrostaticWellPpg: point.tvd > 0 ? minimum : null }));
}

/**
 * Soma um estado parado (a coluna depois da retirada) ao envelope: entra no ECD máximo e
 * na hidrostática mínima de cada profundidade, e a mínima do poço é recalculada.
 */
export function envelopeWithStaticState(envelope: OperationPressureEnvelopePoint[],
  psiAt: (md: number) => number): OperationPressureEnvelopePoint[] {
  return withWellMinimumHydrostatic(envelope.map(point => {
    if (!(point.tvd > 0)) return { ...point };
    const ppg = psiAt(point.md) / (K * point.tvd);
    return { ...point,
      maxEcdPpg: point.maxEcdPpg === null || ppg > point.maxEcdPpg ? ppg : point.maxEcdPpg,
      minHydrostaticPpg: point.minHydrostaticPpg === null || ppg < point.minHydrostaticPpg ? ppg : point.minHydrostaticPpg };
  }));
}

/**
 * Trechos contínuos da janela operacional do envelope: onde há poro e fratura (formação
 * exposta). O ECD que passa por dentro está na janela; à direita da fratura, fratura.
 */
export function operationWindowRuns(envelope: OperationPressureEnvelopePoint[]): OperationPressureEnvelopePoint[][] {
  const runs: OperationPressureEnvelopePoint[][] = [];
  let current: OperationPressureEnvelopePoint[] = [];
  for (const point of envelope) {
    if (point.porePpg != null && point.fracturePpg != null && point.tvd > 0) current.push(point);
    else if (current.length) { runs.push(current); current = []; }
  }
  if (current.length) runs.push(current);
  return runs;
}

/** Pontos do envelope fora da janela: acima da fratura (ECD do bombeio ou da compressão) e abaixo do poro. */
export function envelopeOutOfWindow(envelope: OperationPressureEnvelopePoint[]): {
  aboveFracture: { tvd: number; ppg: number }[]; belowPore: { tvd: number; ppg: number }[] } {
  const aboveFracture: { tvd: number; ppg: number }[] = [];
  const belowPore: { tvd: number; ppg: number }[] = [];
  for (const point of envelope) {
    if (point.fracturePpg != null) for (const value of [point.maxEcdPpg, point.compressionEcdPpg ?? null])
      if (value != null && value > point.fracturePpg + 1e-9) aboveFracture.push({ tvd: point.tvd, ppg: value });
    if (point.porePpg != null && point.minHydrostaticPpg != null && point.minHydrostaticPpg < point.porePpg - 1e-9)
      belowPore.push({ tvd: point.tvd, ppg: point.minHydrostaticPpg });
  }
  return { aboveFracture, belowPore };
}

/** Primeiro instante acima da fratura, interpolado entre os pontos vizinhos. */
export function fractureStartOf(points: OperationFractureRiskPoint[]): OperationFractureRisk['fractureStart'] {
  for (let i = 0; i < points.length; i++) {
    const b = points[i];
    if (!(b.pressurePsi > b.fracturePsi + 1e-6)) continue;
    const a = points[i - 1];
    const da = a ? a.pressurePsi - a.fracturePsi : 0; const db = b.pressurePsi - b.fracturePsi;
    const f = a && db > da && da <= 0 ? -da / (db - da) : 1;
    const lerp = (x: number, y: number) => x + (y - x) * f;
    return { timeMin: a ? lerp(a.timeMin, b.timeMin) : b.timeMin, pressurePsi: a ? lerp(a.pressurePsi, b.pressurePsi) : b.pressurePsi,
      surfacePressurePsi: b.surfacePressurePsi };
  }
  return null;
}

export function operationReference(data: OperationCharts, referenceId?: string | null): OperationHydroEcdReference | null {
  return data.references.find(reference => reference.id === referenceId) ?? data.references[0] ?? null;
}

export function pressureEnvelopeForPhase(data: OperationCharts,
  phaseId: string): OperationPressureEnvelopePoint[] {
  if (phaseId === 'all') return data.envelope;
  const phase = data.phases.find(entry => entry.id === phaseId);
  return phase ? data.envelope.filter(point => point.md >= phase.topMD && point.md <= phase.bottomMD) : [];
}

/** Limites comuns de ESD/ECD e as pressões equivalentes na TVD da referência. */
export function synchronizedHydroEcdAxes(reference: Pick<OperationHydroEcdReference, 'points' | 'tvd' | 'marker'>): {
  ecdMin: number; ecdMax: number; pressureMin: number; pressureMax: number;
} {
  const referenceTVD = Math.max(1, reference.tvd);
  const equivalent = [
    ...finite(reference.points.map(point => point.ecdPpg)),
    ...finite(reference.points.map(point => point.hydrostaticPpg)),
    ...(reference.marker ? [reference.marker.ecdPpg] : []),
  ];
  let ecdMin = equivalent.length ? Math.min(...equivalent) : 0;
  let ecdMax = equivalent.length ? Math.max(...equivalent) : 1;
  if (!(ecdMax > ecdMin)) ecdMax = ecdMin + 1;
  const padding = (ecdMax - ecdMin) * .08;
  ecdMin -= padding; ecdMax += padding;
  return { ecdMin, ecdMax, pressureMin: ecdMin * K * referenceTVD,
    pressureMax: ecdMax * K * referenceTVD };
}

const W = 720; const H = 460; const L = 76; const R = 48; const T = 58; const B = 56;
const PW = W - L - R; const PH = H - T - B;
const extent = (values: number[], zero = false): [number, number] => {
  let min = values.length ? Math.min(...values) : 0;
  let max = values.length ? Math.max(...values) : 1;
  if (zero) min = Math.min(0, min);
  if (!(max > min)) max = min + 1;
  const pad = (max - min) * .06;
  return [zero ? min : min - pad, max + pad];
};
const scale = (value: number, min: number, max: number, start: number, length: number) =>
  start + (value - min) / Math.max(1e-9, max - min) * length;
const svgPath = <T>(rows: T[], readX: (row: T) => number | null, readY: (row: T) => number | null,
  x: (value: number) => number, y: (value: number) => number): string => {
  let open = false;
  return rows.map(row => {
    const xv = readX(row); const yv = readY(row);
    if (xv === null || yv === null || !Number.isFinite(xv) || !Number.isFinite(yv)) { open = false; return ''; }
    const command = open ? 'L' : 'M'; open = true;
    return `${command}${x(xv).toFixed(2)},${y(yv).toFixed(2)}`;
  }).filter(Boolean).join(' ');
};
const axes = (xMin: number, xMax: number, yMin: number, yMax: number,
  xTitle: string, yTitle: string, reverseY = false): string => {
  const lines: string[] = [];
  for (let i = 0; i < 6; i++) {
    const ratio = i / 5;
    const px = L + ratio * PW; const py = T + ratio * PH;
    const xv = xMin + ratio * (xMax - xMin);
    const yv = reverseY ? yMin + ratio * (yMax - yMin) : yMax - ratio * (yMax - yMin);
    lines.push(`<line x1="${px}" y1="${T}" x2="${px}" y2="${T + PH}" stroke="#e2e8f0"/>`,
      `<text x="${px}" y="${H - 34}" text-anchor="middle" font-family="Arial" font-size="10" fill="#64748b">${xv.toFixed(1)}</text>`,
      `<line x1="${L}" y1="${py}" x2="${L + PW}" y2="${py}" stroke="#e2e8f0"/>`,
      `<text x="${L - 9}" y="${py + 3}" text-anchor="end" font-family="Arial" font-size="10" fill="#64748b">${yv.toFixed(1)}</text>`);
  }
  return lines.join('') + `<rect x="${L}" y="${T}" width="${PW}" height="${PH}" fill="none" stroke="#94a3b8"/>`
    + `<text x="${L + PW / 2}" y="${H - 7}" text-anchor="middle" font-family="Arial" font-size="11">${xTitle}</text>`
    + `<text x="16" y="${T + PH / 2}" text-anchor="middle" transform="rotate(-90 16 ${T + PH / 2})" font-family="Arial" font-size="11">${yTitle}</text>`;
};
const legend = (items: { label: string; color: string; dash?: boolean; fill?: string; marker?: boolean }[]): string => {
  // Cada item ocupa o que o rótulo pede (Arial 10 ≈ 5,6 px por caractere); o que não cabe
  // vai para uma segunda linha, ainda acima da área do gráfico.
  let x = 82; let row = 0;
  return items.map(item => {
    const width = 28 + item.label.length * 5.6 + 16;
    if (x > 82 && x + width > W - 12) { x = 82; row++; }
    const y = 34 + row * 13;
    // Área (janela, zona de fratura), marcador (fora da janela) ou traço.
    const key = item.fill
      ? `<rect x="${x.toFixed(1)}" y="${y - 5}" width="22" height="10" fill="${item.fill}" stroke="${item.color}"/>`
      : item.marker
        ? `<path d="M${(x + 7).toFixed(1)},${y - 4}L${(x + 15).toFixed(1)},${y + 4}M${(x + 15).toFixed(1)},${y - 4}L${(x + 7).toFixed(1)},${y + 4}" stroke="${item.color}" stroke-width="2.2"/>`
        : `<line x1="${x.toFixed(1)}" y1="${y}" x2="${(x + 22).toFixed(1)}" y2="${y}" stroke="${item.color}" stroke-width="2.5"${item.dash ? ' stroke-dasharray="3 4"' : ''}/>`;
    const svg = key
      + `<text x="${(x + 28).toFixed(1)}" y="${y + 4}" font-family="Arial" font-size="10" fill="#334155">${item.label}</text>`;
    x += width;
    return svg;
  }).join('');
};
/**
 * Série que só existe num trecho curto da profundidade (poro, fratura e compressão nos
 * canhoneados): a linha some no desenho, então cada ponto ganha um marcador.
 */
const shortSpanMarks = <T extends { tvd: number }>(rows: T[], read: (row: T) => number | null | undefined,
  depthSpan: number, x: (value: number) => number, y: (value: number) => number, color: string): string => {
  const defined = rows.filter(row => { const v = read(row); return v != null && Number.isFinite(v); });
  if (!defined.length) return '';
  const tvds = defined.map(row => row.tvd);
  if (Math.max(...tvds) - Math.min(...tvds) > .04 * depthSpan) return '';
  return defined.map(row => {
    const cx = x(read(row)!); const cy = y(row.tvd);
    return `<path d="M${(cx - 6).toFixed(2)},${cy.toFixed(2)}H${(cx + 6).toFixed(2)}" stroke="${color}" stroke-width="2.5"/>`
      + `<circle cx="${cx.toFixed(2)}" cy="${cy.toFixed(2)}" r="3" fill="${color}"/>`;
  }).join('');
};
const crossMark = (cx: number, cy: number, color: string) =>
  `<path d="M${(cx - 4).toFixed(2)},${(cy - 4).toFixed(2)}L${(cx + 4).toFixed(2)},${(cy + 4).toFixed(2)}M${(cx + 4).toFixed(2)},${(cy - 4).toFixed(2)}L${(cx - 4).toFixed(2)},${(cy + 4).toFixed(2)}" stroke="${color}" stroke-width="2"/>`;
/** Cores da janela operacional e da zona de fratura, na tela e no relatório. */
export const WINDOW_FILL = '#dcfce7';
export const WINDOW_STROKE = '#86efac';
export const FRACTURE_FILL = '#fee2e2';
export const FRACTURE_STROKE = '#fca5a5';
export const BELOW_PORE_FILL = '#e0f2fe';
/**
 * Janela operacional do envelope em verde claro, entre poro e fratura. Um trecho curto
 * (canhoneados) ganha altura mínima, senão some no desenho.
 */
const windowPolygons = (runs: OperationPressureEnvelopePoint[][], x: (value: number) => number,
  y: (value: number) => number): string => runs.map(run => {
  const tops = run.map(p => y(p.tvd));
  if (Math.max(...tops) - Math.min(...tops) < 8) {
    const cy = (Math.max(...tops) + Math.min(...tops)) / 2;
    const x1 = x(Math.min(...run.map(p => p.porePpg!))); const x2 = x(Math.max(...run.map(p => p.fracturePpg!)));
    return `<rect x="${x1.toFixed(2)}" y="${(cy - 5).toFixed(2)}" width="${Math.max(0, x2 - x1).toFixed(2)}" height="10" fill="${WINDOW_FILL}" stroke="${WINDOW_STROKE}"/>`;
  }
  const pts = [...run.map(p => `${x(p.porePpg!).toFixed(2)},${y(p.tvd).toFixed(2)}`),
    ...[...run].reverse().map(p => `${x(p.fracturePpg!).toFixed(2)},${y(p.tvd).toFixed(2)}`)];
  return `<polygon points="${pts.join(' ')}" fill="${WINDOW_FILL}" stroke="${WINDOW_STROKE}"/>`;
}).join('');

/** SVG do risco de fratura do squeeze: pressão nos canhoneados contra a janela, pelo tempo. */
function fractureRiskSvg(risk: OperationFractureRisk): string {
  const pts = risk.points;
  const tExt = extent(pts.map(p => p.timeMin), true);
  const pExt = extent(pts.flatMap(p => [p.pressurePsi, p.porePsi, p.fracturePsi]));
  const tx = (value: number) => scale(value, tExt[0], tExt[1], L, PW);
  const py = (value: number) => T + PH - scale(value, pExt[0], pExt[1], 0, PH);
  const line = (read: (p: OperationFractureRiskPoint) => number) => pts.map(p => `${tx(p.timeMin).toFixed(2)},${py(read(p)).toFixed(2)}`);
  // As faixas vão de borda a borda do gráfico, com o primeiro e o último valor.
  const edges = (read: (p: OperationFractureRiskPoint) => number) => pts.length
    ? [`${L},${py(read(pts[0])).toFixed(2)}`, ...line(read), `${L + PW},${py(read(pts.at(-1)!)).toFixed(2)}`] : [];
  const fracture = edges(p => p.fracturePsi); const pore = edges(p => p.porePsi);
  const x0 = String(L); const x1 = String(L + PW);
  // Acima da fratura, vermelho; entre poro e fratura, a janela em verde; abaixo do poro, azul.
  const zones = pts.length > 1
    ? `<polygon points="${[...fracture, `${x1},${T}`, `${x0},${T}`].join(' ')}" fill="${FRACTURE_FILL}"/>`
      + `<polygon points="${[...pore, ...[...fracture].reverse()].join(' ')}" fill="${WINDOW_FILL}"/>`
      + `<polygon points="${[...pore, `${x1},${T + PH}`, `${x0},${T + PH}`].join(' ')}" fill="${BELOW_PORE_FILL}"/>` : '';
  const compression = risk.compression;
  const band = compression
    ? `<line x1="${tx(compression.from).toFixed(2)}" y1="${T}" x2="${tx(compression.from).toFixed(2)}" y2="${T + PH}" stroke="#7f1d1d" stroke-dasharray="5 4"/>`
      + `<line x1="${tx(compression.to).toFixed(2)}" y1="${T}" x2="${tx(compression.to).toFixed(2)}" y2="${T + PH}" stroke="#7f1d1d" stroke-dasharray="5 4"/>`
      + `<text x="${(tx(compression.from) + 4).toFixed(2)}" y="${T + 12}" font-family="Arial" font-size="9" fill="#7f1d1d">Compressao</text>` : '';
  const start = risk.fractureStart;
  const status = start ? `FRATURA a partir de ${start.timeMin.toFixed(1)} min (P sup. ${start.surfacePressurePsi.toFixed(0)} psi)`
    : risk.belowPore ? 'Abaixo da fratura; abaixo dos poros em algum instante' : 'Dentro da janela';
  const header = (risk.surfaceLimitPsi !== null
    ? `Maior pressao de superficie sem fraturar: ${risk.surfaceLimitPsi.toFixed(0)} psi | aplicada max.: ${risk.maxSurfacePressurePsi.toFixed(0)} psi | `
    : '') + status;
  return zones + axes(...tExt, ...pExt, 'Tempo (min)', 'Pressao nos canhoneados (psi)') + band
    + legend([{ label: 'Janela operacional', color: WINDOW_STROKE, fill: WINDOW_FILL },
      { label: 'Zona de fratura', color: FRACTURE_STROKE, fill: FRACTURE_FILL },
      { label: 'Pressao nos canhoneados', color: '#7f1d1d' }, { label: 'Fratura', color: '#ea580c', dash: true },
      { label: 'Poros', color: '#0369a1', dash: true }])
    + `<text x="${L}" y="51" font-family="Arial" font-size="9" fill="${start ? '#b91c1c' : '#475569'}" font-weight="${start ? 'bold' : 'normal'}">${header}</text>`
    + `<polyline points="${pore.join(' ')}" fill="none" stroke="#0369a1" stroke-width="2" stroke-dasharray="3 4"/>`
    + `<polyline points="${fracture.join(' ')}" fill="none" stroke="#ea580c" stroke-width="2" stroke-dasharray="6 3"/>`
    + `<polyline points="${line(p => p.pressurePsi).join(' ')}" fill="none" stroke="#7f1d1d" stroke-width="2.5"/>`
    + (start ? `<circle cx="${tx(start.timeMin).toFixed(2)}" cy="${py(start.pressurePsi).toFixed(2)}" r="5" fill="#b91c1c"/>`
      + `<text x="${(tx(start.timeMin) - 8).toFixed(2)}" y="${(py(start.pressurePsi) - 9).toFixed(2)}" text-anchor="end" font-family="Arial" font-size="9" font-weight="bold" fill="#b91c1c">Inicio da fratura</text>` : '');
}
const frame = (title: string, content: string): string =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img"><rect width="100%" height="100%" fill="white"/><text x="${L}" y="18" font-family="Arial" font-size="13" font-weight="bold" fill="#051833">${title}</text>${content}</svg>`;
/** O SVG do relatório usa só ASCII nos textos, como os demais anexos. */
const ascii = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');
const volumeStroke: Record<OperationVolumeSeriesKind, { width: number; dash: string | null }> = {
  total: { width: 3, dash: null }, fluid: { width: 2, dash: '7 3' }, extra: { width: 2.5, dash: '2 3' },
};

/** SVGs vetoriais para o seletor do relatorio A4. */
export function operationReportVisuals(data: OperationCharts,
  phaseId = 'all', referenceId?: string | null): PrimaryReportVisual[] {
  const reference = operationReference(data, referenceId);
  const hydro = reference?.points ?? [];
  const byTime = reference?.axis === 'time';
  const xOf = (point: { volumeBbl: number; timeMin: number }) => byTime ? point.timeMin : point.volumeBbl;
  const volumeExtent = extent([...hydro.map(xOf), ...(reference?.marker ? [xOf(reference.marker)] : [])], true);
  const synchronized = synchronizedHydroEcdAxes({ points: hydro, tvd: reference?.tvd ?? 0, marker: reference?.marker });
  const ecdExtent: [number, number] = [synchronized.ecdMin, synchronized.ecdMax];
  const pressureExtent: [number, number] = [synchronized.pressureMin, synchronized.pressureMax];
  const vx = (value: number) => scale(value, volumeExtent[0], volumeExtent[1], L, PW);
  const ey = (value: number) => T + PH - scale(value, ecdExtent[0], ecdExtent[1], 0, PH);
  const py = (value: number) => T + PH - scale(value, pressureExtent[0], pressureExtent[1], 0, PH);
  const summary = reference?.summary ?? summarizeHydroEcd([], false);
  const deltaText = (summary.maxDeltaEcdPpg === null ? 'Delta ECD (atrito) indisponivel'
    : `Delta ECD max. (atrito): ${summary.maxDeltaEcdPpg.toFixed(4)} ppg / ${summary.maxDynamicPressurePsi?.toFixed(2) ?? '-'} psi`)
    + (summary.maxAppliedPressurePsi > 0 ? ` | Pressao aplicada max.: ${summary.maxAppliedPressurePsi.toFixed(0)} psi` : '');
  const hydroMarker = reference?.marker;
  const bands = (reference?.bands ?? []).map(band => {
    const x1 = vx(band.from); const x2 = vx(band.to);
    return `<rect x="${Math.min(x1, x2).toFixed(2)}" y="${T}" width="${Math.abs(x2 - x1).toFixed(2)}" height="${PH}" fill="#fee2e2" opacity="0.55"/>`
      + `<text x="${(Math.min(x1, x2) + 4).toFixed(2)}" y="${T + 12}" font-family="Arial" font-size="9" fill="#991b1b">${ascii(band.label)}</text>`;
  }).join('');
  // Como no iCem: hidrostatica em psi a esquerda e ECD em ppg a direita, com as
  // escalas amarradas pela TVD de referencia.
  const ecdTicks = Array.from({ length: 6 }, (_, i) => {
    const y = T + i / 5 * PH; const value = ecdExtent[1] - i / 5 * (ecdExtent[1] - ecdExtent[0]);
    return `<text x="${L + PW + 7}" y="${y + 3}" font-family="Arial" font-size="10" fill="#64748b">${value.toFixed(2)}</text>`;
  }).join('');
  const hydroSvg = bands + axes(...volumeExtent, ...pressureExtent, byTime ? 'Tempo (min)' : 'Volume injetado (bbl)', 'Pressao hidrostatica (psi)')
    + ecdTicks
    + `<text x="${W - 10}" y="${T + PH / 2}" text-anchor="middle" transform="rotate(90 ${W - 10} ${T + PH / 2})" font-family="Arial" font-size="11">ECD (ppg)</text>`
    + legend([{ label: 'Pressao hidrostatica', color: '#16a34a' },
      { label: 'ECD', color: '#dc2626' }, { label: 'ECD indisponivel', color: '#d97706' }])
    + `<text x="${L}" y="51" font-family="Arial" font-size="9" fill="#475569">${deltaText}</text>`
    + `<path d="${svgPath(hydro, xOf, p => p.hydrostaticPsi, vx, py)}" fill="none" stroke="#16a34a" stroke-width="2.5"/>`
    + `<path d="${svgPath(hydro, xOf, p => p.ecdPpg, vx, ey)}" fill="none" stroke="#dc2626" stroke-width="2.5"/>`
    + (hydroMarker ? `<circle cx="${vx(xOf(hydroMarker)).toFixed(2)}" cy="${ey(hydroMarker.ecdPpg).toFixed(2)}" r="5" fill="#1e293b"/>`
      + `<text x="${(vx(xOf(hydroMarker)) - 8).toFixed(2)}" y="${(ey(hydroMarker.ecdPpg) - 9).toFixed(2)}" text-anchor="end" font-family="Arial" font-size="9" fill="#1e293b">${ascii(hydroMarker.label)}: ${hydroMarker.ecdPpg.toFixed(3)} ppg</text>` : '')
    + hydro.filter(point => point.unavailable && point.hydrostaticPpg !== null)
      .map(point => {
        const x = vx(xOf(point)); const y = ey(point.hydrostaticPpg!);
        return `<path d="M${x - 4},${y - 4}L${x + 4},${y + 4}M${x + 4},${y - 4}L${x - 4},${y + 4}" stroke="#d97706" stroke-width="2"/>`;
      }).join('');

  const selectedEnvelope = pressureEnvelopeForPhase(data, phaseId);
  const phase = data.phases.find(entry => entry.id === phaseId);
  const ppg = finite(selectedEnvelope.flatMap(point => [point.porePpg, point.minHydrostaticPpg,
    point.minHydrostaticWellPpg, point.maxEcdPpg, point.fracturePpg, point.compressionEcdPpg]));
  const hasCompression = selectedEnvelope.some(point => point.compressionEcdPpg != null);
  const ppgExtent = extent(ppg);
  const depthExtent = extent(selectedEnvelope.map(point => point.tvd), true);
  const px = (value: number) => scale(value, ppgExtent[0], ppgExtent[1], L, PW);
  const dy = (value: number) => scale(value, depthExtent[0], depthExtent[1], T, PH);
  const marker = data.envelopeMarker;
  const markerRow = marker
    ? selectedEnvelope.find(point => Math.abs(point.md - marker.md) < 1e-6) : undefined;
  const runs = operationWindowRuns(selectedEnvelope);
  const outside = envelopeOutOfWindow(selectedEnvelope);
  const envelopeSvg = windowPolygons(runs, px, dy) + axes(...ppgExtent, ...depthExtent, 'ECD (ppg)', 'TVD (m)', true)
    + legend([...(runs.length ? [{ label: 'Janela operacional', color: WINDOW_STROKE, fill: WINDOW_FILL }] : []),
      { label: 'ECD max.', color: '#dc2626' }, { label: 'Hidro. min. (perfil)', color: '#16a34a' },
      { label: 'Hidro. min. do poco', color: '#15803d', dash: true }, { label: 'Poro', color: '#0369a1', dash: true },
      { label: 'Fratura', color: '#f97316', dash: true }, ...(hasCompression ? [{ label: 'ECD na compressao', color: '#7c3aed' }] : []),
      ...(outside.aboveFracture.length ? [{ label: 'Acima da fratura', color: '#b91c1c', marker: true }] : []),
      ...(outside.belowPore.length ? [{ label: 'Abaixo do poro', color: '#0369a1', marker: true }] : [])])
    + (marker && markerRow ? `<line x1="${L + 8}" y1="${dy(markerRow.tvd)}" x2="${L + PW - 8}" y2="${dy(markerRow.tvd)}" stroke="#64748b" stroke-width="1.5" stroke-dasharray="6 5"/>`
      + `<text x="${L + 12}" y="${dy(markerRow.tvd) - 5}" font-family="Arial" font-size="9" fill="#475569">${ascii(marker.label)}</text>` : '')
    + `<path d="${svgPath(selectedEnvelope, p => p.porePpg, p => p.tvd, px, dy)}" fill="none" stroke="#0369a1" stroke-width="2" stroke-dasharray="3 4"/>`
    + `<path d="${svgPath(selectedEnvelope, p => p.minHydrostaticPpg, p => p.tvd, px, dy)}" fill="none" stroke="#16a34a" stroke-width="2.5"/>`
    + `<path d="${svgPath(selectedEnvelope, p => p.minHydrostaticWellPpg, p => p.tvd, px, dy)}" fill="none" stroke="#15803d" stroke-width="1.8" stroke-dasharray="8 4"/>`
    + `<path d="${svgPath(selectedEnvelope, p => p.compressionEcdPpg ?? null, p => p.tvd, px, dy)}" fill="none" stroke="#7c3aed" stroke-width="3"/>`
    + `<path d="${svgPath(selectedEnvelope, p => p.maxEcdPpg, p => p.tvd, px, dy)}" fill="none" stroke="#dc2626" stroke-width="2.5"/>`
    + `<path d="${svgPath(selectedEnvelope, p => p.fracturePpg, p => p.tvd, px, dy)}" fill="none" stroke="#f97316" stroke-width="2" stroke-dasharray="3 4"/>`
    + ([[(p: OperationPressureEnvelopePoint) => p.porePpg, '#0369a1'], [(p: OperationPressureEnvelopePoint) => p.fracturePpg, '#f97316'],
      [(p: OperationPressureEnvelopePoint) => p.compressionEcdPpg, '#7c3aed']] as const)
      .map(([read, color]) => shortSpanMarks(selectedEnvelope, read, depthExtent[1] - depthExtent[0], px, dy, color)).join('')
    + outside.aboveFracture.map(p => crossMark(px(p.ppg), dy(p.tvd), '#b91c1c')).join('')
    + outside.belowPore.map(p => crossMark(px(p.ppg), dy(p.tvd), '#0369a1')).join('');

  const volumeRows = data.volumes.flatMap(series => series.points);
  const timeExtent = extent(volumeRows.map(point => point.timeMin), true);
  const injectedExtent = extent(volumeRows.map(point => point.volumeBbl), true);
  const tx = (value: number) => scale(value, timeExtent[0], timeExtent[1], L, PW);
  const vy = (value: number) => T + PH - scale(value, injectedExtent[0], injectedExtent[1], 0, PH);
  const volumeSvg = axes(...timeExtent, ...injectedExtent, 'Tempo (min)', 'Volume injetado (bbl)')
    + legend(data.volumes.slice(0, 4).map(series => ({ label: series.label, color: series.color })))
    + data.volumes.map(series => {
      const stroke = volumeStroke[series.kind];
      return `<path d="${svgPath(series.points, p => p.timeMin, p => p.volumeBbl, tx, vy)}" fill="none" stroke="${series.color}" stroke-width="${stroke.width}"${stroke.dash ? ` stroke-dasharray="${stroke.dash}"` : ''}/>`;
    }).join('');

  const phaseSuffix = phase ? ` - ${phase.name}` : ' - Todas as fases';
  return [
    { id: 'hydrostatic-ecd', title: 'Pressao hidrostatica (ESD) e ECD', landscape: true,
      svg: frame(ascii(reference?.title ?? 'ECD e pressao hidrostatica'), hydroSvg) },
    { id: `pressure-envelope-${phaseId}`, title: `Envelope de pressao${phaseSuffix}`, landscape: true,
      svg: frame(`Envelope de pressao${phaseSuffix}`, envelopeSvg) },
    ...(data.fractureRisk?.points.length ? [{ id: 'fracture-risk', title: 'Risco de fratura nos canhoneados', landscape: true,
      svg: frame('Risco de fratura nos canhoneados', fractureRiskSvg(data.fractureRisk)) }] : []),
    { id: 'injected-volume-time', title: 'Volume injetado x tempo', landscape: true,
      svg: frame('Volume injetado x tempo', volumeSvg) },
  ];
}
