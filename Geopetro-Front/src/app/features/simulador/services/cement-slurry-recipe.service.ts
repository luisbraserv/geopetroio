import { Injectable } from '@angular/core';
import { CEMENT_WEIGHT, VOL_WATER_FRESH, VOL_WATER_SEA, VOL_NACL, VOL_SILICA, LB_TO_KG, GAL_TO_L, FT3_TO_L } from '../models/constantes';
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
  FT3_PER_BBL,
  GAL_PER_FT3,
  GAL_PER_BBL,
} from './slurry-engine';

@Injectable({ providedIn: 'root' })
export class CementSlurryRecipeService {

  calculateRecipeBase(slurryDesign: SlurryDesign): SlurryRecipeBase {
    // O design já contém a composição resolvida pelo motor. A receita apenas
    // contabiliza esses componentes; recalcular pela densidade mudaria a mistura.
    const cementVolGal = slurryDesign.cementClassCv;
    const { waterFreshLb, waterSeaLb, naclLb, silicaWt } = slurryDesign;
    const components = [waterFreshLb, waterSeaLb, naclLb, silicaWt,
      ...(slurryDesign.adds || []).flatMap(a => [a.wt, a.vol])];
    if (!Number.isFinite(cementVolGal) || cementVolGal <= 0 ||
        components.some(value => !Number.isFinite(value) || value < 0)) {
      return {
        densityPpg: 0, densityCheckPpg: 0, yieldFt3PerFt3Cement: 0,
        yieldLPerSk: 0, facGpc: 0, famGpc: 0, facPercent: 0,
        totalMassLb: 0, totalVolumeGal: 0, rows: [],
      };
    }
    const waterWeightLb = waterFreshLb + waterSeaLb;

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
    if (waterFreshLb > 0) {
      rows.push({
        productName:         'Água doce',
        type:                'water',
        concentration:       this.percentOf(waterFreshLb, waterWeightLb),
        concentrationUnit:   '% água mistura',
        baseMassLb:          waterFreshLb,
        baseVolumeGal:       waterFreshLb * VOL_WATER_FRESH,
        absoluteVolumeGalLb: VOL_WATER_FRESH,
        operationalNote:     'Água de mistura.',
      });
    }

    // Água do mar
    if (waterSeaLb > 0) {
      rows.push({
        productName:         'Água do mar',
        type:                'water',
        concentration:       this.percentOf(waterSeaLb, waterWeightLb),
        concentrationUnit:   '% água mistura',
        baseMassLb:          waterSeaLb,
        baseVolumeGal:       waterSeaLb * VOL_WATER_SEA,
        absoluteVolumeGalLb: VOL_WATER_SEA,
        operationalNote:     'Água de mistura.',
      });
    }

    // NaCl
    if (naclLb > 0) {
      rows.push({
        productName:         'NaCl',
        type:                'salt',
        concentration:       this.percentOf(naclLb, waterFreshLb),
        concentrationUnit:   '% BWOW',
        baseMassLb:          naclLb,
        baseVolumeGal:       naclLb * VOL_NACL,
        absoluteVolumeGalLb: VOL_NACL,
        operationalNote:     'Sal calculado sobre água doce.',
      });
    }

    // Sílica
    if (silicaWt > 0) {
      rows.push({
        productName:         'Sílica',
        type:                'silica',
        concentration:       this.percentOf(silicaWt, CEMENT_WEIGHT),
        concentrationUnit:   '% BWOC',
        baseMassLb:          silicaWt,
        baseVolumeGal:       silicaWt * VOL_SILICA,
        absoluteVolumeGalLb: VOL_SILICA,
        operationalNote:     'Misturada a seco com o cimento. Não entra no FAM.',
      });
    }

    // Aditivos
    for (const add of slurryDesign.adds || []) {
      rows.push(this.additiveRow(add));
    }

    const totalMassLb = rows.reduce((sum, row) => sum + row.baseMassLb, 0);
    const totalVolumeGal = rows.reduce((sum, row) => sum + row.baseVolumeGal, 0);
    const facGpc = waterFreshLb * VOL_WATER_FRESH + waterSeaLb * VOL_WATER_SEA;
    const famGpc = facGpc + naclLb * VOL_NACL + (slurryDesign.adds || [])
      .filter(a => a.type === 'liquid').reduce((sum, a) => sum + a.vol, 0);
    const yieldFt3 = totalVolumeGal / GAL_PER_FT3;
    return {
      densityPpg:           totalMassLb / totalVolumeGal,
      densityCheckPpg:      totalMassLb / totalVolumeGal,
      yieldFt3PerFt3Cement: yieldFt3,
      yieldLPerSk:          yieldFt3 * FT3_TO_L,
      facGpc,
      famGpc,
      facPercent:           this.percentOf(waterWeightLb, CEMENT_WEIGHT),
      totalMassLb,
      totalVolumeGal,
      rows,
    };
  }

  calculateRecipeByVolume(
    slurryDesign: SlurryDesign,
    volumePastaBbl: number,
    rendimentoOverride?: number | null,
  ): SlurryRecipeByVolume {
    const base   = this.calculateRecipeBase(slurryDesign);
    const yieldV = rendimentoOverride ?? base.yieldFt3PerFt3Cement;

    if (!Number.isFinite(yieldV) || yieldV <= 0 || base.rows.length === 0 ||
        !Number.isFinite(volumePastaBbl) || volumePastaBbl < 0) {
      return {
        targetSlurryVolumeBbl:   volumePastaBbl,
        targetSlurryVolumeFt3:   this.finite(volumePastaBbl) * FT3_PER_BBL,
        yieldFt3PerFt3Cement:    0,
        cementVolumeFt3:         0,
        sacks94lb:               0,
        scaleFactor:             0,
        totalCementLb:           0,
        totalCementKg:           0,
        totalMixWaterGal:        0,
        totalMixWaterBbl:        0,
        rows:                    [],
        error: !Number.isFinite(volumePastaBbl) || volumePastaBbl < 0
          ? 'Informe um volume de pasta finito e maior ou igual a zero.'
          : 'Não foi possível calcular a receita por volume porque o rendimento da pasta não foi calculado.',
      };
    }

    const targetSlurryVolumeFt3 = volumePastaBbl * FT3_PER_BBL;
    const scaleFactor = targetSlurryVolumeFt3 / yieldV;

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
      targetSlurryVolumeFt3,
      yieldFt3PerFt3Cement:   yieldV,
      cementVolumeFt3:        scaleFactor,
      sacks94lb:              scaleFactor,
      scaleFactor,
      totalCementLb:          scaleFactor * CEMENT_WEIGHT,
      totalCementKg:          scaleFactor * CEMENT_WEIGHT * LB_TO_KG,
      totalMixWaterGal,
      totalMixWaterBbl:       totalMixWaterGal / GAL_PER_BBL,
      facGpc:                 base.facGpc,
      famGpc:                 base.famGpc,
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
    const base = this.calculateRecipeBase(slurryDesign);
    if (!Number.isFinite(yieldFt3) || yieldFt3 <= 0 || !Number.isFinite(facGpc) || facGpc <= 0 ||
        !Number.isFinite(famGpc) || famGpc <= 0 || !Number.isFinite(volumePastaBbl) || volumePastaBbl < 0 ||
        base.rows.length === 0) {
      return {
        targetSlurryVolumeBbl:  volumePastaBbl,
        targetSlurryVolumeFt3:  this.finite(volumePastaBbl) * FT3_PER_BBL,
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
        error: 'Informe uma composição, um volume, FAC, FAM e rendimento válidos para calcular.',
      };
    }

    const targetFt3      = this.finite(volumePastaBbl) * FT3_PER_BBL;
    const cementFt3      = targetFt3 / yieldFt3;
    const scaleFactor    = cementFt3;
    const totalCementLb  = scaleFactor * CEMENT_WEIGHT;
    const totalWaterGal  = facGpc * scaleFactor;

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
      const ratio = waterVolBase > 0 && scaleFactor > 0 ? totalWaterGal / (waterVolBase * scaleFactor) : 0;
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
    const recipeItems = this.toLegacyRecipeItems(volumeRecipe.rows, volumeRecipe.scaleFactor);

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
