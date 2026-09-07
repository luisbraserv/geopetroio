import { AditivoCalc, AditivoEfeitos } from './aditivo.model';

export interface SlurryInputs {
  density: number;
  cementClass: string;
  waterSplitFresh: number;
  waterSplitSea: number;
  silica: number;
  nacl: number;
  bhct: number | null;
  bhst: number | null;
  surfaceTemp: number;
  additivos: { name: string; category: string; type: string; conc: number }[];
  surfacePressure?: number;
  mudWeightFront?: number;
  mudWeightBack?: number;
}

export interface SlurryDesign {
  density: number;
  yieldFt3: number;
  yieldFt3PerFt3Cement?: number;
  yieldLPerSk: number;
  fam: number;
  fac: number;
  famGalPerSk: number;
  facPct: number;
  famGpc: number;
  facGpc: number;
  waterVolumeGal: number;
  waterFreshLb: number;
  waterSeaLb: number;
  naclLb: number;
  retarder: number;
  accelerator: number;
  dispersant: number;
  fluidLoss: number;
  silica: number;
  surfacePressure: number;
  bhct: number;
  bhst: number;
  cementClassCv: number;
  cementClassLabel: string;
  silicaWt: number;
  adds: AditivoCalc[];
  _effects: AditivoEfeitos;
  _thickeningPressureWeightId: string;
  _thickeningChartSurfaceFallback?: number;
  _thickeningChartFallbackWhenZero: boolean;
  slurryRecipeResult?: SlurryRecipeResult;
}

export interface RecipeItem {
  name: string;
  conc: string;
  per: number;
  total: number;
  unit: string;
}

export interface SlurryRecipe {
  sacks: number;
  mixWaterTotalGal: number;
  recipeItems: RecipeItem[];
  baseRecipe?: SlurryRecipeBase;
  volumeRecipe?: SlurryRecipeByVolume;
  error?: string;
}

export interface CementSlurryRecipeRow {
  productName: string;
  type: 'cement' | 'water' | 'liquidAdditive' | 'solidAdditive' | 'salt' | 'silica' | 'other';
  concentration: string | number;
  concentrationUnit: string;
  baseMassLb: number;
  baseVolumeGal: number;
  absoluteVolumeGalLb: number;
  scaledMassLb?: number;
  scaledMassKg?: number;
  scaledVolumeGal?: number;
  scaledVolumeBbl?: number;
  operationalNote?: string;
}

export interface SlurryRecipeBase {
  densityPpg: number;
  densityCheckPpg?: number;
  yieldFt3PerFt3Cement: number;
  yieldLPerSk?: number;
  facGpc: number;
  famGpc: number;
  facPercent?: number;
  totalMassLb: number;
  totalVolumeGal: number;
  rows: CementSlurryRecipeRow[];
}

export interface SlurryRecipeByVolume {
  targetSlurryVolumeBbl: number;
  targetSlurryVolumeFt3: number;
  yieldFt3PerFt3Cement: number;
  cementVolumeFt3: number;
  sacks94lb: number;
  scaleFactor: number;
  totalCementLb: number;
  totalCementKg: number;
  totalMixWaterGal: number;
  totalMixWaterBbl: number;
  facGpc?: number;
  famGpc?: number;
  rows: CementSlurryRecipeRow[];
  error?: string;
}

export interface SlurryRecipeResult {
  baseRecipe: SlurryRecipeBase;
  volumeRecipe?: SlurryRecipeByVolume;
}

export interface Diagnostic {
  text: string;
  cls: 'ok' | 'warn' | 'danger' | 'info';
}
