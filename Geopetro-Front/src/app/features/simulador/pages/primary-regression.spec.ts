import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import { parsePrimaryScenario, primaryScenarioFromApi, serializePrimaryScenario } from '../services/primary-scenario-codec';
import { exportPrimaryScenario, importPrimaryScenario } from '../services/primary-scenario-portable';
import { SimuladorPrimariaComponent } from './simulador-primaria/simulador-primaria.component';

afterEach(() => TestBed.resetTestingModule());

// Os gráficos antigos do squeeze e do tampão foram apagados na S7 (SPEC squeeze-tampao §4):
// os três simuladores usam o mesmo `app-operation-charts`, testado em operation-charts.
describe('regression: squeeze and tampão scenarios stay out of the primary (P12)', () => {
  it('refuses a squeeze scenario where a primary one is expected', () => {
    expect(() => primaryScenarioFromApi({ operacao: 'squeeze', formValue: '{}' }))
      .toThrow(/Operação incompatível/);
    expect(() => importPrimaryScenario(JSON.stringify({ kind: 'geopetro-squeeze-scenario',
      exportVersion: 1 }))).toThrow(/não é um cenário de cimentação primária/);
  });
});

describe('regression: a reopened scenario reproduces the same results (P12)', () => {
  function create() {
    const fixture = TestBed.createComponent(SimuladorPrimariaComponent);
  fixture.componentInstance.selectOperationPhase('open');
    fixture.detectChanges();
    return fixture.componentInstance;
  }

  it('gives the same volumes, transport and hydraulics after a full round trip', () => {
    const component = create();
    component.setTargetToc(0, '620');
    component.setMixingReserve(0, 0, '9');
    component.setFluidDensity('cement', '15.2');
    const before = {
      planned: component.volumes().stages[0].placements[0].plannedBbl,
      prepared: component.recipes().placements[0].preparedBbl,
      pumped: component.transport()!.totalPumpedBbl,
      time: component.transport()!.totalTimeMin,
      toc: component.transport()!.placements[0].actualTocMD,
      points: component.hydraulics()!.points.length,
    };

    const file = component.exportarArquivo()!;
    const reopened = create();
    reopened.lerArquivo(file);
    reopened.confirmarImportacao();

    expect(reopened.volumes().stages[0].placements[0].plannedBbl).toBeCloseTo(before.planned, 9);
    expect(reopened.recipes().placements[0].preparedBbl).toBeCloseTo(before.prepared, 9);
    expect(reopened.transport()!.totalPumpedBbl).toBeCloseTo(before.pumped, 9);
    expect(reopened.transport()!.totalTimeMin).toBeCloseTo(before.time, 9);
    expect(reopened.transport()!.placements[0].actualTocMD).toBeCloseTo(before.toc!, 9);
    expect(reopened.hydraulics()!.points).toHaveLength(before.points);
  });

  it('survives the database codec without losing the program', () => {
    const scenario = primaryContractExample('two-stage');
    const restored = parsePrimaryScenario(serializePrimaryScenario(scenario));
    expect(restored).toEqual(scenario);
    const exported = importPrimaryScenario(exportPrimaryScenario(scenario)).scenario;
    expect(exported.primary.stages.map(stage => stage.steps.map(step => step.id)))
      .toEqual(scenario.primary.stages.map(stage => stage.steps.map(step => step.id)));
  });
});
