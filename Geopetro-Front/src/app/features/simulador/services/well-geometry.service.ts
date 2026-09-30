import { Injectable } from '@angular/core';
import { MinimumCurvature } from './minimum-curvature';
import { BBL_M } from '../models/constantes';
import type { ConventionalPrimaryGeometryInput, PrimaryAssemblyGeometryInput, PrimaryGeometryResolution, PrimaryGeometrySegment, PrimaryStageGeometryResolution } from '../models/primary-geometry.model';
import type { PrimaryConfiguration } from '../models/primary-cementing.model';
import { primaryGeometryVolume, resolveAssemblyGeometry } from './primary-geometry';
import { resolveStageGeometry } from './primary-stage-geometry';
import { resolvePrimaryConnectivity } from './primary-connectivity';
import type { PrimaryDeviceConnectionState } from '../models/primary-cementing.model';
import {
  GeometrySegment,
  LegacySectionFields,
  OperationInterval,
  PerforationInterval,
  WellGeometry,
  WellGeometryIssue,
  WellPhase,
  WellTrajectory,
} from '../models/well-geometry.model';

/** Tolerância de profundidade (m) para comparar fronteiras de fase. */
const MD_EPS = 1e-6;

/** Conversão linear da fase, compartilhada com o adapter do formulário legado. */
export function phaseTvdAtMD(phase: WellPhase, md: number): number {
  const length = phase.bottomMD - phase.topMD;
  if (length <= 0) return phase.topTVD;
  return phase.topTVD + (md - phase.topMD) * (phase.bottomTVD - phase.topTVD) / length;
}

export type CapacityKind = 'open' | 'annulus' | 'pipe' | 'annulusPlusPipe';

export interface CapacityOptions {
  kind: CapacityKind;
  /** OD da coluna de trabalho (pol) — necessário para 'annulus'. */
  pipeOD?: number;
  /** ID da coluna de trabalho (pol) — necessário para 'pipe'. */
  pipeID?: number;
}

/** Resolve a capacidade (bbl/m) de um trecho de geometria homogênea. */
export type CapacityResolver = (segment: GeometrySegment) => number;

export interface TopFromVolumeResult {
  /** Topo alcançado pelo volume, subindo a partir da base. */
  topMD: number;
  /** Volume efetivamente acomodado até esse topo (bbl). */
  filledVolumeBbl: number;
  /** Volume que não coube no poço (bbl) — > 0 indica volume maior que o poço. */
  remainingVolumeBbl: number;
  /** Trechos percorridos, do topo alcançado até a base (ordem topo→base). */
  segments: GeometrySegment[];
}

export interface IntervalDescription {
  /** Fases tocadas pelo intervalo, do topo para a base. */
  phases: WellPhase[];
  segments: GeometrySegment[];
  /** Fase da BASE da operação — é ela que ancora a operação. */
  primaryPhase: WellPhase | null;
  crossesPhases: boolean;
  /** Rótulo do revestimento da fase da base (ex.: `9 5/8"`), null em poço aberto. */
  casingLabel: string | null;
  topTVD: number | null;
  bottomTVD: number | null;
}

/**
 * Formata polegadas como fração de campo (9.625 → `9 5/8"`). Valores que não
 * caem em oitavos (calipers medidos, por exemplo) saem em decimal.
 */
export function formatInches(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '—';
  const eighths = value * 8;
  if (Math.abs(eighths - Math.round(eighths)) > 0.02) return `${value.toFixed(3)}"`;
  const whole = Math.floor(value + MD_EPS);
  let num = Math.round((value - whole) * 8);
  if (num === 0) return `${whole}"`;
  let den = 8;
  while (num % 2 === 0 && den % 2 === 0) { num /= 2; den /= 2; }
  return whole > 0 ? `${whole} ${num}/${den}"` : `${num}/${den}"`;
}

/**
 * Serviço único de geometria do poço. Tudo que dependa de "onde estou no poço"
 * — fase, revestimento, diâmetro, conversão MD↔TVD, capacidade — passa por aqui.
 * Os services de cálculo e o componente de desenho consomem, nunca reimplementam.
 */
@Injectable({ providedIn: 'root' })
export class WellGeometryService {
  private readonly surveys = new WeakMap<WellTrajectory, { key: string; curve: MinimumCurvature }>();

  /** Anular externo do revestimento-alvo; não altera CapacityKind do squeeze. */
  resolveConventionalPrimaryGeometry(geometry: WellGeometry, input: ConventionalPrimaryGeometryInput): PrimaryGeometryResolution {
    return this.resolvePrimaryAssemblyGeometry(geometry, input);
  }

  resolvePrimaryAssemblyGeometry(geometry: WellGeometry, input: PrimaryAssemblyGeometryInput): PrimaryGeometryResolution {
    const issues = this.validate(geometry);
    if (this.hasErrors(issues)) return { segments: [], capacities: null, issues };
    const effective = this.deriveTrajectoryTvd(geometry);
    const result = resolveAssemblyGeometry(effective, input, md => this.mdToTvd(effective, md));
    return { ...result, issues: [...issues, ...result.issues] };
  }

  resolvePrimaryStageGeometry(geometry: WellGeometry, primary: PrimaryConfiguration): PrimaryStageGeometryResolution {
    return resolveStageGeometry(primary, input => this.resolvePrimaryAssemblyGeometry(geometry, input));
  }

  resolvePrimaryConnectivity(geometry: WellGeometry, primary: PrimaryConfiguration,
    states: PrimaryDeviceConnectionState[], activeStageId: string | null) {
    return resolvePrimaryConnectivity(primary, this.resolvePrimaryStageGeometry(geometry, primary), states, activeStageId);
  }

  primaryVolumeBetween(segments: PrimaryGeometrySegment[], zone: 'internal' | 'casing-annulus',
    topMD: number, bottomMD: number): number {
    return primaryGeometryVolume(segments, zone, topMD, bottomMD);
  }

  private survey(trajectory: WellTrajectory): MinimumCurvature {
    const key = JSON.stringify(trajectory.stations);
    const cached = this.surveys.get(trajectory);
    if (cached?.key === key) return cached.curve;
    const curve = new MinimumCurvature(trajectory);
    this.surveys.set(trajectory, { key, curve });
    return curve;
  }

  validateTrajectory(geometry: WellGeometry): WellGeometryIssue[] {
    if (!geometry.trajectory) return [];
    try {
      const curve = this.survey(geometry.trajectory);
      if (curve.positions.at(-1)!.md < geometry.finalMD) throw new Error('Survey: a última estação deve alcançar o MD final do poço.');
      return [];
    } catch (e) {
      return [{ level: 'error', code: 'SURVEY_INVALID', message: e instanceof Error ? e.message : 'Survey inválido.' }];
    }
  }

  /** Deriva TVDs no modelo efetivo; preserva os valores manuais no formulário. */
  deriveTrajectoryTvd(geometry: WellGeometry): WellGeometry {
    if (!geometry.trajectory || this.hasErrors(this.validateTrajectory(geometry))) return geometry;
    const tvd = (md: number) => { try { return this.survey(geometry.trajectory!).at(md).tvd; } catch { return NaN; } };
    return { ...geometry, finalTVD: tvd(geometry.finalMD), phases: geometry.phases.map(p => ({
      ...p, topTVD: tvd(p.topMD), bottomTVD: tvd(p.bottomMD),
      shoe: p.shoe ? { ...p.shoe, tvd: tvd(p.shoe.md) } : undefined,
    })) };
  }

  /** Fases ordenadas por topo. Toda leitura passa por aqui. */
  sortedPhases(geometry: WellGeometry): WellPhase[] {
    return [...(geometry?.phases ?? [])].sort((a, b) => a.topMD - b.topMD);
  }

  // ── Localização ────────────────────────────────────────────────────────

  /**
   * Fase que contém o MD. Numa fronteira entre fases (a base de uma é o topo
   * da seguinte) devolve a mais rasa — a sapata pertence à fase que ela fecha.
   */
  phaseAtMD(geometry: WellGeometry, md: number): WellPhase | null {
    if (!Number.isFinite(md)) return null;
    for (const phase of this.sortedPhases(geometry)) {
      if (md >= phase.topMD - MD_EPS && md <= phase.bottomMD + MD_EPS) return phase;
    }
    return null;
  }

  phaseAtTVD(geometry: WellGeometry, tvd: number): WellPhase | null {
    if (geometry.trajectory) return this.phaseAtMD(geometry, this.tvdToMd(geometry, tvd));
    if (!Number.isFinite(tvd)) return null;
    for (const phase of this.sortedPhases(geometry)) {
      if (tvd >= phase.topTVD - MD_EPS && tvd <= phase.bottomTVD + MD_EPS) return phase;
    }
    return null;
  }

  /** Fases tocadas pelo intervalo [topMD, bottomMD], do topo para a base. */
  getPhasesBetween(geometry: WellGeometry, topMD: number, bottomMD: number): WellPhase[] {
    const top = Math.min(topMD, bottomMD);
    const bottom = Math.max(topMD, bottomMD);
    return this.sortedPhases(geometry).filter(p =>
      p.bottomMD > top + MD_EPS && p.topMD < bottom - MD_EPS);
  }

  // ── Conversão MD ↔ TVD ─────────────────────────────────────────────────

  /**
   * Interpolação linear DENTRO da fase que contém o MD — substitui as duas
   * retas do modelo de seção única. Lança se o MD não pertence a nenhuma fase:
   * é erro de cadastro (gap), não algo para corrigir em silêncio.
   */
  mdToTvd(geometry: WellGeometry, md: number): number {
    if (geometry.trajectory) {
      if (md > geometry.finalMD) throw new Error('Profundidade abaixo do fundo do poço.');
      return this.survey(geometry.trajectory).at(md).tvd;
    }
    const phase = this.phaseAtMD(geometry, md);
    if (!phase) throw new Error(`Nenhuma fase encontrada para MD ${md}`);
    return phaseTvdAtMD(phase, md);
  }

  /**
   * Mesma conversão de `mdToTvd`, com o survey resolvido uma única vez. Para laços
   * densos, como a hidráulica da primária, evita reconferir o survey a cada chamada.
   */
  mdToTvdResolver(geometry: WellGeometry): (md: number) => number {
    if (!geometry.trajectory) return md => this.mdToTvd(geometry, md);
    const curve = this.survey(geometry.trajectory);
    const finalMD = geometry.finalMD;
    return md => {
      if (md > finalMD) throw new Error('Profundidade abaixo do fundo do poço.');
      return curve.at(md).tvd;
    };
  }

  /** Versão não-lançante: null quando o MD está fora das fases cadastradas. */
  tryMdToTvd(geometry: WellGeometry, md: number): number | null {
    try { return this.mdToTvd(geometry, md); } catch { return null; }
  }

  tvdToMd(geometry: WellGeometry, tvd: number): number {
    if (geometry.trajectory) {
      const md = this.survey(geometry.trajectory).mdAtTvd(tvd);
      if (md > geometry.finalMD) throw new Error('TVD abaixo do fundo do poço.');
      return md;
    }
    const phase = this.phaseAtTVD(geometry, tvd);
    if (!phase) throw new Error(`Nenhuma fase encontrada para TVD ${tvd}`);
    const tvdLength = phase.bottomTVD - phase.topTVD;
    if (tvdLength <= 0) return phase.topMD;
    const ratio = (phase.bottomMD - phase.topMD) / tvdLength;
    return phase.topMD + (tvd - phase.topTVD) * ratio;
  }

  // ── Segmentação geométrica ─────────────────────────────────────────────

  /**
   * Quebra [topMD, bottomMD] nos trechos de geometria homogênea: fronteiras de
   * fase E topo/sapata de revestimento. Dentro de cada trecho o diâmetro
   * interno é constante, então a capacidade bbl/m também é.
   */
  getGeometrySegments(geometry: WellGeometry, topMD: number, bottomMD: number): GeometrySegment[] {
    const top = Math.min(topMD, bottomMD);
    const bottom = Math.max(topMD, bottomMD);
    if (!(bottom > top + MD_EPS)) return [];

    const phases = this.getPhasesBetween(geometry, top, bottom);
    const segments: GeometrySegment[] = [];

    for (const phase of phases) {
      const phaseTop = Math.max(top, phase.topMD);
      const phaseBottom = Math.min(bottom, phase.bottomMD);
      if (!(phaseBottom > phaseTop + MD_EPS)) continue;

      // Fronteiras internas da fase: onde o revestimento começa e termina
      const cuts = new Set<number>([phaseTop, phaseBottom]);
      for (const station of geometry.trajectory?.stations ?? []) {
        if (station.md > phaseTop && station.md < phaseBottom) cuts.add(station.md);
      }
      const cased = this.casedInterval(phase);
      if (cased) {
        for (const cut of [cased.top, cased.bottom]) {
          if (cut > phaseTop + MD_EPS && cut < phaseBottom - MD_EPS) cuts.add(cut);
        }
      }
      const bounds = [...cuts].sort((a, b) => a - b);

      for (let i = 0; i < bounds.length - 1; i += 1) {
        const segTop = bounds[i];
        const segBottom = bounds[i + 1];
        if (!(segBottom > segTop + MD_EPS)) continue;
        const mid = (segTop + segBottom) / 2;
        const isCased = !!cased && mid >= cased.top - MD_EPS && mid <= cased.bottom + MD_EPS;
        const innerDiameterIn = isCased && phase.casing ? phase.casing.idIn : phase.holeDiameterIn;
        segments.push({
          topMD: segTop,
          bottomMD: segBottom,
          lengthMD: segBottom - segTop,
          topTVD: geometry.trajectory ? this.mdToTvd(geometry, segTop) : this.tvdWithinPhase(phase, segTop),
          bottomTVD: geometry.trajectory ? this.mdToTvd(geometry, segBottom) : this.tvdWithinPhase(phase, segBottom),
          phaseId: phase.id,
          phaseName: phase.name,
          phaseType: phase.type,
          holeDiameterIn: phase.holeDiameterIn,
          casingIdIn: isCased ? phase.casing?.idIn : undefined,
          casingOdIn: isCased ? phase.casing?.odIn : undefined,
          cased: isCased,
          innerDiameterIn,
        });
      }
    }
    return segments;
  }

  /** Trecho revestido da fase (MD), ou null se a fase é poço aberto. */
  private casedInterval(phase: WellPhase): { top: number; bottom: number } | null {
    if (!phase.casing) return null;
    const top = Math.max(phase.topMD, phase.casing.topMD ?? 0);
    const bottom = Math.min(phase.bottomMD, phase.casing.bottomMD);
    return bottom > top + MD_EPS ? { top, bottom } : null;
  }

  private tvdWithinPhase(phase: WellPhase, md: number): number {
    return phaseTvdAtMD(phase, md);
  }

  // ── Capacidades ────────────────────────────────────────────────────────

  /** Capacidade (bbl/m) de um trecho, dado o que ocupa o poço ali. */
  capacityOfSegment(segment: GeometrySegment, options: CapacityOptions): number {
    const inner = segment.innerDiameterIn;
    const pipeOD = options.pipeOD ?? 0;
    const pipeID = options.pipeID ?? 0;
    switch (options.kind) {
      case 'open':
        return BBL_M * Math.max(0, inner * inner);
      case 'annulus':
        return BBL_M * Math.max(0, inner * inner - pipeOD * pipeOD);
      case 'pipe':
        return BBL_M * Math.max(0, pipeID * pipeID);
      case 'annulusPlusPipe':
        return BBL_M * (Math.max(0, inner * inner - pipeOD * pipeOD) + Math.max(0, pipeID * pipeID));
    }
  }

  /** Capacidade (bbl/m) na profundidade informada. */
  getCapacityAtMD(geometry: WellGeometry, md: number, options: CapacityOptions): number {
    const phase = this.phaseAtMD(geometry, md);
    const segment = phase && this.getGeometrySegments(geometry, phase.topMD, phase.bottomMD)
      .find(s => md >= s.topMD - MD_EPS && md <= s.bottomMD + MD_EPS);
    if (!segment) throw new Error(`Nenhuma fase encontrada para MD ${md}`);
    return this.capacityOfSegment(segment, options);
  }

  /** Resolver pronto para as capacidades usuais. */
  capacityResolver(options: CapacityOptions): CapacityResolver {
    return segment => this.capacityOfSegment(segment, options);
  }

  // ── Volume ↔ altura, atravessando mudanças de geometria ────────────────

  /**
   * Sobe da base consumindo volume trecho a trecho: dentro de cada segmento a
   * capacidade é constante, e ao esgotá-lo o algoritmo continua no segmento
   * imediatamente acima. É o que substitui `altura = volume / capacidade`
   * quando a operação atravessa fases de diâmetros diferentes.
   */
  calculateTopFromVolume(
    geometry: WellGeometry,
    bottomMD: number,
    volumeBbl: number,
    capacityResolver: CapacityResolver,
  ): TopFromVolumeResult {
    const all = this.getGeometrySegments(geometry, 0, bottomMD);
    let remaining = Math.max(0, volumeBbl);
    let filled = 0;
    const used: GeometrySegment[] = [];

    for (let i = all.length - 1; i >= 0; i -= 1) {
      const segment = all[i];
      const capacity = capacityResolver(segment);
      if (!(capacity > 0)) continue; // trecho sem espaço: o fluido não fica ali
      const segmentVolume = capacity * segment.lengthMD;
      if (remaining <= segmentVolume + MD_EPS) {
        used.unshift(segment);
        filled += remaining;
        const height = remaining / capacity;
        return {
          topMD: segment.bottomMD - height,
          filledVolumeBbl: filled,
          remainingVolumeBbl: 0,
          segments: used,
        };
      }
      used.unshift(segment);
      remaining -= segmentVolume;
      filled += segmentVolume;
    }

    // Volume maior do que o poço comporta até a superfície
    return { topMD: 0, filledVolumeBbl: filled, remainingVolumeBbl: remaining, segments: used };
  }

  /** Volume (bbl) contido entre dois MDs, somando trecho a trecho. */
  calculateVolumeBetween(
    geometry: WellGeometry,
    topMD: number,
    bottomMD: number,
    capacityResolver: CapacityResolver,
  ): number {
    return this.getGeometrySegments(geometry, topMD, bottomMD)
      .reduce((total, segment) => total + capacityResolver(segment) * segment.lengthMD, 0);
  }

  // ── Descrição da operação dentro do poço ───────────────────────────────

  /** Onde a operação caiu no poço — alimenta o resumo "Fase da operação". */
  describeInterval(geometry: WellGeometry, interval: OperationInterval): IntervalDescription {
    const top = Math.min(interval.topMD, interval.bottomMD);
    const bottom = Math.max(interval.topMD, interval.bottomMD);
    const phases = this.getPhasesBetween(geometry, top, bottom);
    const segments = this.getGeometrySegments(geometry, top, bottom);
    const primaryPhase = this.phaseAtMD(geometry, bottom) ?? phases.at(-1) ?? null;
    return {
      phases,
      segments,
      primaryPhase,
      crossesPhases: phases.length > 1,
      casingLabel: primaryPhase?.casing ? formatInches(primaryPhase.casing.odIn) : null,
      topTVD: this.tryMdToTvd(geometry, top),
      bottomTVD: this.tryMdToTvd(geometry, bottom),
    };
  }

  // ── Validação (nunca corrige em silêncio) ──────────────────────────────

  validate(geometry: WellGeometry): WellGeometryIssue[] {
    const surveyIssues = this.validateTrajectory(geometry);
    if (this.hasErrors(surveyIssues)) return surveyIssues;
    geometry = this.deriveTrajectoryTvd(geometry);
    const issues: WellGeometryIssue[] = [];
    const phases = this.sortedPhases(geometry);

    if (!Number.isFinite(geometry?.finalMD) || geometry.finalMD <= 0) {
      issues.push({ level: 'error', code: 'WELL_FINAL_MD', message: 'Informe a profundidade final do poço (MD).' });
    }
    if (!Number.isFinite(geometry?.finalTVD) || geometry.finalTVD < 0) {
      issues.push({ level: 'error', code: 'WELL_FINAL_TVD_INVALID', message: 'Informe uma TVD final válida, maior ou igual a zero.' });
    }
    if (Number.isFinite(geometry?.finalTVD) && Number.isFinite(geometry?.finalMD) && geometry.finalTVD > geometry.finalMD + MD_EPS) {
      issues.push({ level: 'error', code: 'WELL_FINAL_TVD', message: 'A TVD final não pode ser maior que o MD final.' });
    }
    if (phases.length === 0) {
      issues.push({ level: 'error', code: 'NO_PHASES', message: 'Cadastre ao menos uma fase do poço.' });
      return issues;
    }

    phases.forEach((phase, index) => {
      const at = (code: string, message: string, level: WellGeometryIssue['level'] = 'error') =>
        issues.push({ level, code, message: `${phase.name || `Fase ${index + 1}`}: ${message}`, phaseId: phase.id, index });

      if (![phase.topMD, phase.bottomMD, phase.topTVD, phase.bottomTVD].every(v => Number.isFinite(v) && v >= 0)) {
        at('PHASE_DEPTH_INVALID', 'informe topo e base em MD e TVD com valores finitos, maiores ou iguais a zero.');
      }
      if (phase.bottomTVD - phase.topTVD > phase.bottomMD - phase.topMD + MD_EPS) {
        at('PHASE_TVD_LENGTH', 'a variação de TVD não pode superar o comprimento em MD.');
      }

      if (!(phase.bottomMD > phase.topMD)) {
        at('PHASE_MD_ORDER', `base MD (${phase.bottomMD} m) deve ser maior que o topo MD (${phase.topMD} m).`);
      }
      if (!geometry.trajectory && phase.bottomTVD < phase.topTVD) {
        at('PHASE_TVD_ORDER', `base TVD (${phase.bottomTVD} m) não pode ser menor que o topo TVD (${phase.topTVD} m).`);
      }
      if (phase.bottomTVD > phase.bottomMD + MD_EPS || phase.topTVD > phase.topMD + MD_EPS) {
        at('PHASE_TVD_GT_MD', 'a TVD não pode ser maior que o MD.');
      }
      if (Number.isFinite(geometry.finalMD) && phase.bottomMD > geometry.finalMD + MD_EPS) {
        at('PHASE_BELOW_TD', `base MD (${phase.bottomMD} m) está abaixo do fundo do poço (${geometry.finalMD} m).`);
      }
      if (!Number.isFinite(phase.holeDiameterIn) || !(phase.holeDiameterIn > 0)) {
        at('PHASE_HOLE_DIAMETER', 'informe o diâmetro do furo desta fase, nominal ou medido, em Estrutura do Poço.');
      }

      const casing = phase.casing;
      if (casing) {
        if (![casing.odIn, casing.idIn].every(v => Number.isFinite(v) && v > 0)) {
          at('CASING_DIAMETER', 'OD e ID do revestimento devem ser maiores que zero.');
        } else if (casing.idIn >= casing.odIn) {
          at('CASING_ID_GE_OD', `ID do revestimento (${casing.idIn}") deve ser menor que o OD (${casing.odIn}").`);
        }
        if (!Number.isFinite(casing.bottomMD) || casing.bottomMD < 0 ||
          (casing.topMD != null && (!Number.isFinite(casing.topMD) || casing.topMD < 0))) {
          at('CASING_DEPTH_INVALID', 'informe profundidades válidas para o revestimento.');
        }
        if (casing.odIn > 0 && phase.holeDiameterIn > 0 && casing.odIn > phase.holeDiameterIn + MD_EPS) {
          at('CASING_OD_GT_HOLE', `OD do revestimento (${casing.odIn}") não cabe no furo informado (${phase.holeDiameterIn}"). Revise o diâmetro do furo e o revestimento desta fase em Estrutura do Poço.`);
        }
        if (casing.topMD != null && casing.topMD >= casing.bottomMD) {
          at('CASING_MD_ORDER', 'o topo do revestimento deve ficar acima da sapata.');
        }
        if (casing.bottomMD > phase.bottomMD + MD_EPS || casing.bottomMD < phase.topMD - MD_EPS) {
          at('CASING_OUT_OF_PHASE', `a sapata do revestimento (${casing.bottomMD} m) está fora do intervalo da fase.`);
        }
      }

      const shoe = phase.shoe;
      if (shoe) {
        if (![shoe.md, shoe.tvd].every(v => Number.isFinite(v) && v >= 0)) {
          at('SHOE_DEPTH_INVALID', 'informe MD e TVD válidos para a sapata.');
        }
        if (shoe.md < phase.topMD - MD_EPS || shoe.md > phase.bottomMD + MD_EPS) {
          at('SHOE_OUT_OF_PHASE', `sapata em ${shoe.md} m está fora do intervalo da fase (${phase.topMD}–${phase.bottomMD} m).`);
        }
        if (Number.isFinite(shoe.tvd) && shoe.tvd > shoe.md + MD_EPS) {
          at('SHOE_TVD_GT_MD', 'a TVD da sapata não pode ser maior que o MD.');
        }
      }
    });

    if (phases[0].topMD > MD_EPS) {
      issues.push({
        level: 'warning',
        code: 'FIRST_PHASE_GAP',
        message: `A primeira fase começa em ${phases[0].topMD} m — o trecho 0–${phases[0].topMD} m não tem geometria cadastrada.`,
        phaseId: phases[0].id,
        index: 0,
      });
    }

    for (let i = 1; i < phases.length; i += 1) {
      const previous = phases[i - 1];
      const current = phases[i];
      const delta = current.topMD - previous.bottomMD;
      if (Math.abs(delta) <= MD_EPS && Math.abs(current.topTVD - previous.bottomTVD) > MD_EPS) {
        issues.push({
          level: 'error', code: 'PHASE_TVD_DISCONTINUITY',
          message: `O topo TVD de ${current.name} deve coincidir com a base TVD de ${previous.name}.`,
          phaseId: current.id, index: i,
        });
      }
      if (delta < -MD_EPS) {
        issues.push({
          level: 'error',
          code: 'PHASE_OVERLAP',
          message: `${current.name || `Fase ${i + 1}`} (topo ${current.topMD} m) sobrepõe ${previous.name || `Fase ${i}`} (base ${previous.bottomMD} m).`,
          phaseId: current.id,
          index: i,
        });
      } else if (delta > MD_EPS) {
        issues.push({
          level: 'error',
          code: 'PHASE_GAP',
          message: `Há um vazio de ${delta.toFixed(1)} m entre ${previous.name || `Fase ${i}`} (base ${previous.bottomMD} m) e ${current.name || `Fase ${i + 1}`} (topo ${current.topMD} m).`,
          phaseId: current.id,
          index: i,
        });
      }
    }

    const deepest = phases.at(-1)!;
    if (Math.abs(geometry.finalMD - deepest.bottomMD) <= MD_EPS &&
      Math.abs(geometry.finalTVD - deepest.bottomTVD) > MD_EPS) {
      issues.push({ level: 'error', code: 'WELL_FINAL_TVD_MISMATCH', message: 'A TVD final deve coincidir com a base TVD da última fase.' });
    }
    if (Number.isFinite(geometry.finalMD) && geometry.finalMD - deepest.bottomMD > MD_EPS) {
      issues.push({
        level: 'warning',
        code: 'TD_NOT_COVERED',
        message: `As fases terminam em ${deepest.bottomMD} m, acima do fundo do poço (${geometry.finalMD} m).`,
      });
    }

    return issues;
  }

  /** Valida um intervalo de operação contra a estrutura do poço. */
  validateInterval(geometry: WellGeometry, interval: OperationInterval, label = 'Intervalo'): WellGeometryIssue[] {
    const issues: WellGeometryIssue[] = [];
    const { topMD, bottomMD } = interval;

    if (!Number.isFinite(topMD) || !Number.isFinite(bottomMD)) {
      issues.push({ level: 'error', code: 'INTERVAL_INVALID', message: `${label}: informe topo e base em MD.` });
      return issues;
    }
    if (!(bottomMD > topMD)) {
      issues.push({ level: 'error', code: 'INTERVAL_ORDER', message: `${label}: a base (${bottomMD} m) deve ser maior que o topo (${topMD} m).` });
    }
    if (topMD < -MD_EPS) {
      issues.push({ level: 'error', code: 'INTERVAL_ABOVE_SURFACE', message: `${label}: o topo não pode ser negativo.` });
    }
    if (Number.isFinite(geometry?.finalMD) && bottomMD > geometry.finalMD + MD_EPS) {
      issues.push({
        level: 'error',
        code: 'INTERVAL_BELOW_TD',
        message: `${label} ${topMD} – ${bottomMD} m: o intervalo informado está abaixo do fundo do poço (${geometry.finalMD} m).`,
      });
    }
    for (const md of [topMD, bottomMD]) {
      if (Number.isFinite(md) && !this.phaseAtMD(geometry, md)) {
        issues.push({
          level: 'error',
          code: 'INTERVAL_OUT_OF_PHASES',
          message: `${label}: ${md} m não pertence a nenhuma fase cadastrada.`,
        });
      }
    }
    return issues;
  }

  /**
   * Valida canhoneados — sem clamp silencioso: intervalo fora do poço vira erro
   * visível para o usuário, não um valor corrigido por baixo dos panos.
   */
  validatePerforations(geometry: WellGeometry, perforations: PerforationInterval[]): WellGeometryIssue[] {
    const issues: WellGeometryIssue[] = [];
    const list = perforations ?? [];

    list.forEach((perf, index) => {
      const label = `Canhoneado ${index + 1} (${perf.topMD} – ${perf.bottomMD} m)`;
      issues.push(...this.validateInterval(geometry, perf, label).map(issue => ({ ...issue, index })));
    });

    const sorted = [...list].sort((a, b) => a.topMD - b.topMD);
    for (let i = 1; i < sorted.length; i += 1) {
      if (sorted[i].topMD < sorted[i - 1].bottomMD - MD_EPS) {
        issues.push({
          level: 'error',
          code: 'PERF_OVERLAP',
          message: `Canhoneados sobrepostos: ${sorted[i - 1].topMD}–${sorted[i - 1].bottomMD} m e ${sorted[i].topMD}–${sorted[i].bottomMD} m.`,
        });
      }
    }
    return issues;
  }

  /** Caminho da coluna de trabalho e folga do anular, da superfície até sua base. */
  validateWorkString(geometry: WellGeometry, bottomMD: number, pipeOD: number, pipeID: number): WellGeometryIssue[] {
    const issues: WellGeometryIssue[] = [];
    if (![pipeOD, pipeID].every(v => Number.isFinite(v) && v > 0) || pipeID >= pipeOD) {
      issues.push({ level: 'error', code: 'WORK_STRING_DIAMETER', message: 'Informe diâmetros positivos para a coluna, com ID menor que OD.' });
      return issues;
    }
    if (!Number.isFinite(bottomMD) || bottomMD <= 0) return issues; // intervalo já validado
    const segments = this.getGeometrySegments(geometry, 0, bottomMD);
    if (Math.abs(segments.reduce((sum, s) => sum + s.lengthMD, 0) - bottomMD) > MD_EPS) {
      issues.push({ level: 'error', code: 'WORK_STRING_GAP', message: 'Cadastre a geometria contínua da superfície até a base da coluna para calcular a hidráulica.' });
    }
    for (const s of segments) if (pipeOD >= s.innerDiameterIn) {
      issues.push({ level: 'error', code: 'WORK_STRING_FIT', phaseId: s.phaseId,
        message: `A coluna de ${pipeOD}" não tem folga no trecho ${s.topMD}–${s.bottomMD} m de ${s.phaseName} (diâmetro interno ${s.innerDiameterIn}").` });
    }
    return issues;
  }

  hasErrors(issues: WellGeometryIssue[]): boolean {
    return issues.some(issue => issue.level === 'error');
  }

  // ── Migração ───────────────────────────────────────────────────────────

  /**
   * Adapter dos campos legados de seção única. Gera fases contínuas de 0 até o
   * fundo do poço — a seção informada vira a fase de trabalho, e os trechos
   * acima/abaixo dela são preenchidos para que MD↔TVD e as capacidades tenham
   * cobertura em todo o poço. Cálculos novos devem consumir `WellGeometry`,
   * nunca mais os campos legados.
   */
  legacySectionToWellGeometry(legacy: LegacySectionFields): WellGeometry {
    const startMD = Math.min(legacy.sectionStartMD, legacy.sectionEndMD);
    const endMD = Math.max(legacy.sectionStartMD, legacy.sectionEndMD);
    const startTVD = Math.min(legacy.sectionStartTVD, legacy.sectionEndTVD);
    const endTVD = Math.max(legacy.sectionStartTVD, legacy.sectionEndTVD);
    const finalMD = Math.max(legacy.wellFinalMD ?? endMD, endMD);
    const finalTVD = Math.max(legacy.wellFinalTVD ?? endTVD, endTVD);
    const holeDiameterIn = legacy.holeDiameterIn && legacy.holeDiameterIn > 0 ? legacy.holeDiameterIn : 8.5;
    const casing = legacy.casingOD && legacy.casingID && legacy.casingID < legacy.casingOD
      ? { odIn: legacy.casingOD, idIn: legacy.casingID }
      : null;

    const phases: WellPhase[] = [];
    if (startMD > MD_EPS) {
      phases.push({
        id: 'legacy-above',
        name: 'Trecho acima da seção',
        topMD: 0, bottomMD: startMD,
        topTVD: 0, bottomTVD: startTVD,
        holeDiameterIn,
        casing: casing ? { ...casing, bottomMD: startMD } : undefined,
        type: 'SURFACE',
      });
    }
    phases.push({
      id: 'legacy-section',
      name: 'Seção de trabalho',
      topMD: startMD, bottomMD: endMD,
      topTVD: startTVD, bottomTVD: endTVD,
      holeDiameterIn,
      casing: casing ? { ...casing, bottomMD: endMD } : undefined,
      shoe: casing ? { md: endMD, tvd: endTVD } : undefined,
      type: 'PRODUCTION',
    });
    if (finalMD > endMD + MD_EPS) {
      phases.push({
        id: 'legacy-below',
        name: 'Trecho abaixo da seção',
        topMD: endMD, bottomMD: finalMD,
        topTVD: endTVD, bottomTVD: finalTVD,
        holeDiameterIn,
        type: 'OPEN_HOLE',
      });
    }

    return { finalMD, finalTVD, phases };
  }
}
