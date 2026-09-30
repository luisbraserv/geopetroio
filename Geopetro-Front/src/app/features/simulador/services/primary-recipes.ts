import type { SlurryDesign, SlurryInputs, SlurryRecipeByVolume } from '../models/pasta.model';
import type { PrimaryConfiguration, PrimaryDiagnostic } from '../models/primary-cementing.model';
import type { PrimaryPlacementRecipe, PrimaryProgramVolumes, PrimaryRecipeOverride, PrimaryRecipeResolution, PrimaryRecipeTotalRow } from '../models/primary-volumes.model';

export interface PrimaryRecipeDeps {
  design: (inputs: SlurryInputs) => SlurryDesign;
  byVolume: (design: SlurryDesign, volumeBbl: number) => SlurryRecipeByVolume;
  manual?: (design: SlurryDesign, volumeBbl: number, fac: number, fam: number, yieldFt3: number) => SlurryRecipeByVolume;
}

const OVERRIDE_FIELDS: PrimaryRecipeOverride['field'][] = ['densityPpg', 'n', 'kLbfSnFt2'];

/**
 * Quantidades por pasta a partir do volume preparado de cada colocação.
 * Não altera o volume simulado, não recalcula densidade e não apaga override:
 * propriedades substituídas pelo usuário seguem valendo com sua origem.
 */
export function resolvePrimaryRecipes(primary: PrimaryConfiguration, program: PrimaryProgramVolumes,
  deps: PrimaryRecipeDeps): PrimaryRecipeResolution {
  const diagnostics: PrimaryDiagnostic[] = [];
  const placements: PrimaryPlacementRecipe[] = [];
  for (const stage of program.stages) {
    for (const placement of stage.placements) {
      const fluid = primary.fluids.find(f => f.id === placement.fluidId);
      if (!fluid) continue;
      const overrides: PrimaryRecipeOverride[] = OVERRIDE_FIELDS
        .map(field => ({ field, source: fluid.propertySources[field] }))
        .filter((entry): entry is PrimaryRecipeOverride => !!entry.source && entry.source.source !== 'estimated');
      const base = { stageId: stage.stageId, placementId: placement.placementId, fluidId: fluid.id,
        pumpedBbl: placement.programmedBbl, preparedBbl: placement.preparedBbl, overrides };
      if (!fluid.recipe) {
        diagnostics.push({ code: 'PRIMARY_RECIPE_MISSING', severity: 'warning', category: 'configuration',
          stageId: stage.stageId, message: `${fluid.name}: sem composição cadastrada; quantidades de cimento e aditivos indisponíveis.` });
        placements.push({ ...base, yieldFt3PerFt3Cement: 0, sacks94lb: 0, supplySacks94: 0,
          mixWaterGal: 0, rows: [], error: 'Pasta sem composição cadastrada.' });
        continue;
      }
      const design = deps.design(fluid.recipe);
      const params = fluid.recipeParameters;
      const manual = params?.source === 'manual';
      if (manual && (!deps.manual || [params.yieldFt3, params.facGpc, params.famGpc]
        .some(value => value === null || !Number.isFinite(value) || value <= 0))) {
        const error = 'Informe rendimento, FAC e FAM positivos para a receita manual.';
        diagnostics.push({ code: 'PRIMARY_RECIPE_MANUAL_INVALID', severity: 'error', category: 'configuration',
          stageId: stage.stageId, message: fluid.name + ': ' + error });
        placements.push({ ...base, yieldFt3PerFt3Cement: 0, sacks94lb: 0, supplySacks94: 0,
          mixWaterGal: 0, rows: [], error, parameterSource: 'manual' });
        continue;
      }
      const recipe = manual ? deps.manual!(design, placement.preparedBbl, params.facGpc!, params.famGpc!, params.yieldFt3!)
        : deps.byVolume(design, placement.preparedBbl);
      if (recipe.error)
        diagnostics.push({ code: 'PRIMARY_RECIPE_INVALID', severity: 'error', category: 'configuration',
          stageId: stage.stageId, message: `${fluid.name}: ${recipe.error}` });
      placements.push({ ...base, yieldFt3PerFt3Cement: recipe.yieldFt3PerFt3Cement,
        sacks94lb: recipe.sacks94lb, supplySacks94: Math.ceil(recipe.sacks94lb),
        mixWaterGal: recipe.totalMixWaterGal, rows: recipe.rows, error: recipe.error,
        parameterSource: manual ? 'manual' : 'calculated', facGpc: recipe.facGpc ?? design.facGpc,
        famGpc: recipe.famGpc ?? design.famGpc });
    }
  }
  return { placements, totals: totalsByProduct(placements), diagnostics };
}

/** Soma apenas produtos com o mesmo tipo e a mesma unidade de concentração. */
function totalsByProduct(placements: PrimaryPlacementRecipe[]): PrimaryRecipeTotalRow[] {
  const totals = new Map<string, PrimaryRecipeTotalRow>();
  for (const placement of placements) {
    if (placement.error) continue;
    for (const row of placement.rows) {
      const key = JSON.stringify([row.productName, row.type, row.concentrationUnit]);
      const entry = totals.get(key) ?? { productName: row.productName, type: row.type,
        concentrationUnit: row.concentrationUnit, massLb: 0, volumeGal: 0, placementIds: [] };
      entry.massLb += row.scaledMassLb ?? 0;
      entry.volumeGal += row.scaledVolumeGal ?? 0;
      if (!entry.placementIds.includes(placement.placementId)) entry.placementIds.push(placement.placementId);
      totals.set(key, entry);
    }
  }
  return [...totals.values()];
}
