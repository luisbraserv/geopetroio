import type { CaliperSample, WellCaliperProfile } from '../models/caliper.model';

const INCH_M = 0.0254;

export class LasCaliperError extends Error {
  constructor(message: string) { super(message); this.name = 'LasCaliperError'; }
}

interface CurveHeader { mnemonic: string; unit: string }

const sectionIndex = (lines: string[], name: string): number =>
  lines.findIndex(line => line.trim().toUpperCase().startsWith(name));

function unitFactor(unit: string, quantity: 'depth' | 'diameter'): number {
  const value = unit.trim().toLowerCase();
  if (quantity === 'depth') {
    if (['m', 'meter', 'metre', 'meters', 'metres'].includes(value)) return 1;
    if (['ft', 'feet', 'foot'].includes(value)) return 0.3048;
  } else {
    if (['in', 'inch', 'inches'].includes(value)) return 1;
    if (['mm'].includes(value)) return 1 / 25.4;
    if (['cm'].includes(value)) return 1 / 2.54;
  }
  throw new LasCaliperError(`Unidade ${unit || '(vazia)'} não reconhecida para ${quantity === 'depth' ? 'profundidade' : 'diâmetro'}.`);
}

function parseCurveHeader(line: string): CurveHeader | null {
  const match = line.match(/^\s*([^\s.#~]+)\s*\.\s*([^\s:]*)/);
  return match ? { mnemonic: match[1].toUpperCase(), unit: match[2] } : null;
}

export function integrateCaliperHoleVolumeM3(samples: CaliperSample[], topMD?: number, bottomMD?: number): number {
  if (samples.length < 2) return 0;
  const top = topMD ?? samples[0].md;
  const bottom = bottomMD ?? samples.at(-1)!.md;
  if (!(bottom > top)) return 0;
  const points = [
    caliperAtMD(samples, top),
    ...samples.filter(row => row.md > top && row.md < bottom),
    caliperAtMD(samples, bottom),
  ].filter((row): row is CaliperSample => !!row);
  let volume = 0;
  const area = (row: CaliperSample) => Math.PI / 4 * row.ehd1In * INCH_M * row.ehd2In * INCH_M;
  for (let i = 1; i < points.length; i += 1) {
    volume += (area(points[i - 1]) + area(points[i])) / 2 * (points[i].md - points[i - 1].md);
  }
  return volume;
}

export function caliperAtMD(samples: CaliperSample[], md: number): CaliperSample | null {
  if (!samples.length || md < samples[0].md || md > samples.at(-1)!.md) return null;
  let lo = 0; let hi = samples.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (samples[mid].md === md) return samples[mid];
    if (samples[mid].md < md) lo = mid + 1; else hi = mid - 1;
  }
  const a = samples[Math.max(0, hi)];
  const b = samples[Math.min(samples.length - 1, lo)];
  if (!a || !b || b.md === a.md) return a ?? b ?? null;
  const t = (md - a.md) / (b.md - a.md);
  return {
    md,
    ehd1In: a.ehd1In + (b.ehd1In - a.ehd1In) * t,
    ehd2In: a.ehd2In + (b.ehd2In - a.ehd2In) * t,
    ihvM3: a.ihvM3 != null && b.ihvM3 != null ? a.ihvM3 + (b.ihvM3 - a.ihvM3) * t : null,
  };
}

export function parseCaliperLas(text: string, fileName: string, importedAt = new Date().toISOString()): WellCaliperProfile {
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  const versionAt = sectionIndex(lines, '~V');
  const curvesAt = sectionIndex(lines, '~C');
  const asciiAt = sectionIndex(lines, '~A');
  if (versionAt < 0 || curvesAt < 0 || asciiAt < 0 || curvesAt >= asciiAt)
    throw new LasCaliperError('Arquivo LAS inválido: seções VERSION, CURVE ou ASCII ausentes.');
  const wrapLine = lines.slice(versionAt, curvesAt).find(line => /^\s*WRAP\s*\./i.test(line));
  if (wrapLine && /\.\s*YES\b/i.test(wrapLine)) throw new LasCaliperError('LAS com WRAP=YES ainda não é suportado.');
  const nullLine = lines.slice(versionAt, curvesAt).find(line => /^\s*NULL\s*\./i.test(line));
  const nullMatch = nullLine?.match(/\.\s*([^\s:]+)/);
  const nullValue = nullMatch ? Number(nullMatch[1]) : -999.25;
  const curves = lines.slice(curvesAt + 1, asciiAt)
    .filter(line => line.trim() && !line.trim().startsWith('#'))
    .map(parseCurveHeader).filter((entry): entry is CurveHeader => !!entry);
  const indexOf = (...names: string[]) => curves.findIndex(curve => names.includes(curve.mnemonic));
  const depthIndex = indexOf('DEPT', 'DEPTH', 'MD');
  const ehd1Index = indexOf('EHD1');
  const ehd2Index = indexOf('EHD2');
  const ihvIndex = indexOf('IHV');
  if (depthIndex < 0) throw new LasCaliperError('Curva de profundidade DEPT/DEPTH/MD não encontrada.');
  if (ehd1Index < 0 || ehd2Index < 0) throw new LasCaliperError('As curvas EHD1 e EHD2 são obrigatórias para importar o caliper.');
  const depthFactor = unitFactor(curves[depthIndex].unit, 'depth');
  const d1Factor = unitFactor(curves[ehd1Index].unit, 'diameter');
  const d2Factor = unitFactor(curves[ehd2Index].unit, 'diameter');
  const rows: CaliperSample[] = [];
  for (let lineIndex = asciiAt + 1; lineIndex < lines.length; lineIndex += 1) {
    const line = lines[lineIndex].trim();
    if (!line || line.startsWith('#')) continue;
    const values = line.split(/\s+/).map(value => Number(value));
    if (values.length < curves.length || values.some(value => Number.isNaN(value)))
      throw new LasCaliperError(`Linha ${lineIndex + 1}: quantidade de colunas ou valor numérico inválido.`);
    const raw = [values[depthIndex], values[ehd1Index], values[ehd2Index]];
    if (raw.some(value => value === nullValue)) continue;
    const sample: CaliperSample = {
      md: values[depthIndex] * depthFactor,
      ehd1In: values[ehd1Index] * d1Factor,
      ehd2In: values[ehd2Index] * d2Factor,
      ihvM3: ihvIndex >= 0 && values[ihvIndex] !== nullValue ? values[ihvIndex] : null,
    };
    if (![sample.md, sample.ehd1In, sample.ehd2In].every(Number.isFinite) || sample.md < 0 ||
      sample.ehd1In <= 0 || sample.ehd2In <= 0)
      throw new LasCaliperError(`Linha ${lineIndex + 1}: profundidade ou diâmetro inválido.`);
    rows.push(sample);
  }
  rows.sort((a, b) => a.md - b.md);
  if (rows.length < 2) throw new LasCaliperError('O LAS precisa conter ao menos duas amostras válidas de caliper.');
  for (let i = 1; i < rows.length; i += 1)
    if (rows[i].md <= rows[i - 1].md) throw new LasCaliperError('A curva de profundidade possui valores repetidos.');
  const calculated = integrateCaliperHoleVolumeM3(rows);
  const firstIhv = rows[0].ihvM3;
  const lastIhv = rows.at(-1)!.ihvM3;
  const reported = firstIhv != null && lastIhv != null ? Math.abs(firstIhv - lastIhv) : null;
  const difference = reported && reported > 0 ? (calculated - reported) / reported * 100 : null;
  return {
    fileName, importedAt,
    depthMnemonic: curves[depthIndex].mnemonic,
    diameterMnemonics: [curves[ehd1Index].mnemonic, curves[ehd2Index].mnemonic],
    startMD: rows[0].md, stopMD: rows.at(-1)!.md, sampleCount: rows.length,
    calculatedHoleVolumeM3: calculated, reportedHoleVolumeM3: reported,
    volumeDifferencePct: difference, samples: rows,
  };
}

