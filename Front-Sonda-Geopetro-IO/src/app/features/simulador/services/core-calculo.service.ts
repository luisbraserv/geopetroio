import { Injectable } from '@angular/core';
import {
  API_TEMP_DEPTHS_FT, API_TEMP_GRADS_F, API_TEMP_D1_F, API_TEMP_D2_F,
  CEMENT_CLASSES, M_TO_FT, CementClassProps
} from '../models/constantes';

export interface SectionGeo {
  startMD: number;
  endMD: number;
  startTVD: number;
  endTVD: number;
  lengthMD: number;
  heightTVD: number;
  mdToTvdRatio: number;
  tvdAt: (md: number) => number;
}

export interface WellFinalGeo {
  wellFinalMD: number;
  wellFinalTVD: number;
}

export interface BHTResult {
  bhst: number;
  bhct: number;
  formula: string;
}

export type TemperatureSource = 'automatica' | 'manual';
export type TemperatureUnit = 'F' | 'C';

export interface SqtTemperatureResult {
  bhstF: number;
  bhstC: number;
  source: TemperatureSource;
  inputValue: number;
  inputUnit: TemperatureUnit;
  geoGradientFPer100Ft: number;
  sqtF: number;
  sqtC: number;
  hvertM: number;
  formula: string;
}

@Injectable({ providedIn: 'root' })
export class CoreCalculoService {

  clamp(value: number, min: number, max: number): number {
    return Math.max(min, Math.min(max, value));
  }

  lerp(a: number, b: number, t: number): number {
    return a + (b - a) * t;
  }

  bblToFt3(bbl: number): number {
    return bbl * 5.61458;
  }

  getCementClass(label: string): CementClassProps {
    return CEMENT_CLASSES[label] ?? CEMENT_CLASSES['G'];
  }

  normalizeSectionValues(startMD: number, endMD: number, startTVD: number, endTVD: number): SectionGeo {
    const s = Math.min(startMD, endMD);
    const e = Math.max(startMD, endMD);
    const sT = Math.min(startTVD, endTVD);
    const eT = Math.max(startTVD, endTVD);
    const lengthMD = Math.max(0, e - s);
    const heightTVD = Math.max(0, eT - sT);
    const ratio = lengthMD > 0 ? heightTVD / lengthMD : 1;
    return {
      startMD: s, endMD: e, startTVD: sT, endTVD: eT,
      lengthMD, heightTVD,
      mdToTvdRatio: ratio,
      tvdAt: (md: number) => sT + (md - s) * ratio,
    };
  }

  getWellFinalGeometry(section: SectionGeo, wellFinalMD: number, wellFinalTVD: number): WellFinalGeo {
    const md = Number.isFinite(wellFinalMD) && wellFinalMD >= section.endMD ? wellFinalMD : section.endMD;
    const tvd = Number.isFinite(wellFinalTVD) ? wellFinalTVD : section.tvdAt(md);
    return { wellFinalMD: md, wellFinalTVD: tvd };
  }

  private clampForTable(value: number, list: number[]): number {
    return this.clamp(value, list[0], list[list.length - 1]);
  }

  private bracketIndex(value: number, list: number[]): number {
    if (value <= list[0]) return 0;
    for (let i = 0; i < list.length - 1; i++) {
      if (value >= list[i] && value <= list[i + 1]) return i;
    }
    return list.length - 2;
  }

  interpolateApiTemperatureF(depthFt: number, gradientF: number, table: number[][]): { value: number; depthClamped: boolean; gradientClamped: boolean; depthUsed: number; gradientUsed: number } {
    const d = this.clampForTable(depthFt, API_TEMP_DEPTHS_FT);
    const g = this.clampForTable(gradientF, API_TEMP_GRADS_F);
    const di = this.bracketIndex(d, API_TEMP_DEPTHS_FT);
    const gi = this.bracketIndex(g, API_TEMP_GRADS_F);
    const d0 = API_TEMP_DEPTHS_FT[di], d1 = API_TEMP_DEPTHS_FT[di + 1];
    const g0 = API_TEMP_GRADS_F[gi], g1 = API_TEMP_GRADS_F[gi + 1];
    const td = d1 === d0 ? 0 : (d - d0) / (d1 - d0);
    const tg = g1 === g0 ? 0 : (g - g0) / (g1 - g0);
    const low = this.lerp(table[di][gi], table[di][gi + 1], tg);
    const high = this.lerp(table[di + 1][gi], table[di + 1][gi + 1], tg);
    return { value: this.lerp(low, high, td), depthUsed: d, gradientUsed: g, depthClamped: d !== depthFt, gradientClamped: g !== gradientF };
  }

  calcBHT(surfaceTemp: number, geoGradient: number, depthM: number, schedule: 'D1' | 'D2' = 'D2'): BHTResult {
    const tSurf = Number.isFinite(surfaceTemp) ? surfaceTemp : 80.6;
    const grad = Number.isFinite(geoGradient) ? geoGradient : 1.50;
    const dM = Number.isFinite(depthM) ? depthM : 0;
    const dRef = dM * M_TO_FT;
    const bhst = tSurf + grad * dRef / 100;
    const table = schedule === 'D1' ? API_TEMP_D1_F : API_TEMP_D2_F;
    const api = this.interpolateApiTemperatureF(dRef, grad, table);
    const bhct = api.value;
    let formula = `BHST = ${tSurf.toFixed(1)} + ${grad.toFixed(2)} × ${dRef.toFixed(0)} / 100 = ${bhst.toFixed(1)} °F\nTemperatura de ensaio API ${schedule} = ${bhct.toFixed(1)} °F`;
    if (api.depthClamped || api.gradientClamped) {
      formula += `\nNota: tabela API limitada a 1000-22000 ft e 0.9-1.9 °F/100 ft; valor usado: ${api.depthUsed.toFixed(0)} ft / ${api.gradientUsed.toFixed(1)} °F/100 ft.`;
    }
    return { bhst: Math.round(bhst * 10) / 10, bhct: Math.round(bhct * 10) / 10, formula };
  }

  calcSqtFromBhst(
    bhstValue: number,
    inputUnit: TemperatureUnit,
    hvertM: number,
    source: TemperatureSource,
  ): SqtTemperatureResult {
    const input = Number.isFinite(bhstValue) ? bhstValue : 80;
    const hvert = Number.isFinite(hvertM) && hvertM > 0 ? hvertM : 0;
    const bhstF = inputUnit === 'C' ? (input * 1.8) + 32 : input;
    // O SQT acompanha a BHST usada (manual ou automática): o gradiente é derivado
    // da própria BHST com base API de 80 °F — mesma regra da planilha de referência.
    // (BHST manual de teste de poço mais fria ⇒ SQT proporcionalmente mais frio.)
    const gg = hvert > 0 ? 30.48 * (bhstF - 80) / hvert : 0;
    const denominator = 1 - (0.0000264711 * hvert);
    const sqt = denominator !== 0
      ? 80 + (((0.02509801 * hvert * gg) - 8.2021) / denominator)
      : 80;
    const sqtC = (sqt - 32) / 1.8;
    const bhstC = (bhstF - 32) / 1.8;

    const round = (value: number, decimals: number): number => {
      const factor = 10 ** decimals;
      return Math.round(value * factor) / factor;
    };

    const roundedBhstF = round(bhstF, 1);
    const roundedBhstC = round(bhstC, 1);
    const roundedGg = round(gg, 3);
    const roundedSqtF = round(sqt, 1);
    const roundedSqtC = round(sqtC, 1);

    return {
      bhstF: roundedBhstF,
      bhstC: roundedBhstC,
      source,
      inputValue: input,
      inputUnit,
      geoGradientFPer100Ft: roundedGg,
      sqtF: roundedSqtF,
      sqtC: roundedSqtC,
      hvertM: round(hvert, 1),
      formula:
        `BHST usada = ${roundedBhstF.toFixed(1)} °F (${source})\n` +
        `GG = 30,48 × (${roundedBhstF.toFixed(1)} - 80) / ${round(hvert, 1).toFixed(1)} = ${roundedGg.toFixed(3)} °F/100 ft\n` +
        `SQT = 80 + [(0,02509801 × ${round(hvert, 1).toFixed(1)} × ${roundedGg.toFixed(3)}) - 8,2021] / [1 - (0,0000264711 × ${round(hvert, 1).toFixed(1)})] = ${roundedSqtF.toFixed(1)} °F`,
    };
  }
}
