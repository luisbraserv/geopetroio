import { describe, expect, it } from 'vitest';
import type { SlurryInputs } from '../models/pasta.model';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { buildWellGeometry } from '../models/well-geometry.form';
import { CementSlurryRecipeService } from './cement-slurry-recipe.service';
import { CoreCalculoService } from './core-calculo.service';
import { resolvePrimaryRecipes } from './primary-recipes';
import { resolvePrimaryProgramVolumes } from './primary-volumes';
import { RheologyAdjustmentService } from './rheology-adjustment.service';
import { SlurryCalculoService } from './slurry-calculo.service';
import { WellGeometryService } from './well-geometry.service';

/** ft³ por bbl da SPEC §5.6; usado para conferir os sacos fora do código testado. */
const FT3_PER_BBL = 9702 / 1728;

describe('primary placement recipes and traceable overrides (P4)', () => {
  const geometry = new WellGeometryService();
  const recipeService = new CementSlurryRecipeService();
  const slurry = new SlurryCalculoService(new CoreCalculoService(), new RheologyAdjustmentService(), recipeService);
  const deps = {
    design: (inputs: SlurryInputs) => slurry.calculateSlurryDesign(inputs),
    byVolume: (design: ReturnType<typeof slurry.calculateSlurryDesign>, volumeBbl: number) =>
      recipeService.calculateRecipeByVolume(design, volumeBbl),
  };
  const composition = (density: number, additivos: SlurryInputs['additivos'] = []): SlurryInputs => ({
    density, cementClass: 'G', waterSplitFresh: 100, waterSplitSea: 0, silica: 0, nacl: 0,
    bhct: null, bhst: null, surfaceTemp: 25, additivos,
  });
  const resolve = (s: PrimaryScenario) => {
    const stageGeometry = geometry.resolvePrimaryStageGeometry(
      buildWellGeometry(s.wellFinalMD, s.wellFinalTVD, s.fases), s.primary);
    return resolvePrimaryRecipes(s.primary, resolvePrimaryProgramVolumes(s.primary, stageGeometry), deps);
  };
  const withRecipe = (kind: 'conventional' | 'two-stage' = 'conventional'): PrimaryScenario => {
    const scenario = primaryContractExample(kind);
    scenario.primary.fluids.find(f => f.id === 'cement')!.recipe = composition(15.8);
    return scenario;
  };

  it('scales sacks, water and additives from the prepared volume of each placement', () => {
    const result = resolve(withRecipe());
    expect(result.diagnostics).toEqual([]);
    const recipe = result.placements[0];
    expect(recipe.error).toBeUndefined();
    expect(recipe.preparedBbl).toBeCloseTo(recipe.pumpedBbl, 12);
    expect(recipe.sacks94lb).toBeCloseTo(recipe.preparedBbl * FT3_PER_BBL / recipe.yieldFt3PerFt3Cement, 9);
    const water = recipe.rows.filter(r => r.type === 'water')
      .reduce((sum, r) => sum + (r.scaledVolumeGal ?? 0), 0);
    expect(recipe.mixWaterGal).toBeCloseTo(water, 9);
    expect(recipe.mixWaterGal).toBeGreaterThan(0);
  });

  it('prepares the mixing reserve without changing the volume the program pumps', () => {
    const plain = resolve(withRecipe()).placements[0];
    const scenario = withRecipe();
    scenario.primary.stages[0].placements[0].mixingReserveBbl = 10;
    const reserved = resolve(scenario).placements[0];
    expect(reserved.pumpedBbl).toBeCloseTo(plain.pumpedBbl, 12);
    expect(reserved.preparedBbl).toBeCloseTo(plain.preparedBbl + 10, 12);
    expect(reserved.sacks94lb).toBeCloseTo(plain.sacks94lb * reserved.preparedBbl / plain.preparedBbl, 9);
  });

  it('rounds sacks only for supply, leaving the simulated volume untouched', () => {
    const recipe = resolve(withRecipe()).placements[0];
    expect(recipe.supplySacks94).toBe(Math.ceil(recipe.sacks94lb));
    expect(recipe.supplySacks94).toBeGreaterThanOrEqual(recipe.sacks94lb);
    expect(recipe.preparedBbl).toBeCloseTo(recipe.sacks94lb * recipe.yieldFt3PerFt3Cement / FT3_PER_BBL, 9);
  });

  it('keeps measured and entered overrides with their origin and leaves the fluid untouched', () => {
    const scenario = withRecipe();
    const fluid = scenario.primary.fluids.find(f => f.id === 'cement')!;
    fluid.propertySources = {
      densityPpg: { source: 'measured', reference: 'Ensaio 42', measuredAt: '2026-09-17',
        originalValue: 16.1, originalUnit: 'lb/gal', temperatureC: 60 },
      n: { source: 'estimated' },
      kLbfSnFt2: { source: 'entered' },
    };
    const before = structuredClone(scenario);
    const recipe = resolve(scenario).placements[0];
    expect(recipe.overrides.map(o => o.field)).toEqual(['densityPpg', 'kLbfSnFt2']);
    expect(recipe.overrides[0].source).toEqual(fluid.propertySources.densityPpg);
    // Recalcular a receita não apaga nem reescreve o override do usuário.
    expect(scenario).toEqual(before);
    expect(resolve(scenario).placements[0].overrides).toEqual(recipe.overrides);
  });

  it('totals only products that share type and concentration unit', () => {
    const scenario = withRecipe('two-stage');
    scenario.primary.fluids.push({ ...scenario.primary.fluids.find(f => f.id === 'cement')!,
      id: 'cement-tail', name: 'cement-tail',
      recipe: composition(16.2, [{ name: 'Retardador teste', category: 'retarder', type: 'liquid', conc: 0.2 }]) });
    scenario.primary.stages[1].placements[0].fluidId = 'cement-tail';
    scenario.primary.stages[1].steps = scenario.primary.stages[1].steps.map(step =>
      step.kind === 'pump' && step.fluidId === 'cement' ? { ...step, fluidId: 'cement-tail' } : step);
    const result = resolve(scenario);
    expect(result.placements).toHaveLength(2);
    const cement = result.totals.filter(t => t.type === 'cement');
    expect(cement).toHaveLength(1);
    expect(cement[0].placementIds).toEqual(['cement-1', 'cement-2']);
    expect(cement[0].massLb).toBeCloseTo(result.placements.reduce((sum, p) =>
      sum + p.rows.filter(r => r.type === 'cement').reduce((s, r) => s + (r.scaledMassLb ?? 0), 0), 0), 9);
    const retarder = result.totals.filter(t => t.productName === 'Retardador teste');
    expect(retarder).toHaveLength(1);
    expect(retarder[0].placementIds).toEqual(['cement-2']);
  });

  it('reports a cement without composition instead of inventing quantities', () => {
    const result = resolve(primaryContractExample('conventional'));
    expect(result.diagnostics.map(d => d.code)).toEqual(['PRIMARY_RECIPE_MISSING']);
    expect(result.diagnostics[0].severity).toBe('warning');
    expect(result.placements[0].sacks94lb).toBe(0);
    expect(result.placements[0].rows).toEqual([]);
    expect(result.placements[0].error).toBeTruthy();
    expect(result.totals).toEqual([]);
  });
});
