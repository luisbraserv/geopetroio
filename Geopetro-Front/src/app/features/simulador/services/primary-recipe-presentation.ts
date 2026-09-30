import { GAL_TO_L, LB_TO_KG } from '../models/constantes';
import type { CementSlurryRecipeRow, SlurryInputs } from '../models/pasta.model';

/** Mesmas unidades de preparo do squeeze: sólidos em kg e líquidos em L. */
export function primaryRecipeQuantity(row: CementSlurryRecipeRow, scaled = false): { value: number; unit: 'kg' | 'L' } {
  const mass = ['cement', 'solidAdditive', 'salt', 'silica'].includes(row.type);
  return mass
    ? { value: (scaled ? row.scaledMassKg ?? (row.scaledMassLb ?? row.baseMassLb) * LB_TO_KG : row.baseMassLb * LB_TO_KG), unit: 'kg' }
    : { value: (scaled ? row.scaledVolumeGal ?? row.baseVolumeGal : row.baseVolumeGal) * GAL_TO_L, unit: 'L' };
}

export function primaryRecipeCode(row: CementSlurryRecipeRow, composition?: SlurryInputs): string {
  const additive = composition?.additivos.find(item => item.name === row.productName && item.ativo !== false);
  return additive ? additive.catalogId || 'Manual' : 'Composição';
}
