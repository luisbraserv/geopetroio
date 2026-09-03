import { Injectable } from '@angular/core';
import { CoreCalculoService } from './core-calculo.service';
import { HYDRO_K } from '../models/constantes';
import { SlurryDesign, Diagnostic } from '../models/pasta.model';
import { ThickeningResult, UCAResult, Rheology } from '../models/reologia.model';

@Injectable({ providedIn: 'root' })
export class TestsCalculoService {

  constructor(private core: CoreCalculoService) {}

  simulateThickening(slurry: SlurryDesign, sectionEndTVD: number, rheology?: Rheology): ThickeningResult {
    const bhctF = slurry.bhct || 140;
    const densityPpg = slurry.density;
    const surfacePressure = slurry.surfacePressure || 0;
    const surfaceTempF = slurry.surfacePressure !== undefined ? (slurry as any)._surfaceTemp || bhctF : bhctF;
    const mudW = 9.0;

    const bhcp = HYDRO_K * mudW * sectionEndTVD + surfacePressure;
    const chartPressureStart = Math.max(0, surfacePressure);
    const chartPressureTarget = Math.max(chartPressureStart, bhcp);

    const testTempF = bhctF;
    let tempTerm = Math.max(0, testTempF - 100) * 0.014;
    if (testTempF > 180) tempTerm += (testTempF - 180) * 0.008;
    if (testTempF > 230) tempTerm += (testTempF - 230) * 0.006;

    const pressureTerm = bhcp > 1500 ? (bhcp - 1500) * 0.00012 : 0;
    const densityTerm = (densityPpg - 15.8) * 0.10;
    const facPct = Number.isFinite(slurry.facPct) ? slurry.facPct : slurry.fac;
    const waterTerm = (facPct - 55) * 0.018;

    const effects = slurry._effects || {} as any;
    let ttShift = effects.ttShift || 0;
    const slopeMod = effects.slopeModifier || 0;
    const t30Extra = effects.t30Extra || 0;
    const t100Extra = effects.t100Extra || 0;

    if (bhctF > 120) ttShift += (effects.tempSensTotal || 0) * (bhctF - 120);

    const chemTerm = ttShift !== 0
      ? ttShift
      : (slurry.retarder * 0.90 - slurry.accelerator * 1.15 - slurry.dispersant * 0.10 + slurry.fluidLoss * 0.12);

    let pv = 65, yp = 20, n = 0.6, k = 1.0, theta3 = 6;
    if (rheology) {
      const th600 = Math.round(rheology.theta300 * 1.7);
      pv = Math.max(1, th600 - rheology.theta300);
      yp = Math.max(0, rheology.theta300 - pv);
      n = this.core.clamp(Math.log10((rheology.theta300 + 1) / (rheology.theta100 + 1)) / Math.log10(511 / 170.3), 0.2, 1.2);
      k = this.core.clamp(rheology.theta300 / Math.pow(511, n), 0.001, 50);
      theta3 = rheology.theta3;
    }

    const rheologyDelay = this.core.clamp((65 - pv) * 0.006 + (20 - yp) * 0.010 + (n - 0.62) * 1.10 + (6 - theta3) * 0.035, -1.50, 1.50);
    const buildRate = this.core.clamp(1 + (pv - 65) / 150 + (yp - 20) / 100 + (theta3 - 6) / 18 + (0.62 - n) * 0.8 + (testTempF - 140) / 180 + (bhcp - 3000) / 8000 + slopeMod * 0.08, 0.55, 2.10);

    const t70Seed = this.core.clamp(6.2 + chemTerm + rheologyDelay - tempTerm - pressureTerm + densityTerm + waterTerm, 1.5, 12);
    const t30Gap = this.core.clamp(0.85 / buildRate + 0.25 - t30Extra * 0.35, 0.35, 1.70);
    const t50Gap = this.core.clamp(0.40 / buildRate + 0.10 - t30Extra * 0.18, 0.15, 0.90);
    const t100Gap = this.core.clamp(0.90 / buildRate + 0.25 + t100Extra, 0.25, 2.40);
    const t100Seed = this.core.clamp(t70Seed + t100Gap, t70Seed + 0.20, 14);
    const maxHours = Math.max(5, Math.ceil(t100Seed + 1.0));

    const tempRampHours = this.core.clamp(0.75 + Math.abs(testTempF - surfaceTempF) / 220, 0.60, 2.00);
    const pressureRampHours = this.core.clamp(0.60 + Math.abs(chartPressureTarget - chartPressureStart) / 9000, 0.60, 2.20);
    const gammaEq = 255.5;
    const tau0Pa = yp * 0.4788;
    const hbStressProxy = this.core.clamp(tau0Pa + k * Math.pow(gammaEq / 511, n) * 4.5, 0.5, 90);
    const bcMin = this.core.clamp(3 + slurry.dispersant * 0.30 - slurry.accelerator * 0.20, 2, 12);
    const bc0 = this.core.clamp(2 + hbStressProxy * 0.18 + pv * 0.05 + theta3 * 0.45, bcMin + 0.5, 35);
    const kMix = this.core.clamp(0.80 + slurry.dispersant * 0.20 + (pv - 65) / 220, 0.35, 2.20);
    const bcHydMax = 100 - bcMin;
    const actEnergy = 34000, gasR = 8.314, tRefK = 333.15;
    const pressureInfluence = this.core.clamp(0.04 + Math.max(0, bhcp - 1500) / 20000, 0.04, 0.20);
    const logisticSlope = this.core.clamp(1.10 + buildRate * 0.55 + slopeMod * 0.08, 0.75, 3.20);

    const t: number[] = [], temp: number[] = [], pressure: number[] = [], maturity: number[] = [], bc: number[] = [];
    let maturityNow = 0;
    const dtHours = 1 / 12;

    for (let i = 0; i <= maxHours * 12; i++) {
      const x = i / 12;
      t.push(x);
      const tempFrac = x < tempRampHours ? x / tempRampHours : 1;
      const tempNow = this.core.clamp(surfaceTempF + (testTempF - surfaceTempF) * tempFrac, 70, 350);
      temp.push(tempNow);
      const pressureFrac = x < pressureRampHours ? x / pressureRampHours : 1;
      pressure.push(this.core.clamp(chartPressureStart + (chartPressureTarget - chartPressureStart) * pressureFrac, 0, chartPressureTarget));
      const tempK = (tempNow - 32) * 5 / 9 + 273.15;
      const arrheniusFactor = Math.exp((actEnergy / gasR) * (1 / tRefK - 1 / tempK));
      const pressureFactor = 1 + pressureInfluence * pressureFrac;
      if (i > 0) maturityNow += dtHours * arrheniusFactor * pressureFactor;
      maturity.push(maturityNow);
    }

    const maturityAt70 = this.interpolateAtTime(t70Seed, t, maturity);
    const baseAt70 = bcMin + (bc0 - bcMin) * Math.exp(-kMix * t70Seed);
    const hydAt70 = this.core.clamp(70 - baseAt70, 1, bcHydMax - 0.5);
    const maturityMid = maturityAt70 + Math.log(bcHydMax / hydAt70 - 1) / logisticSlope;

    for (let j = 0; j < t.length; j++) {
      const baseNow = bcMin + (bc0 - bcMin) * Math.exp(-kMix * t[j]);
      const hydNow = bcHydMax / (1 + Math.exp(-logisticSlope * (maturity[j] - maturityMid)));
      bc.push(this.core.clamp(baseNow + hydNow, 0, 100));
    }

    return {
      t30: this.interpolateCrossing(30, t, bc),
      t50: this.interpolateCrossing(50, t, bc),
      t70: this.interpolateCrossing(70, t, bc),
      t100: this.interpolateCrossing(100, t, bc),
      maxHours, bhcp, t, temp, pressure, bc,
    };
  }

  simulateUCA(slurry: SlurryDesign, tt: ThickeningResult): UCAResult {
    const effects = slurry._effects || {} as any;
    const onset = this.core.clamp(tt.t100 * 1.10 + 1.0 + (effects.ucaOnsetMod || 0), 1.5, 14);
    const maxStrength = this.core.clamp(4200 + (slurry.density - 15.8) * 300 + slurry.silica * 30 + (effects.ucaStrengthMod || 0), 1000, 9000);
    const growth = this.core.clamp(0.07 + slurry.accelerator * 0.02 - slurry.retarder * 0.005 + ((slurry.bhst || 150) - 150) * 0.0005, 0.03, 0.18);

    const t: number[] = [], strength: number[] = [], transit: number[] = [], temp: number[] = [];
    for (let x = 0; x <= 72; x += 0.5) {
      t.push(x);
      const s = x < onset ? Math.max(0, (x - (onset - 1)) * 130) : maxStrength * (1 - Math.exp(-growth * (x - onset)));
      strength.push(s);
      transit.push(this.core.clamp(25 - 15 * (s / maxStrength) + Math.exp(-x / 10) * 1.0, 8, 26));
      temp.push(this.core.clamp(80 + (slurry.bhct - 80) * (1 - Math.exp(-x / 2.0)) + Math.exp(-Math.pow(x - onset, 2) / 6) * 14, 70, 350));
    }
    return { t, strength, transit, temp };
  }

  estimateFreeWater(slurry: SlurryDesign): number {
    const effects = slurry._effects || {} as any;
    const facPct = Number.isFinite(slurry.facPct) ? slurry.facPct : slurry.fac;
    return this.core.clamp(
      parseFloat((5.0 + (facPct - 46) * 0.25 + (effects.freeWaterMod || 0) - slurry.silica * 0.08 - slurry.fluidLoss * 1.5).toFixed(1)),
      0, 25
    );
  }

  rheoDiagnostics(slurry: SlurryDesign, tt: ThickeningResult, fw: number): Diagnostic[] {
    const out: Diagnostic[] = [];
    if (tt.t50 < 3) out.push({ text: 'Tempo de bombeio curto', cls: 'danger' });
    else if (tt.t50 < 4.5) out.push({ text: 'Bombeabilidade moderada', cls: 'warn' });
    else out.push({ text: 'Bombeabilidade confortável', cls: 'ok' });
    if (fw > 8.75) out.push({ text: 'Água livre alta (>3.5%)', cls: 'danger' });
    else if (fw > 3.5) out.push({ text: 'Água livre moderada', cls: 'warn' });
    else out.push({ text: 'Água livre controlada', cls: 'ok' });
    if ((slurry.bhst || 0) > 230 && slurry.silica < 35) out.push({ text: 'Avaliar sílica para alta temperatura', cls: 'warn' });
    return out;
  }

  private interpolateCrossing(target: number, times: number[], values: number[]): number {
    for (let i = 1; i < values.length; i++) {
      if (values[i] >= target) {
        const y1 = values[i - 1], y2 = values[i], x1 = times[i - 1], x2 = times[i];
        return y2 === y1 ? x2 : x1 + (target - y1) * (x2 - x1) / (y2 - y1);
      }
    }
    return times.length ? times[times.length - 1] : 0;
  }

  private interpolateAtTime(target: number, times: number[], values: number[]): number {
    for (let i = 1; i < times.length; i++) {
      if (times[i] >= target) {
        const x1 = times[i - 1], x2 = times[i], y1 = values[i - 1], y2 = values[i];
        return x2 === x1 ? y2 : y1 + (target - x1) * (y2 - y1) / (x2 - x1);
      }
    }
    return values.length ? values[values.length - 1] : 0;
  }
}
