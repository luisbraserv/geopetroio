import type { UCAResult } from '../models/reologia.model';

/**
 * Tabelas que substituem o cronograma e as curvas de UCA no squeeze e no tampão
 * (SPEC squeeze-tampao §4 e §7): a mesma informação da tela vai para o relatório
 * como SVG, sem capturar canvas.
 */
export interface CronogramaStep {
  label: string;
  fluid: string | null;
  volumeBbl: number | null;
  rateBpm: number | null;
  durationMin: number;
}
export interface CronogramaRow extends CronogramaStep { accumulatedMin: number }

export function buildCronograma(steps: CronogramaStep[]): CronogramaRow[] {
  let accumulated = 0;
  return steps.filter(step => step.durationMin > 0).map(step => {
    accumulated += step.durationMin;
    return { ...step, accumulatedMin: accumulated };
  });
}

/** Marcos de resistência lidos da curva `UCAResult` (tempo em h, resistência em psi). */
export interface UcaMilestones {
  t50PsiH: number | null;
  t500PsiH: number | null;
  strength12hPsi: number | null;
  strength24hPsi: number | null;
}

export function ucaMilestones(uca: UCAResult | null): UcaMilestones {
  const t = uca?.t ?? []; const s = uca?.strength ?? [];
  const n = Math.min(t.length, s.length);
  /** Primeiro instante em que a resistência alcança o alvo, por interpolação linear. */
  const timeTo = (target: number): number | null => {
    for (let i = 0; i < n; i++) {
      if (s[i] < target) continue;
      if (i === 0) return t[0];
      const f = (target - s[i - 1]) / (s[i] - s[i - 1]);
      return t[i - 1] + f * (t[i] - t[i - 1]);
    }
    return null;
  };
  const strengthAt = (hours: number): number | null => {
    if (!n || hours < t[0] || hours > t[n - 1]) return null;
    for (let i = 1; i < n; i++) {
      if (t[i] < hours) continue;
      const f = t[i] > t[i - 1] ? (hours - t[i - 1]) / (t[i] - t[i - 1]) : 1;
      return s[i - 1] + f * (s[i] - s[i - 1]);
    }
    return s[n - 1];
  };
  return { t50PsiH: timeTo(50), t500PsiH: timeTo(500), strength12hPsi: strengthAt(12), strength24hPsi: strengthAt(24) };
}

const ascii = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '');
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Tabela em SVG para uma página do relatório. Como os gráficos, o texto sai sem
 * acento. A primeira coluna alinha à esquerda; as demais, à direita.
 */
export function tableReportSvg(title: string, columns: string[], rows: string[][], notes: string[] = []): string {
  const W = 720; const left = 24; const rowH = 24; const top = 58;
  const width = W - 2 * left;
  const firstShare = 0.3;
  const colW = columns.length > 1 ? width * (1 - firstShare) / (columns.length - 1) : width;
  const x = (i: number) => i === 0 ? left : left + width * firstShare + (i - 1) * colW;
  const cell = (text: string, i: number, y: number, bold = false) => {
    const anchor = i === 0 ? 'start' : 'end';
    const tx = i === 0 ? x(0) + 6 : x(i) + colW - 6;
    return `<text x="${tx}" y="${y}" text-anchor="${anchor}" font-family="Arial" font-size="11"${bold ? ' font-weight="bold"' : ''} fill="#0f172a">${escapeXml(ascii(text))}</text>`;
  };
  const header = `<rect x="${left}" y="${top}" width="${width}" height="${rowH}" fill="#e2e8f0"/>`
    + columns.map((column, i) => cell(column, i, top + 16, true)).join('');
  const body = rows.map((row, r) => {
    const y = top + rowH * (r + 1);
    return (r % 2 ? `<rect x="${left}" y="${y}" width="${width}" height="${rowH}" fill="#f8fafc"/>` : '')
      + row.map((text, i) => cell(text, i, y + 16)).join('')
      + `<line x1="${left}" y1="${y + rowH}" x2="${left + width}" y2="${y + rowH}" stroke="#e2e8f0"/>`;
  }).join('');
  const notesTop = top + rowH * (rows.length + 1) + 22;
  const notesSvg = notes.map((note, i) => `<text x="${left}" y="${notesTop + i * 16}" font-family="Arial" font-size="10" fill="#475569">${escapeXml(ascii(note))}</text>`).join('');
  const H = notesTop + notes.length * 16 + 16;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img"><rect width="100%" height="100%" fill="white"/>`
    + `<text x="${left}" y="32" font-family="Arial" font-size="15" font-weight="bold" fill="#0f172a">${escapeXml(ascii(title))}</text>`
    + header + body + notesSvg + '</svg>';
}

/** SVG como imagem do relatório (`<img src>`). */
export const svgDataUrl = (svg: string): string => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
