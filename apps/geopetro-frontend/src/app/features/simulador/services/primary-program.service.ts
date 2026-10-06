import { Injectable, inject } from '@angular/core';
import type { PrimaryConfiguration, PrimaryReference } from '../models/primary-cementing.model';
import type { PrimaryStageGeometryResolution } from '../models/primary-geometry.model';
import type { WellGeometry, WellGeometryIssue } from '../models/well-geometry.model';
import type { PrimaryHydraulicsResult } from '../models/primary-hydraulics.model';
import type { PrimaryTransportResult } from '../models/primary-transport.model';
import type { PrimaryProgramVolumes, PrimaryRecipeResolution } from '../models/primary-volumes.model';
import { CementSlurryRecipeService } from './cement-slurry-recipe.service';
import { SlurryCalculoService } from './slurry-calculo.service';
import { resolvePrimaryRecipes } from './primary-recipes';
import { createPrimaryRateModel, resolvePrimaryHydraulics } from './primary-hydraulics';
import { simulatePrimaryTransport } from './primary-transport';
import { resolvePrimaryProgramVolumes } from './primary-volumes';
import { WellGeometryService } from './well-geometry.service';

export interface PrimaryProgramResolution {
  geometry: PrimaryStageGeometryResolution;
  volumes: PrimaryProgramVolumes;
  recipes: PrimaryRecipeResolution;
  /** null quando o dimensionamento não fecha: não se transporta programa inválido. */
  transport: PrimaryTransportResult | null;
  /** null sem transporte válido: não se calcula pressão sobre parcelas inexistentes. */
  hydraulics: PrimaryHydraulicsResult | null;
}

/** Resultado vazio explícito: sem executar o motor na ausência de uma fase válida. */
export function unavailablePrimaryProgram(issues: WellGeometryIssue[]): PrimaryProgramResolution {
  return {
    geometry: { stages: [], accessories: [], inventoryCapacities: null, issues,
      fullGeometry: { segments: [], capacities: null, issues } },
    volumes: { stages: [], totalPumpedBbl: 0, totalCementPlannedBbl: 0,
      totalCementProgrammedBbl: 0, totalTimeMin: 0, valid: false,
      diagnostics: issues.map(issue => ({ code: issue.code, message: issue.message,
        severity: 'error', category: 'configuration' })) },
    recipes: { placements: [], totals: [], diagnostics: [] }, transport: null, hydraulics: null,
  };
}

/**
 * P4–P6: dimensionamento, transporte das parcelas e hidráulica da primária,
 * com a queda livre de §7.5 resolvida pelo transporte conservativo com vazio.
 */
@Injectable({ providedIn: 'root' })
export class PrimaryProgramService {
  private readonly wellGeometry = inject(WellGeometryService);
  private readonly slurry = inject(SlurryCalculoService);
  private readonly recipes = inject(CementSlurryRecipeService);

  resolve(geometry: WellGeometry, primary: PrimaryConfiguration,
    references: PrimaryReference[] = []): PrimaryProgramResolution {
    const stageGeometry = this.wellGeometry.resolvePrimaryStageGeometry(geometry, primary);
    const volumes = resolvePrimaryProgramVolumes(primary, stageGeometry);
    const tvdOf = this.wellGeometry.mdToTvdResolver(geometry);
    // Transporte e hidráulica acoplados: a vazão de saída vem do balanço de
    // pressão a cada passo, o que resolve a queda livre em vez de interrompê-la.
    const transport = volumes.valid
      ? simulatePrimaryTransport(primary, stageGeometry, volumes,
        primary.target ? { rateModel: createPrimaryRateModel(primary, stageGeometry, tvdOf) } : {})
      : null;
    return { geometry: stageGeometry, volumes,
      recipes: resolvePrimaryRecipes(primary, volumes, {
        design: inputs => this.slurry.calculateSlurryDesign(inputs),
        byVolume: (design, volumeBbl) => this.recipes.calculateRecipeByVolume(design, volumeBbl),
        manual: (design, volume, fac, fam, yieldFt3) => this.recipes.buildSlurryRecipeByFacFam(design, volume, fac, fam, yieldFt3),
      }),
      transport,
      hydraulics: transport && transport.status !== 'invalid'
        ? resolvePrimaryHydraulics(primary, stageGeometry, transport, tvdOf, references)
        : null };
  }
}
