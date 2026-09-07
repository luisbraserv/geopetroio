import { describe, expect, it } from 'vitest';
import { MinimumCurvature } from './minimum-curvature';
import { WellGeometryService } from './well-geometry.service';
import { WellGeometry, WellTrajectory } from '../models/well-geometry.model';

const survey: WellTrajectory = { stations: [
  { md: 0, inclinationDeg: 0, azimuthDeg: 0 },
  { md: 1000, inclinationDeg: 90, azimuthDeg: 0 },
] };
const well: WellGeometry = { finalMD: 1000, finalTVD: 999, trajectory: survey, phases: [
  { id: 'a', name: 'Fase', type: 'OPEN_HOLE', topMD: 0, bottomMD: 1000, topTVD: 0, bottomTVD: 999, holeDiameterIn: 8.5 },
] };
const radius = 2000 / Math.PI;

describe('Mínima curvatura', () => {
  it('reproduz um quarto de círculo, incluindo posições entre estações', () => {
    const curve = new MinimumCurvature(survey);
    expect(curve.at(1000).tvd).toBeCloseTo(radius, 9);
    expect(curve.at(1000).north).toBeCloseTo(radius, 9);
    expect(curve.at(1000).east).toBe(0);
    expect(curve.at(500).tvd).toBeCloseTo(radius * Math.sin(Math.PI / 4), 9);
    expect(curve.at(500).north).toBeCloseTo(radius * (1 - Math.cos(Math.PI / 4)), 9);
    expect(curve.at(500).tvd).not.toBeCloseTo(curve.at(1000).tvd / 2, 1);
  });

  it.each([0, 30, 90])('trata dogleg zero com inclinação %s', inclinationDeg => {
    const curve = new MinimumCurvature({ stations: [
      { md: 0, inclinationDeg, azimuthDeg: 90 }, { md: 1000, inclinationDeg, azimuthDeg: 90 },
    ] });
    expect(curve.at(1000).tvd).toBeCloseTo(1000 * Math.cos(inclinationDeg * Math.PI / 180), 9);
    expect(curve.at(1000).east).toBeCloseTo(1000 * Math.sin(inclinationDeg * Math.PI / 180), 9);
  });

  it('é estável para dogleg muito pequeno e azimute cruzando o norte', () => {
    const curve = new MinimumCurvature({ stations: [
      { md: 0, inclinationDeg: 30, azimuthDeg: 359.99999999 },
      { md: 1000, inclinationDeg: 30.000000001, azimuthDeg: 0.00000001 },
    ] });
    expect(curve.at(1000).tvd).toBeCloseTo(1000 * Math.cos(Math.PI / 6), 7);
    expect(curve.at(1000).north).toBeCloseTo(500, 7);
    expect(curve.at(1000).east).toBeCloseTo(0, 7);
  });

  it('inverte TVD de pontos internos e retorna o início de um trecho horizontal', () => {
    const curve = new MinimumCurvature({ stations: [...survey.stations, { md: 1500, inclinationDeg: 90, azimuthDeg: 0 }] });
    expect(curve.mdAtTvd(curve.at(350).tvd)).toBeCloseTo(350, 7);
    expect(curve.mdAtTvd(radius)).toBe(1000);
    expect(() => curve.at(1501)).toThrow('fora');
    expect(() => curve.mdAtTvd(900)).toThrow('fora');
  });

  it('aceita retorno ascendente em MD sem inventar uma inversão TVD ambígua', () => {
    const curve = new MinimumCurvature({ stations: [
      { md: 0, inclinationDeg: 0, azimuthDeg: 0 },
      { md: 1000, inclinationDeg: 60, azimuthDeg: 0 },
      { md: 2000, inclinationDeg: 120, azimuthDeg: 0 },
    ] });
    expect(curve.at(1500).tvd).toBeGreaterThan(curve.at(2000).tvd);
    expect(() => curve.mdAtTvd(500)).toThrow('unívoco');
  });

  it.each([
    [],
    [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 }],
    [{ md: 1, inclinationDeg: 0, azimuthDeg: 0 }, survey.stations[1]],
    [survey.stations[0], { md: 0, inclinationDeg: 10, azimuthDeg: 0 }],
    [survey.stations[0], { md: 100, inclinationDeg: NaN, azimuthDeg: 0 }],
    [survey.stations[0], { md: 100, inclinationDeg: 181, azimuthDeg: 0 }],
    [survey.stations[0], { md: 100, inclinationDeg: 20, azimuthDeg: -1 }],
    [survey.stations[0], { md: 100, inclinationDeg: 180, azimuthDeg: 0 }],
  ])('rejeita estações inválidas %#', (...stations) => {
    // it.each espalha cada linha; cada linha representa uma lista de estações.
    expect(() => new MinimumCurvature({ stations })).toThrow('Survey');
  });
});

describe('Geometria com survey opcional', () => {
  const geo = new WellGeometryService();
  it('deriva o TVD e usa a curva na conversão e na segmentação', () => {
    const derived = geo.deriveTrajectoryTvd(well);
    expect(derived.finalTVD).toBeCloseTo(radius, 9);
    expect(derived.phases[0].bottomTVD).toBeCloseTo(radius, 9);
    expect(well.finalTVD).toBe(999);
    expect(geo.validate(derived)).toEqual([]);
    expect(geo.mdToTvd(derived, 500)).toBeCloseTo(radius / Math.sqrt(2), 9);
    expect(geo.getGeometrySegments(derived, 0, 500)[0].bottomTVD).toBeCloseTo(radius / Math.sqrt(2), 9);
  });

  it('bloqueia survey incompleto em vez de extrapolar ao fundo', () => {
    expect(geo.validate({ ...well, finalMD: 1500 }).some(i => i.code === 'SURVEY_INVALID')).toBe(true);
  });

  it('preserva interpolação manual quando não há survey', () => {
    const legacy = { ...well, trajectory: undefined };
    expect(geo.mdToTvd(legacy, 500)).toBe(499.5);
  });

  it('invalida o cache ao editar as estações existentes', () => {
    const changed = structuredClone(well);
    expect(geo.mdToTvd(changed, 1000)).toBeCloseTo(radius, 9);
    changed.trajectory!.stations[1].inclinationDeg = 0;
    expect(geo.mdToTvd(changed, 1000)).toBe(1000);
  });
});
