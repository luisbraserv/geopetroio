import { describe, expect, it } from 'vitest';
import {
  ADJUSTED_SCHEMATIC_NOTE,
  computeVisualSegmentHeights,
  displaySubtitleForSegment,
  formatBbl,
  formatM,
  formatPpg,
  formatPsi,
  joinInfoParts,
  layoutDepthAnnotations,
  shouldShowSegmentLabel,
  shouldShowSegmentSubtitle,
  visualYForDepth,
  visualYForSegmentBoundary,
} from './visual-segments';

const baseSegments = [
  { key: 'completionFluid', top: 0, bottom: 1000, label: 'Fluido', sub: '1000 m reais' },
  { key: 'frontWater', top: 1000, bottom: 1200, label: 'Água Frente', sub: '200 m reais' },
  { key: 'backWater', top: 1200, bottom: 1300, label: 'Água Trás', sub: '100 m reais' },
  { key: 'cement', top: 1300, bottom: 1400, label: 'Cimento', sub: '23,22 bbl | 100,0 m' },
];

describe('computeVisualSegmentHeights', () => {
  it('assigns 40 percent of visual height to cement', () => {
    const out = computeVisualSegmentHeights(baseSegments, { totalVisualHeight: 500 });
    expect(out.find(segment => segment.key === 'cement')?.visualHeight).toBeCloseTo(200, 6);
  });

  it('distributes the remaining 60 percent to non-cement segments', () => {
    const out = computeVisualSegmentHeights(baseSegments, { totalVisualHeight: 500 });
    const otherTotal = out.filter(segment => segment.key !== 'cement').reduce((sum, segment) => sum + segment.visualHeight, 0);
    expect(otherTotal).toBeCloseTo(300, 6);
  });

  it('does not change real heights or labels', () => {
    const out = computeVisualSegmentHeights(baseSegments, { totalVisualHeight: 500 });
    const cement = out.find(segment => segment.key === 'cement')!;
    expect(cement.realHeight).toBe(100);
    expect(cement.sub).toBe('23,22 bbl | 100,0 m');
  });

  it('applies minimum visual height for small non-cement segments', () => {
    const out = computeVisualSegmentHeights([
      { key: 'completionFluid', top: 0, bottom: 1000 },
      { key: 'frontWater', top: 1000, bottom: 1001 },
      { key: 'cement', top: 1001, bottom: 1100 },
    ], { totalVisualHeight: 500, minVisualHeightPx: 28 });
    expect(out.find(segment => segment.key === 'frontWater')?.visualHeight).toBeGreaterThanOrEqual(42);
  });

  it('gives front and back water priority minimum heights', () => {
    const out = computeVisualSegmentHeights([
      { key: 'completionFluid', top: 0, bottom: 1000 },
      { key: 'frontWater', top: 1000, bottom: 1001 },
      { key: 'backWater', top: 1001, bottom: 1002 },
      { key: 'cement', top: 1002, bottom: 1100 },
    ], { totalVisualHeight: 500 });

    expect(out.find(segment => segment.key === 'frontWater')?.visualHeight).toBeGreaterThanOrEqual(42);
    expect(out.find(segment => segment.key === 'backWater')?.visualHeight).toBeGreaterThanOrEqual(42);
    expect(out.find(segment => segment.key === 'cement')?.visualHeight).toBeCloseTo(200, 6);
  });

  it('keeps real water volume and height text unchanged', () => {
    const out = computeVisualSegmentHeights([
      { key: 'frontWater', top: 1000, bottom: 1100, sub: '19,31 bbl | 100 m' },
      { key: 'backWater', top: 1100, bottom: 1200, sub: '2,43 bbl | 100 m' },
      { key: 'cement', top: 1200, bottom: 1300 },
    ], { totalVisualHeight: 500 });

    expect(out.find(segment => segment.key === 'frontWater')?.sub).toBe('19,31 bbl | 100 m');
    expect(out.find(segment => segment.key === 'backWater')?.sub).toBe('2,43 bbl | 100 m');
  });

  it('keeps the adjusted schematic note available for tampao and squeeze', () => {
    expect(ADJUSTED_SCHEMATIC_NOTE).toContain('Representação visual ajustada');
    expect(ADJUSTED_SCHEMATIC_NOTE).toContain('valores exibidos são reais');
  });

  it('works for the four schematic contexts', () => {
    const contexts = ['tampao-with-tubing', 'tampao-without-tubing', 'squeeze-with-tubing', 'squeeze-without-tubing'];
    for (const _context of contexts) {
      const out = computeVisualSegmentHeights(baseSegments, { totalVisualHeight: 600 });
      expect(out.find(segment => segment.key === 'cement')?.visualHeight).toBeCloseTo(240, 6);
      expect(out.reduce((sum, segment) => sum + segment.visualHeight, 0)).toBeCloseTo(600, 6);
    }
  });
});

describe('layoutDepthAnnotations', () => {
  it('keeps lateral depth labels separated by the configured minimum gap', () => {
    const out = layoutDepthAnnotations([
      { id: 'front', label: 'Topo agua frente', depthReal: 1200, yReal: 110 },
      { id: 'back', label: 'Topo agua tras', depthReal: 1250, yReal: 116 },
      { id: 'cement', label: 'Topo cimento', depthReal: 1300, yReal: 121 },
    ], { topPadding: 80, bottomPadding: 220, minGapPx: 24 });

    const ordered = [...out].sort((a, b) => a.yLabel - b.yLabel);
    expect(ordered[1].yLabel - ordered[0].yLabel).toBeGreaterThanOrEqual(24);
    expect(ordered[2].yLabel - ordered[1].yLabel).toBeGreaterThanOrEqual(24);
  });

  it('moves only the text position while preserving the real depth target', () => {
    const out = layoutDepthAnnotations([
      { id: 'top-perf', label: 'Topo canhoneado', depthReal: 1400, yReal: 150 },
      { id: 'base-perf', label: 'Base canhoneado', depthReal: 1410, yReal: 154 },
    ], { topPadding: 100, bottomPadding: 220, minGapPx: 28 });

    expect(out.find(item => item.id === 'top-perf')).toMatchObject({ depthReal: 1400, yReal: 150 });
    expect(out.find(item => item.id === 'base-perf')).toMatchObject({ depthReal: 1410, yReal: 154 });
    expect(out.some(item => item.yLabel !== item.yReal)).toBe(true);
  });

  it('clamps labels inside the available schematic area', () => {
    const out = layoutDepthAnnotations([
      { id: 'top', label: 'Topo', depthReal: 0, yReal: 10 },
      { id: 'base', label: 'Base', depthReal: 1500, yReal: 500 },
    ], { topPadding: 70, bottomPadding: 430, minGapPx: 24 });

    expect(out.find(item => item.id === 'top')?.yLabel).toBeGreaterThanOrEqual(70);
    expect(out.find(item => item.id === 'base')?.yLabel).toBeLessThanOrEqual(430);
  });
});

describe('segment label visibility', () => {
  it('keeps internal labels readable in short visual blocks', () => {
    expect(shouldShowSegmentLabel(17)).toBe(false);
    expect(shouldShowSegmentLabel(18)).toBe(true);
    expect(shouldShowSegmentSubtitle(41)).toBe(false);
    expect(shouldShowSegmentSubtitle(42)).toBe(true);
  });

  it('keeps front and back water volume visible in compact labels', () => {
    expect(displaySubtitleForSegment({ key: 'frontWater', sub: '19,31 bbl | 100 m', visualHeight: 34 })).toBe('19,31 bbl');
    expect(displaySubtitleForSegment({ key: 'backWater', sub: '2,43 bbl | 100 m', visualHeight: 34 })).toBe('2,43 bbl');
    expect(displaySubtitleForSegment({ key: 'completionFluid', sub: 'Fluido do poço', visualHeight: 34 })).toBeUndefined();
  });
});

describe('visual marker anchors', () => {
  it('uses the visual top and bottom of the cement segment for reference lines', () => {
    const out = computeVisualSegmentHeights(baseSegments, { totalVisualHeight: 500 });
    expect(visualYForSegmentBoundary(out, 'cement', 'top', 65)).toBeCloseTo(365, 6);
    expect(visualYForSegmentBoundary(out, 'cement', 'bottom', 65)).toBeCloseTo(565, 6);
  });

  it('maps an arbitrary real depth into the adjusted visual segment', () => {
    const out = computeVisualSegmentHeights(baseSegments, { totalVisualHeight: 500 });
    const cementMidDepth = 1350;
    expect(visualYForDepth(out, cementMidDepth, 65)).toBeCloseTo(465, 6);
  });
});

describe('schematic info formatting', () => {
  it('formats schematic panel units consistently', () => {
    expect(formatM(92, 0)).toBe('92 m');
    expect(formatM(101.5)).toBe('101,5 m');
    expect(formatBbl(6.99)).toBe('6,99 bbl');
    expect(formatPpg(9.5)).toBe('9,50 ppg');
    expect(formatPsi(37)).toBe('37 psi');
  });

  it('does not render invalid numbers in info rows', () => {
    expect(formatM(Number.NaN)).toBeNull();
    expect(formatBbl(Number.POSITIVE_INFINITY)).toBeNull();
    expect(joinInfoParts(formatM(Number.NaN), formatBbl(2))).toBe('2,00 bbl');
  });
});
