import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { WellGeometry, WellOverlay, WellPhase, WellPhaseType } from '../../models/well-geometry.model';
import { WellSpatialPath } from '../../services/well-spatial-path';
import {
  FORMATION_BAND, WellLayer, frameAt, operationFocus, subtractRanges, sweptLayerGeometry, wellLayers, workString3d,
} from './well-3d-layers';

const phase = (id: string, type: WellPhaseType, topMD: number, bottomMD: number, holeDiameterIn: number,
  casing?: { odIn: number; idIn: number; bottomMD: number; topMD?: number }): WellPhase =>
  ({ id, name: id, type, topMD, bottomMD, topTVD: topMD, bottomTVD: bottomMD, holeDiameterIn, ...(casing ? { casing } : {}) });
const well = (finalMD: number, phases: WellPhase[]): WellGeometry => ({ finalMD, finalTVD: finalMD, phases });
const layersOf = (geometry: WellGeometry, overlays: WellOverlay[], ws: { odIn: number; idIn: number } | null, shoe = 0) =>
  wellLayers(geometry, overlays, ws, () => '#ccc', o => o.color ?? o.type, shoe);

/** Nenhum par de camadas divide raio e profundidade: as faces do corte nunca disputam o mesmo pixel. */
function expectNoOverlap(layers: WellLayer[]): void {
  for (let i = 0; i < layers.length; i++) for (let j = i + 1; j < layers.length; j++) {
    const a = layers[i]; const b = layers[j];
    const md = Math.min(a.bottomMD, b.bottomMD) - Math.max(a.topMD, b.topMD);
    const radial = Math.min(a.outerIn, b.outerIn) - Math.max(a.innerIn, b.innerIn);
    if (md > 1e-6 && radial > 1e-6)
      throw new Error(`${a.kind} ${a.topMD}-${a.bottomMD} [${a.innerIn}, ${a.outerIn}] cruza ${b.kind} ${b.topMD}-${b.bottomMD} [${b.innerIn}, ${b.outerIn}]`);
  }
}
const fluid = (layers: WellLayer[], overlay: number) => layers.filter(l => l.overlay === overlay)
  .map(l => ({ top: l.topMD, bottom: l.bottomMD, inner: l.innerIn, outer: l.outerIn }));

// Poço do cenário de exemplo do tampão: 13⅜" até 500 m, 9⅝" até 1800 m, 8½" aberto até 2600 m.
const tampaoWell = () => well(2600, [
  phase('superficie', 'SURFACE', 0, 500, 17.5, { odIn: 13.375, idIn: 12.415, bottomMD: 500 }),
  phase('intermediaria', 'INTERMEDIATE', 500, 1800, 12.25, { odIn: 9.625, idIn: 8.681, bottomMD: 1800 }),
  phase('aberto', 'OPEN_HOLE', 1800, 2600, 8.5),
]);
const tampaoOverlays: WellOverlay[] = [
  { type: 'TUBING', topMD: 0, bottomMD: 2510, label: 'Coluna de trabalho', zone: 'tubing' },
  { type: 'DISPLACEMENT', topMD: 0, bottomMD: 2300, label: 'Fluido de deslocamento', zone: 'tubing' },
  { type: 'SPACER', topMD: 2300, bottomMD: 2370, label: 'Espaçador de trás', zone: 'tubing' },
  { type: 'SPACER', topMD: 2340, bottomMD: 2370, label: 'Espaçador de frente', zone: 'annulus' },
  { type: 'CEMENT', topMD: 2370, bottomMD: 2510, label: 'Pasta de cimento', zone: 'full' },
];
// Poço do exemplo do squeeze: 13⅜" até 500 m e 7" até 2000 m, dois canhoneados.
const squeezeWell = () => well(2000, [
  phase('superficie', 'SURFACE', 0, 500, 17.5, { odIn: 13.375, idIn: 12.415, bottomMD: 500 }),
  phase('producao', 'PRODUCTION', 500, 2000, 8.5, { odIn: 7, idIn: 6.276, bottomMD: 2000 }),
]);

describe('camadas do poço em 3D', () => {
  it('tampão: coluna, fluidos e pasta nos diâmetros reais, sem duas camadas no mesmo raio', () => {
    const layers = layersOf(tampaoWell(), tampaoOverlays, { odIn: 4.5, idIn: 3.826 }, 10);
    expectNoOverlap(layers);
    // A pasta "do poço todo" se divide em anular (4½" a 8½") e interior da coluna.
    expect(fluid(layers, 4)).toEqual([
      { top: 2370, bottom: 2510, inner: 4.5, outer: 8.5 },
      { top: 2370, bottom: 2510, inner: 0, outer: 3.826 },
    ]);
    expect(fluid(layers, 3)).toEqual([{ top: 2340, bottom: 2370, inner: 4.5, outer: 8.5 }]);
    // A coluna, cortada nas trocas de parede, sempre de 3,826" a 4½".
    expect(new Set(fluid(layers, 0).map(l => `${l.inner}-${l.outer}`))).toEqual(new Set(['3.826-4.5']));
    expect(fluid(layers, 0).reduce((sum, l) => sum + l.bottom - l.top, 0)).toBeCloseTo(2510, 9);
    // O deslocamento é cortado nas trocas de parede, sempre no ID da coluna.
    const displacement = fluid(layers, 1);
    expect(displacement.map(l => l.bottom)).toEqual([500, 1800, 2300]);
    expect(displacement.every(l => l.inner === 0 && l.outer === 3.826)).toBe(true);
    // Aço: 9⅝" de 0 a 1800 m com a sapata nos últimos 10 m; formação em volta do furo.
    const casing = layers.filter(l => l.kind === 'casing' || l.kind === 'shoe').filter(l => l.outerIn === 9.625);
    expect(casing.map(l => [l.kind, l.topMD, l.bottomMD])).toEqual([['casing', 0, 1790], ['shoe', 1790, 1800]]);
    const rock = layers.filter(l => l.kind === 'formation');
    expect(rock.map(l => [l.topMD, l.bottomMD, l.innerIn])).toEqual([[0, 500, 17.5], [500, 1800, 12.25], [1800, 2600, 8.5]]);
    expect(rock[2].outerIn).toBeCloseTo(8.5 * (1 + FORMATION_BAND), 12);
    // O resto de dentro da parede é fluido do poço: o anular acima do espaçador de frente e
    // o poço abaixo da ponta da coluna.
    expect(layers.filter(l => l.kind === 'well-fluid').map(l => [l.topMD, l.bottomMD, l.innerIn, l.outerIn])).toEqual([
      [0, 1800, 4.5, 8.681], [1800, 2340, 4.5, 8.5], [2510, 2600, 0, 8.5],
    ]);
  });

  it('squeeze depois: canhoneados e intervalo squeezado no lugar da rocha, sem sobrepor', () => {
    const overlays: WellOverlay[] = [
      { type: 'CEMENT', topMD: 1780, bottomMD: 1880, label: 'Cimento após injeção', zone: 'full' },
      { type: 'SQUEEZE', topMD: 1830, bottomMD: 1860, label: 'Intervalo squeezado', zone: 'full' },
      { type: 'PERFORATION', topMD: 1830, bottomMD: 1840, label: 'Canhoneado 1', zone: 'full' },
      { type: 'PERFORATION', topMD: 1850, bottomMD: 1860, label: 'Canhoneado 2', zone: 'full' },
    ];
    const layers = layersOf(squeezeWell(), overlays, { odIn: 2.875, idIn: 2.441 }, 5);
    expectNoOverlap(layers);
    expect(fluid(layers, 0)).toEqual([{ top: 1780, bottom: 1880, inner: 0, outer: 6.276 }]);
    // Sem coluna desenhada, a pasta ocupa o revestimento inteiro, mesmo com a coluna informada.
    const band = 8.5 * (1 + FORMATION_BAND);
    expect(fluid(layers, 1)).toEqual([{ top: 1840, bottom: 1850, inner: 7, outer: band }]);
    expect(fluid(layers, 2)).toEqual([{ top: 1830, bottom: 1840, inner: 7, outer: band }]);
    expect(layers.filter(l => l.kind === 'formation' && l.innerIn === 8.5).map(l => [l.topMD, l.bottomMD]))
      .toEqual([[500, 1830], [1860, 2000]]);
  });

  it('squeeze antes: a pasta com a coluna dentro se divide em anular e interior', () => {
    const overlays: WellOverlay[] = [
      { type: 'TUBING', topMD: 0, bottomMD: 1880, label: 'Coluna de trabalho', zone: 'tubing' },
      { type: 'CEMENT', topMD: 1780, bottomMD: 1880, label: 'Cimento no poço', zone: 'full' },
      { type: 'PERFORATION', topMD: 1850, bottomMD: 1860, label: 'Canhoneado 1', zone: 'full' },
    ];
    const withString = layersOf(squeezeWell(), overlays, { odIn: 2.875, idIn: 2.441 });
    expectNoOverlap(withString);
    expect(fluid(withString, 1)).toEqual([
      { top: 1780, bottom: 1880, inner: 2.875, outer: 6.276 },
      { top: 1780, bottom: 1880, inner: 0, outer: 2.441 },
    ]);
    // Sem as medidas da coluna, a proporção da parede vale para o aço e para a pasta.
    const fallback = layersOf(squeezeWell(), overlays, null);
    expectNoOverlap(fallback);
    expect(fluid(fallback, 0).at(-1)!.outer).toBeCloseTo(6.276 * 0.38, 12);
  });

  it('primária: a bainha segue a parede de fora trecho a trecho, e o interior fica no ID do alvo', () => {
    const geometry = well(1500, [
      phase('superficie', 'SURFACE', 0, 500, 17.5, { odIn: 13.375, idIn: 12.415, bottomMD: 500 }),
      phase('producao', 'PRODUCTION', 500, 1500, 12.25, { odIn: 9.625, idIn: 8.681, bottomMD: 1490 }),
    ]);
    // O overlay traz os diâmetros do primeiro trecho (dentro do 13⅜"), como a primária monta.
    const overlays: WellOverlay[] = [
      { type: 'CEMENT', topMD: 300, bottomMD: 1490, label: 'Pasta', sub: 'anular', zone: 'casing-annulus',
        outerDiameterIn: 12.415, innerDiameterIn: 9.625 },
      { type: 'DISPLACEMENT', topMD: 0, bottomMD: 1450, label: 'Deslocamento', sub: 'interior do revestimento', zone: 'tubing' },
    ];
    const layers = layersOf(geometry, overlays, null, 8);
    expectNoOverlap(layers);
    expect(fluid(layers, 0)).toEqual([
      { top: 300, bottom: 500, inner: 9.625, outer: 12.415 },
      { top: 500, bottom: 1490, inner: 9.625, outer: 12.25 },
    ]);
    expect(fluid(layers, 1).every(l => l.inner === 0 && l.outer === 8.681)).toBe(true);
  });

  it('zona da operação: fluidos e canhoneados com margem, sem a coluna e o deslocamento', () => {
    expect(operationFocus(tampaoOverlays, 2600)).toEqual([2300 - 52.5, 2510 + 52.5]);
    expect(operationFocus([{ type: 'PERFORATION', topMD: 1850, bottomMD: 1860, label: 'C' }], 1860)).toEqual([1835, 1860]);
    expect(operationFocus(tampaoOverlays.slice(0, 2), 2600)).toBeNull();
    expect(subtractRanges([0, 100], [[20, 30], [50, 60]])).toEqual([[0, 20], [30, 50], [60, 100]]);
    expect(subtractRanges([0, 100], [[-10, 5], [90, 120]])).toEqual([[5, 90]]);
    expect(workString3d(4.5, 3.826)).toEqual({ odIn: 4.5, idIn: 3.826 });
    expect(workString3d(null, 3)).toBeNull();
    expect(workString3d(3, 4)).toBeNull();
  });
});

/** Cada triângulo tem a ordem dos vértices de acordo com as normais: o material desenha só a frente. */
function expectOriented(geometry: THREE.BufferGeometry): void {
  const position = geometry.getAttribute('position'); const normal = geometry.getAttribute('normal');
  const index = geometry.getIndex()!;
  const v = (i: number) => new THREE.Vector3().fromBufferAttribute(position, i);
  const nrm = (i: number) => new THREE.Vector3().fromBufferAttribute(normal, i);
  let checked = 0;
  for (let t = 0; t < index.count; t += 3) {
    const [a, b, c] = [index.getX(t), index.getX(t + 1), index.getX(t + 2)];
    const face = new THREE.Vector3().crossVectors(v(b).sub(v(a)), v(c).sub(v(a)));
    if (face.lengthSq() < 1e-12) continue;
    expect(face.dot(nrm(a).add(nrm(b)).add(nrm(c)))).toBeGreaterThan(0);
    checked++;
  }
  expect(checked).toBeGreaterThan(0);
}

describe('sólido de uma camada em meia seção', () => {
  it('vertical: só a metade de trás, entre os raios, faces orientadas', () => {
    const path = new WellSpatialPath(tampaoWell());
    const frame = frameAt(path, 1000, 2600);
    expect(frame.t.toArray().map(x => Math.round(x * 1e9) / 1e9)).toEqual([0, -1, 0]);
    expect(frame.n.toArray()).toEqual([0, 0, 1]);
    expect(frame.b.x).toBeCloseTo(-1, 12);
    const geometry = sweptLayerGeometry(path, 100, 200, 2, 5, true, 2600);
    const position = geometry.getAttribute('position');
    for (let i = 0; i < position.count; i++) {
      const x = position.getX(i); const y = position.getY(i); const z = position.getZ(i);
      expect(z).toBeLessThanOrEqual(1e-9);
      expect(Math.hypot(x, z)).toBeGreaterThan(2 - 1e-6);
      expect(Math.hypot(x, z)).toBeLessThan(5 + 1e-6);
      expect(-y).toBeGreaterThanOrEqual(100 - 1e-6); expect(-y).toBeLessThanOrEqual(200 + 1e-6);
    }
    expectOriented(geometry);
    // Sem o corte, o tubo inteiro, dos dois lados; com raio interno zero, maciço até o eixo.
    const full = sweptLayerGeometry(path, 100, 200, 0, 5, false, 2600);
    const zs = Array.from({ length: full.getAttribute('position').count }, (_, i) => full.getAttribute('position').getZ(i));
    expect(Math.max(...zs)).toBeGreaterThan(4.9);
    expectOriented(full);
    expectOriented(sweptLayerGeometry(path, 100, 200, 0, 5, true, 2600));
  });

  it('direcional: faces orientadas ao longo da curva e metade de trás em cada seção', () => {
    const geometry = tampaoWell();
    geometry.trajectory = { stations: [
      { md: 0, inclinationDeg: 0, azimuthDeg: 45 },
      { md: 800, inclinationDeg: 0, azimuthDeg: 45 },
      { md: 2600, inclinationDeg: 60, azimuthDeg: 45 },
    ] };
    const path = new WellSpatialPath(geometry);
    const solid = sweptLayerGeometry(path, 1500, 2500, 3, 6, true, 2600);
    expectOriented(solid);
    // O primeiro anel do sólido fica do lado de −N no referencial daquela profundidade.
    const frame = frameAt(path, 1500, 2600, 1000 / 200 / 2);
    const position = solid.getAttribute('position');
    // As posições ficam em Float32: a ~1500 m, a resolução é de ~1e-4 m.
    for (let j = 0; j <= 24; j++) {
      const offset = new THREE.Vector3().fromBufferAttribute(position, j).sub(frame.p);
      expect(offset.dot(frame.n)).toBeLessThanOrEqual(1e-3);
      expect(offset.length()).toBeCloseTo(6, 3);
    }
  });
});
