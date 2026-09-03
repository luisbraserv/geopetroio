import { Injectable } from '@angular/core';
import { CoreCalculoService } from './core-calculo.service';
import { BBL_M, BBL_PER_M, HYDRO_M } from '../models/constantes';
import { SqueezeInputs, SqueezeGeometry, Perfuracao } from '../models/squeeze.model';
import { SlurryDesign } from '../models/pasta.model';

@Injectable({ providedIn: 'root' })
export class SqueezeCalculoService {

  constructor(private core: CoreCalculoService) {}

  calcVolumes(inputs: SqueezeInputs, perfs: Perfuracao[], slurryVolumeOverrideBbl?: number | null): SqueezeGeometry {
    const top = Math.min(inputs.sectionStartMD, inputs.sectionEndMD);
    const base = Math.max(inputs.sectionStartMD, inputs.sectionEndMD);
    const len = Math.max(0, base - top);
    const section = this.core.normalizeSectionValues(inputs.sectionStartMD, inputs.sectionEndMD, inputs.sectionStartTVD, inputs.sectionEndTVD);
    const wellFinal = this.core.getWellFinalGeometry(section, inputs.wellFinalMD, inputs.wellFinalTVD);

    const normalizedPerfs: Perfuracao[] = (perfs || [{ top: top + 20, base: top + 40 }]).map(p => ({
      top: this.core.clamp(Math.min(p.top, p.base), top, base),
      base: this.core.clamp(Math.max(p.top, p.base), top, base),
    }));

    const deepestPerf = normalizedPerfs.reduce((d, p) => Math.max(d, p.base), top);
    const shallowestPerf = normalizedPerfs.reduce((d, p) => Math.min(d, p.top), base);

    const oh = inputs.caliper || 8.5;
    const cOD = inputs.casingOD || 5.5;
    const cID = inputs.casingID || 4.778;
    const tOD = inputs.tubingOD || 2.875;
    const tID = inputs.tubingID || 2.441;

    const annulusOpen_m = BBL_PER_M * Math.max(0, oh * oh - cOD * cOD);
    const annulusCasing_m = BBL_PER_M * Math.max(0, cID * cID - tOD * tOD);
    const casingFull_m = BBL_PER_M * Math.max(0, cID * cID);
    const tubingID_m = BBL_PER_M * Math.max(0, tID * tID);

    const finalCapacity_m = casingFull_m > 0 ? casingFull_m : annulusCasing_m;
    const annulusVolume = finalCapacity_m * len;
    const expectedLoss = Math.max(0, inputs.expectedLoss || 0);
    // Volume total de pasta (bombeado). Quando o usuário escolhe "Receita por Volume",
    // o valor informado substitui o volume geométrico e a geometria é recalculada a partir dele.
    const geometricSlurryPhysicalVolume = annulusVolume;
    const hasSlurryVolumeOverride = slurryVolumeOverrideBbl != null && slurryVolumeOverrideBbl > 0;
    const slurryPhysicalVolume = hasSlurryVolumeOverride
      ? slurryVolumeOverrideBbl
      : geometricSlurryPhysicalVolume;
    const slurryTotal = slurryPhysicalVolume + expectedLoss;
    const cementPhysicalHeight = finalCapacity_m > 0 ? slurryPhysicalVolume / finalCapacity_m : 0;
    const workVolumeBbl = slurryPhysicalVolume;
    const capWithTubing = annulusCasing_m + tubingID_m;
    // Altura do cimento com a coluna imersa (balanceado): pasta ocupa o anular
    // casing×tubing E o interior da coluna na mesma altura (capWithTubing).
    const cementHeightWithTubing = capWithTubing > 0 ? slurryPhysicalVolume / capWithTubing : 0;
    // Topos do cimento (MD), medidos da base da seção (base do cimento), em 4 estados:
    // antes/depois de injetar na formação × com/sem coluna (tubing) no poço.
    // - com coluna (imersa): pasta no anular + interior da coluna (capWithTubing)
    // - sem coluna: pasta redistribuída no revestimento cheio (finalCapacity_m)
    // - depois: desconta o volume squeezado para a formação (expectedLoss)
    const slurryAfterInjection = Math.max(0, slurryPhysicalVolume - expectedLoss);
    const topCementImmersedMD = Math.max(0, base - cementHeightWithTubing);                                                                 // antes, c/ tubing
    const topCementAfterPullMD = finalCapacity_m > 0 ? Math.max(0, base - slurryPhysicalVolume / finalCapacity_m) : base;                   // antes, s/ tubing
    const topCementImmersedAfterInjectionMD = capWithTubing > 0 ? Math.max(0, base - slurryAfterInjection / capWithTubing) : base;          // depois, c/ tubing
    const topCementAfterInjectionMD = finalCapacity_m > 0 ? Math.max(0, base - slurryAfterInjection / finalCapacity_m) : base;             // depois, s/ tubing
    const mwFront = Math.max(0, inputs.mudWeightFront || 9.5);
    const mwBack = Math.max(0, inputs.mudWeightBack || 9.5);
    const backPhysicalHeight = Math.max(0, inputs.backSpacerHeight || 0);
    // Espaçador de trás fica dentro da coluna, apoiado sobre o topo do cimento imerso
    const topBackSpacerMD = Math.max(0, topCementImmersedMD - backPhysicalHeight);
    const calculatedDisplacementVolume = tubingID_m * topBackSpacerMD;
    const displacementVolume = (inputs.volumeDeslocamentoBbl != null && inputs.volumeDeslocamentoBbl > 0)
      ? inputs.volumeDeslocamentoBbl
      : calculatedDisplacementVolume;
    const frontPhysicalHeight = mwFront > 0 ? backPhysicalHeight * (mwBack / mwFront) : backPhysicalHeight;
    const frontPhysicalVolumeBbl = annulusCasing_m * frontPhysicalHeight;
    const backPhysicalVolumeBbl = tubingID_m * backPhysicalHeight;

    return {
      top, base,
      wellFinalMD: wellFinal.wellFinalMD,
      wellFinalTVD: wellFinal.wellFinalTVD,
      len,
      perfs: normalizedPerfs,
      deepestPerf,
      shallowestPerf,
      annulusOpen_m, annulusCasing_m, casingFull_m, finalCapacity_m, tubingID_m,
      annulusVolume, workVolumeBbl,
      cementHeightWithTubing,
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
      cementPhysicalTopMD: top,
      cementPhysicalBaseMD: top + cementPhysicalHeight,
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

  calcFractureGradient(geom: SqueezeGeometry, inputs: SqueezeInputs): { fracPsi: number; porePsi: number; squeezePsi: number } {
    const K = HYDRO_M;
    const section = this.core.normalizeSectionValues(inputs.sectionStartMD, inputs.sectionEndMD, inputs.sectionStartTVD, inputs.sectionEndTVD);
    const deepTVD = section.tvdAt(geom.deepestPerf);
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
    const topCemTVD = this.core.clamp(section.tvdAt(geom.topCementImmersedMD), 0, deepTVD);
    const topBackTVD = this.core.clamp(section.tvdAt(Math.max(0, geom.topCementImmersedMD - geom.backPhysicalHeight)), 0, topCemTVD);
    const hydroPsi = K * (
      mwDesloc * topBackTVD +
      mwBack * (topCemTVD - topBackTVD) +
      cementDen * (deepTVD - topCemTVD)
    );
    const squeezePsi = Math.max(0, inputs.pressaoOperacao || 0) + hydroPsi;
    return { fracPsi, porePsi, squeezePsi };
  }
}