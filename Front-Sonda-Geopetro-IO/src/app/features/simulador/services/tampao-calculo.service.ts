import { Injectable } from '@angular/core';
import { CoreCalculoService } from './core-calculo.service';
import { BBL_M, HYDRO_M } from '../models/constantes';
import { TampaoInputs, PlugGeometry, PressureProfile, PressurePoint } from '../models/tampao.model';
import { SlurryDesign } from '../models/pasta.model';

@Injectable({ providedIn: 'root' })
export class TampaoCalculoService {

  constructor(private core: CoreCalculoService) {}

  calcPlug(inputs: TampaoInputs, cementVolumeOverrideBbl?: number | null): PlugGeometry {
    const hID = inputs.holeID || 8.535;
    const pOD = inputs.pipeOD || 3.5;
    const pID = inputs.pipeID || 2.764;

    const section = this.core.normalizeSectionValues(
      inputs.sectionStartMD, inputs.sectionEndMD,
      inputs.sectionStartTVD, inputs.sectionEndTVD
    );
    const wellFinal = this.core.getWellFinalGeometry(section, inputs.wellFinalMD, inputs.wellFinalTVD);

    // pTop = topo da seção, pBase = base da seção (base do tampão)
    const pTop = section.startMD;
    const pBase = section.endMD;
    const sEnd = wellFinal.wellFinalMD;

    // Capacidades (bbl/m)
    const capAnn  = BBL_M * Math.max(0, hID * hID - pOD * pOD);  // anular com tubing
    const capPipe = BBL_M * Math.max(0, pID * pID);               // interior do tubing
    const capHole = BBL_M * Math.max(0, hID * hID);               // poço aberto (sem tubing)
    const capWithPipe = capAnn + capPipe;

    // Altura da seção (zona de trabalho)
    const plugHeight = Math.max(0, pBase - pTop);

    // Volume total de pasta = capacidade do poço aberto × altura da seção
    // (é o volume que precisa ser preenchido sem tubing)
    const geometricVolCementTotal = capHole * plugHeight;
    // Quando o usuário escolhe "Receita por Volume", o volume informado substitui
    // o volume geométrico e toda a geometria (alturas/topos) é recalculada a partir dele.
    const volCementTotal = (cementVolumeOverrideBbl != null && cementVolumeOverrideBbl > 0)
      ? cementVolumeOverrideBbl
      : geometricVolCementTotal;

    // ── Estado 1: Com tubing ──
    // Htci = Vp / (Can + Ctp)
    const cementHeightWithTubing = capWithPipe > 0 ? volCementTotal / capWithPipe : 0;
    // topoCimentoComTubing = base - Htci
    const topCementWithTubing = pBase - cementHeightWithTubing;
    const volCementAnn  = capAnn  * cementHeightWithTubing;
    const volCementPipe = capPipe * cementHeightWithTubing;

    // Água atrás: altura definida pelo usuário, no interior do tubing
    const mwBack  = Math.max(0, inputs.mudWeightBack  || 9.5);
    const mwFront = Math.max(0, inputs.mudWeightFront || 9.5);
    const backPhysicalHeight  = Math.max(0, inputs.backSpacerHeight || 0);
    // topoAguaAtras = topoCimentoComTubing - Hfa
    const topBackSpacer = topCementWithTubing - backPhysicalHeight;
    const backPhysicalVolumeBbl = capPipe * backPhysicalHeight;

    // Água frente: altura balanceada hidraulicamente, no anular
    // Hff = (pesoAtrás / pesoFrente) * Hfa
    const frontPhysicalHeight = mwFront > 0 ? backPhysicalHeight * (mwBack / mwFront) : backPhysicalHeight;
    // topoAguaFrente = topoCimentoComTubing - Hff
    const topFrontSpacer = topCementWithTubing - frontPhysicalHeight;
    const frontPhysicalVolumeBbl = capAnn * frontPhysicalHeight;

    // Fluido de deslocamento dentro do tubing: de 0 até topoAguaAtras
    const volDisplacement = capPipe * Math.max(0, topBackSpacer);

    // ── Estado 2: Sem tubing ──
    // Hfinal = Vp / capHole
    const cementHeightWithoutTubing = capHole > 0 ? volCementTotal / capHole : plugHeight;
    // topoCimentoFinal = base - Hfinal
    const topCementWithoutTubing = pBase - cementHeightWithoutTubing;

    // Água frente final no estado sem tubing (no poço aberto)
    const frontHeightNoTubing = frontPhysicalHeight; // mesma altura calculada acima
    const topFrontNoTubing = topCementWithoutTubing - frontHeightNoTubing;

    return {
      hID, pOD, pID, pTop, pBase,
      pipeDep: pBase,
      sEnd,
      spH: backPhysicalHeight,
      wellFinalMD: wellFinal.wellFinalMD,
      wellFinalTVD: wellFinal.wellFinalTVD,
      capAnn, capPipe, capHole, capFinal: capHole,
      plugHeight, lenAnnCement: cementHeightWithTubing,
      volCementAnn, volCementPipe, volCementTotal,
      workVolumeBbl: volCementTotal,
      cementHeightWithTubing,
      cementHeightWithoutTubing,
      // topos calculados corretamente
      topCementWithTubing,
      topCementWithoutTubing,
      topBackSpacer,
      topFrontSpacer,
      topFrontNoTubing,
      volWashAnn: frontPhysicalVolumeBbl,
      volWashTotal: frontPhysicalVolumeBbl,
      volBackSpacer: backPhysicalVolumeBbl,
      volDisplacement,
      frontOperationalHeight: frontPhysicalHeight,
      backOperationalHeight: backPhysicalHeight,
      frontPhysicalVolumeBbl, frontPhysicalHeight,
      cementPhysicalVolumeBbl: volCementTotal,
      cementPhysicalCapacityBblM: capHole,
      cementPhysicalHeight: cementHeightWithoutTubing,
      backPhysicalVolumeBbl, backPhysicalHeight,
      // compat legados
      topCementInPipe: topCementWithTubing,
      topWashInPipe: topBackSpacer,
      displacementHydroBalance: null,
      operationalDisplacementVolumeBbl: volDisplacement,
    };
  }

  calcPressureProfile(plug: PlugGeometry, slurry: SlurryDesign, inputs: TampaoInputs): PressureProfile {
    const fracGrad = inputs.fracGrad || 16.0;
    const poreGrad = inputs.poreGrad || 9.0;
    const K = HYDRO_M;
    const mwComp = inputs.completionWeight || 9.5;
    const mwDesloc = inputs.displacementWeight || mwComp;
    const mwFront = inputs.mudWeightFront || 9.5;
    const mwBack = inputs.mudWeightBack || 9.5;
    const cementDen = slurry.density || 15.8;
    const section = this.core.normalizeSectionValues(
      inputs.sectionStartMD, inputs.sectionEndMD,
      inputs.sectionStartTVD, inputs.sectionEndTVD,
    );

    // Conversão MD → TVD: linear até o início da seção, razão da seção dali em diante
    const ratioAbove = section.startMD > 0 ? section.startTVD / section.startMD : 1;
    const ratioSection = section.mdToTvdRatio > 0 ? section.mdToTvdRatio : 1;
    const mdToTvd = (md: number): number => md <= section.startMD
      ? md * ratioAbove
      : section.startTVD + (md - section.startMD) * ratioSection;
    const tvdToMd = (tvd: number): number => tvd <= section.startTVD
      ? (ratioAbove > 0 ? tvd / ratioAbove : tvd)
      : section.startMD + (tvd - section.startTVD) / ratioSection;

    // Fronteiras das camadas (MD → TVD). Estado: coluna imersa, pasta balanceada.
    const topCemAnnTVD = mdToTvd(Math.max(0, plug.topCementWithTubing));
    const topFrontTVD = mdToTvd(Math.max(0, plug.topFrontSpacer));
    const topBackTVD = mdToTvd(Math.max(0, plug.topBackSpacer));
    const baseTVD = mdToTvd(plug.pBase);
    const totalTVD = baseTVD;

    // Integra a hidrostática de uma pilha de camadas [topoTVD→baseTVD, densidade]
    const stackPsi = (tvd: number, layers: Array<{ from: number; to: number; den: number }>): number => {
      let psi = 0;
      for (const layer of layers) {
        const h = Math.max(0, Math.min(tvd, layer.to) - layer.from);
        psi += K * layer.den * h;
      }
      return psi;
    };

    // Anular (fora da coluna), de cima para baixo: fluido do poço → fl. frente → pasta.
    // Abaixo da base do tampão volta a ser o fluido do poço.
    const annulusLayers = [
      { from: 0, to: topFrontTVD, den: mwComp },
      { from: topFrontTVD, to: topCemAnnTVD, den: mwFront },
      { from: topCemAnnTVD, to: baseTVD, den: cementDen },
      { from: baseTVD, to: Number.POSITIVE_INFINITY, den: mwComp },
    ];
    // Coluna (dentro do tubing), de cima para baixo: deslocamento → água atrás → pasta
    const insideLayers = [
      { from: 0, to: topBackTVD, den: mwDesloc },
      { from: topBackTVD, to: topCemAnnTVD, den: mwBack },
      { from: topCemAnnTVD, to: baseTVD, den: cementDen },
      { from: baseTVD, to: Number.POSITIVE_INFINITY, den: mwComp },
    ];

    const points: PressurePoint[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const tvd = totalTVD * i / steps;
      const fracPsi = K * fracGrad * tvd;
      const porePsi = K * poreGrad * tvd;
      const psiInside = stackPsi(tvd, insideLayers);
      const bhpAnn = stackPsi(tvd, annulusLayers);

      const ecdPpg = tvd > 0 ? bhpAnn / (K * tvd) : mwFront;
      // Free fall: propensão da coluna de cimento cair antes do puxamento (zona de cimento)
      const inCementZone = tvd >= topCemAnnTVD && tvd <= baseTVD;
      const freeFallPct = inCementZone ? Math.max(0, Math.min(100, ((cementDen - mwBack) / cementDen) * 100)) : 0;

      const md = tvdToMd(tvd);
      points.push({
        md, tvd, psiInside, psiOutside: bhpAnn, fracPsi, porePsi,
        ecdInside: tvd > 0 ? psiInside / (K * tvd) : mwComp,
        ecdOutside: ecdPpg,
        bhpAnn, ecdPpg, freeFallPct,
      });
    }

    return { points, fracGradPpg: fracGrad, poreGradPpg: poreGrad };
  }

}

// Extend PlugGeometry locally for slurryDensity
declare module '../models/tampao.model' {
  interface PlugGeometry { slurryDensity?: number; }
}
