import { Injectable } from '@angular/core';
import { CoreCalculoService } from './core-calculo.service';
import { BBL_PER_M, HYDRO_M } from '../models/constantes';
import { SqueezeInputs, SqueezeGeometry, Perfuracao } from '../models/squeeze.model';
import { OperationInterval, WellGeometry } from '../models/well-geometry.model';
import { WellGeometryService } from './well-geometry.service';

export interface SqueezeWellContext {
  geometry: WellGeometry;
  interval: OperationInterval;
}

@Injectable({ providedIn: 'root' })
export class SqueezeCalculoService {

  constructor(
    private core: CoreCalculoService,
    private wellGeo: WellGeometryService = new WellGeometryService(),
  ) {}

  calcVolumes(inputs: SqueezeInputs, perfs: Perfuracao[], slurryVolumeOverrideBbl?: number | null, well?: SqueezeWellContext | null): SqueezeGeometry {
    const top = well ? well.interval.topMD : Math.min(inputs.sectionStartMD, inputs.sectionEndMD);
    const base = well ? well.interval.bottomMD : Math.max(inputs.sectionStartMD, inputs.sectionEndMD);
    const len = Math.max(0, base - top);
    const section = this.core.normalizeSectionValues(inputs.sectionStartMD, inputs.sectionEndMD, inputs.sectionStartTVD, inputs.sectionEndTVD);
    const wellFinal = this.core.getWellFinalGeometry(section, inputs.wellFinalMD, inputs.wellFinalTVD);

    // Canhoneados: só a ordem topo/base é normalizada. Um intervalo fora do poço
    // NÃO é mais puxado para dentro em silêncio — vira erro visível na tela,
    // levantado pelo WellGeometryService.validatePerforations().
    const normalizedPerfs: Perfuracao[] = (perfs?.length ? perfs : [{ top: top + 20, base: top + 40 }]).map(p => ({
      top: Math.min(p.top, p.base),
      base: Math.max(p.top, p.base),
    }));

    const deepestPerf = Math.max(...normalizedPerfs.map(p => p.base));
    const shallowestPerf = Math.min(...normalizedPerfs.map(p => p.top));

    const baseSegment = well ? this.wellGeo.getGeometrySegments(well.geometry, top, base).at(-1) : undefined;
    const oh = baseSegment ? baseSegment.holeDiameterIn : inputs.caliper || 8.5;
    const cOD = baseSegment ? baseSegment.casingOdIn ?? 0 : inputs.casingOD || 5.5;
    const cID = baseSegment ? baseSegment.innerDiameterIn : inputs.casingID || 4.778;
    const tOD = inputs.tubingOD || 2.875;
    const tID = inputs.tubingID || 2.441;

    const holeResolver = this.wellGeo.capacityResolver({ kind: 'open' });
    const annResolver = this.wellGeo.capacityResolver({ kind: 'annulus', pipeOD: tOD });
    const pipeResolver = this.wellGeo.capacityResolver({ kind: 'pipe', pipeID: tID });
    const withTubingResolver = this.wellGeo.capacityResolver({ kind: 'annulusPlusPipe', pipeOD: tOD, pipeID: tID });

    // Capacidades pontuais são referências na base; volumes usam todos os trechos.
    const annulusOpen_m = BBL_PER_M * Math.max(0, oh * oh - cOD * cOD);
    const annulusCasing_m = well
      ? this.wellGeo.getCapacityAtMD(well.geometry, base, { kind: 'annulus', pipeOD: tOD })
      : BBL_PER_M * Math.max(0, cID * cID - tOD * tOD);
    const casingFull_m = well
      ? this.wellGeo.getCapacityAtMD(well.geometry, base, { kind: 'open' })
      : BBL_PER_M * Math.max(0, cID * cID);
    const tubingID_m = BBL_PER_M * Math.max(0, tID * tID);

    const finalCapacity_m = casingFull_m > 0 ? casingFull_m : annulusCasing_m;
    const annulusVolume = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, top, base, holeResolver)
      : finalCapacity_m * len;
    const expectedLoss = Math.max(0, inputs.expectedLoss || 0);
    // Volume total de pasta (bombeado). Quando o usuário escolhe "Receita por Volume",
    // o valor informado substitui o volume geométrico e a geometria é recalculada a partir dele.
    const geometricSlurryPhysicalVolume = annulusVolume;
    const hasSlurryVolumeOverride = slurryVolumeOverrideBbl != null && slurryVolumeOverrideBbl > 0;
    const slurryPhysicalVolume = hasSlurryVolumeOverride
      ? slurryVolumeOverrideBbl
      : geometricSlurryPhysicalVolume;
    const slurryTotal = slurryPhysicalVolume + expectedLoss;
    const workVolumeBbl = slurryPhysicalVolume;
    const capWithTubing = annulusCasing_m + tubingID_m;
    // Altura do cimento com a coluna imersa (balanceado): pasta ocupa o anular
    // casing×tubing E o interior da coluna na mesma altura (capWithTubing).
    const topFromVolume = (volume: number, withTubing: boolean): number => {
      if (well) return this.wellGeo.calculateTopFromVolume(
        well.geometry, base, volume, withTubing ? withTubingResolver : holeResolver,
      ).topMD;
      const capacity = withTubing ? capWithTubing : finalCapacity_m;
      return capacity > 0 ? Math.max(0, base - volume / capacity) : base;
    };
    // Topos do cimento (MD), medidos da base da seção (base do cimento), em 4 estados:
    // antes/depois de injetar na formação × com/sem coluna (tubing) no poço.
    // - com coluna (imersa): pasta no anular + interior da coluna (capWithTubing)
    // - sem coluna: pasta redistribuída no revestimento cheio (finalCapacity_m)
    // - depois: desconta o volume squeezado para a formação (expectedLoss)
    const slurryAfterInjection = Math.max(0, slurryPhysicalVolume - expectedLoss);
    const topCementImmersedMD = topFromVolume(slurryPhysicalVolume, true);
    const topCementAfterPullMD = topFromVolume(slurryPhysicalVolume, false);
    const topCementImmersedAfterInjectionMD = topFromVolume(slurryAfterInjection, true);
    const topCementAfterInjectionMD = topFromVolume(slurryAfterInjection, false);
    const cementHeightWithTubing = well ? base - topCementImmersedMD
      : capWithTubing > 0 ? slurryPhysicalVolume / capWithTubing : 0;
    const cementPhysicalHeight = well ? base - topCementAfterPullMD
      : finalCapacity_m > 0 ? slurryPhysicalVolume / finalCapacity_m : 0;
    const mwFront = Math.max(0, inputs.mudWeightFront || 9.5);
    const mwBack = Math.max(0, inputs.mudWeightBack || 9.5);
    const backPhysicalHeight = Math.max(0, inputs.backSpacerHeight || 0);
    // Espaçador de trás fica dentro da coluna, apoiado sobre o topo do cimento imerso
    const topBackSpacerMD = Math.max(0, topCementImmersedMD - backPhysicalHeight);
    const calculatedDisplacementVolume = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, 0, topBackSpacerMD, pipeResolver)
      : tubingID_m * topBackSpacerMD;
    const displacementVolume = (inputs.volumeDeslocamentoBbl != null && inputs.volumeDeslocamentoBbl > 0)
      ? inputs.volumeDeslocamentoBbl
      : calculatedDisplacementVolume;
    const frontPhysicalHeight = mwFront > 0 ? backPhysicalHeight * (mwBack / mwFront) : backPhysicalHeight;
    const frontPhysicalVolumeBbl = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, Math.max(0, topCementImmersedMD - frontPhysicalHeight), topCementImmersedMD, annResolver)
      : annulusCasing_m * frontPhysicalHeight;
    const backPhysicalVolumeBbl = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, topBackSpacerMD, topCementImmersedMD, pipeResolver)
      : tubingID_m * backPhysicalHeight;

    return {
      top, base,
      wellFinalMD: well ? well.geometry.finalMD : wellFinal.wellFinalMD,
      wellFinalTVD: well ? well.geometry.finalTVD : wellFinal.wellFinalTVD,
      len,
      perfs: normalizedPerfs,
      deepestPerf,
      shallowestPerf,
      annulusOpen_m, annulusCasing_m, casingFull_m, finalCapacity_m, tubingID_m,
      annulusVolume, workVolumeBbl,
      cementHeightWithTubing,
      ...(well ? {
        cementVolumeTubingBbl: this.wellGeo.calculateVolumeBetween(well.geometry, topCementImmersedMD, base, pipeResolver),
        cementVolumeAnnulusBbl: this.wellGeo.calculateVolumeBetween(well.geometry, topCementImmersedMD, base, annResolver),
        topDisplacementAfterPullMD: this.wellGeo.calculateTopFromVolume(
          well.geometry, topCementAfterPullMD,
          displacementVolume + frontPhysicalVolumeBbl + backPhysicalVolumeBbl, holeResolver,
        ).topMD,
      } : {}),
      cementHeightWithoutTubing: cementPhysicalHeight,
      topCementImmersedMD,
      topCementAfterPullMD,
      topCementImmersedAfterInjectionMD,
      topCementAfterInjectionMD,
      displacementVolume,
      expectedLoss, slurryTotal,
      slurryPumpedVolumeBbl: slurryTotal,
      slurryInjectedVolumeBbl: expectedLoss,
      slurryPhysicalVolumeBbl: slurryPhysicalVolume,
      cementPhysicalHeight,
      cementPhysicalTopMD: well ? topCementAfterPullMD : top,
      cementPhysicalBaseMD: well ? base : top + cementPhysicalHeight,
      cementPhysicalCapacityBblM: finalCapacity_m,
      washVolFront: frontPhysicalVolumeBbl,
      washFrontHeight: frontPhysicalHeight,
      frontOperationalHeight: frontPhysicalHeight,
      backOperationalHeight: backPhysicalHeight,
      frontPhysicalVolumeBbl, frontPhysicalHeight,
      volBackSpacer: backPhysicalVolumeBbl,
      backPhysicalVolumeBbl, backPhysicalHeight,
      displacementHydroBalance: null,
      operationalDisplacementVolumeBbl: displacementVolume,
      oh, cOD, cID, tOD, tID,
    };
  }

  calcFractureGradient(geom: SqueezeGeometry, inputs: SqueezeInputs, well?: SqueezeWellContext | null): { fracPsi: number; porePsi: number; squeezePsi: number } {
    const K = HYDRO_M;
    const section = this.core.normalizeSectionValues(inputs.sectionStartMD, inputs.sectionEndMD, inputs.sectionStartTVD, inputs.sectionEndTVD);
    const tvdAt = (md: number): number => well ? this.wellGeo.mdToTvd(well.geometry, md) : section.tvdAt(md);
    const deepTVD = tvdAt(geom.deepestPerf);
    // Pressão de fratura é propriedade da formação — a pressão de superfície
    // entra do lado do BHP na comparação, não no limite de fratura.
    const fracPsi = K * (inputs.fracGrad || 16.0) * deepTVD;
    const porePsi = K * (inputs.poreGrad || 9.0) * deepTVD;
    // Pressão de fundo na injeção = pressão de operação aplicada na superfície
    // + hidrostática da coluna no estado final do deslocamento
    // (deslocamento → água atrás → pasta, até a TVD do canhoneado mais profundo).
    const mwDesloc = Math.max(0, inputs.displacementWeight || inputs.completionWeight || 9.5);
    const mwBack = Math.max(0, inputs.mudWeightBack || 9.5);
    const cementDen = Math.max(0, inputs.density || 15.8);
    const topCemTVD = this.core.clamp(tvdAt(geom.topCementImmersedMD), 0, deepTVD);
    const topBackTVD = this.core.clamp(tvdAt(Math.max(0, geom.topCementImmersedMD - geom.backPhysicalHeight)), 0, topCemTVD);
    const hydroPsi = K * (
      mwDesloc * topBackTVD +
      mwBack * (topCemTVD - topBackTVD) +
      cementDen * (deepTVD - topCemTVD)
    );
    const squeezePsi = Math.max(0, inputs.pressaoOperacao || 0) + hydroPsi;
    return { fracPsi, porePsi, squeezePsi };
  }
}
