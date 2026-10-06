import * as THREE from 'three';
import type { WellGeometry, WellOverlay } from '../../models/well-geometry.model';
import type { WellSpatialPath } from '../../services/well-spatial-path';
import { wellWallSections } from '../../services/work-string-config';

/**
 * Camadas do poço em 3D com os diâmetros reais (polegadas) de cada coisa em cada
 * profundidade: formação em volta do furo, revestimentos, coluna de trabalho, fluidos
 * em cada zona e canhoneados. O desenho só amplia os diâmetros; as proporções entre as
 * camadas são as do poço.
 *
 * Duas camadas nunca ocupam o mesmo raio na mesma profundidade: onde há canhoneado a
 * formação dá lugar a ele, e a sapata é o último trecho do próprio aço. Assim as faces
 * do corte, que ficam todas no mesmo plano, não disputam o mesmo pixel. O que sobra
 * dentro da parede, sem fluido da operação nem coluna, é o fluido do poço.
 */
export interface WorkString3d { odIn: number; idIn: number }
/** Coluna do formulário para o 3D; medidas ausentes ou incoerentes ficam de fora. */
export function workString3d(odIn: unknown, idIn: unknown): WorkString3d | null {
  const od = Number(odIn); const id = Number(idIn);
  return Number.isFinite(od) && Number.isFinite(id) && id > 0 && od > id ? { odIn: od, idIn: id } : null;
}
export type WellLayerKind = 'formation' | 'casing' | 'shoe' | 'string' | 'fluid' | 'well-fluid' | 'perforation' | 'squeeze';
export interface WellLayer {
  kind: WellLayerKind;
  topMD: number;
  bottomMD: number;
  /** Diâmetro interno da camada (0 = até o eixo), em polegadas. */
  innerIn: number;
  outerIn: number;
  color: string;
  /** Índice do overlay de origem (fluidos, canhoneados), para rótulo e legenda. */
  overlay?: number;
}

/** Espessura desenhada da formação em volta do furo, como fração do diâmetro do furo. */
export const FORMATION_BAND = 0.5;
export const SHOE_COLOR = '#1e293b';
export const CASING_COLOR = '#a7b3c2';
export const STRING_COLOR = '#56657a';
export const WELL_FLUID_COLOR = '#c9dcef';
const EPS = 1e-6;
type Range = readonly [number, number];

/** [top, bottom] sem os trechos de `holes`. */
export function subtractRanges(range: Range, holes: Range[]): Range[] {
  let parts: Range[] = [range];
  for (const [a, b] of holes) {
    parts = parts.flatMap(([top, bottom]) => {
      if (b <= top + EPS || a >= bottom - EPS) return [[top, bottom] as Range];
      return [[top, Math.min(a, bottom)] as Range, [Math.max(b, top), bottom] as Range]
        .filter(([x, y]) => y > x + EPS);
    });
  }
  return parts;
}

export function wellLayers(geometry: WellGeometry, overlays: WellOverlay[], workString: WorkString3d | null,
  phaseColor: (index: number) => string, overlayColor: (overlay: WellOverlay) => string,
  shoeLengthMD = 0): WellLayer[] {
  const layers: WellLayer[] = [];
  const wall = wellWallSections(geometry, geometry.finalMD);
  const casings = geometry.phases.filter(p => p.casing && p.casing.idIn > 0 && p.casing.bottomMD > 0)
    .map(p => ({ topMD: p.casing!.topMD ?? 0, bottomMD: p.casing!.bottomMD, idIn: p.casing!.idIn, odIn: p.casing!.odIn }));
  const casingsAt = (md: number) => casings.filter(c => c.topMD <= md && c.bottomMD > md).sort((a, b) => a.idIn - b.idIn);
  const holeAt = (md: number) => geometry.phases.find(p => p.topMD <= md && p.bottomMD > md)?.holeDiameterIn
    ?? geometry.phases.at(-1)?.holeDiameterIn ?? 0;
  /** Parede em volta de um revestimento: o ID do revestimento de fora ou o furo. */
  const wallOutside = (md: number, odIn: number) =>
    casingsAt(md).find(c => c.idIn > odIn + EPS)?.idIn ?? holeAt(md);
  /** Corta [top, bottom] nas mudanças de parede e de revestimento: diâmetros constantes em cada pedaço. */
  const pieces = (top: number, bottom: number) => {
    const cuts = new Set<number>([top, bottom]);
    const inside = (md: number) => md > top + EPS && md < bottom - EPS;
    for (const w of wall) for (const md of [w.topMD, w.bottomMD]) if (inside(md)) cuts.add(md);
    for (const c of casings) for (const md of [c.topMD, c.bottomMD]) if (inside(md)) cuts.add(md);
    for (const p of geometry.phases) for (const md of [p.topMD, p.bottomMD]) if (inside(md)) cuts.add(md);
    const bounds = [...cuts].sort((a, b) => a - b);
    return bounds.slice(1).map((b, i) => {
      const a = bounds[i]; const mid = (a + b) / 2;
      return { topMD: a, bottomMD: b, mid, wallIn: wall.find(w => w.topMD <= mid && w.bottomMD > mid)?.diameterIn ?? holeAt(mid) };
    }).filter(p => p.bottomMD > p.topMD + EPS);
  };

  const perforations = overlays.filter(o => o.type === 'PERFORATION').map(o => [o.topMD, o.bottomMD] as Range);
  const squeezed = overlays.filter(o => o.type === 'SQUEEZE').map(o => [o.topMD, o.bottomMD] as Range);
  geometry.phases.forEach((phase, i) => {
    if (phase.bottomMD <= phase.topMD || phase.holeDiameterIn <= 0) return;
    for (const [topMD, bottomMD] of subtractRanges([phase.topMD, phase.bottomMD], [...perforations, ...squeezed]))
      layers.push({ kind: 'formation', topMD, bottomMD, innerIn: phase.holeDiameterIn,
        outerIn: phase.holeDiameterIn * (1 + FORMATION_BAND), color: phaseColor(i) });
  });
  for (const casing of casings) {
    const shoeTop = Math.max(casing.topMD, casing.bottomMD - shoeLengthMD);
    const steel = { topMD: casing.topMD, bottomMD: shoeLengthMD > 0 ? shoeTop : casing.bottomMD,
      innerIn: casing.idIn, outerIn: casing.odIn };
    layers.push({ ...steel, kind: 'casing', color: CASING_COLOR });
    if (shoeLengthMD > 0) layers.push({ ...steel, kind: 'shoe', topMD: shoeTop, bottomMD: casing.bottomMD, color: SHOE_COLOR });
  }

  // Onde a coluna de trabalho está desenhada, o fluido "do poço todo" se divide em anular
  // e interior dela, para o aço aparecer entre os dois.
  // Sem as medidas da coluna, a mesma proporção da parede vale para o aço e para os fluidos.
  const stringRanges = overlays.filter(o => o.type === 'TUBING').map(o => [o.topMD, o.bottomMD] as Range);
  const inString = (md: number) => stringRanges.some(([a, b]) => md >= a - EPS && md <= b + EPS);
  const pipe = (wallIn: number): WorkString3d => workString ?? { odIn: wallIn * 0.38, idIn: wallIn * 0.32 };
  overlays.forEach((overlay, index) => {
    const color = overlayColor(overlay);
    const ranges = overlay.type === 'SQUEEZE' ? subtractRanges([overlay.topMD, overlay.bottomMD], perforations)
      : [[overlay.topMD, overlay.bottomMD] as Range];
    for (const [top, bottom] of ranges) for (const piece of pieces(top, bottom)) {
      const base = { topMD: piece.topMD, bottomMD: piece.bottomMD, color, overlay: index };
      const casing = casingsAt(piece.mid)[0];
      const string = pipe(piece.wallIn);
      if (overlay.type === 'TUBING') {
        layers.push({ ...base, kind: 'string', innerIn: string.idIn, outerIn: string.odIn });
      } else if (overlay.type === 'PERFORATION' || overlay.type === 'SQUEEZE') {
        // Do aço para dentro da formação, no lugar da faixa de rocha.
        layers.push({ ...base, kind: overlay.type === 'PERFORATION' ? 'perforation' : 'squeeze',
          innerIn: casing ? casing.odIn : piece.wallIn, outerIn: holeAt(piece.mid) * (1 + FORMATION_BAND) });
      } else if (overlay.zone === 'casing-annulus') {
        // Bainha da primária: entre o OD do revestimento-alvo e a parede de fora dele, trecho a
        // trecho (o overlay traz os diâmetros de um trecho só).
        const target = overlay.innerDiameterIn
          ? casingsAt(piece.mid).find(c => Math.abs(c.odIn - overlay.innerDiameterIn!) < 0.01) : casing;
        layers.push({ ...base, kind: 'fluid', innerIn: target?.odIn ?? overlay.innerDiameterIn ?? 0,
          outerIn: target ? wallOutside(piece.mid, target.odIn) : overlay.outerDiameterIn ?? piece.wallIn });
      } else if (overlay.zone === 'tubing') {
        layers.push({ ...base, kind: 'fluid', innerIn: 0, outerIn: inString(piece.mid) ? string.idIn : piece.wallIn });
      } else if (overlay.zone === 'annulus') {
        layers.push({ ...base, kind: 'fluid', innerIn: string.odIn, outerIn: piece.wallIn });
      } else if (inString(piece.mid)) {
        layers.push({ ...base, kind: 'fluid', innerIn: string.odIn, outerIn: piece.wallIn });
        layers.push({ ...base, kind: 'fluid', innerIn: 0, outerIn: string.idIn });
      } else {
        layers.push({ ...base, kind: 'fluid', innerIn: 0, outerIn: piece.wallIn });
      }
    }
  });
  layers.push(...wellFluid(layers.filter(l => l.kind === 'fluid' || l.kind === 'string'), wall, geometry.finalMD, holeAt));
  return layers.filter(layer => layer.bottomMD > layer.topMD + EPS && layer.outerIn > layer.innerIn + EPS);
}

/** O que sobra de [0, parede] em cada profundidade, emendado onde os raios não mudam. */
function wellFluid(inside: WellLayer[], wall: { topMD: number; bottomMD: number; diameterIn: number }[], finalMD: number,
  holeAt: (md: number) => number): WellLayer[] {
  const cuts = new Set<number>([0, finalMD]);
  for (const l of inside) cuts.add(l.topMD).add(l.bottomMD);
  for (const w of wall) cuts.add(w.topMD).add(w.bottomMD);
  const bounds = [...cuts].filter(md => md >= 0 && md <= finalMD).sort((a, b) => a - b);
  const free: WellLayer[] = [];
  for (let i = 1; i < bounds.length; i++) {
    const top = bounds[i - 1]; const bottom = bounds[i];
    if (bottom - top <= EPS) continue;
    const mid = (top + bottom) / 2;
    const wallIn = wall.find(w => w.topMD <= mid && w.bottomMD > mid)?.diameterIn ?? holeAt(mid);
    if (wallIn <= 0) continue;
    const taken = inside.filter(l => l.topMD <= mid && l.bottomMD >= mid && l.innerIn < wallIn)
      .map(l => [l.innerIn, Math.min(l.outerIn, wallIn)] as Range);
    for (const [innerIn, outerIn] of subtractRanges([0, wallIn], taken)) {
      const above = free.find(f => Math.abs(f.bottomMD - top) < EPS && Math.abs(f.innerIn - innerIn) < EPS
        && Math.abs(f.outerIn - outerIn) < EPS);
      if (above) above.bottomMD = bottom;
      else free.push({ kind: 'well-fluid', topMD: top, bottomMD: bottom, innerIn, outerIn, color: WELL_FLUID_COLOR });
    }
  }
  return free;
}

export const toScene = (p: { east: number; north: number; tvd: number }) => new THREE.Vector3(p.east, -p.tvd, -p.north);

/**
 * Referencial na profundidade: T ao longo do poço (para baixo), N a parte de +z (a
 * direção da câmera "Frente") perpendicular a T, e B = T × N. O corte da meia seção é o
 * plano de T e B; a metade do lado de +N sai, e as faces do corte olham para +N.
 */
export interface WellFrame { p: THREE.Vector3; t: THREE.Vector3; n: THREE.Vector3; b: THREE.Vector3 }
export function frameAt(path: WellSpatialPath, md: number, finalMD: number, delta = 0.5): WellFrame {
  const clamp = (x: number) => Math.max(0, Math.min(finalMD, x));
  const p = toScene(path.at(clamp(md)));
  const t = toScene(path.at(clamp(md + delta))).sub(toScene(path.at(clamp(md - delta))));
  if (t.lengthSq() < 1e-12) t.set(0, -1, 0);
  t.normalize();
  let normal = new THREE.Vector3(0, 0, 1).addScaledVector(t, -t.z);
  if (normal.lengthSq() < 1e-8) normal = new THREE.Vector3(1, 0, 0).addScaledVector(t, -t.x);
  normal.normalize();
  return { p, t, n: normal, b: new THREE.Vector3().crossVectors(t, normal).normalize() };
}
/** Direção radial no ângulo θ: de +B (θ = 0), passando por −N (o lado que fica), até −B (θ = π). */
export function radialDirection(frame: WellFrame, theta: number): THREE.Vector3 {
  return frame.b.clone().multiplyScalar(Math.cos(theta)).addScaledVector(frame.n, -Math.sin(theta));
}

/**
 * Sólido fechado de uma camada, varrido ao longo da trajetória: casca externa, casca
 * interna, tampas e, em meia seção, as duas faces do corte. Cada face é orientada para
 * fora do sólido (a normal dada e a ordem dos vértices concordam), para o material poder
 * desenhar só a frente.
 */
export function sweptLayerGeometry(path: WellSpatialPath, topMD: number, bottomMD: number,
  innerRadius: number, outerRadius: number, half: boolean, finalMD: number): THREE.BufferGeometry {
  const n = Math.max(2, Math.min(200, Math.ceil((bottomMD - topMD) / Math.max(finalMD, 1) * 200)));
  const radial = half ? 24 : 40;
  const thetaMax = half ? Math.PI : Math.PI * 2;
  const positions: number[] = []; const normals: number[] = []; const indices: number[] = [];
  const delta = Math.max((bottomMD - topMD) / n * 0.5, 1e-3);
  const frames = Array.from({ length: n + 1 }, (_, k) => frameAt(path, topMD + (bottomMD - topMD) * k / n, finalMD, delta));
  const grid = (rows: number, cols: number, vertex: (row: number, col: number) => [THREE.Vector3, THREE.Vector3]) => {
    const start = positions.length / 3;
    const points: THREE.Vector3[] = []; const vertexNormals: THREE.Vector3[] = [];
    for (let r = 0; r <= rows; r++) for (let c = 0; c <= cols; c++) {
      const [v, nrm] = vertex(r, c);
      points.push(v); vertexNormals.push(nrm);
      positions.push(v.x, v.y, v.z); normals.push(nrm.x, nrm.y, nrm.z);
    }
    // A ordem dos vértices segue a normal: a primeira célula não degenerada decide o lado.
    let flip = false;
    search: for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = r * (cols + 1) + c; const b = a + cols + 1;
      for (const [i, j, k] of [[a, b, a + 1], [a + 1, b, b + 1]]) {
        const cross = new THREE.Vector3().crossVectors(points[j].clone().sub(points[i]), points[k].clone().sub(points[i]));
        if (cross.lengthSq() > 1e-16) { flip = cross.dot(vertexNormals[i].clone().add(vertexNormals[j]).add(vertexNormals[k])) < 0; break search; }
      }
    }
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const a = start + r * (cols + 1) + c; const b = a + cols + 1;
      if (flip) indices.push(a, a + 1, b, a + 1, b + 1, b); else indices.push(a, b, a + 1, a + 1, b, b + 1);
    }
  };
  const at = (k: number, theta: number, radius: number) => frames[k].p.clone().addScaledVector(radialDirection(frames[k], theta), radius);
  grid(n, radial, (k, j) => [at(k, thetaMax * j / radial, outerRadius), radialDirection(frames[k], thetaMax * j / radial)]);
  if (innerRadius > 0)
    grid(n, radial, (k, j) => [at(k, thetaMax * j / radial, innerRadius), radialDirection(frames[k], thetaMax * j / radial).negate()]);
  if (half) for (const theta of [0, Math.PI])
    grid(n, 1, (k, j) => [at(k, theta, j ? outerRadius : innerRadius), frames[k].n.clone()]);
  for (const k of [0, n])
    grid(1, radial, (r, j) => [at(k, thetaMax * j / radial, r ? outerRadius : innerRadius), frames[k].t.clone().multiplyScalar(k ? 1 : -1)]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  return geometry;
}

/**
 * Onde a câmera "Zona da operação" olha: o trecho dos fluidos e dos canhoneados, sem a
 * coluna e o deslocamento, que descem da superfície, com uma margem de cada lado.
 */
export function operationFocus(overlays: WellOverlay[], finalMD: number): Range | null {
  const focus = overlays.filter(o => o.type !== 'TUBING' && o.type !== 'DISPLACEMENT' && o.bottomMD > o.topMD);
  if (!focus.length) return null;
  const top = Math.min(...focus.map(o => o.topMD)); const bottom = Math.max(...focus.map(o => o.bottomMD));
  const margin = Math.max((bottom - top) * 0.25, 15);
  return [Math.max(0, top - margin), Math.min(finalMD, bottom + margin)];
}
