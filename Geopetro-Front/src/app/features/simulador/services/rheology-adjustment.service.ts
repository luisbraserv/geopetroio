import { Injectable } from '@angular/core';
import {
  Aditivo,
  AditivoRheologyCoefficients,
  FannReadings,
  OrigemReologia,
  hydrateAditivosFromCatalog,
} from '../models/aditivo.model';
import { Rheology } from '../models/reologia.model';
import { AdditiveEffectEngineService, AppliedPastaEffect } from './additive-effect-engine.service';

export interface BaseRheology {
  plasticViscosityCp?: number | null;
  yieldPointLbf100ft2?: number | null;
  gel10sLbf100ft2?: number | null;
  gel10minLbf100ft2?: number | null;
  gel30minLbf100ft2?: number | null;
  consistencyBc?: number | null;
  thickeningTimeMin?: number | null;
  frictionFactorMultiplier?: number | null;
  fluidLossCc30min?: number | null;
  rpm300?: number | null;
  rpm200?: number | null;
  rpm100?: number | null;
  rpm60?: number | null;
  rpm30?: number | null;
  rpm6?: number | null;
  rpm3?: number | null;
}

export interface RheologyAdjustmentOptions {
  manualRheology?: BaseRheology | null;
  thetaReadings?: Partial<Rheology> | null;
}

export interface RheologyAdjustmentResult {
  rheology: BaseRheology;
  warnings: string[];
  confidence: 'manual' | 'measured' | 'estimated' | 'unknown';
  source: OrigemReologia;
  rheologyPressureFactor: number;
  synergyApplied: string[];
  riscoEspuma: boolean;
  operationalEffects?: {
    positivo: AppliedPastaEffect[];
    negativo: AppliedPastaEffect[];
  };
}

export const BASE_SLURRY_RHEOLOGY: BaseRheology = {
  plasticViscosityCp: 38,
  yieldPointLbf100ft2: 45,
  gel10sLbf100ft2: 10,
  gel10minLbf100ft2: 22,
  gel30minLbf100ft2: 32,
  consistencyBc: 30,
  thickeningTimeMin: null,
  frictionFactorMultiplier: 1.0,
  fluidLossCc30min: 1500,
  rpm300: 75,
  rpm200: 60,
  rpm100: 42,
  rpm60: 32,
  rpm30: 22,
  rpm6: 9,
  rpm3: 7,
};

@Injectable({ providedIn: 'root' })
export class RheologyAdjustmentService {
  constructor(private effectEngine: AdditiveEffectEngineService = new AdditiveEffectEngineService()) {}

  applyAdditiveRheologyEffects(
    baseRheology: BaseRheology,
    additives: Aditivo[],
    options: RheologyAdjustmentOptions = {},
  ): RheologyAdjustmentResult {
    const rheology: BaseRheology = { ...BASE_SLURRY_RHEOLOGY, ...this.sanitizeBase(baseRheology) };
    const warnings: string[] = [];
    const synergyApplied: string[] = [];

    if (this.hasAnyBaseValue(options.manualRheology)) {
      Object.assign(rheology, this.sanitizeBase(options.manualRheology || {}));
      return this.finalize(rheology, warnings, 'measured', 'laboratorio', 0, synergyApplied, false);
    }

    if (this.hasThetaReadings(options.thetaReadings)) {
      Object.assign(rheology, this.fromThetaReadings(options.thetaReadings || {}));
      return this.finalize(rheology, warnings, 'measured', 'theta', 0, synergyApplied, false);
    }

    let confidence: RheologyAdjustmentResult['confidence'] = 'manual';
    let source: OrigemReologia = 'base';
    let frictionDelta = 0;
    let riscoEspuma = false;
    let hasDispersant = false;
    let hasFluidLoss = false;
    let hasSilica = false;
    let hasAccelerator = false;
    let hasRetarder = false;
    let hasLatex = false;
    let hasAntifoam = false;
    const hydratedAdditives = this.effectEngine.hydrateAdditivesFromCatalog(additives || []);
    const effectResult = this.effectEngine.applyPositiveNegativeEffects({}, hydratedAdditives);
    warnings.push(...effectResult.warnings);

    if (effectResult.rheologyCoefficients && this.hasAnyCoefficient(effectResult.rheologyCoefficients)) {
      this.applyGenericProfile(rheology, effectResult.rheologyCoefficients, 1);
      frictionDelta += this.frictionDelta(effectResult.rheologyCoefficients, 1);
      confidence = 'estimated';
      source = effectResult.origem === 'laboratorio' ? 'laboratorio' : effectResult.origem === 'catalogo' ? 'catalogo' : 'estimado';
    }

    for (const additive of hydratedAdditives) {
      warnings.push(...(additive._hydrationWarnings || []));
      if (!this.affectsRheology(additive)) continue;

      const label = additive.name || additive.nomeComercial || additive.commercialName || 'Aditivo';
      const concentration = this.numberOrZero(additive.concentracaoUsada ?? additive.conc ?? additive.concentracaoPadrao);
      const coeffs = this.getCoefficients(additive);
      const fann = this.getFannReadings(additive);
      const hasLab = this.hasMeasuredRheology(additive);
      const hasCoeffs = this.hasAnyCoefficient(coeffs);
      const hasFann = this.hasAnyFann(fann);

      const min = additive.concentracaoMin;
      const max = additive.concentracaoMax;
      if (typeof min === 'number' && concentration < min) warnings.push(`${label}: concentracao abaixo do minimo; resultado e extrapolacao.`);
      if (typeof max === 'number' && concentration > max) warnings.push(`${label}: concentracao acima do maximo; resultado e extrapolacao.`);

      if (hasCoeffs) {
        this.applyCoefficient(rheology, 'plasticViscosityCp', coeffs.pvDeltaPerUnit, concentration);
        this.applyCoefficient(rheology, 'yieldPointLbf100ft2', coeffs.ypDeltaPerUnit, concentration);
        this.applyCoefficient(rheology, 'gel10sLbf100ft2', coeffs.gel10sDeltaPerUnit, concentration);
        this.applyCoefficient(rheology, 'gel10minLbf100ft2', coeffs.gel10minDeltaPerUnit, concentration);
        this.applyCoefficient(rheology, 'gel30minLbf100ft2', coeffs.gel30minDeltaPerUnit, concentration);
        this.applyCoefficient(rheology, 'consistencyBc', coeffs.consistencyDeltaPerUnit, concentration);
        this.applyCoefficient(rheology, 'thickeningTimeMin', coeffs.thickeningTimeDeltaMinPerUnit, concentration);
        this.applyFluidLossReduction(rheology, coeffs, concentration);
        frictionDelta += this.frictionDelta(coeffs, concentration);
        confidence = 'estimated';
        if (source === 'base') source = 'catalogo';
      } else if (!hasLab && !hasFann) {
        if (!additive.efeitoPasta?.positivo?.length && !additive.efeitoPasta?.negativo?.length) {
          warnings.push(`${label}: pode afetar a reologia, mas sem coeficientes cadastrados; efeito nao calculado.`);
          if (confidence === 'manual') confidence = 'unknown';
        }
      }

      if (hasFann) {
        Object.assign(rheology, fann);
        const pv = this.calcPvFromFann(fann);
        const yp = this.calcYpFromFann(fann);
        if (pv != null) rheology.plasticViscosityCp = pv;
        if (yp != null) rheology.yieldPointLbf100ft2 = yp;
        warnings.push(`${label}: leituras Fann cadastradas substituiram a estimativa base.`);
        confidence = 'measured';
        source = 'laboratorio';
      }

      if (hasLab) {
        this.applyMeasuredFields(rheology, additive);
        confidence = 'measured';
        source = 'laboratorio';
      }

      const cat = additive.category ?? additive.categoria;
      if (cat === 'dispersant') hasDispersant = true;
      if (cat === 'fluidLossControl' || cat === 'fluid-loss') hasFluidLoss = true;
      if (cat === 'silica') hasSilica = true;
      if (cat === 'accelerator') hasAccelerator = true;
      if (cat === 'retarder') hasRetarder = true;
      if (additive.riscoEspuma) hasLatex = true;
      if (cat === 'antifoam') hasAntifoam = true;
    }

    if (hasDispersant && hasFluidLoss) {
      rheology.plasticViscosityCp = this.isFiniteNumber(rheology.plasticViscosityCp)
        ? (rheology.plasticViscosityCp as number) * 0.90 : rheology.plasticViscosityCp;
      rheology.yieldPointLbf100ft2 = this.isFiniteNumber(rheology.yieldPointLbf100ft2)
        ? (rheology.yieldPointLbf100ft2 as number) * 0.90 : rheology.yieldPointLbf100ft2;
      synergyApplied.push('Dispersante + Controlador de filtrado: reducao adicional de 10% em PV e YP.');
    }
    if (hasSilica && hasAccelerator) {
      rheology.plasticViscosityCp = this.isFiniteNumber(rheology.plasticViscosityCp)
        ? (rheology.plasticViscosityCp as number) * 1.05 : rheology.plasticViscosityCp;
      synergyApplied.push('Silica + Acelerador em alta temperatura: PV aumentado 5%.');
    }
    if (hasAccelerator && hasRetarder) {
      warnings.push('Acelerador e retardador na mesma pasta: efeito pode ser imprevisivel; recomendar teste de laboratorio.');
      synergyApplied.push('Acelerador + Retardador: efeito oponente; resultado incerto.');
    }
    if (hasLatex && !hasAntifoam) {
      riscoEspuma = true;
      warnings.push('Latex sem antiespumante: risco de formacao de espuma na pasta.');
    }

    return this.finalize(rheology, warnings, confidence, source, frictionDelta, synergyApplied, riscoEspuma, effectResult.appliedEffects);
  }

  computeRheologyPressureFactor(additives: Aditivo[], options: RheologyAdjustmentOptions = {}): number {
    const result = this.applyAdditiveRheologyEffects({}, additives, options);
    return result.rheologyPressureFactor;
  }

  hasAutomaticRheologyData(additive: Aditivo): boolean {
    return this.hasMeasuredRheology(additive) || this.hasAnyCoefficient(this.getCoefficients(additive)) || this.hasAnyFann(this.getFannReadings(additive));
  }

  private finalize(
    rheology: BaseRheology,
    warnings: string[],
    confidence: RheologyAdjustmentResult['confidence'],
    source: OrigemReologia,
    frictionDelta: number,
    synergyApplied: string[],
    riscoEspuma: boolean,
    operationalEffects?: RheologyAdjustmentResult['operationalEffects'],
  ): RheologyAdjustmentResult {
    if (this.isFiniteNumber(rheology.plasticViscosityCp)) rheology.plasticViscosityCp = Math.max(5, rheology.plasticViscosityCp as number);
    if (this.isFiniteNumber(rheology.yieldPointLbf100ft2)) rheology.yieldPointLbf100ft2 = Math.max(2, rheology.yieldPointLbf100ft2 as number);
    if (this.isFiniteNumber(rheology.gel10sLbf100ft2)) rheology.gel10sLbf100ft2 = Math.max(1, rheology.gel10sLbf100ft2 as number);
    if (this.isFiniteNumber(rheology.gel10minLbf100ft2)) rheology.gel10minLbf100ft2 = Math.max(2, rheology.gel10minLbf100ft2 as number);
    if (this.isFiniteNumber(rheology.gel30minLbf100ft2)) rheology.gel30minLbf100ft2 = Math.max(3, rheology.gel30minLbf100ft2 as number);
    if (this.isFiniteNumber(rheology.consistencyBc)) rheology.consistencyBc = Math.max(1, rheology.consistencyBc as number);

    const pv = this.numberOrDefault(rheology.plasticViscosityCp, 38);
    const yp = this.numberOrDefault(rheology.yieldPointLbf100ft2, 45);
    const baseMultiplier = Math.max(0.65, Math.min(1.80, 1 + (pv - 38) / 100 + (yp - 45) / 180));
    const rheologyPressureFactor = Math.max(0.5, Math.min(2.0, baseMultiplier + frictionDelta / 100));

    return {
      rheology: this.sanitize(rheology),
      warnings: [...new Set(warnings)],
      confidence,
      source,
      rheologyPressureFactor,
      synergyApplied,
      riscoEspuma,
      operationalEffects,
    };
  }

  private applyGenericProfile(target: BaseRheology, coeffs: AditivoRheologyCoefficients, concentration: number): void {
    this.applyCoefficient(target, 'plasticViscosityCp', coeffs.pvDeltaPerUnit, concentration);
    this.applyCoefficient(target, 'yieldPointLbf100ft2', coeffs.ypDeltaPerUnit, concentration);
    this.applyCoefficient(target, 'gel10sLbf100ft2', coeffs.gel10sDeltaPerUnit, concentration);
    this.applyCoefficient(target, 'gel10minLbf100ft2', coeffs.gel10minDeltaPerUnit, concentration);
    this.applyCoefficient(target, 'gel30minLbf100ft2', coeffs.gel30minDeltaPerUnit, concentration);
    this.applyCoefficient(target, 'consistencyBc', coeffs.consistencyDeltaPerUnit, concentration);
    this.applyCoefficient(target, 'thickeningTimeMin', coeffs.thickeningTimeDeltaMinPerUnit, concentration);
    this.applyFluidLossReduction(target, coeffs, concentration);
  }

  private applyFluidLossReduction(target: BaseRheology, coeffs: AditivoRheologyCoefficients, concentration: number): void {
    if (!this.isFiniteNumber(coeffs.fluidLossReductionFactorPerUnit) || (coeffs.fluidLossReductionFactorPerUnit as number) <= 0) return;
    const base = this.numberOrDefault(target.fluidLossCc30min, 1500);
    const reduction = Math.min(0.95, (coeffs.fluidLossReductionFactorPerUnit as number) * concentration);
    target.fluidLossCc30min = Math.max(20, base * (1 - reduction));
  }

  private frictionDelta(coeffs: AditivoRheologyCoefficients, concentration: number): number {
    if (this.isFiniteNumber(coeffs.frictionFactorMultiplierDeltaPerUnit)) {
      return (coeffs.frictionFactorMultiplierDeltaPerUnit as number) * concentration;
    }
    if (this.isFiniteNumber(coeffs.frictionFactorMultiplier)) {
      return ((coeffs.frictionFactorMultiplier as number) - 1);
    }
    return 0;
  }

  private sanitizeBase(base: BaseRheology): BaseRheology {
    const out: BaseRheology = {};
    for (const [k, v] of Object.entries(base) as [keyof BaseRheology, unknown][]) {
      if (this.isFiniteNumber(v)) (out as Record<string, unknown>)[k] = v;
    }
    return out;
  }

  private affectsRheology(additive: Aditivo): boolean {
    return !!(additive.afetaReologia ?? additive.rheology?.affectsRheology);
  }

  private getCoefficients(additive: Aditivo): AditivoRheologyCoefficients {
    return additive.coefficients || additive.rheology?.coefficients || {};
  }

  private getFannReadings(additive: Aditivo): FannReadings {
    return {
      rpm300: additive.rpm300 ?? additive.rheology?.fannReadings?.rpm300,
      rpm200: additive.rpm200 ?? additive.rheology?.fannReadings?.rpm200,
      rpm100: additive.rpm100 ?? additive.rheology?.fannReadings?.rpm100,
      rpm60: additive.rpm60 ?? additive.rheology?.fannReadings?.rpm60,
      rpm30: additive.rpm30 ?? additive.rheology?.fannReadings?.rpm30,
      rpm6: additive.rpm6 ?? additive.rheology?.fannReadings?.rpm6,
      rpm3: additive.rpm3 ?? additive.rheology?.fannReadings?.rpm3,
    };
  }

  private hasMeasuredRheology(additive: Aditivo): boolean {
    return [
      additive.plasticViscosityCp ?? additive.rheology?.plasticViscosityCp,
      additive.yieldPointLbf100ft2 ?? additive.rheology?.yieldPointLbf100ft2,
      additive.gel10sLbf100ft2 ?? additive.rheology?.gel10sLbf100ft2,
      additive.gel10minLbf100ft2 ?? additive.rheology?.gel10minLbf100ft2,
      additive.gel30minLbf100ft2 ?? additive.rheology?.gel30minLbf100ft2,
    ].some(v => this.isFiniteNumber(v));
  }

  private hasAnyCoefficient(coeffs: AditivoRheologyCoefficients): boolean {
    return Object.values(coeffs || {}).some(v => this.isFiniteNumber(v));
  }

  private hasAnyFann(fann: FannReadings): boolean {
    return Object.values(fann || {}).some(v => this.isFiniteNumber(v));
  }

  private hasAnyBaseValue(rheology?: BaseRheology | null): boolean {
    return Object.values(rheology || {}).some(v => this.isFiniteNumber(v));
  }

  private hasThetaReadings(theta?: Partial<Rheology> | null): boolean {
    return this.isFiniteNumber(theta?.theta300) && this.isFiniteNumber(theta?.theta100);
  }

  private fromThetaReadings(theta: Partial<Rheology>): BaseRheology {
    const rpm300 = this.numberOrDefault(theta.theta300, 75);
    const rpm100 = this.numberOrDefault(theta.theta100, 42);
    const pv = Math.max(0, rpm300 - rpm100);
    const yp = Math.max(0, rpm300 - pv);
    return {
      rpm300,
      rpm200: this.numberOrNull(theta.theta200),
      rpm100,
      rpm60: this.numberOrNull(theta.theta60),
      rpm30: this.numberOrNull(theta.theta30),
      rpm6: this.numberOrNull(theta.theta6),
      rpm3: this.numberOrNull(theta.theta3),
      plasticViscosityCp: pv,
      yieldPointLbf100ft2: yp,
      gel10sLbf100ft2: this.numberOrDefault(theta.theta10, BASE_SLURRY_RHEOLOGY.gel10sLbf100ft2 || 10),
      gel10minLbf100ft2: this.numberOrDefault(theta.theta3, BASE_SLURRY_RHEOLOGY.gel10minLbf100ft2 || 22),
    };
  }

  private applyCoefficient(target: BaseRheology, key: keyof BaseRheology, delta: number | null | undefined, concentration: number): void {
    if (!this.isFiniteNumber(delta)) return;
    const base = this.numberOrZero(target[key] as number | null | undefined);
    (target as Record<string, unknown>)[key] = Math.max(0, base + (delta as number) * concentration);
  }

  private applyMeasuredFields(target: BaseRheology, additive: Aditivo): void {
    const pairs: [keyof BaseRheology, number | null | undefined][] = [
      ['plasticViscosityCp', additive.plasticViscosityCp ?? additive.rheology?.plasticViscosityCp],
      ['yieldPointLbf100ft2', additive.yieldPointLbf100ft2 ?? additive.rheology?.yieldPointLbf100ft2],
      ['gel10sLbf100ft2', additive.gel10sLbf100ft2 ?? additive.rheology?.gel10sLbf100ft2],
      ['gel10minLbf100ft2', additive.gel10minLbf100ft2 ?? additive.rheology?.gel10minLbf100ft2],
      ['gel30minLbf100ft2', additive.gel30minLbf100ft2 ?? additive.rheology?.gel30minLbf100ft2],
    ];
    for (const [key, value] of pairs) {
      if (this.isFiniteNumber(value)) (target as Record<string, unknown>)[key] = value;
    }
  }

  private calcPvFromFann(fann: FannReadings): number | null {
    if (this.isFiniteNumber(fann.rpm300) && this.isFiniteNumber(fann.rpm100)) return Math.max(0, (fann.rpm300 as number) - (fann.rpm100 as number));
    return null;
  }

  private calcYpFromFann(fann: FannReadings): number | null {
    const pv = this.calcPvFromFann(fann);
    if (pv == null || !this.isFiniteNumber(fann.rpm300)) return null;
    return Math.max(0, (fann.rpm300 as number) - pv);
  }

  private sanitize(rheology: BaseRheology): BaseRheology {
    const clean: BaseRheology = {};
    for (const [key, value] of Object.entries(rheology) as [keyof BaseRheology, number | null | undefined][]) {
      clean[key] = this.isFiniteNumber(value) ? value as number : null;
    }
    return clean;
  }

  private numberOrZero(value: number | null | undefined): number {
    return this.numberOrDefault(value, 0);
  }

  private numberOrDefault(value: number | null | undefined, fallback: number): number {
    return this.isFiniteNumber(value) ? value as number : fallback;
  }

  private numberOrNull(value: number | null | undefined): number | null {
    return this.isFiniteNumber(value) ? value as number : null;
  }

  private isFiniteNumber(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
  }
}
