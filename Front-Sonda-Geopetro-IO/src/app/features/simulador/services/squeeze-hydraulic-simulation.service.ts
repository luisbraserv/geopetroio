import { Injectable } from '@angular/core';
import {
  Perfuracao,
  SqueezeGeometry,
  SqueezeHydraulicPoint,
  SqueezeHydraulicSimulation,
  SqueezeInputs,
} from '../models/squeeze.model';
import { SlurryDesign } from '../models/pasta.model';
import { CoreCalculoService } from './core-calculo.service';
import { Aditivo } from '../models/aditivo.model';
import { RheologyAdjustmentOptions, RheologyAdjustmentService } from './rheology-adjustment.service';

interface PowerLawRheo {
  n: number;
  k: number; // lbf·s^n/ft²
}

interface PhaseDef {
  label: string;
  volumeBbl: number;
  densityPpg: number;
  rateBpm: number;
  pauseMin?: number;
  rheo: PowerLawRheo;
  /** Pressão aplicada na superfície durante a fase (psi). Bombeio com retorno aberto = 0. */
  appliedSurfacePsi?: number;
}

/** Reologia newtoniana equivalente para fluidos aquosos (~1 cP): k = µ × 2,0885e-5 lbf·s/ft² */
const WATER_LIKE_RHEO: PowerLawRheo = { n: 1, k: 2.09e-5 };

/** 1 cP em lbf·s/ft² — converte viscosidade newtoniana para o k do modelo de potência (n=1). */
const CP_TO_LBF_S_FT2 = 2.0885e-5;

/**
 * Multiplicador do fator de atrito em regime de transição/turbulento por estado
 * do tubo. A correlação F-40 (Dodge-Metzner) assume tubo liso; a rugosidade
 * eleva o atrito turbulento e não afeta o regime laminar.
 */
const ROUGHNESS_FRICTION_FACTOR: Record<'low' | 'medium' | 'high', number> = {
  low: 1.0,    // tubo novo (liso)
  medium: 1.15, // uso típico de campo
  high: 1.35,  // fim de vida (corrosão/incrustação)
};

@Injectable({ providedIn: 'root' })
export class SqueezeHydraulicSimulationService {
  private readonly hydroK = 0.1706;
  readonly categories = [
    'Pressão e deslocamento x tempo',
    'BHP/ECD x tempo',
    'Free fall/tubo em U',
    'Índice operacional por fase',
    'Resumo de volumes/fases',
  ];

  constructor(
    private core: CoreCalculoService,
    private rheologyAdj: RheologyAdjustmentService = new RheologyAdjustmentService(),
  ) {}

  simulate(geom: SqueezeGeometry, slurry: SlurryDesign, inputs: SqueezeInputs, perfs: Perfuracao[], additives?: Aditivo[], rheologyOptions: RheologyAdjustmentOptions = {}): SqueezeHydraulicSimulation {
    const rheologyResult = this.rheologyAdj.applyAdditiveRheologyEffects({}, additives || [], rheologyOptions);
    const rheologyPressureFactor = rheologyResult.rheologyPressureFactor;
    // Modelo de potência da pasta a partir das leituras Fann ajustadas (Petroguia F-41)
    const slurryRheo = this.powerLawFromFann(
      rheologyResult.rheology.rpm300,
      rheologyResult.rheology.rpm200,
      rheologyResult.rheology.rpm100,
    );
    const section = this.core.normalizeSectionValues(
      inputs.sectionStartMD,
      inputs.sectionEndMD,
      inputs.sectionStartTVD,
      inputs.sectionEndTVD,
    );
    const topPerfMD = inputs.topoCanhoneadoMD ?? Math.min(...perfs.map(p => p.top));
    const basePerfMD = inputs.baseCanhoneadoMD ?? Math.max(...perfs.map(p => p.base));
    const topPerfTVD = inputs.topoCanhoneadoTVD ?? section.tvdAt(topPerfMD);
    const basePerfTVD = inputs.baseCanhoneadoTVD ?? section.tvdAt(basePerfMD);
    const referenceMD = inputs.profundidadeReferenciaSqueezeMD ?? (topPerfMD + basePerfMD) / 2;
    const referenceTVD = inputs.profundidadeReferenciaSqueezeTVD ?? (topPerfTVD + basePerfTVD) / 2;
    // Pressão de operação: aplicada na superfície SÓ na fase de injeção/pressurização
    // final. Durante o bombeio com retorno aberto a pressão aplicada é 0.
    const pressaoOperacao = Math.max(0, inputs.pressaoOperacao ?? 0);
    // Configurações do motor (seção "Simulador")
    const roughnessFactor = ROUGHNESS_FRICTION_FACTOR[inputs.rugosidadeTubo ?? 'low'] ?? 1.0;
    const waterCp = Math.max(0.2, Number(inputs.viscosidadeAguaCp) || 1);
    const waterRheo: PowerLawRheo = { n: 1, k: waterCp * CP_TO_LBF_S_FT2 };
    const freeFallMaxFactor = Math.max(1, Number(inputs.freeFallMaxFactor) || 3.5);
    const stoRaw = Number(inputs.standoffPct);
    const standoffPct = this.core.clamp(Number.isFinite(stoRaw) ? stoRaw : 100, 0, 100);
    const poreGrad = inputs.gradientePoroPpg ?? inputs.poreGrad ?? 9;
    const fracGrad = inputs.gradienteFraturaPpg ?? inputs.fracGrad ?? 16;
    const completion = inputs.densidadeFluidoCompletaçãoPpg ?? inputs.completionWeight ?? 9.5;
    // Fluido de deslocamento (bombeado) ≠ fluido de completação (preenche o poço).
    const displacement = inputs.densidadeFluidoDeslocamentoPpg ?? inputs.displacementWeight ?? completion;
    const front = inputs.densidadeAguaFrentePpg ?? inputs.mudWeightFront ?? 9.5;
    const back = inputs.densidadeAguaAtrasPpg ?? inputs.mudWeightBack ?? 9.5;
    const cement = inputs.densidadePastaPpg ?? slurry.density ?? 15.8;
    const rate = inputs.vazaoBpm ?? inputs.pumpRate ?? 0;
    // Vazões por fluido: cada fase pode ter sua própria vazão (bpm);
    // sem valor específico, cai na vazão geral.
    const rateFrente = inputs.vazaoAguaFrenteBpm ?? rate;
    const ratePasta = inputs.vazaoPastaBpm ?? rate;
    const rateAtras = inputs.vazaoAguaAtrasBpm ?? rate;
    const rateDesloc = inputs.vazaoDeslocamentoBpm ?? rate;
    const pause1Min = Math.max(0, Number((inputs as any).pause1) || 0);
    const pause2Min = Math.max(0, Number(inputs.tempoPausaMin ?? (inputs as any).pause2) || 0);
    const pause3Min = Math.max(0, Number((inputs as any).pause3) || 0);
    const pauseMin = pause1Min + pause2Min + pause3Min;
    const pressurizacaoMin = Math.max(1, Number(inputs.tempoPressurizacaoMin) || 0);
    const porePsi = this.hydroK * poreGrad * referenceTVD;
    const fracturePsi = this.hydroK * fracGrad * referenceTVD;
    // Injeção: o volume squeezado para a formação é empurrado com fluido de
    // deslocamento adicional, sob a pressão de operação, ao longo do tempo de
    // pressurização. Vazão de injeção = volume ÷ tempo.
    const injectionVolumeBbl = Math.max(0, inputs.volMaxInjetadoBbl ?? geom.slurryInjectedVolumeBbl ?? 0);
    const injectionRateBpm = injectionVolumeBbl > 0 ? injectionVolumeBbl / pressurizacaoMin : 0;
    const phases: PhaseDef[] = [
      { label: 'Água frente', volumeBbl: inputs.volumeAguaFrenteBbl ?? geom.frontPhysicalVolumeBbl, densityPpg: front, rateBpm: rateFrente, pauseMin: pause1Min, rheo: waterRheo },
      { label: 'Pasta de cimento', volumeBbl: inputs.volumePastaBbl ?? geom.slurryTotal, densityPpg: cement, rateBpm: ratePasta, pauseMin: pause2Min, rheo: slurryRheo },
      { label: 'Água atrás', volumeBbl: inputs.volumeAguaAtrasBbl ?? geom.volBackSpacer, densityPpg: back, rateBpm: rateAtras, pauseMin: pause3Min, rheo: waterRheo },
      { label: 'Deslocamento', volumeBbl: inputs.volumeDeslocamentoBbl ?? geom.operationalDisplacementVolumeBbl, densityPpg: displacement, rateBpm: rateDesloc, rheo: waterRheo },
    ];
    // Tampão: a operação termina no deslocamento (plug balanceado) — não há injeção.
    if (inputs.modoOperacao !== 'tampao') {
      phases.push({
        label: 'Injeção/pressurização final',
        volumeBbl: injectionVolumeBbl,
        densityPpg: displacement,
        rateBpm: injectionRateBpm,
        pauseMin: injectionRateBpm > 0 ? 0 : pressurizacaoMin,
        rheo: waterRheo,
        appliedSurfacePsi: pressaoOperacao,
      });
    }

    // Sequência bombeada (ordem real) para o modelo de tubo em U
    const pumpSequence = phases.filter(p => p.volumeBbl > 0);
    const tubingCap = geom.tubingID_m || 0.03;
    const annulusCap = geom.annulusCasing_m || 0.03;
    const tubingVolumeBbl = tubingCap * referenceTVD;

    const points: SqueezeHydraulicPoint[] = [];
    let timeMin = 0;
    let pumpedVolume = 0;    // volume que permaneceu no poço (bombeado nas fases de circulação)
    let injectedVolume = 0;  // volume squeezado para a formação (fase de injeção)
    let freeFallAccum = 0;
    let lastBhp = 0;
    for (const phase of phases) {
      // A fase de injeção NÃO adiciona volume novo ao poço: o volume squeezado
      // (já bombeado como parte da pasta) sai do poço para a formação. Ele é
      // debitado do acumulado — o "volume no poço" cai pelo volume injetado.
      const isInjection = /Inje/i.test(phase.label);
      const pumpDuration = phase.rateBpm > 0 ? phase.volumeBbl / phase.rateBpm : 0;
      const totalDuration = pumpDuration + (phase.pauseMin || 0);
      const steps = Math.max(1, Math.ceil(totalDuration || 1));
      for (let i = 0; i <= steps; i += 1) {
        const elapsed = steps > 0 ? totalDuration * i / steps : 0;
        const pumping = elapsed <= pumpDuration && phase.rateBpm > 0;
        const dt = i === 0 ? 0 : totalDuration / steps;
        const programmedRate = pumping ? phase.rateBpm : 0;
        if (pumping && i > 0) {
          if (isInjection) injectedVolume += programmedRate * dt;  // perda para a formação
          else pumpedVolume += programmedRate * dt;                // permanece no poço
        }
        const volumeNoPocoBbl = Math.max(0, pumpedVolume - injectedVolume);
        const hydrostaticPsi = this.tubingHydrostaticPsi(referenceTVD, tubingCap, pumpSequence, pumpedVolume, completion);
        const annularHydrostaticPsi = this.annulusHydrostaticPsi(referenceTVD, annulusCap, tubingVolumeBbl, pumpSequence, pumpedVolume, completion);
        const drivePsi = Math.max(0, hydrostaticPsi - annularHydrostaticPsi);
        const frictionPsi = programmedRate > 0 ? this.calculateFrictionLoss(programmedRate, referenceMD, phase.densityPpg, geom.tID, phase.rheo, rheologyPressureFactor, roughnessFactor) : 0;
        const appliedSurfacePsi = Math.max(0, phase.appliedSurfacePsi ?? 0);
        // Poço fechado (pressão aplicada na superfície): o fluido só avança pela
        // vazão injetada na formação — não há retorno pelo anular nem queda livre,
        // pois o tubo em U exige caminho aberto para a coluna cair.
        const openWell = appliedSurfacePsi <= 0;
        // Fricção do retorno pelo anular: só existe bombeando com o poço aberto.
        // Na injeção (pressão aplicada) o fluido vai para a formação — anular estático.
        const hasAnnularReturn = programmedRate > 0 && openWell;
        const annularFrictionPsi = hasAnnularReturn
          ? this.calculateAnnularFrictionLoss(programmedRate, referenceMD, phase.densityPpg, geom.cID, geom.tOD, phase.rheo, rheologyPressureFactor, roughnessFactor, standoffPct)
          : 0;
        const naturalRate = openWell
          ? this.solveFreeFallRate(drivePsi, programmedRate || rate, referenceMD, phase.densityPpg, geom.tID, phase.rheo, rheologyPressureFactor, roughnessFactor, freeFallMaxFactor)
          : 0;
        const realRate = Math.max(programmedRate, naturalRate);
        const freeFallExtraRate = Math.max(0, realRate - programmedRate);
        freeFallAccum += freeFallExtraRate * dt;
        // A fricção do retorno represa pressão no fundo (contrapressão) — soma ao BHP/ECD
        const bhpPsi = appliedSurfacePsi + hydrostaticPsi - frictionPsi + annularFrictionPsi;
        const ecdPpg = referenceTVD > 0 ? bhpPsi / (this.hydroK * referenceTVD) : null;
        const pumpPressurePsi = Math.max(appliedSurfacePsi, frictionPsi + annularFrictionPsi - drivePsi);
        lastBhp = bhpPsi;
        points.push({
          timeMin: timeMin + elapsed,
          phase: phase.label,
          pumpedVolumeBbl: volumeNoPocoBbl,
          injectedVolumeBbl: injectedVolume,
          programmedRateBpm: programmedRate,
          realRateBpm: realRate,
          freeFallExtraRateBpm: freeFallExtraRate,
          pumpPressurePsi,
          surfacePressurePsi: appliedSurfacePsi,
          frictionPsi,
          annularFrictionPsi,
          hydrostaticPsi,
          bhpPsi,
          ecdPpg,
          porePsi,
          fracturePsi,
          freeFallAccumBbl: freeFallAccum,
          freeFallHeightM: geom.tubingID_m > 0 ? freeFallAccum / geom.tubingID_m : 0,
          drivePsi,
          hydraulicLossPsi: frictionPsi + annularFrictionPsi,
        });
      }
      timeMin += totalDuration;
    }

    const bhps = points.map(p => p.bhpPsi);
    const ecds = points.map(p => p.ecdPpg).filter((v): v is number => v !== null && Number.isFinite(v));
    const bhpMaxPsi = Math.max(...bhps, lastBhp);
    const bhpMinPsi = Math.min(...bhps, lastBhp);

    // ── Limites do equipamento de bombeio ─────────────────────────────────
    // HHP = pressão de bombeio (psi) × vazão (bpm) ÷ 40,8
    const motorHP = Math.max(0, Number(inputs.motorHP) || 0);
    const pumpEff = this.core.clamp(Number(inputs.pumpEff) || 0, 0, 100);
    const hhpAvailable = motorHP > 0 && pumpEff > 0 ? motorHP * pumpEff / 100 : null;
    const maxSurfaceLimitPsi = Math.max(0, Number(inputs.maxSurfacePressure) || 0);
    const maxRateLimitBpm = Math.max(0, Number(inputs.maxPumpRate) || 0);
    const hhpMaxRequired = points.reduce((m, p) => Math.max(m, p.pumpPressurePsi * p.programmedRateBpm / 40.8), 0);
    const maxPumpPressurePsi = points.reduce((m, p) => Math.max(m, p.pumpPressurePsi), 0);
    const maxProgrammedRateBpm = points.reduce((m, p) => Math.max(m, p.programmedRateBpm), 0);
    const hhpUsePct = hhpAvailable && hhpAvailable > 0 ? hhpMaxRequired / hhpAvailable * 100 : null;
    const equipmentAlerts: string[] = [];
    if (hhpAvailable != null && hhpMaxRequired > hhpAvailable) {
      equipmentAlerts.push(`HHP exigido (${Math.round(hhpMaxRequired)}) excede o disponível (${Math.round(hhpAvailable)} = ${Math.round(motorHP)} HP × ${Math.round(pumpEff)}%)`);
    }
    if (maxSurfaceLimitPsi > 0 && maxPumpPressurePsi > maxSurfaceLimitPsi) {
      equipmentAlerts.push(`Pressão de superfície (${Math.round(maxPumpPressurePsi)} psi) excede o limite da unidade (${Math.round(maxSurfaceLimitPsi)} psi)`);
    }
    if (maxRateLimitBpm > 0 && maxProgrammedRateBpm > maxRateLimitBpm) {
      equipmentAlerts.push(`Vazão programada (${maxProgrammedRateBpm.toFixed(1)} bpm) excede o limite da unidade (${maxRateLimitBpm.toFixed(1)} bpm)`);
    }
    const pressurePenalty = bhpMaxPsi > fracturePsi || bhpMinPsi < porePsi ? 24 : 0;
    const densityPenalty = cement < back || cement < front ? 12 : 0;
    const ratePenalty = rate < 0.5 || rate > 8 ? 12 : 0;
    const freeFallPenalty = Math.min(18, freeFallAccum * 2);
    const operationalIndex = Math.max(0, Math.round(100 - pressurePenalty - densityPenalty - ratePenalty - freeFallPenalty));
    const alert = bhpMaxPsi > fracturePsi ? 'above-fracture' : bhpMinPsi < porePsi ? 'below-pore' : 'inside-window';

    return {
      categories: this.categories,
      points,
      summary: {
        referenceMD,
        referenceTVD,
        topPerfMD,
        basePerfMD,
        topPerfTVD,
        basePerfTVD,
        porePsi,
        fracturePsi,
        bhpMaxPsi,
        bhpMinPsi,
        ecdMaxPpg: ecds.length ? Math.max(...ecds) : null,
        maxSurfacePressurePsi: points.reduce((m, p) => Math.max(m, p.surfacePressurePsi), 0),
        marginToFracturePsi: fracturePsi - bhpMaxPsi,
        marginAbovePorePsi: bhpMinPsi - porePsi,
        totalTimeMin: points.at(-1)?.timeMin ?? 0,
        pauseTimeMin: pauseMin,
        freeFallAccumBbl: freeFallAccum,
        freeFallHeightM: geom.tubingID_m > 0 ? freeFallAccum / geom.tubingID_m : 0,
        operationalIndex,
        alert,
        hhpMaxRequired,
        hhpAvailable,
        hhpUsePct,
        equipmentAlerts,
      },
    };
  }

  /**
   * Hidrostática do lado da coluna (tubing) na profundidade de referência.
   * O trem bombeado entra pelo topo e empurra o fluido original para fora
   * pela extremidade: o fluido mais recente fica no topo, o mais antigo desce.
   * Alturas em modelo vertical simplificado (altura = volume / capacidade).
   */
  private tubingHydrostaticPsi(
    tvdRef: number,
    tubingCap: number,
    sequence: PhaseDef[],
    pumpedVolume: number,
    completionPpg: number,
  ): number {
    if (tvdRef <= 0 || tubingCap <= 0) return 0;
    const tubingVolume = tubingCap * tvdRef;
    let remaining = tubingVolume;
    let psi = 0;
    let before = 0;
    const pumpedOf = sequence.map(p => {
      const v = Math.min(p.volumeBbl, Math.max(0, pumpedVolume - before));
      before += p.volumeBbl;
      return v;
    });
    // do topo para baixo: fases na ordem inversa de bombeio
    for (let i = sequence.length - 1; i >= 0 && remaining > 0; i -= 1) {
      const inTube = Math.min(pumpedOf[i], remaining);
      psi += this.hydroK * sequence[i].densityPpg * (inTube / tubingCap);
      remaining -= inTube;
    }
    // abaixo do trem bombeado: fluido original do poço
    psi += this.hydroK * completionPpg * Math.max(0, remaining / tubingCap);
    return psi;
  }

  /**
   * Hidrostática do lado anular na profundidade de referência.
   * O que já saiu pela extremidade da coluna sobe pelo anular: o fluido que
   * saiu por último fica junto à extremidade, o que saiu primeiro fica acima.
   */
  private annulusHydrostaticPsi(
    tvdRef: number,
    annulusCap: number,
    tubingVolumeBbl: number,
    sequence: PhaseDef[],
    pumpedVolume: number,
    completionPpg: number,
  ): number {
    if (tvdRef <= 0) return 0;
    if (annulusCap <= 0) return this.hydroK * completionPpg * tvdRef;
    const exitedTotal = Math.max(0, pumpedVolume - tubingVolumeBbl);
    let before = 0;
    const exitedOf = sequence.map(p => {
      const v = Math.min(p.volumeBbl, Math.max(0, exitedTotal - before));
      before += p.volumeBbl;
      return v;
    });
    let remainingHeight = tvdRef;
    let psi = 0;
    // da extremidade para cima: fases na ordem inversa de saída
    for (let i = sequence.length - 1; i >= 0 && remainingHeight > 0; i -= 1) {
      const h = Math.min(exitedOf[i] / annulusCap, remainingHeight);
      psi += this.hydroK * sequence[i].densityPpg * h;
      remainingHeight -= h;
    }
    psi += this.hydroK * completionPpg * Math.max(0, remainingHeight);
    return psi;
  }

  /**
   * Parâmetros do modelo de potência (τ = k·γⁿ) a partir das leituras Fann
   * R1/B1 a 100/200/300 rpm — Petroguia 2ª ed. (2009), folha F-41:
   *   n = 0,81·ln(θ300) + 0,15·ln(θ200) − 0,96·ln(θ100)
   *   k = 1,066 · θ100^5,84 · θ200^(−0,53) · θ300^(−4,32) / 100   [lbf·sⁿ/ft²]
   */
  private powerLawFromFann(theta300?: number | null, theta200?: number | null, theta100?: number | null): PowerLawRheo {
    const t300 = Number.isFinite(theta300) && (theta300 as number) > 0 ? theta300 as number : 75;
    const t200 = Number.isFinite(theta200) && (theta200 as number) > 0 ? theta200 as number : 60;
    const t100 = Number.isFinite(theta100) && (theta100 as number) > 0 ? theta100 as number : 42;
    const n = 0.81 * Math.log(t300) + 0.15 * Math.log(t200) - 0.96 * Math.log(t100);
    const k = 1.066 * (t100 ** 5.84) * (t200 ** -0.53) * (t300 ** -4.32) / 100;
    if (!Number.isFinite(n) || !Number.isFinite(k) || n <= 0 || k <= 0) return { n: 0.52, k: 0.029 };
    return { n: this.core.clamp(n, 0.1, 1.6), k };
  }

  /**
   * Perda de carga por fricção no tubo — Petroguia 2ª ed. (2009), folha F-40,
   * modelo de potência (mesma família Dodge-Metzner do Well Cementing/SLB cap. 4):
   *   V   = 17,158·Q/D²                         [ft/s; Q em bpm, D em pol]
   *   NRe = 1,86·ρ·V^(2−n)·Dⁿ / (96ⁿ·k)         [ρ em ppg, k em lbf·sⁿ/ft²]
   *   f   = 16/NRe                              (laminar, NRe < 400)
   *       = 0,11·n^0,616·NRe^(−0,287)           (transição/turbulento, n ≤ 1)
   *       = 0,00454 + 0,645·NRe^(−0,7)          (transição/turbulento, n > 1)
   *   pf  = 0,03874·f·ρ·V²·L/D                  [psi; L em ft]
   */
  private calculateFrictionLoss(flowRateBpm: number, lengthM: number, densityPpg: number, diameterIn: number, rheo: PowerLawRheo, rheologyFactor = 1.0, roughnessFactor = 1.0): number {
    if (!Number.isFinite(flowRateBpm) || flowRateBpm <= 0) return 0;
    const d = Number.isFinite(diameterIn) && diameterIn > 0 ? diameterIn : 2.441;
    const n = this.core.clamp(rheo?.n ?? 1, 0.1, 1.6);
    const k = Math.max(1e-6, rheo?.k ?? WATER_LIKE_RHEO.k);
    const rho = Math.max(0.1, densityPpg || 8.33);
    const v = 17.158 * flowRateBpm / (d * d);
    if (v <= 0) return 0;
    const nre = 1.86 * rho * Math.pow(v, 2 - n) * Math.pow(d, n) / (Math.pow(96, n) * k);
    if (!Number.isFinite(nre) || nre <= 0) return 0;
    // Rugosidade só atua fora do regime laminar (F-40 assume tubo liso)
    const f = nre < 400
      ? 16 / nre
      : (n <= 1
        ? 0.11 * Math.pow(n, 0.616) * Math.pow(nre, -0.287)
        : 0.00454 + 0.645 * Math.pow(nre, -0.7)) * Math.max(1, roughnessFactor);
    const lengthFt = Math.max(0, lengthM) * 3.28084;
    const pf = 0.03874 * f * rho * v * v * lengthFt / d;
    return Math.max(0, pf) * Math.max(0.5, rheologyFactor);
  }

  /**
   * Perda de carga por fricção no anular — Petroguia 2ª ed. (2009), folha F-40:
   *   V   = 17,158·Q/(Dp²−De²)                  [ft/s; Q em bpm, D em pol]
   *   Deq = 0,861·(Dp−De)                       [diâmetro equivalente do anular]
   *   NRe/f como no tubo (rugosidade fora do regime laminar)
   *   pfo = 0,03874·f·ρ·V²·L/Deq                [anular totalmente concêntrico]
   *   Correção de excentricidade (standoff Sto, 100% = concêntrico):
   *   pf  = pfo · [1 − (0,44 + 0,18·n)·(1 − Sto/100)]
   *   (coeficientes da geometria 8½"×7"; os da 12¼"×9⅝" diferem <3%)
   */
  private calculateAnnularFrictionLoss(
    flowRateBpm: number,
    lengthM: number,
    densityPpg: number,
    holeIdIn: number,
    pipeOdIn: number,
    rheo: PowerLawRheo,
    rheologyFactor = 1.0,
    roughnessFactor = 1.0,
    standoffPct = 100,
  ): number {
    if (!Number.isFinite(flowRateBpm) || flowRateBpm <= 0) return 0;
    const dp = Number.isFinite(holeIdIn) && holeIdIn > 0 ? holeIdIn : 4.778;
    const de = Number.isFinite(pipeOdIn) && pipeOdIn > 0 ? pipeOdIn : 2.875;
    if (dp <= de) return 0;
    const n = this.core.clamp(rheo?.n ?? 1, 0.1, 1.6);
    const k = Math.max(1e-6, rheo?.k ?? WATER_LIKE_RHEO.k);
    const rho = Math.max(0.1, densityPpg || 8.33);
    const v = 17.158 * flowRateBpm / (dp * dp - de * de);
    if (v <= 0) return 0;
    const deq = 0.861 * (dp - de);
    const nre = 1.86 * rho * Math.pow(v, 2 - n) * Math.pow(deq, n) / (Math.pow(96, n) * k);
    if (!Number.isFinite(nre) || nre <= 0) return 0;
    const f = nre < 400
      ? 16 / nre
      : (n <= 1
        ? 0.11 * Math.pow(n, 0.616) * Math.pow(nre, -0.287)
        : 0.00454 + 0.645 * Math.pow(nre, -0.7)) * Math.max(1, roughnessFactor);
    const lengthFt = Math.max(0, lengthM) * 3.28084;
    const pfo = 0.03874 * f * rho * v * v * lengthFt / deq;
    const sto = this.core.clamp(standoffPct, 0, 100);
    const eccentricityCorrection = Math.max(0, 1 - (0.44 + 0.18 * n) * (1 - sto / 100));
    return Math.max(0, pfo * eccentricityCorrection) * Math.max(0.5, rheologyFactor);
  }

  /**
   * Vazão natural de queda livre: resolve por bisseção a vazão em que a perda
   * de carga por fricção (F-40) equilibra o desbalanço hidrostático (drivePsi).
   */
  private solveFreeFallRate(drivePsi: number, pumpRateBpm: number, lengthM: number, densityPpg: number, diameterIn: number, rheo: PowerLawRheo, rheologyFactor = 1.0, roughnessFactor = 1.0, maxFactor = 3.5): number {
    if (!Number.isFinite(drivePsi) || drivePsi <= 0) return 0;
    const referenceRate = Math.max(0.25, pumpRateBpm || 1);
    const qMax = referenceRate * Math.max(1, maxFactor);
    const lossAtMax = this.calculateFrictionLoss(qMax, lengthM, densityPpg, diameterIn, rheo, rheologyFactor, roughnessFactor);
    if (!Number.isFinite(lossAtMax) || lossAtMax <= 1e-6) return 0;
    if (lossAtMax <= drivePsi) return qMax;
    let lo = 0;
    let hi = qMax;
    for (let i = 0; i < 40; i += 1) {
      const mid = (lo + hi) / 2;
      if (this.calculateFrictionLoss(mid, lengthM, densityPpg, diameterIn, rheo, rheologyFactor, roughnessFactor) < drivePsi) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
  }
}
