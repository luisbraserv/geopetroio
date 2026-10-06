import { describe, expect, it } from 'vitest';
import { resolvePrimaryProgramVolumes } from '../services/primary-volumes';
import { WellGeometryService } from '../services/well-geometry.service';
import type { PrimaryFluid, PrimaryPumpStep } from './primary-cementing.model';
import { buildPrimaryConfiguration, defaultStageSteps, moveStep, previousShoeMD, repeatStep,
  type PrimaryOperationFormValue } from './primary-operation.form';
import { buildWellGeometry, type WellPhaseFormValue } from './well-geometry.form';

const service = new WellGeometryService();

const phases: WellPhaseFormValue[] = [
  { id: 'surface', name: 'Superfície', type: 'SURFACE', topMD: 0, bottomMD: 300, topTVD: 0,
    bottomTVD: 300, holeDiameterIn: 12.25, casingOD: 9.625, casingID: 8.535, shoeMD: 300, shoeTVD: 300 },
  { id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: 300, bottomMD: 1500, topTVD: 300,
    bottomTVD: 1500, holeDiameterIn: 8.5, casingOD: null, casingID: null, shoeMD: null, shoeTVD: null },
];

function fluid(id: string, kind: PrimaryFluid['kind'], densityPpg: number): PrimaryFluid {
  return { id, kind, name: id, densityPpg,
    rheology: { model: 'power-law', n: 1, kLbfSnFt2: 0.000020885 },
    propertySources: { densityPpg: { source: 'entered' } } };
}

function formValue(): PrimaryOperationFormValue {
  return {
    targetKind: 'conventional', shoeMD: 1500, floatCollarMD: 1480, linerTopMD: null,
    casingIdIn: 6.276, casingOdIn: 7, settingIdIn: 4, settingOdIn: 5,
    excessPct: 0, measuredHoleIn: null,
    headCondition: 'closed-head', returnPressurePsi: 0,
    internalFrictionLevel: 'medium', annularFrictionLevel: 'medium',
    porePpg: 9, fracturePpg: 15,
    maxPressurePsi: null, maxRateBpm: null, motorHp: null, efficiency: null,
    initialFluidId: 'mud',
    fluids: [fluid('mud', 'mud', 10), fluid('cement', 'cement', 15.8), fluid('displacement', 'displacement', 9)],
    stages: [{ id: 'stage-1', name: 'Estágio 1', targetTocMD: 500, outletMD: 1500, seatMD: 1480,
      placements: [{ id: 'cement-1', fluidId: 'cement', topMD: 500, bottomMD: 1500, mixingReserveBbl: 0 }],
      steps: defaultStageSteps('stage-1', 'collar', 'cement-1', 5, false) }],
  };
}

const resolve = (form: PrimaryOperationFormValue) => {
  const well = buildWellGeometry(form.shoeMD, form.shoeMD, phases);
  const primary = buildPrimaryConfiguration(form, well);
  return { primary, volumes: resolvePrimaryProgramVolumes(primary,
    service.resolvePrimaryStageGeometry(well, primary)) };
};

describe('primary operation form to configuration (P7)', () => {
  it('derives the outer wall from the well phases instead of asking for it again', () => {
    const well = buildWellGeometry(1500, 1500, phases);
    expect(previousShoeMD(well, 1500)).toEqual({ md: 300, idIn: 8.535, odIn: 9.625 });
    const primary = buildPrimaryConfiguration(formValue(), well);
    const previous = primary.outerBoundaries.find(b => b.kind === 'previous-casing')!;
    const open = primary.outerBoundaries.find(b => b.kind === 'open-hole')!;
    expect(previous.bottomMD).toBe(300);
    expect(open.topMD).toBe(300);
    expect(open.bottomMD).toBe(1500);
  });

  it('produces a configuration the engine dimensions without diagnostics', () => {
    const { volumes } = resolve(formValue());
    expect(volumes.diagnostics).toEqual([]);
    expect(volumes.valid).toBe(true);
    const placement = volumes.stages[0].placements[0];
    // Anular de 500 a 1500 com parede de 8.5 in e OD de 7 in.
    expect(placement.annularBbl).toBeCloseTo(74.100075, 9);
    expect(placement.retainedBbl).toBeCloseTo(2.510681114592, 9);
    expect(volumes.stages[0].displacementTargetBbl).toBeCloseTo(185.790402479808, 9);
  });

  it('assigns the shoe track once and only in the first stage', () => {
    const primary = buildPrimaryConfiguration(formValue(), buildWellGeometry(1500, 1500, phases));
    expect(primary.stages[0].placements[0].retainedVolumeIds).toEqual(['track']);
    expect(primary.retainedVolumes).toHaveLength(1);
  });

  it('applies the excess to the open hole and drops it when a caliper is measured', () => {
    const excess = { ...formValue(), excessPct: 20 };
    expect(resolve(excess).volumes.stages[0].placements[0].annularBbl)
      .toBeCloseTo(74.100075 * 1.2, 9);
    const measured = { ...formValue(), excessPct: 20, measuredHoleIn: 9 };
    const open = resolve(measured).primary.outerBoundaries.find(b => b.kind === 'open-hole')!;
    expect(open.kind === 'open-hole' && open.diameter.source).toBe('measured');
  });

  it('keeps the window out of the cased interval', () => {
    const primary = buildPrimaryConfiguration(formValue(), buildWellGeometry(1500, 1500, phases));
    expect(primary.pressureWindow).toEqual([{ topMD: 300, bottomMD: 1500,
      topPorePpg: 9, topFracturePpg: 15, porePpg: 9, fracturePpg: 15 }]);
  });

  it('carries the independent pipe and annular friction levels into the engine configuration', () => {
    const form = { ...formValue(), internalFrictionLevel: 'low' as const,
      annularFrictionLevel: 'high' as const };
    const primary = buildPrimaryConfiguration(form, buildWellGeometry(1500, 1500, phases));
    expect(primary.frictionSettings).toEqual({ internal: 'low', annular: 'high' });
  });

  it('carries the mixing reserve into the placement only when it is positive', () => {
    const none = buildPrimaryConfiguration(formValue(), buildWellGeometry(1500, 1500, phases));
    expect(none.stages[0].placements[0].mixingReserveBbl).toBeUndefined();
    const form = formValue();
    form.stages[0].placements[0].mixingReserveBbl = 12;
    const reserved = buildPrimaryConfiguration(form, buildWellGeometry(1500, 1500, phases));
    expect(reserved.stages[0].placements[0].mixingReserveBbl).toBe(12);
  });

  it('builds the liner path through the setting string and the liner', () => {
    const form: PrimaryOperationFormValue = { ...formValue(), targetKind: 'liner', linerTopMD: 1000,
      casingIdIn: 6, casingOdIn: 7 };
    const primary = buildPrimaryConfiguration(form, buildWellGeometry(1500, 1500, phases));
    expect(primary.target!.kind).toBe('liner');
    expect(primary.assemblies.map(a => a.id)).toContain('setting');
    const legs = primary.paths[0].legs;
    expect(legs[0].assemblyId).toBe('setting');
    expect(legs[0].zone).toBe('internal');
    expect(legs.at(-1)!.assemblyId).toBe('setting');
    expect(legs.at(-1)!.zone).toBe('casing-annulus');
  });

  it('reorders and repeats steps without changing the dimensioned total', () => {
    const steps = formValue().stages[0].steps;
    const moved = moveStep(steps, 0, 2);
    expect(moved.map(s => s.id)).toEqual(['stage-1-launch', 'stage-1-displace', 'stage-1-cement']);
    expect(moveStep(steps, 0, 0)).toBe(steps);

    const repeated = repeatStep(steps, 0, 'stage-1-cement-b');
    expect(repeated).toHaveLength(4);
    const fractions = repeated.filter((s): s is Extract<PrimaryPumpStep, { kind: 'pump' }> =>
      s.kind === 'pump' && s.quantity.source === 'placement')
      .map(s => s.quantity.source === 'placement' ? s.quantity.fraction : 0);
    // Repetir divide a fração: o total continua fechando em 1.
    expect(fractions.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);

    const form = formValue();
    form.stages[0].steps = repeated;
    expect(resolve(form).volumes.diagnostics).toEqual([]);
  });

  it('refuses to repeat a tool event, which has no volume to split', () => {
    const steps = formValue().stages[0].steps;
    expect(repeatStep(steps, 1, 'x')).toBe(steps);
  });
});
