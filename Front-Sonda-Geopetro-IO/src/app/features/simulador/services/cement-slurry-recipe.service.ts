import { Injectable } from '@angular/core';
import { CEMENT_WEIGHT, VOL_WATER_FRESH, VOL_WATER_SEA, VOL_NACL, VOL_SILICA, LB_TO_KG, GAL_TO_L } from '../models/constantes';
import { AditivoCalc } from '../models/aditivo.model';
import {
  CementSlurryRecipeRow,
  RecipeItem,
  SlurryDesign,
  SlurryRecipe,
  SlurryRecipeBase,
  SlurryRecipeByVolume,
} from '../models/pasta.model';
import {
  calcSlurryEngine,
  scaleSlurry,
  CEMENT_BASE_VOL_GAL,
  GAL_PER_FT3,
  GAL_PER_BBL,
} from './slurry-engine';

@Injectable({ providedIn: 'root' })
export class CementSlurryRecipeService {

  calculateRecipeBase(slurryDesign: SlurryDesign): SlurryRecipeBase {
    const { freshFrac, seaFrac } = this.waterFractions(slurryDesign);
    const cementVolGal = this.finite(slurryDesign.cementClassCv) > 0
      ? this.finite(slurryDesign.cementClassCv)
      : CEMENT_BASE_VOL_GAL;

    // Engine centralizado — fonte única de verdade para FAC/FAM/rendimento
    const eng = calcSlurryEngine({
      targetDensityPpg:   slurryDesign.density,
      freshWaterFraction: freshFrac,
      seaWaterFraction:   seaFrac,
      silicaPct:          this.finite(slurryDesign.silica),
      naclPct:            this.naclPct(slurryDesign),
      cementAbsVolGal:    cementVolGal,
      adds:               slurryDesign.adds || [],
    });

    const rows: CementSlurryRecipeRow[] = [];

    // Cimento
    rows.push({
      productName:            'Cimento',
      type:                   'cement',
      concentration:          'base',
      concentrationUnit:      '94 lb/sk',
      baseMassLb:             CEMENT_WEIGHT,
      baseVolumeGal:          cementVolGal,
      absoluteVolumeGalLb:    cementVolGal / CEMENT_WEIGHT,
      operationalNote:        'Base: 1 saco de 94 lb / 1 ft³ de cimento.',
    });

    // Água doce
    if (eng.waterFreshLb > 0) {
      rows.push({
        productName:         'Água doce',
        type:                'water',
        concentration:       this.percentOf(eng.waterFreshLb, eng.waterWeightLbPerFt3Cement),
        concentrationUnit:   '% água mistura',
        baseMassLb:          eng.waterFreshLb,
        baseVolumeGal:       eng.waterFreshLb * VOL_WATER_FRESH,
        absoluteVolumeGalLb: VOL_WATER_FRESH,
        operationalNote:     'Água de mistura.',
      });
    }

    // Água do mar
    if (eng.waterSeaLb > 0) {
      rows.push({
        productName:         'Água do mar',
        type:                'water',
        concentration:       this.percentOf(eng.waterSeaLb, eng.waterWeightLbPerFt3Cement),
        concentrationUnit:   '% água mistura',
        baseMassLb:          eng.waterSeaLb,
        baseVolumeGal:       eng.waterSeaLb * VOL_WATER_SEA,
        absoluteVolumeGalLb: VOL_WATER_SEA,
        operationalNote:     'Água de mistura.',
      });
    }

    // NaCl
    if (eng.naclWeightLb > 0) {
      rows.push({
        productName:         'NaCl',
        type:                'salt',
        concentration:       this.naclPct(slurryDesign),
        concentrationUnit:   '% BWOW',
        baseMassLb:          eng.naclWeightLb,
        baseVolumeGal:       eng.naclVolumeGal,
        absoluteVolumeGalLb: VOL_NACL,
        operationalNote:     'Sal calculado sobre água doce.',
      });
    }

    // Sílica
    if (eng.silicaWeightLb > 0) {
      rows.push({
        productName:         'Sílica',
        type:                'silica',
        concentration:       this.finite(slurryDesign.silica),
        concentrationUnit:   '% BWOC',
        baseMassLb:          eng.silicaWeightLb,
        baseVolumeGal:       eng.silicaVolumeGal,
        absoluteVolumeGalLb: VOL_SILICA,
        operationalNote:     'Misturada a seco com o cimento. Não entra no FAM.',
      });
    }

    // Aditivos
    for (const add of slurryDesign.adds || []) {
      rows.push(this.additiveRow(add));
    }

    return {
      densityPpg:           eng.densityCheckPpg,
      densityCheckPpg:      eng.densityCheckPpg,
      yieldFt3PerFt3Cement: eng.yieldFt3PerFt3Cement,
      yieldLPerSk:          eng.yieldLPerSk,
      facGpc:               eng.facGpc,
      famGpc:               eng.famGpc,
      facPercent:           eng.facPercent,
      totalMassLb:          eng.totalWeightLbPerFt3Cement,
      totalVolumeGal:       eng.totalVolumeGalPerFt3Cement,
      rows,
    };
  }

  calculateRecipeByVolume(
    slurryDesign: SlurryDesign,
    volumePastaBbl: number,
    rendimentoOverride?: number | null,
  ): SlurryRecipeByVolume {
    const base   = this.calculateRecipeBase(slurryDesign);
    const yieldV = this.finite(rendimentoOverride, NaN) > 0
      ? this.finite(rendimentoOverride, NaN)
      : this.finite(base.yieldFt3PerFt3Cement, NaN);

    if (!Number.isFinite(yieldV) || yieldV <= 0) {
      return {
        targetSlurryVolumeBbl:   volumePastaBbl,
        targetSlurryVolumeFt3:   this.finite(volumePastaBbl) * 5.6146,
        yieldFt3PerFt3Cement:    0,
        cementVolumeFt3:         0,
        sacks94lb:               0,
        scaleFactor:             0,
        totalCementLb:           0,
        totalCementKg:           0,
        totalMixWaterGal:        0,
        totalMixWaterBbl:        0,
        rows:                    [],
        error: 'Não foi possível calcular a receita por volume porque o rendimento da pasta não foi calculado.',
      };
    }

    const { freshFrac, seaFrac } = this.waterFractions(slurryDesign);
    const eng = calcSlurryEngine({
      targetDensityPpg:   slurryDesign.density,
      freshWaterFraction: freshFrac,
      seaWaterFraction:   seaFrac,
      silicaPct:          this.finite(slurryDesign.silica),
      naclPct:            this.naclPct(slurryDesign),
      cementAbsVolGal:    this.finite(slurryDesign.cementClassCv) > 0
        ? this.finite(slurryDesign.cementClassCv)
        : CEMENT_BASE_VOL_GAL,
      adds:               slurryDesign.adds || [],
    });

    const scaled      = scaleSlurry({ ...eng, yieldFt3PerFt3Cement: yieldV }, volumePastaBbl);
    const scaleFactor = scaled.scaleFactor;

    const rows = base.rows.map(row => ({
      ...row,
      scaledMassLb:   row.baseMassLb   * scaleFactor,
      scaledMassKg:   row.baseMassLb   * scaleFactor * LB_TO_KG,
      scaledVolumeGal: row.baseVolumeGal * scaleFactor,
      scaledVolumeBbl: row.baseVolumeGal * scaleFactor / GAL_PER_BBL,
    }));

    const waterRows       = rows.filter(r => r.type === 'water');
    const totalMixWaterGal = waterRows.reduce((s, r) => s + this.finite(r.scaledVolumeGal), 0);

    return {
      targetSlurryVolumeBbl:  volumePastaBbl,
      targetSlurryVolumeFt3:  scaled.targetSlurryVolumeFt3,
      yieldFt3PerFt3Cement:   yieldV,
      cementVolumeFt3:        scaled.cementRequiredFt3,
      sacks94lb:              scaled.sacks94lb,
      scaleFactor,
      totalCementLb:          scaled.totalCementLb,
      totalCementKg:          scaled.totalCementKg,
      totalMixWaterGal,
      totalMixWaterBbl:       totalMixWaterGal / GAL_PER_BBL,
      facGpc:                 eng.facGpc,
      famGpc:                 eng.famGpc,
      rows,
    };
  }

  /**
   * Receita por volume usando FAC e FAM informados manualmente.
   *
   * Sequência:
   *   1. ft³ de pasta = bbl × 5,6146
   *   2. ft³ de cimento = ft³ pasta / rendimento
   *   3. sacos = ft³ de cimento
   *   4. água total (FAC) = facGpc × ft³ de cimento
   *   5. volume FAM total = famGpc × ft³ de cimento
   *   6. escala as linhas da receita base pelo scaleFactor (ft³ de cimento)
   */
  buildSlurryRecipeByFacFam(
    slurryDesign: SlurryDesign,
    volumePastaBbl: number,
    facGpc: number,
    famGpc: number,
    yieldFt3: number,
  ): SlurryRecipeByVolume {
    if (!Number.isFinite(yieldFt3) || yieldFt3 <= 0 || !Number.isFinite(facGpc) || facGpc <= 0) {
      return {
        targetSlurryVolumeBbl:  volumePastaBbl,
        targetSlurryVolumeFt3:  this.finite(volumePastaBbl) * 5.6146,
        yieldFt3PerFt3Cement:   yieldFt3,
        cementVolumeFt3:        0,
        sacks94lb:              0,
        scaleFactor:            0,
        totalCementLb:          0,
        totalCementKg:          0,
        totalMixWaterGal:       0,
        totalMixWaterBbl:       0,
        facGpc,
        famGpc,
        rows:  [],
        error: 'Preencha FAC GPC e rendimento válidos para calcular.',
      };
    }

    const targetFt3      = this.finite(volumePastaBbl) * 5.6146;
    const cementFt3      = targetFt3 / yieldFt3;
    const scaleFactor    = cementFt3;
    const totalCementLb  = scaleFactor * CEMENT_WEIGHT;
    const totalWaterGal  = facGpc * scaleFactor;
    const totalFamGal    = famGpc * scaleFactor;

    const base = this.calculateRecipeBase(slurryDesign);
    const rows = base.rows.map(row => ({
      ...row,
      scaledMassLb:    row.baseMassLb    * scaleFactor,
      scaledMassKg:    row.baseMassLb    * scaleFactor * LB_TO_KG,
      scaledVolumeGal: row.baseVolumeGal * scaleFactor,
      scaledVolumeBbl: row.baseVolumeGal * scaleFactor / GAL_PER_BBL,
    }));

    // Sobrescreve a linha de água com o volume baseado no FAC informado
    // (caso o FAC manual difira do calculado)
    const waterRows = rows.filter(r => r.type === 'water');
    if (waterRows.length > 0) {
      const waterVolBase = waterRows.reduce((s, r) => s + r.baseVolumeGal, 0);
      const ratio = waterVolBase > 0 ? totalWaterGal / (waterVolBase * scaleFactor) : 1;
      waterRows.forEach(r => {
        r.scaledVolumeGal = (r.scaledVolumeGal ?? 0) * ratio;
        r.scaledVolumeBbl = (r.scaledVolumeGal) / GAL_PER_BBL;
        r.scaledMassLb    = (r.scaledMassLb ?? 0) * ratio;
        r.scaledMassKg    = (r.scaledMassKg ?? 0) * ratio;
      });
    }

    return {
      targetSlurryVolumeBbl: volumePastaBbl,
      targetSlurryVolumeFt3: targetFt3,
      yieldFt3PerFt3Cement:  yieldFt3,
      cementVolumeFt3:       cementFt3,
      sacks94lb:             cementFt3,
      scaleFactor,
      totalCementLb,
      totalCementKg:         totalCementLb * LB_TO_KG,
      totalMixWaterGal:      totalWaterGal,
      totalMixWaterBbl:      totalWaterGal / GAL_PER_BBL,
      facGpc,
      famGpc,
      rows,
    };
  }

  buildSlurryRecipe(
    volumePastaBbl: number,
    slurryDesign: SlurryDesign,
    rendimentoOverride?: number | null,
  ): SlurryRecipe {
    const baseRecipe   = this.calculateRecipeBase(slurryDesign);
    const volumeRecipe = this.calculateRecipeByVolume(slurryDesign, volumePastaBbl, rendimentoOverride);
    const recipeItems  = this.toLegacyRecipeItems(
      volumeRecipe.rows.length ? volumeRecipe.rows : baseRecipe.rows,
      volumeRecipe.scaleFactor || 1,
    );

    return {
      sacks:           volumeRecipe.error ? 0 : Math.ceil(volumeRecipe.sacks94lb),
      mixWaterTotalGal: volumeRecipe.totalMixWaterGal,
      recipeItems,
      baseRecipe,
      volumeRecipe,
      error: volumeRecipe.error,
    };
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private waterFractions(d: SlurryDesign): { freshFrac: number; seaFrac: number } {
    let freshPct = this.finite(d.waterFreshLb > 0 || d.waterSeaLb > 0
      ? (d.waterFreshLb / (d.waterFreshLb + d.waterSeaLb)) * 100
      : 100,
    );
    // Se o design já tem frações salvas, usar; senão assumir 100% doce
    if (!isNaN((d as any).waterSplitFresh)) {
      freshPct = this.finite((d as any).waterSplitFresh, 100);
    }
    const seaPct   = 100 - freshPct;
    const total    = freshPct + seaPct;
    return {
      freshFrac: total > 0 ? freshPct / total : 1,
      seaFrac:   total > 0 ? seaPct  / total : 0,
    };
  }

  private naclPct(d: SlurryDesign): number {
    // naclLb / waterFreshLb * 100 — ou campo nacl (% direto)
    if (this.finite(d.naclLb) > 0 && this.finite(d.waterFreshLb) > 0) {
      return d.naclLb / d.waterFreshLb * 100;
    }
    return this.finite((d as any).nacl);
  }

  private additiveRow(add: AditivoCalc): CementSlurryRecipeRow {
    const type = add.category === 'salt'
      ? 'salt'
      : add.type === 'liquid'
        ? 'liquidAdditive'
        : 'solidAdditive';
    const absVol = add.wt > 0 ? add.vol / add.wt : 0;
    return {
      productName:         add.name,
      type,
      concentration:       add.conc,
      concentrationUnit:   this.unitLabel(add.dosageUnit),
      baseMassLb:          this.finite(add.wt),
      baseVolumeGal:       this.finite(add.vol),
      absoluteVolumeGalLb: absVol,
      operationalNote:     add.warning || '',
    };
  }

  private toLegacyRecipeItems(rows: CementSlurryRecipeRow[], scaleFactor: number): RecipeItem[] {
    return rows.map(row => {
      const totalKg  = this.finite(row.scaledMassKg,  row.baseMassLb   * scaleFactor * LB_TO_KG);
      const totalL   = this.finite(row.scaledVolumeGal, row.baseVolumeGal * scaleFactor) * GAL_TO_L;
      const isMass   = row.type === 'cement' || row.type === 'solidAdditive' || row.type === 'salt' || row.type === 'silica';
      return {
        name:  row.productName,
        conc:  `${row.concentration} ${row.concentrationUnit}`.trim(),
        per:   row.baseMassLb / CEMENT_WEIGHT,
        total: isMass ? totalKg : totalL,
        unit:  isMass ? 'kg' : 'L',
      };
    });
  }

  private unitLabel(unit?: string): string {
    const labels: Record<string, string> = {
      percentBWOC:            '% BWOC',
      percentBWOW:            '% BWOW',
      galPerSack:             'gal/sk',
      galPerBbl:              'gal/bbl',
      galPerCubicFootCement:  'gal/ft³ cimento',
      lbPerSack:              'lb/sk',
      kgPerM3:                'kg/m³',
      lbPerBbl:               'lb/bbl',
    };
    return unit ? labels[unit] || unit : '';
  }

  private percentOf(value: number, total: number): number {
    return total > 0 ? value / total * 100 : 0;
  }

  private finite(value: unknown, fallback = 0): number {
    const n = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(n) ? n : fallback;
  }
}
