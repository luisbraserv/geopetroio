import { describe, expect, it } from 'vitest';
import { buildPressureDepthConfig } from './pressure-depth-config';

describe('pressure depth display units', () => {
  it('converts only the depth axis and makes independent points for each chart', () => {
    const series = [{ label: 'Pressão', color: '#000', points: [{ x: 2500, y: 304.8 }] }];
    const original = structuredClone(series);
    const feet = buildPressureDepthConfig(series, { depthUnit: 'ft', maxDepth: 609.6 });
    const metres = buildPressureDepthConfig(series, { maxDepth: 609.6 });
    expect(feet.data.datasets[0].data).toEqual([{ x: 2500, y: 1000 }]);
    expect(feet.options?.scales?.['y']).toMatchObject({
      reverse: true, suggestedMax: 2000, title: { text: 'Profundidade Medida (ft)' },
    });
    expect(metres.data.datasets[0].data).toEqual([{ x: 2500, y: 304.8 }]);
    expect(metres.options?.scales?.['y']).toMatchObject({ title: { text: 'Profundidade Medida (m)' } });
    expect(feet.data.datasets[0].data[0]).not.toBe(series[0].points[0]);
    expect(series).toEqual(original);
  });
});
