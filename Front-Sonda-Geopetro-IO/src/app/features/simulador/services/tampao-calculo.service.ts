import { Injectable } from '@angular/core';
import { CoreCalculoService } from './core-calculo.service';
import { BBL_M, HYDRO_M } from '../models/constantes';
import { TampaoInputs, PlugGeometry, PressureProfile, PressurePoint } from '../models/tampao.model';
import { SlurryDesign } from '../models/pasta.model';
import { OperationInterval, WellGeometry } from '../models/well-geometry.model';
import { WellGeometryService } from './well-geometry.service';

/**
 * Poço + intervalo da operação. Quando informado, a geometria manda: a base do
 * tampão é interval.bottomMD (não mais a base de uma "seção"), e as alturas
 * saem do consumo de volume trecho a trecho — correto mesmo quando o tampão
 * atravessa fases de diâmetros diferentes.
 */
export interface PlugWellContext {
  geometry: WellGeometry;
  interval: OperationInterval;
}

@Injectable({ providedIn: 'root' })
export class TampaoCalculoService {

  constructor(
    private core: CoreCalculoService,
    private wellGeo: WellGeometryService,
  ) {}

  calcPlug(inputs: TampaoInputs, cementVolumeOverrideBbl?: number | null, well?: PlugWellContext | null): PlugGeometry {
    const hID = inputs.holeID || 8.535;
    const pOD = inputs.pipeOD || 3.5;
    const pID = inputs.pipeID || 2.764;

    const section = this.core.normalizeSectionValues(
      inputs.sectionStartMD, inputs.sectionEndMD,
      inputs.sectionStartTVD, inputs.sectionEndTVD
    );
    const wellFinal = this.core.getWellFinalGeometry(section, inputs.wellFinalMD, inputs.wellFinalTVD);

    // A âncora do tampão é o intervalo da OPERAÇÃO, não a estrutura do poço.
    const pTop = well ? Math.min(well.interval.topMD, well.interval.bottomMD) : section.startMD;
    const pBase = well ? Math.max(well.interval.topMD, well.interval.bottomMD) : section.endMD;
    const sEnd = well ? well.geometry.finalMD : wellFinal.wellFinalMD;

    // Resolvers de capacidade: com geometria cadastrada eles variam por trecho;
    // sem ela, caem no diâmetro único informado (comportamento legado).
    const annResolver = this.wellGeo.capacityResolver({ kind: 'annulus', pipeOD: pOD });
    const pipeResolver = this.wellGeo.capacityResolver({ kind: 'pipe', pipeID: pID });
    const holeResolver = this.wellGeo.capacityResolver({ kind: 'open' });
    const withPipeResolver = this.wellGeo.capacityResolver({ kind: 'annulusPlusPipe', pipeOD: pOD, pipeID: pID });

    // Capacidades (bbl/m) — com várias fases, são as da BASE do tampão (referência)
    const capAnn = well ? this.wellGeo.getCapacityAtMD(well.geometry, pBase, { kind: 'annulus', pipeOD: pOD }) : BBL_M * Math.max(0, hID * hID - pOD * pOD);
    const capPipe = well ? this.wellGeo.getCapacityAtMD(well.geometry, pBase, { kind: 'pipe', pipeID: pID }) : BBL_M * Math.max(0, pID * pID);
    const capHole = well ? this.wellGeo.getCapacityAtMD(well.geometry, pBase, { kind: 'open' }) : BBL_M * Math.max(0, hID * hID);
    const capWithPipe = capAnn + capPipe;

    // Altura da seção (zona de trabalho)
    const plugHeight = Math.max(0, pBase - pTop);

    // Volume total de pasta = o que preenche o intervalo sem tubing. Com várias
    // fases isso é a soma trecho a trecho, não capacidade × altura.
    const geometricVolCementTotal = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, pTop, pBase, holeResolver)
      : capHole * plugHeight;
    // Quando o usuário escolhe "Receita por Volume", o volume informado substitui
    // o volume geométrico e toda a geometria (alturas/topos) é recalculada a partir dele.
    const volCementTotal = (cementVolumeOverrideBbl != null && cementVolumeOverrideBbl > 0)
      ? cementVolumeOverrideBbl
      : geometricVolCementTotal;

    // ── Estado 1: Com tubing ──
    // Sobe da base consumindo o volume trecho a trecho (anular + interior da coluna).
    // Numa geometria de diâmetro único isso é idêntico a Htci = Vp / (Can + Ctp).
    const topCementWithTubing = well
      ? this.wellGeo.calculateTopFromVolume(well.geometry, pBase, volCementTotal, withPipeResolver).topMD
      : pBase - (capWithPipe > 0 ? volCementTotal / capWithPipe : 0);
    const cementHeightWithTubing = pBase - topCementWithTubing;
    const volCementAnn = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, topCementWithTubing, pBase, annResolver)
      : capAnn * cementHeightWithTubing;
    const volCementPipe = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, topCementWithTubing, pBase, pipeResolver)
      : capPipe * cementHeightWithTubing;

    // Água atrás: altura definida pelo usuário, no interior do tubing
    const mwBack  = Math.max(0, inputs.mudWeightBack  || 9.5);
    const mwFront = Math.max(0, inputs.mudWeightFront || 9.5);
    const backPhysicalHeight  = Math.max(0, inputs.backSpacerHeight || 0);
    // topoAguaAtras = topoCimentoComTubing - Hfa
    const topBackSpacer = topCementWithTubing - backPhysicalHeight;
    const backPhysicalVolumeBbl = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, topBackSpacer, topCementWithTubing, pipeResolver)
      : capPipe * backPhysicalHeight;

    // Água frente: altura balanceada hidraulicamente, no anular
    // Hff = (pesoAtrás / pesoFrente) * Hfa
    const frontPhysicalHeight = mwFront > 0 ? backPhysicalHeight * (mwBack / mwFront) : backPhysicalHeight;
    // topoAguaFrente = topoCimentoComTubing - Hff
    const topFrontSpacer = topCementWithTubing - frontPhysicalHeight;
    const frontPhysicalVolumeBbl = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, topFrontSpacer, topCementWithTubing, annResolver)
      : capAnn * frontPhysicalHeight;

    // Fluido de deslocamento dentro do tubing: de 0 até topoAguaAtras
    const volDisplacement = well
      ? this.wellGeo.calculateVolumeBetween(well.geometry, 0, Math.max(0, topBackSpacer), pipeResolver)
      : capPipe * Math.max(0, topBackSpacer);

    // ── Estado 2: Sem tubing ──
    // Mesmo consumo de volume, agora com o poço/revestimento cheio (coluna retirada)
    const topCementWithoutTubing = well
      ? this.wellGeo.calculateTopFromVolume(well.geometry, pBase, volCementTotal, holeResolver).topMD
      : pBase - (capHole > 0 ? volCementTotal / capHole : plugHeight);
    const cementHeightWithoutTubing = pBase - topCementWithoutTubing;

    // Água frente final no estado sem tubing (no poço aberto)
    const frontHeightNoTubing = frontPhysicalHeight; // mesma altura calculada acima
    const topFrontNoTubing = topCementWithoutTubing - frontHeightNoTubing;

    return {
      hID, pOD, pID, pTop, pBase,
      pipeDep: pBase,
      sEnd,
      spH: backPhysicalHeight,
      wellFinalMD: well ? well.geometry.finalMD : wellFinal.wellFinalMD,
      wellFinalTVD: well ? well.geometry.finalTVD : wellFinal.wellFinalTVD,
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

  calcPressureProfile(plug: PlugGeometry, slurry: SlurryDesign, inputs: TampaoInputs, well?: PlugWellContext | null): PressureProfile {
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

    // Conversão MD ↔ TVD: com a estrutura cadastrada, interpola DENTRO de cada
    // fase (WellGeometryService é o único dono dessa regra). Sem ela, cai no
    // modelo legado de duas retas ancorado na seção.
    const ratioAbove = section.startMD > 0 ? section.startTVD / section.startMD : 1;
    const ratioSection = section.mdToTvdRatio > 0 ? section.mdToTvdRatio : 1;
    const mdToTvd = (md: number): number => {
      if (well) {
        const tvd = this.wellGeo.tryMdToTvd(well.geometry, md);
        if (tvd !== null) return tvd;
      }
      return md <= section.startMD ? md * ratioAbove : section.startTVD + (md - section.startMD) * ratioSection;
    };
    const tvdToMd = (tvd: number): number => {
      if (well) {
        const phase = this.wellGeo.phaseAtTVD(well.geometry, tvd);
        if (phase) return this.wellGeo.tvdToMd(well.geometry, tvd);
      }
      return tvd <= section.startTVD
        ? (ratioAbove > 0 ? tvd / ratioAbove : tvd)
        : section.startMD + (tvd - section.startTVD) / ratioSection;
    };

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
    const mdStackPsi = (md: number, spacerTop: number, upperDensity: number, spacerDensity: number): number => {
      const boundaries = [0, Math.max(0, spacerTop), Math.max(0, plug.topCementWithTubing), plug.pBase];
      const densities = [upperDensity, spacerDensity, cementDen];
      return densities.reduce((sum, den, i) => {
        if (md <= boundaries[i]) return sum;
        return sum + K * den * (mdToTvd(Math.min(md, boundaries[i + 1])) - mdToTvd(boundaries[i]));
      }, 0);
    };
    const steps = 40;
    for (let i = 0; i <= steps; i++) {
      const md = well ? plug.pBase * i / steps : tvdToMd(totalTVD * i / steps);
      const tvd = well ? mdToTvd(md) : totalTVD * i / steps;
      const fracPsi = K * fracGrad * tvd;
      const porePsi = K * poreGrad * tvd;
      const psiInside = well ? mdStackPsi(md, plug.topBackSpacer, mwDesloc, mwBack) : stackPsi(tvd, insideLayers);
      const bhpAnn = well ? mdStackPsi(md, plug.topFrontSpacer, mwComp, mwFront) : stackPsi(tvd, annulusLayers);

      const ecdPpg = tvd > 0 ? bhpAnn / (K * tvd) : mwFront;
      // Free fall: propensão da coluna de cimento cair antes do puxamento (zona de cimento)
      const inCementZone = well ? md >= plug.topCementWithTubing && md <= plug.pBase : tvd >= topCemAnnTVD && tvd <= baseTVD;
      const freeFallPct = inCementZone ? Math.max(0, Math.min(100, ((cementDen - mwBack) / cementDen) * 100)) : 0;

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
