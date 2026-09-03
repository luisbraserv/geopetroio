import { describe, expect, it } from 'vitest';
import {
  createWithoutTubingSchematic,
  distributeMarkerLabels,
} from './schematic-tampao.component';
import { PlugGeometry } from '../../models/tampao.model';

const plug: PlugGeometry = {
  hID: 8.535,
  pOD: 3.5,
  pID: 2.764,
  pTop: 1400,
  pBase: 1500,
  pipeDep: 1500,
  sEnd: 1500,
  spH: 100,
  wellFinalMD: 1500,
  wellFinalTVD: 1500,
  capAnn: 0.18,
  capPipe: 0.04,
  capHole: 0.2322,
  capFinal: 0.2322,
  plugHeight: 100,
  lenAnnCement: 100,
  volCementAnn: 18,
  volCementPipe: 5.22,
  volCementTotal: 23.22,
  workVolumeBbl: 23.22,
  cementHeightWithTubing: 100,
  cementHeightWithoutTubing: 100,
  volWashAnn: 19.31,
  volWashTotal: 19.31,
  volBackSpacer: 4,
  volDisplacement: 56,
  frontOperationalHeight: 100,
  backOperationalHeight: 100,
  frontPhysicalVolumeBbl: 19.31,
  frontPhysicalHeight: 100,
  cementPhysicalVolumeBbl: 23.22,
  cementPhysicalCapacityBblM: 0.2322,
  cementPhysicalHeight: 100,
  backPhysicalVolumeBbl: 4,
  backPhysicalHeight: 100,
  topCementInPipe: 1400,
  topWashInPipe: 1300,
  displacementHydroBalance: null,
  operationalDisplacementVolumeBbl: 56,
  topCementWithTubing: 1400,
  topCementWithoutTubing: 1400,
  topBackSpacer: 1300,
  topFrontSpacer: 1300,
  topFrontNoTubing: 1300,
};

describe('createWithoutTubingSchematic', () => {
  it('does not draw tubing or annulus split in without tubing mode', () => {
    const model = createWithoutTubingSchematic(plug);

    expect(model.mode).toBe('withoutTubing');
    expect(model.showTubing).toBe(false);
    expect(model.showAnnulusSplit).toBe(false);
  });

  it('draws formation and casing on both sides of the well', () => {
    const model = createWithoutTubingSchematic(plug);

    expect(model.showFormation).toBe(true);
    expect(model.showCasing).toBe(true);
    expect(model.lanes.map(lane => lane.key)).toEqual([
      'formationLeft',
      'casingLeft',
      'well',
      'casingRight',
      'formationRight',
    ]);
  });

  it('merges displacement + front/back spacers into a single "Deslocamento" fluid', () => {
    const model = createWithoutTubingSchematic(plug);

    expect(model.segments.map(segment => segment.name)).toEqual([
      'Fluido de Completação do poço',
      'Deslocamento',
      'Cimento',
    ]);
    // Volume do bloco fundido = soma dos três (deslocamento + frente + trás)
    const displacement = model.segments.find(segment => segment.name === 'Deslocamento')!;
    expect(displacement.sub).toContain(`${(plug.volDisplacement + plug.volWashTotal + plug.volBackSpacer).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} bbl`);
  });

  it('keeps cement last and each fluid immediately above the next one', () => {
    const model = createWithoutTubingSchematic(plug);
    const names = model.segments.map(segment => segment.name);

    expect(names.at(0)).toBe('Fluido de Completação do poço');
    expect(names.at(-1)).toBe('Cimento');
    expect(names[names.length - 2]).toBe('Deslocamento');
    for (let i = 1; i < model.segments.length; i += 1) {
      expect(model.segments[i].top).toBeCloseTo(model.segments[i - 1].bottom, 6);
    }
  });

  it('does not leave empty spaces when zero-height segments are omitted', () => {
    const withoutDisplacement: PlugGeometry = {
      ...plug,
      volDisplacement: 0,
      backPhysicalHeight: 0,
      volBackSpacer: 0,
    };
    const model = createWithoutTubingSchematic(withoutDisplacement);

    // Sobra apenas a altura do espaçador de frente dentro do bloco "Deslocamento".
    expect(model.segments.map(segment => segment.name)).toEqual([
      'Fluido de Completação do poço',
      'Deslocamento',
      'Cimento',
    ]);
    for (let i = 1; i < model.segments.length; i += 1) {
      expect(model.segments[i].top).toBeCloseTo(model.segments[i - 1].bottom, 6);
    }
  });

  it('limits the work zone bracket to the final cement interval', () => {
    const model = createWithoutTubingSchematic(plug);

    expect(model.workZone.top).toBe(1400);
    expect(model.workZone.bottom).toBe(1500);
  });

  it('keeps depth marker labels separated', () => {
    const markers = distributeMarkerLabels([
      { key: 'a', label: 'A', depth: 1300 },
      { key: 'b', label: 'B', depth: 1301 },
      { key: 'c', label: 'C', depth: 1302 },
    ], 1500, 30);

    for (let i = 1; i < markers.length; i += 1) {
      expect(markers[i].displayY - markers[i - 1].displayY).toBeGreaterThanOrEqual(30);
    }
  });
});
