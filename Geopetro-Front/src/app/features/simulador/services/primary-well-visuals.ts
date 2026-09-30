import type { WellCaliperProfile } from '../models/caliper.model';
import type { WellGeometry } from '../models/well-geometry.model';
import { caliperAtMD } from './caliper-las';
import { WellGeometryService } from './well-geometry.service';
import { WellSpatialPath } from './well-spatial-path';

export interface VisualPoint { md: number; tvd: number; north: number; east: number }
export interface VisualLine { x1: number; y1: number; x2: number; y2: number; width: number; measured: boolean; md1: number; md2: number }
export interface VisualTick { position: number; label: string }
export interface VisualMarker { x: number; y: number; label: string }
export interface PrimaryWellVisualModel {
  points: VisualPoint[];
  profile: {
    center: string; hole: VisualLine[]; cement: VisualLine[]; casing: VisualLine[];
    xTicks: VisualTick[]; yTicks: VisualTick[]; markers: VisualMarker[];
  };
  plan: { center: string; xTicks: VisualTick[]; yTicks: VisualTick[]; stations: { x: number; y: number }[] };
  caliper: {
    d1: string; d2: string; nominal: string; envelope: string;
    minIn: number; maxIn: number; startMD: number; stopMD: number;
    xTicks: VisualTick[]; yTicks: VisualTick[];
  } | null;
  bounds: { topMD: number; bottomMD: number; minTVD: number; maxTVD: number; minDeparture: number; maxDeparture: number };
  /** Falso no squeeze e no tampão, que não usam caliper: some a figura, o aviso e a legenda. */
  showCaliper: boolean;
}

export interface PrimaryWellVisualInterval { phaseId: string; topMD: number; bottomMD: number }
/** `annulus`: bainha em volta do tubo (primária); `wellbore`: poço cheio (tampão, squeeze). */
export interface WellVisualCement { topMD: number; bottomMD: number; location: 'annulus' | 'wellbore' }
export interface WellVisualOptions {
  caliper: WellCaliperProfile | null;
  showCaliper: boolean;
  cement: WellVisualCement[];
  /** Trechos com tubo desenhado (revestimento da primária, coluna de trabalho). */
  tubulars: { topMD: number; bottomMD: number }[];
  markers: { md: number; label: string }[];
  interval?: PrimaryWellVisualInterval;
}

export const VISUAL_WIDTH = 720;
export const VISUAL_HEIGHT = 460;
const LEFT = 76; const RIGHT = 28; const TOP = 48; const BOTTOM = 52;
const PLOT_W = VISUAL_WIDTH - LEFT - RIGHT; const PLOT_H = VISUAL_HEIGHT - TOP - BOTTOM;
const path = (points: { x: number; y: number }[]) => points.map((point, index) =>
  `${index ? 'L' : 'M'}${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ');

function ticks(min: number, max: number, count: number, map: (value: number) => number, digits = 0): VisualTick[] {
  if (!(max > min)) return [{ position: map(min), label: min.toFixed(digits) }];
  return Array.from({ length: count }, (_, index) => {
    const value = min + (max - min) * index / (count - 1);
    return { position: map(value), label: value.toFixed(digits) };
  });
}

function pointAt(md: number, spatial: WellSpatialPath | null, geo: WellGeometryService,
  geometry: WellGeometry): VisualPoint {
  if (spatial) return spatial.at(md);
  return { md, north: 0, east: 0, tvd: geo.mdToTvd(geometry, md) };
}

/** Primária: bainha do TOC à sapata em volta do revestimento, com caliper quando houver. */
export function buildPrimaryWellVisualModel(geometry: WellGeometry, caliper: WellCaliperProfile | null,
  tocMD: number | null, shoeMD: number, interval?: PrimaryWellVisualInterval): PrimaryWellVisualModel {
  const cementTop = tocMD ?? shoeMD;
  return buildWellVisualModel(geometry, { caliper, showCaliper: true, interval,
    cement: [{ topMD: cementTop, bottomMD: shoeMD, location: 'annulus' }],
    tubulars: [{ topMD: 0, bottomMD: shoeMD }],
    markers: [{ md: cementTop, label: 'TOC' }, { md: shoeMD, label: 'Sapata' }] });
}

export function buildWellVisualModel(geometry: WellGeometry, options: WellVisualOptions): PrimaryWellVisualModel {
  const { interval } = options;
  const caliper = options.showCaliper ? options.caliper : null;
  const geo = new WellGeometryService();
  const topMD = interval?.topMD ?? 0;
  const bottomMD = interval?.bottomMD ?? geometry.finalMD;
  const intervalPhase = interval ? geometry.phases.find(phase => phase.id === interval.phaseId) : null;
  const depths = new Set<number>([topMD, bottomMD,
    ...geometry.phases.flatMap(phase => [phase.topMD, phase.bottomMD])]);
  const boundaries = [...options.cement.flatMap(entry => [entry.topMD, entry.bottomMD]),
    ...options.tubulars.flatMap(entry => [entry.topMD, entry.bottomMD]), ...options.markers.map(entry => entry.md)];
  for (const md of boundaries) if (md >= topMD && md <= bottomMD) depths.add(md);
  for (let i = 1; i < 121; i += 1) depths.add(topMD + (bottomMD - topMD) * i / 120);
  geometry.trajectory?.stations.filter(station => station.md >= topMD && station.md <= bottomMD)
    .forEach(station => depths.add(station.md));
  if (caliper) {
    const stride = Math.max(1, Math.ceil(caliper.samples.length / 220));
    caliper.samples.forEach((sample, index) => { if (index % stride === 0) depths.add(sample.md); });
    if (caliper.startMD >= topMD && caliper.startMD <= bottomMD) depths.add(caliper.startMD);
    if (caliper.stopMD >= topMD && caliper.stopMD <= bottomMD) depths.add(caliper.stopMD);
  }
  let spatial: WellSpatialPath | null = null;
  try { if (geometry.trajectory) spatial = new WellSpatialPath(geometry); } catch { spatial = null; }
  const points: VisualPoint[] = [...depths].filter(md => md >= topMD && md <= bottomMD)
    .sort((a, b) => a - b).map(md => pointAt(md, spatial, geo, geometry));
  const departures = points.map(point => Math.hypot(point.north, point.east));
  const minDeparture = Math.min(...departures); const maxDeparture = Math.max(...departures);
  const minTVD = Math.min(...points.map(point => point.tvd)); const maxTVD = Math.max(...points.map(point => point.tvd));
  const departureRange = maxDeparture - minDeparture;
  const departureSpan = Math.max(1, departureRange);
  const tvdSpan = Math.max(1, maxTVD - minTVD);
  const profileX = (departure: number) => departureRange < 1e-6
    ? LEFT + PLOT_W / 2 : LEFT + (departure - minDeparture) / departureSpan * PLOT_W;
  const profileY = (tvd: number) => TOP + (tvd - minTVD) / tvdSpan * PLOT_H;
  const profilePoint = (point: VisualPoint) => ({ x: profileX(Math.hypot(point.north, point.east)), y: profileY(point.tvd) });
  const minEast = Math.min(...points.map(point => point.east)); const maxEast = Math.max(...points.map(point => point.east));
  const minNorth = Math.min(...points.map(point => point.north)); const maxNorth = Math.max(...points.map(point => point.north));
  const planSpan = Math.max(1, maxEast - minEast, maxNorth - minNorth) * 1.12;
  const centerEast = (minEast + maxEast) / 2; const centerNorth = (minNorth + maxNorth) / 2;
  const planMinEast = centerEast - planSpan / 2; const planMaxEast = centerEast + planSpan / 2;
  const planMinNorth = centerNorth - planSpan / 2; const planMaxNorth = centerNorth + planSpan / 2;
  const planX = (east: number) => LEFT + (east - planMinEast) / planSpan * PLOT_W;
  const planY = (north: number) => TOP + (planMaxNorth - north) / planSpan * PLOT_H;
  const planPoint = (point: VisualPoint) => ({ x: planX(point.east), y: planY(point.north) });

  const diameters = points.map(point => {
    const phase = geometry.phases.find(p => point.md >= p.topMD && point.md <= p.bottomMD) ?? geometry.phases.at(-1);
    const measured = caliper ? caliperAtMD(caliper.samples, point.md) : null;
    return { measured, effective: measured ? Math.sqrt(measured.ehd1In * measured.ehd2In) : phase?.holeDiameterIn ?? 1 };
  });
  const minD = Math.min(...diameters.map(item => item.effective));
  const maxD = Math.max(...diameters.map(item => item.effective));
  const radialWidth = (diameter: number) => 14 + (diameter - minD) / Math.max(1e-6, maxD - minD) * 18;
  const profileLines = points.slice(1).map((point, index) => {
    const a = profilePoint(points[index]); const b = profilePoint(point); const d = diameters[index + 1];
    return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, width: radialWidth(d.effective), measured: !!d.measured,
      md1: points[index].md, md2: point.md };
  });
  const lineInInterval = (line: VisualLine, top: number, bottom: number) => {
    const middle = (line.md1 + line.md2) / 2; return middle >= top && middle <= bottom;
  };
  const cement = options.cement.flatMap(entry => profileLines
    .filter(line => lineInInterval(line, entry.topMD, entry.bottomMD))
    // A bainha fica um pouco mais estreita que o furo; o tampão ocupa o poço inteiro.
    .map(line => ({ ...line, width: entry.location === 'annulus' ? Math.max(13, line.width - 2) : line.width })));
  const casing = profileLines.filter(line => options.tubulars.some(entry =>
    lineInInterval(line, entry.topMD, entry.bottomMD))).map(line => ({ ...line, width: 10 }));
  const markers: VisualMarker[] = [];
  for (const { md, label } of options.markers) {
    if (md < 0 || md > geometry.finalMD) continue;
    const projected = profilePoint(pointAt(md, spatial, geo, geometry));
    markers.push({ ...projected, label: `${label} ${md.toFixed(1)} m MD` });
  }

  let caliperChart: PrimaryWellVisualModel['caliper'] = null;
  const caliperTop = caliper ? Math.max(topMD, caliper.startMD) : 0;
  const caliperBottom = caliper ? Math.min(bottomMD, caliper.stopMD) : 0;
  if (caliper && caliperBottom > caliperTop) {
    const first = caliperAtMD(caliper.samples, caliperTop);
    const last = caliperAtMD(caliper.samples, caliperBottom);
    const rows = [first, ...caliper.samples.filter(sample => sample.md > caliperTop && sample.md < caliperBottom), last]
      .filter((sample, index, all): sample is NonNullable<typeof sample> => !!sample && all.findIndex(other => other?.md === sample.md) === index);
    const coveredPhases = intervalPhase ? [intervalPhase] : geometry.phases.filter(phase =>
      Math.max(phase.topMD, caliperTop) < Math.min(phase.bottomMD, caliperBottom));
    const nominalDiameters = coveredPhases.map(phase => phase.holeDiameterIn);
    const rawMin = Math.min(...rows.flatMap(sample => [sample.ehd1In, sample.ehd2In]), ...nominalDiameters);
    const rawMax = Math.max(...rows.flatMap(sample => [sample.ehd1In, sample.ehd2In]), ...nominalDiameters);
    const margin = Math.max(.5, (rawMax - rawMin) * .08);
    const trackMax = rawMax + margin;
    const centerX = LEFT + PLOT_W / 2;
    const halfTrack = PLOT_W / 2;
    const xLeft = (diameter: number) => centerX - diameter / trackMax * halfTrack;
    const xRight = (diameter: number) => centerX + diameter / trackMax * halfTrack;
    const y = (md: number) => TOP + (md - caliperTop) / (caliperBottom - caliperTop) * PLOT_H;
    const leftEdge = rows.map(sample => ({ x: xLeft(sample.ehd1In), y: y(sample.md) }));
    const rightEdge = [...rows].reverse().map(sample => ({ x: xRight(sample.ehd2In), y: y(sample.md) }));
    const tickValues = Array.from({ length: 5 }, (_, index) => trackMax * index / 4);
    const diameterTicks = [
      ...[...tickValues].reverse().slice(0, -1).map(value => ({ position: xLeft(value), label: value.toFixed(1) })),
      { position: centerX, label: '0' },
      ...tickValues.slice(1).map(value => ({ position: xRight(value), label: value.toFixed(1) })),
    ];
    caliperChart = {
      d1: path(rows.map(sample => ({ x: xLeft(sample.ehd1In), y: y(sample.md) }))),
      d2: path(rows.map(sample => ({ x: xRight(sample.ehd2In), y: y(sample.md) }))),
      nominal: coveredPhases.map(phase => {
        const segmentTop = Math.max(phase.topMD, caliperTop);
        const segmentBottom = Math.min(phase.bottomMD, caliperBottom);
        return `${path([{ x: xLeft(phase.holeDiameterIn), y: y(segmentTop) },
          { x: xLeft(phase.holeDiameterIn), y: y(segmentBottom) }])} ${path([
          { x: xRight(phase.holeDiameterIn), y: y(segmentTop) },
          { x: xRight(phase.holeDiameterIn), y: y(segmentBottom) }])}`;
      }).join(' '),
      envelope: `${path(leftEdge)} ${rightEdge.map(point => `L${point.x.toFixed(2)},${point.y.toFixed(2)}`).join(' ')} Z`,
      minIn: rawMin, maxIn: rawMax, startMD: caliperTop, stopMD: caliperBottom,
      xTicks: diameterTicks, yTicks: ticks(caliperTop, caliperBottom, 6, y, 1),
    };
  }
  return {
    points,
    profile: {
      center: path(points.map(profilePoint)), hole: profileLines, cement, casing, markers,
      xTicks: ticks(minDeparture, maxDeparture, 6, profileX, 1), yTicks: ticks(minTVD, maxTVD, 6, profileY, 1),
    },
    plan: {
      center: path(points.map(planPoint)),
      xTicks: ticks(planMinEast, planMaxEast, 5, planX, 1), yTicks: ticks(planMinNorth, planMaxNorth, 5, planY, 1),
      stations: (geometry.trajectory?.stations ?? []).filter(station => station.md >= topMD && station.md <= bottomMD)
        .map(station => planPoint(pointAt(station.md, spatial, geo, geometry))),
    },
    caliper: caliperChart,
    bounds: { topMD, bottomMD, minTVD, maxTVD, minDeparture, maxDeparture },
    showCaliper: options.showCaliper,
  };
}

const lineSvg = (line: VisualLine, color: string, width = line.width) =>
  `<line x1="${line.x1}" y1="${line.y1}" x2="${line.x2}" y2="${line.y2}" stroke="${color}" stroke-width="${width}" stroke-linecap="butt"/>`;
const gridSvg = (xTicks: VisualTick[], yTicks: VisualTick[]) => [
  ...xTicks.map(tick => `<line x1="${tick.position}" y1="${TOP}" x2="${tick.position}" y2="${TOP + PLOT_H}" stroke="#e5e7eb"/>`),
  ...yTicks.map(tick => `<line x1="${LEFT}" y1="${tick.position}" x2="${LEFT + PLOT_W}" y2="${tick.position}" stroke="#e5e7eb"/>`),
  ...xTicks.map(tick => `<text x="${tick.position}" y="${VISUAL_HEIGHT - 22}" text-anchor="middle" font-family="Arial" font-size="10" fill="#64748b">${tick.label}</text>`),
  ...yTicks.map(tick => `<text x="${LEFT - 10}" y="${tick.position + 3}" text-anchor="end" font-family="Arial" font-size="10" fill="#64748b">${tick.label}</text>`),
].join('');

export interface PrimaryReportVisual { id: string; title: string; svg: string; landscape: boolean }

export function primaryReportVisuals(model: PrimaryWellVisualModel,
  phase?: { id: string; name: string }): PrimaryReportVisual[] {
  const suffix = phase ? `-${phase.id}` : '';
  const titleSuffix = phase ? ` - ${phase.name}` : '';
  const frame = (content: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${VISUAL_WIDTH} ${VISUAL_HEIGHT}" role="img"><rect width="100%" height="100%" fill="white"/>${content}</svg>`;
  const profile = gridSvg(model.profile.xTicks, model.profile.yTicks)
    + model.profile.hole.map(line => lineSvg(line, line.measured ? '#f2c94c' : '#eadcc4')).join('')
    + model.profile.cement.map(line => lineSvg(line, '#39b86b')).join('')
    + model.profile.casing.map(line => lineSvg(line, '#334155')).join('')
    + model.profile.casing.map(line => lineSvg(line, '#f8fafc', 6)).join('')
    + `<path d="${model.profile.center}" fill="none" stroke="#0f4c81" stroke-width="2"/>`
    + `<text x="${VISUAL_WIDTH / 2}" y="${VISUAL_HEIGHT - 5}" text-anchor="middle" font-family="Arial" font-size="11">Afastamento horizontal (m)</text>`;
  const plan = gridSvg(model.plan.xTicks, model.plan.yTicks)
    + `<path d="${model.plan.center}" fill="none" stroke="#dbeafe" stroke-width="10" stroke-linecap="round" stroke-linejoin="round"/>`
    + `<path d="${model.plan.center}" fill="none" stroke="#0f4c81" stroke-width="3"/>`
    + model.plan.stations.map(point => `<circle cx="${point.x}" cy="${point.y}" r="2.5" fill="#fff" stroke="#0f4c81"/>`).join('')
    + `<text x="${VISUAL_WIDTH - 50}" y="28" font-family="Arial" font-size="13" font-weight="bold">N &#8593;</text>`;
  const visuals: PrimaryReportVisual[] = [
    { id: `profile${suffix}`, title: `Perfil direcional e cimenta\u00e7\u00e3o${titleSuffix}`, svg: frame(profile), landscape: true },
    { id: `plan${suffix}`, title: `Planta da trajet\u00f3ria${titleSuffix}`, svg: frame(plan), landscape: true },
  ];
  if (model.caliper) {
    const chart = model.caliper;
    const caliper = `<defs><pattern id="report-caliper-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="8" height="8" fill="#c98245" fill-opacity=".72"/><line x1="0" y1="0" x2="0" y2="8" stroke="#5f3a1f" stroke-width="1.4"/></pattern></defs>`
      + gridSvg(chart.xTicks, chart.yTicks)
      + `<path d="${chart.envelope}" fill="url(#report-caliper-hatch)" stroke="none"/>`
      + `<line x1="${VISUAL_WIDTH / 2}" y1="${TOP}" x2="${VISUAL_WIDTH / 2}" y2="${TOP + PLOT_H}" stroke="#334155" stroke-width="1.2"/>`
      + `<path d="${chart.d1}" fill="none" stroke="#06b6d4" stroke-width="2.5"/>`
      + `<path d="${chart.d2}" fill="none" stroke="#2563eb" stroke-width="2.5"/>`
      + `<path d="${chart.nominal}" fill="none" stroke="#f59e0b" stroke-width="1.7" stroke-dasharray="7 5"/>`
      + `<text x="${VISUAL_WIDTH / 2}" y="${VISUAL_HEIGHT - 5}" text-anchor="middle" font-family="Arial" font-size="11">Di&#226;metro indicado por eixo (pol)</text>`;
    visuals.push({ id: `caliper${suffix}`, title: `Curvas de caliper por MD${titleSuffix}`, landscape: true, svg: frame(caliper) });
  }
  return visuals;
}
