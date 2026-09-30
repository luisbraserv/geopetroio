import { describe, expect, it } from 'vitest';
import { DEFAULT_MARGIN_CLASSES, type PressureProfileInput } from '../models/pressure-profile.model';
import { K } from './primary-hydraulics';
import { classifyMargins, marginPpg, normalizeMarginClasses, pressureProfileFromForm, profileAt, profilePointsPpg,
  profileWindowRows, PSI_FT_PER_PPG, toPpg } from './pressure-profile';

const table = (unit: PressureProfileInput['unit'], points: [number, number, number][]): PressureProfileInput =>
  ({ unit, mode: 'table', pore: 9, fracture: 16, points: points.map(([tvdM, pore, fracture]) => ({ tvdM, pore, fracture })) });

describe('perfil de poro e fratura por TVD (janela operacional J1)', () => {
  it('psi/ft vira EMW em ppg pelo mesmo fator do K do motor', () => {
    expect(toPpg(0.468, 'psi/ft')).toBeCloseTo(9, 9);
    expect(toPpg(9, 'ppg')).toBe(9);
    expect(PSI_FT_PER_PPG * 3.28084).toBeCloseTo(K, 6);
  });

  it('constante, ou linear entre os pontos por TVD e o ponto mais próximo fora da tabela', () => {
    const constant: PressureProfileInput = { unit: 'ppg', mode: 'constant', pore: 8.6, fracture: 15, points: [] };
    expect(profileAt(constant, 1234)).toEqual({ porePpg: 8.6, fracturePpg: 15 });
    const profile = table('ppg', [[2000, 9, 16], [1000, 8.6, 14]]);
    expect(profilePointsPpg(profile).map(p => p.tvd)).toEqual([1000, 2000]);
    expect(profileAt(profile, 500)).toEqual({ porePpg: 8.6, fracturePpg: 14 });
    const mid = profileAt(profile, 1500);
    expect(mid.porePpg).toBeCloseTo(8.8, 9);
    expect(mid.fracturePpg).toBeCloseTo(15, 9);
    expect(profileAt(profile, 2500)).toEqual({ porePpg: 9, fracturePpg: 16 });
    // Em psi/ft, a tabela vira ppg antes de interpolar.
    const psiFt = profileAt(table('psi/ft', [[1000, 0.4472, 0.728], [2000, 0.468, 0.832]]), 1500);
    expect(psiFt.porePpg).toBeCloseTo(8.8, 6);
    expect(psiFt.fracturePpg).toBeCloseTo(15, 6);
    // Tabela sem ponto completo vale o constante (como um cenário antigo).
    expect(profileAt(table('ppg', [[1000, NaN, 14]]), 1500)).toEqual({ porePpg: 9, fracturePpg: 16 });
  });

  it('linhas da janela quebradas nas TVDs da tabela, com topo e base: o motor interpola sem aproximar', () => {
    const tvdOf = (md: number) => md <= 1000 ? md : 1000 + (md - 1000) * 0.8;   // desvio abaixo de 1000 m
    const profile = table('ppg', [[500, 8.5, 13], [1400, 9.5, 17]]);
    const rows = profileWindowRows(profile, { topMD: 0, bottomMD: 2000 }, tvdOf);
    expect(rows.map(r => [r.topMD, Number(r.bottomMD.toFixed(6))])).toEqual([[0, 500], [500, 1500], [1500, 2000]]);
    // Dentro de cada linha, a interpolação em TVD do motor dá o perfil.
    const windowAt = (md: number) => {
      const row = rows.find(r => md >= r.topMD && md <= r.bottomMD)!;
      const ratio = (tvdOf(md) - tvdOf(row.topMD)) / (tvdOf(row.bottomMD) - tvdOf(row.topMD));
      return row.topFracturePpg! + (row.fracturePpg! - row.topFracturePpg!) * ratio;
    };
    for (const md of [100, 700, 1200, 1700]) expect(windowAt(md)).toBeCloseTo(profileAt(profile, tvdOf(md)).fracturePpg, 9);
    // Canhoneado do squeeze: uma linha exposta, com o perfil no topo e na base.
    const perf = profileWindowRows(profile, { topMD: 1200, bottomMD: 1210 }, tvdOf, true);
    expect(perf).toHaveLength(1);
    expect(perf[0].exposed).toBe(true);
    expect(perf[0].topPorePpg).toBeCloseTo(profileAt(profile, tvdOf(1200)).porePpg, 9);
  });

  it('classes de margem do cenário: negativa é fratura ou influxo; senão, a classe da menor margem', () => {
    const classes = DEFAULT_MARGIN_CLASSES;
    expect(classifyMargins(-0.1, 2, classes)).toBe('fratura');
    expect(classifyMargins(2, -0.1, classes)).toBe('influxo');
    expect(classifyMargins(0.2, 3, classes)).toBe('critico');
    expect(classifyMargins(3, 0.4, classes)).toBe('alerta');
    expect(classifyMargins(0.9, 3, classes)).toBe('atencao');
    expect(classifyMargins(1.2, 1.5, classes)).toBe('normal');
    expect(classifyMargins(1.2, 1.5, { atencaoPpg: 2, alertaPpg: 1, criticoPpg: 0.5 })).toBe('atencao');
    // Fora de ordem ou vazias: em ordem, com o padrão no que faltar.
    expect(normalizeMarginClasses({ atencaoPpg: 0.2, alertaPpg: '', criticoPpg: 0.3 }))
      .toEqual({ criticoPpg: 0.3, alertaPpg: 0.5, atencaoPpg: 0.5 });
    expect(marginPpg(K * 1000 * 0.5, 1000)).toBeCloseTo(0.5, 9);
  });

  it('lê o formulário: cenário antigo abre constante em ppg com os valores de hoje', () => {
    expect(pressureProfileFromForm({ fracGrad: 15.5, poreGrad: 8.5 }))
      .toEqual({ unit: 'ppg', mode: 'constant', pore: 8.5, fracture: 15.5, points: [] });
    const psiFt = pressureProfileFromForm({ gradUnit: 'psi/ft', gradMode: 'table', fracGrad: 0.8, poreGrad: 0.45,
      gradPoints: [{ tvd: 1000, poro: 0.45, fratura: 0.78 }] });
    expect(psiFt.unit).toBe('psi/ft');
    expect(psiFt.points).toEqual([{ tvdM: 1000, pore: 0.45, fracture: 0.78 }]);
  });
});
