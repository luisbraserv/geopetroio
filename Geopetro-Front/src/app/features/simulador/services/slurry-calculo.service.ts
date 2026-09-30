import { Injectable } from '@angular/core';
import { CoreCalculoService } from './core-calculo.service';
import {
  CEMENT_WEIGHT, VOL_WATER_FRESH, VOL_WATER_SEA, VOL_NACL, VOL_SILICA,
  LB_TO_KG, GAL_TO_L, FT3_TO_L,
} from '../models/constantes';
import {
  Aditivo,
  AditivoCalc,
  AditivoEfeitos,
  UnidadeDosagem,
  hydrateAditivosFromCatalog,
  unidadePadraoAditivo,
} from '../models/aditivo.model';
import { SlurryDesign, SlurryInputs, SlurryRecipe, RecipeItem } from '../models/pasta.model';
import { RheologyAdjustmentService } from './rheology-adjustment.service';
import { CementSlurryRecipeService } from './cement-slurry-recipe.service';
import {
  calcSlurryEngine,
  CEMENT_BASE_VOL_GAL,
  GAL_PER_FT3,
} from './slurry-engine';

interface AdditiveCalcContext {
  waterLbPerSk?: number;
  baseFluidBblPerSk?: number;
  cementVolumeFt3PerSk?: number;
  slurryBblPerSk?: number;
}

@Injectable({ providedIn: 'root' })
export class SlurryCalculoService {
  constructor(
    private core: CoreCalculoService,
    private rheologyAdjustments: RheologyAdjustmentService,
    private cementRecipe: CementSlurryRecipeService,
  ) {}

  getAdditiveCalcs(additivos: Aditivo[], context: AdditiveCalcContext = {}): AditivoCalc[] {
    return hydrateAditivosFromCatalog(additivos || []).map(a => {
      const conc         = this.safeNumber(a.concentracaoUsada ?? a.conc ?? a.concentracaoPadrao, 0);
      const unit         = this.getDosageUnit(a);
      const type         = (a.estadoFisico ?? a.type ?? 'solid') as Aditivo['type'];
      const category     = (a.categoria ?? a.category ?? 'other') as Aditivo['category'];
      const densityLbGal = this.getDensityLbGal(a);
      const absVol       = this.getAbsoluteVolumeGalLb(a);
      const waterLb      = context.waterLbPerSk ?? this.galToWaterLb(5);
      const cementFt3    = context.cementVolumeFt3PerSk ?? 3.59;
      const baseBbl      = context.baseFluidBblPerSk ?? Math.max(0.01, waterLb * VOL_WATER_FRESH / 42);
      const slurryBbl    = context.slurryBblPerSk ?? baseBbl;

      let wt = 0, vol = 0;
      const warnings = [...(a._hydrationWarnings || [])];

      switch (unit) {
        case 'percentBWOC':
          wt  = CEMENT_WEIGHT * conc / 100;
          vol = absVol != null ? wt * absVol : 0;
          break;
        case 'percentBWOW':
          wt  = waterLb * conc / 100;
          vol = absVol != null ? wt * absVol : 0;
          break;
        case 'lbPerSack':
          wt  = conc;
          vol = absVol != null ? wt * absVol : 0;
          break;
        case 'galPerSack':
          vol = conc;
          wt  = densityLbGal != null ? vol * densityLbGal : 0;
          break;
        case 'galPerBbl':
          vol = baseBbl * conc;
          wt  = densityLbGal != null ? vol * densityLbGal : 0;
          break;
        case 'galPerCubicFootCement':
          vol = conc;
          wt  = densityLbGal != null ? vol * densityLbGal : 0;
          break;
        case 'kgPerM3':
          wt  = conc * slurryBbl * 0.158987 * 2.20462;
          vol = absVol != null ? wt * absVol : 0;
          break;
        case 'lbPerBbl':
          wt  = conc * slurryBbl;
          vol = absVol != null ? wt * absVol : 0;
          break;
      }

      if (type === 'liquid' && !this.hasDensity(a)) {
        warnings.push('Informar densidade do liquido no catalogo para massa precisa.');
      }
      if (type === 'solid' && !this.hasAbsoluteVolumeOrSg(a)) {
        warnings.push('Informar volume absoluto ou massa especifica do solido no catalogo para volume preciso.');
      }

      wt  = this.sanitize(wt);
      vol = this.sanitize(vol);

      return {
        name:             a.name || a.nomeComercial || a.commercialName || 'Aditivo',
        type,
        category,
        conc,
        dosageUnit:       unit,
        mixedIn:          a.misturadoEm,
        wt,
        vol,
        absoluteVolumeGal: absVol != null ? wt * absVol : 0,
        warning: [...new Set(warnings)].join(' '),
      };
    });
  }

  getAdditiveEffects(additivos: Aditivo[]): AditivoEfeitos {
    const ef: AditivoEfeitos = {
      retarder: 0, accelerator: 0, dispersant: 0, fluidLoss: 0, ttShift: 0,
      slopeModifier: 0, t30Extra: 0, t100Extra: 0, tempSensTotal: 0,
      ucaOnsetMod: 0, ucaStrengthMod: 0, freeWaterMod: 0, warnings: [],
    };

    for (const a of (additivos || [])) {
      const conc     = this.safeNumber(a.concentracaoUsada ?? a.conc ?? a.concentracaoPadrao, 0);
      const category = a.categoria ?? a.category;
      if (category === 'retarder')                                   ef.retarder    += conc;
      if (category === 'accelerator')                                ef.accelerator += conc;
      if (category === 'dispersant')                                 ef.dispersant  += conc;
      if (category === 'fluidLossControl' || category === 'fluid-loss') ef.fluidLoss += conc;

      const adjustment = this.rheologyAdjustments.applyAdditiveRheologyEffects({}, [a]);
      ef.warnings?.push(...adjustment.warnings);

      const coeffs = a.coefficients || a.rheology?.coefficients;
      if (coeffs?.thickeningTimeDeltaMinPerUnit != null) {
        ef.ttShift += coeffs.thickeningTimeDeltaMinPerUnit * conc / 60;
      }
      if ((a.afetaReologia ?? a.rheology?.affectsRheology) && !this.rheologyAdjustments.hasAutomaticRheologyData(a)) {
        ef.warnings?.push(`${a.name}: reologia marcada como afetada, mas sem base laboratorial ou coeficiente.`);
      }
    }
    return ef;
  }

  calculateSlurryDesign(inputs: SlurryInputs): SlurryDesign {
    const rhoTarget   = inputs.density ?? 15.8;
    const cementClass = this.core.getCementClass(inputs.cementClass ?? 'G');

    // Frações de água
    let freshPct = inputs.waterSplitFresh ?? 100;
    let seaPct   = inputs.waterSplitSea   ?? 0;
    const splitSum = freshPct + seaPct;
    if (splitSum <= 0) { freshPct = 100; seaPct = 0; }
    else if (splitSum !== 100) { freshPct = freshPct * 100 / splitSum; seaPct = seaPct * 100 / splitSum; }
    const freshFrac = freshPct / 100;
    const seaFrac   = seaPct  / 100;

    const silicaPct = inputs.silica ?? 35;
    const naclPct   = inputs.nacl   ?? 0;
    const additivos = hydrateAditivosFromCatalog((inputs.additivos ?? []) as Aditivo[]);

    // Pré-calcular aditivos com estimativa de água (contexto inicial)
    const estimatedWaterLb = this.galToWaterLb(cementClass.waterGal || 5);
    const adds = this.getAdditiveCalcs(additivos, {
      waterLbPerSk:       estimatedWaterLb,
      baseFluidBblPerSk:  (cementClass.waterGal || 5) / 42,
      cementVolumeFt3PerSk: cementClass.cv,
      slurryBblPerSk:     Math.max(0.01, (cementClass.neatYield || 1.14) / 5.6146),
    });
    const effects = this.getAdditiveEffects(additivos);

    // ── Engine centralizado ────────────────────────────────────────────────
    const eng = calcSlurryEngine({
      targetDensityPpg:   rhoTarget,
      freshWaterFraction: freshFrac,
      seaWaterFraction:   seaFrac,
      silicaPct,
      naclPct,
      cementAbsVolGal:    cementClass.cv,
      adds,
    });

    if (eng.densityError) {
      console.warn(
        `[SlurryEngine] Pasta não fechou na densidade alvo. ` +
        `Alvo: ${rhoTarget.toFixed(2)} ppg | Calculado: ${eng.densityCheckPpg.toFixed(2)} ppg`,
      );
    }

    const design: SlurryDesign = {
      density:          eng.densityCheckPpg,
      yieldFt3:         eng.yieldFt3PerFt3Cement,
      yieldFt3PerFt3Cement: eng.yieldFt3PerFt3Cement,
      yieldLPerSk:      eng.yieldLPerSk,

      // FAC / FAM — fonte única: engine
      facGpc:           eng.facGpc,
      famGpc:           eng.famGpc,
      fac:              eng.facPercent,   // % auxiliar
      facPct:           eng.facPercent,
      fam:              eng.famGpc,       // alias legado
      famGalPerSk:      eng.famGpc,       // alias legado

      waterVolumeGal:   eng.waterGalPerFt3Cement,
      waterFreshLb:     eng.waterFreshLb,
      waterSeaLb:       eng.waterSeaLb,
      naclLb:           eng.naclWeightLb,

      retarder:         effects.retarder,
      accelerator:      effects.accelerator,
      dispersant:       effects.dispersant,
      fluidLoss:        effects.fluidLoss,
      silica:           silicaPct,
      surfacePressure:  inputs.surfacePressure ?? 0,
      bhct:             inputs.bhct ?? 0,
      bhst:             inputs.bhst ?? 0,
      cementClassCv:    cementClass.cv,
      cementClassLabel: cementClass.label,
      silicaWt:         eng.silicaWeightLb,
      adds,
      _effects:         effects,
      _thickeningPressureWeightId:      'mudWeightFront',
      _thickeningChartSurfaceFallback:  500,
      _thickeningChartFallbackWhenZero: true,
    };

    design.slurryRecipeResult = {
      baseRecipe: this.cementRecipe.calculateRecipeBase(design),
    };

    return design;
  }

  buildSlurryRecipe(
    volumeBbl: number,
    slurry: SlurryDesign,
    rendimentoOverride?: number | null,
  ): SlurryRecipe {
    const recipe = this.cementRecipe.buildSlurryRecipe(volumeBbl, slurry, rendimentoOverride);
    slurry.slurryRecipeResult = {
      baseRecipe:   recipe.baseRecipe!,
      volumeRecipe: recipe.volumeRecipe,
    };
    return recipe;
  }

  buildSlurryRecipeByFacFam(
    slurry: SlurryDesign,
    volumeBbl: number,
    facGpc: number,
    famGpc: number,
    yieldFt3: number,
  ) {
    return this.cementRecipe.buildSlurryRecipeByFacFam(slurry, volumeBbl, facGpc, famGpc, yieldFt3);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private getDosageUnit(a: Aditivo): UnidadeDosagem {
    const explicit = a.unidadeDosagem || a.unit as UnidadeDosagem | undefined;
    if (explicit && [
      'percentBWOC', 'percentBWOW', 'galPerSack', 'galPerBbl',
      'galPerCubicFootCement', 'lbPerSack', 'kgPerM3', 'lbPerBbl',
    ].includes(explicit)) return explicit;
    return unidadePadraoAditivo(a);
  }

  private getDensityLbGal(a: Aditivo): number | null {
    if (this.safeNumber(a.densidadeLbGal ?? a.densityLbGal ?? a.densityLb, 0) > 0)
      return this.safeNumber(a.densidadeLbGal ?? a.densityLbGal ?? a.densityLb, 8.33);
    if ((a.massaEspecificaUnidade === 'sg' || a.massaEspecificaUnidade === 'gPerCm3') && this.safeNumber(a.massaEspecifica ?? a.specificGravity, 0) > 0)
      return this.safeNumber(a.massaEspecifica ?? a.specificGravity, 1) * 8.3454;
    if (a.massaEspecificaUnidade === 'kgPerM3' && this.safeNumber(a.massaEspecifica, 0) > 0)
      return this.safeNumber(a.massaEspecifica, 1000) / 119.826;
    return null;
  }

  private getAbsoluteVolumeGalLb(a: Aditivo): number | null {
    if (this.safeNumber(a.volumeAbsolutoGalPerLb, 0) > 0)
      return this.safeNumber(a.volumeAbsolutoGalPerLb, 0.0453);
    const sg = this.getSpecificGravity(a);
    return sg > 0 ? 1 / (sg * 8.3454) : null;
  }

  private getSpecificGravity(a: Aditivo): number {
    if ((a.massaEspecificaUnidade === 'sg' || a.massaEspecificaUnidade === 'gPerCm3')
        && this.safeNumber(a.massaEspecifica ?? a.specificGravity, 0) > 0)
      return this.safeNumber(a.massaEspecifica ?? a.specificGravity, 1);
    if (this.safeNumber(a.densidadeLbGal ?? a.densityLbGal ?? a.densityLb, 0) > 0)
      return this.safeNumber(a.densidadeLbGal ?? a.densityLbGal ?? a.densityLb, 8.33) / 8.3454;
    return 0;
  }

  private hasDensity(a: Aditivo): boolean {
    return this.safeNumber(a.densidadeLbGal ?? a.densityLbGal ?? a.densityLb, 0) > 0
        || this.safeNumber(a.massaEspecifica ?? a.specificGravity, 0) > 0;
  }

  private hasAbsoluteVolumeOrSg(a: Aditivo): boolean {
    return this.safeNumber(a.volumeAbsolutoGalPerLb, 0) > 0
        || this.safeNumber(a.massaEspecifica ?? a.specificGravity, 0) > 0;
  }

  private galToWaterLb(gal: number): number {
    return this.safeNumber(gal, 0) / VOL_WATER_FRESH;
  }

  private safeNumber(value: unknown, fallback = 0): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }

  private sanitize(value: number): number {
    return Number.isFinite(value) ? Math.max(0, value) : 0;
  }
}
