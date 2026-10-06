import type { WellPhaseFormValue } from '../models/well-geometry.form';
import type { SurveyStation, WellGeometryIssue, WellTrajectory } from '../models/well-geometry.model';

const EPS = 1e-7;
/**
 * Estações por fase. Um survey giroscópico tem centenas de estações (o do
 * MINA-28BD tem 138 só na fase de 12¼"); o limite só protege a tela de colagens
 * absurdas, não é critério de engenharia.
 */
export const PHASE_SURVEY_MAX_STATIONS = 1000;

const finiteStation = (station: SurveyStation): boolean =>
  [station.md, station.inclinationDeg, station.azimuthDeg].every(Number.isFinite);

export function validatePhaseSurveys(rows: WellPhaseFormValue[]): WellGeometryIssue[] {
  const issues: WellGeometryIssue[] = [];
  const seen = new Set<number>();
  rows.forEach((phase, phaseIndex) => {
    if (phase.survey?.enabled !== true) return;
    const stations = (phase.survey.stations ?? []) as SurveyStation[];
    const add = (code: string, message: string, index?: number) => issues.push({
      level: 'error' as const, code, message: `${phase.name || `Fase ${phaseIndex + 1}`}: ${message}`,
      phaseId: phase.id, index,
    });
    if (!stations.length) add('PHASE_SURVEY_EMPTY', 'adicione ao menos uma estação ou desative o survey.');
    if (stations.length > PHASE_SURVEY_MAX_STATIONS)
      add('PHASE_SURVEY_LIMIT', `o survey aceita no máximo ${PHASE_SURVEY_MAX_STATIONS} estações por fase.`);
    stations.forEach((station, index) => {
      if (!finiteStation(station)) { add('PHASE_SURVEY_INCOMPLETE', `estação ${index + 1} incompleta.`, index); return; }
      if (station.md < Number(phase.topMD) - EPS || station.md > Number(phase.bottomMD) + EPS)
        add('PHASE_SURVEY_MD_RANGE', `MD ${station.md} m está fora do intervalo da fase.`, index);
      if (station.inclinationDeg < 0 || station.inclinationDeg > 180)
        add('PHASE_SURVEY_INCLINATION', `inclinação da estação ${index + 1} deve ficar entre 0° e 180°.`, index);
      if (station.azimuthDeg < 0 || station.azimuthDeg > 360)
        add('PHASE_SURVEY_AZIMUTH', `azimute da estação ${index + 1} deve ficar entre 0° e 360°.`, index);
      if (seen.has(station.md)) add('PHASE_SURVEY_DUPLICATE_MD', `MD ${station.md} m está repetido.`, index);
      seen.add(station.md);
    });
  });
  return issues;
}

/** Move estações pela MD quando os limites das fases mudam. */
export function redistributePhaseSurveys(rows: WellPhaseFormValue[]): WellPhaseFormValue[] {
  const copies = rows.map(row => ({ ...row, survey: {
    enabled: row.survey?.enabled === true,
    stations: [] as NonNullable<NonNullable<WellPhaseFormValue['survey']>['stations']>,
  } }));
  const all = rows.flatMap(row => row.survey?.enabled ? (row.survey.stations ?? []) : []);
  all.forEach(station => {
    const md = Number(station.md);
    const targetIndex = copies.findIndex((phase, index) => Number.isFinite(md) &&
      md >= Number(phase.topMD) - EPS && (md < Number(phase.bottomMD) - EPS || index === copies.length - 1));
    const fallback = rows.findIndex(row => row.survey?.stations?.includes(station));
    const index = targetIndex >= 0 ? targetIndex : Math.max(0, fallback);
    copies[index].survey!.enabled = true;
    copies[index].survey!.stations!.push({ ...station });
  });
  copies.forEach(row => row.survey!.stations!.sort((a, b) => Number(a.md) - Number(b.md)));
  return copies;
}

/**
 * Monta uma trajetória cumulativa. Fases sem survey são sintetizadas a partir
 * do incremento manual de TVD; a troca de inclinação ocorre em um intervalo
 * numérico desprezível para preservar a continuidade no limite.
 */
export function buildPrimaryTrajectory(rows: WellPhaseFormValue[]): WellTrajectory | undefined {
  if (!rows.some(row => row.survey?.enabled === true)) return undefined;
  const phases = [...rows].sort((a, b) => Number(a.topMD) - Number(b.topMD));
  const stations: SurveyStation[] = [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 }];
  let lastInc = 0; let lastAz = 0;
  const push = (station: SurveyStation): void => {
    const previous = stations.at(-1)!;
    if (Math.abs(previous.md - station.md) <= EPS) {
      stations[stations.length - 1] = station;
      return;
    }
    if (station.md > previous.md) stations.push(station);
  };
  for (const phase of phases) {
    const top = Number(phase.topMD); const bottom = Number(phase.bottomMD);
    if (![top, bottom].every(Number.isFinite) || !(bottom > top)) continue;
    if (stations.at(-1)!.md < top) push({ md: top, inclinationDeg: lastInc, azimuthDeg: lastAz });
    const measured = phase.survey?.enabled === true
      ? (phase.survey.stations ?? []).map(s => ({ md: Number(s.md), inclinationDeg: Number(s.inclinationDeg), azimuthDeg: Number(s.azimuthDeg) }))
        .filter(finiteStation).sort((a, b) => a.md - b.md)
      : [];
    if (measured.length) {
      if (stations.at(-1)!.md < top + EPS) push({ md: top, inclinationDeg: lastInc, azimuthDeg: lastAz });
      measured.forEach(push);
      const last = measured.at(-1)!; lastInc = last.inclinationDeg; lastAz = last.azimuthDeg;
      if (stations.at(-1)!.md < bottom) push({ md: bottom, inclinationDeg: lastInc, azimuthDeg: lastAz });
      continue;
    }
    const deltaMD = bottom - top;
    const deltaTVD = Number(phase.bottomTVD) - Number(phase.topTVD);
    const ratio = Number.isFinite(deltaTVD) ? Math.max(-1, Math.min(1, deltaTVD / deltaMD)) : 1;
    const phaseInc = Math.acos(ratio) * 180 / Math.PI;
    const transitionMD = Math.min(bottom, top + Math.min(1e-5, deltaMD / 1_000_000));
    if (transitionMD > stations.at(-1)!.md) push({ md: transitionMD, inclinationDeg: phaseInc, azimuthDeg: lastAz });
    push({ md: bottom, inclinationDeg: phaseInc, azimuthDeg: lastAz });
    lastInc = phaseInc;
  }
  return stations.length >= 2 ? { stations } : undefined;
}

