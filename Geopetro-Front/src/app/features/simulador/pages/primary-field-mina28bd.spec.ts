import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { buildPrimaryConfiguration, primaryFormFromConfiguration } from '../models/primary-operation.form';
import { buildWellGeometry } from '../models/well-geometry.form';
import { OperationContextService } from '../services/operation-context.service';
import { buildPrimaryTrajectory, validatePhaseSurveys } from '../services/phase-survey';
import { createPrimaryRateModel, resolvePrimaryHydraulics } from '../services/primary-hydraulics';
import { PrimaryProgramService } from '../services/primary-program.service';
import { primaryScenarioFromApi, primaryScenarioPayload } from '../services/primary-scenario-codec';
import { exportPrimaryScenario } from '../services/primary-scenario-portable';
import { simulatePrimaryTransport } from '../services/primary-transport';
import { resolvePrimaryProgramVolumes } from '../services/primary-volumes';
import { WellGeometryService } from '../services/well-geometry.service';
import { MINA28BD_SCENARIO_NAME, MINA28BD_SURVEY, mina28bdForm, mina28bdPhases, mina28bdReportData,
  mina28bdScenario } from './primary-field-mina28bd.fixture';

/**
 * Caso de campo: survey giroscópico real do MINA-28BD (12¼", 824 m) com o
 * programa e os fluidos do exemplo de projeto do R3 §12-7. Roda pelo mesmo
 * caminho da tela: fases → trajetória → fase da operação → configuração → motor.
 */
function runField() {
  const wells = TestBed.inject(WellGeometryService);
  const rows = mina28bdPhases();
  const last = rows.at(-1)!;
  const fullWell = wells.deriveTrajectoryTvd({
    ...buildWellGeometry(last.bottomMD, last.bottomTVD, rows),
    trajectory: buildPrimaryTrajectory(rows), caliper: null,
  });
  const context = TestBed.inject(OperationContextService).resolve(fullWell, 'intermediate', 'primaria');
  const form = mina28bdForm();
  const primary = buildPrimaryConfiguration(form, context.geometry);
  const resolution = TestBed.inject(PrimaryProgramService).resolve(context.geometry, primary,
    [{ id: 'sapata', name: 'Sapata', md: form.shoeMD, zone: 'casing-annulus', assemblyId: 'target' }]);
  return { wells, rows, fullWell, context, primary, resolution, surveyIssues: validatePhaseSurveys(rows) };
}

describe('caso de campo MINA-28BD (survey Gyrodata + programa do R3 §12-7)', () => {
  it('converte o survey pela mínima curvatura com a TVD do relatório Gyrodata', () => {
    const { wells, fullWell } = runField();
    for (const [md, , , tvd] of MINA28BD_SURVEY)
      expect(Math.abs(wells.mdToTvd(fullWell, md) - tvd)).toBeLessThan(0.006);
  }, 30_000);

  it('bate com o modelo de referência independente do job (Python, Δt = 0,025 min)', () => {
    // Referência escrita à parte, sem código do simulador: mínima curvatura própria,
    // atrito do R3 §4-6 conferido nos exemplos do livro e transporte lagrangiano com
    // vazio. Os valores abaixo são os dela; as tolerâncias vêm do passo do motor.
    const { resolution } = runField();
    const stage = resolution.volumes.stages[0];
    expect(stage.placements.find(p => p.placementId === 'lead')!.plannedBbl).toBeCloseTo(142.4129, 2);
    expect(stage.placements.find(p => p.placementId === 'tail')!.plannedBbl).toBeCloseTo(38.7059, 2);
    expect(stage.displacementTargetBbl).toBeCloseTo(191.1822, 2);

    const transport = resolution.transport!;
    const hydraulics = resolution.hydraulics!;
    expect(transport.status).toBe('complete');
    expect(hydraulics.status).toBe('complete');
    const at = (kind: string) => transport.events.find(e => e.kind === kind)!.timeMin;
    expect(at('bottom-plug-opened')).toBeCloseTo(55.817, 1);
    expect(at('top-plug-landed')).toBeCloseTo(106.791, 2);
    // Colocação: lead até a superfície, tail de 670 a 820 m, nada de pasta retornada.
    const lead = transport.placements.find(p => p.placementId === 'lead')!;
    const tail = transport.placements.find(p => p.placementId === 'tail')!;
    expect(lead.actualTocMD).toBeCloseTo(0, 3);
    expect(tail.actualIntervals).toHaveLength(1);
    expect(tail.actualIntervals[0].topMD).toBeCloseTo(670, 3);
    expect(lead.returnedBbl + tail.returnedBbl).toBeLessThan(1e-6);

    // Queda livre de 10,0 a 78,3 min, com retorno de até 6,337 bpm e vazio de 31 bbl.
    const falling = hydraulics.points.filter(p => p.state === 'free-fall');
    expect(falling[0].timeMin).toBeCloseTo(10, 6);
    expect(Math.abs(falling.at(-1)!.timeMin - 78.27)).toBeLessThan(0.2);
    expect(Math.max(...falling.map(p => p.outletRateBpm!))).toBeCloseTo(6.337, 2);
    expect(Math.abs(Math.max(...falling.map(p => p.voidVolumeBbl!)) - 30.961) / 30.961).toBeLessThan(0.015);

    // Chegada do plugue: pressão final de circulação e maior ECD na sapata.
    const landing = at('top-plug-landed');
    const dynamic = hydraulics.points.find(p => Math.abs(p.timeMin - landing) < 1e-9 && p.state === 'full')!;
    expect(dynamic.pumpPressurePsi).toBeCloseTo(410.97, 1);
    expect(dynamic.bhpPsi).toBeCloseTo(1766.07, 1);
    expect(dynamic.ecdPpg).toBeCloseTo(12.9317, 3);
    expect(Math.max(...hydraulics.points.map(p => p.ecdPpg ?? 0))).toBeCloseTo(12.9317, 3);
    // Poço aberto com fratura de 13,0 ppg: margem estreita, mas sem ruptura.
    expect(hydraulics.breaches.some(b => b.limit === 'fracture')).toBe(false);
    for (const snapshot of transport.snapshots)
      for (const entry of snapshot.inventory) expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  }, 30_000);

  it('grava e reabre o cenário pelo formato do banco sem mudar o resultado', async () => {
    const run = runField();
    const scenario = mina28bdScenario(run.primary, buildPrimaryTrajectory(run.rows)!);
    const payload = primaryScenarioPayload(scenario);
    expect(payload.operacao).toBe('primaria');
    // Volta pelo mesmo caminho da tela: formValue → cenário → formulário → configuração.
    const reopened = primaryScenarioFromApi({ operacao: payload.operacao, formValue: payload.formValue });
    expect(validatePhaseSurveys(reopened.fases)).toEqual([]);
    const wells = TestBed.inject(WellGeometryService);
    const last = reopened.fases.at(-1)!;
    const well = wells.deriveTrajectoryTvd({ ...buildWellGeometry(last.bottomMD, last.bottomTVD, reopened.fases),
      trajectory: buildPrimaryTrajectory(reopened.fases), caliper: null });
    const context = TestBed.inject(OperationContextService).resolve(well, reopened.selectedPhaseId, 'primaria');
    const form = primaryFormFromConfiguration(reopened.primary, mina28bdForm());
    const again = TestBed.inject(PrimaryProgramService).resolve(context.geometry, buildPrimaryConfiguration(form, context.geometry));
    const peak = (points: { bhpPsi: number | null }[]) => Math.max(...points.map(p => p.bhpPsi ?? -Infinity));
    expect(again.hydraulics!.points.length).toBe(run.resolution.hydraulics!.points.length);
    expect(peak(again.hydraulics!.points)).toBeCloseTo(peak(run.resolution.hydraulics!.points), 9);
    expect(again.transport!.placements).toEqual(run.resolution.transport!.placements);

    const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['PRIMARY_DUMP'];
    if (!target) return;
    const fsModule = 'node:fs';
    const { writeFileSync } = await import(/* @vite-ignore */ fsModule) as
      { writeFileSync: (path: string, data: string) => void };
    const dadosRelatorio = JSON.stringify(mina28bdReportData());
    writeFileSync(target.replace(/\.json$/, '-db.json'), JSON.stringify({ nome: MINA28BD_SCENARIO_NAME,
      operacao: payload.operacao, formValue: payload.formValue, dadosRelatorio }));
    writeFileSync(target.replace(/\.json$/, '-portatil.json'), exportPrimaryScenario(scenario,
      { scenarioName: MINA28BD_SCENARIO_NAME }, new Date().toISOString(), mina28bdReportData()));
  }, 30_000);

  it('mede tempo e convergência do passo (diagnóstico, só com PRIMARY_CONVERGENCE)', async () => {
    const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['PRIMARY_CONVERGENCE'];
    if (!target) return;
    const wells = TestBed.inject(WellGeometryService);
    const { context, primary } = runField();
    const tvdOf = wells.mdToTvdResolver(context.geometry);
    const geometry = wells.resolvePrimaryStageGeometry(context.geometry, primary);
    const volumes = resolvePrimaryProgramVolumes(primary, geometry);
    const rows: Record<string, number>[] = [];
    for (const maxAdvanceBbl of [2, 1, 0.5, 0.25, 0.125]) {
      const t0 = performance.now();
      const transport = simulatePrimaryTransport(primary, geometry, volumes,
        { rateModel: createPrimaryRateModel(primary, geometry, tvdOf), maxAdvanceBbl });
      const t1 = performance.now();
      const hydraulics = resolvePrimaryHydraulics(primary, geometry, transport, tvdOf);
      const t2 = performance.now();
      const max = (pick: (p: typeof hydraulics.points[number]) => number | null) =>
        Math.max(...hydraulics.points.map(pick).filter((v): v is number => v !== null));
      rows.push({ maxAdvanceBbl, transportMs: t1 - t0, hydraulicsMs: t2 - t1, snapshots: transport.snapshots.length,
        maxBhp: max(p => p.bhpPsi), maxOutlet: max(p => p.outletRateBpm), maxVoid: max(p => p.voidVolumeBbl),
        maxPump: max(p => p.pumpPressurePsi), bottomOpened: transport.events.find(e => e.kind === 'bottom-plug-opened')!.timeMin });
    }
    const fsModule = 'node:fs';
    const { writeFileSync } = await import(/* @vite-ignore */ fsModule) as
      { writeFileSync: (path: string, data: string) => void };
    writeFileSync(target, JSON.stringify(rows, null, 1));
  }, 120_000);

  it('grava o resultado do motor quando PRIMARY_DUMP aponta um arquivo', async () => {
    const run = runField();
    const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['PRIMARY_DUMP'];
    if (!target) return;
    // Sem tipos do Node no projeto: o especificador em variável passa pela checagem
    // e é resolvido pelo vitest, que roda em Node.
    const fsModule = 'node:fs';
    const { writeFileSync } = await import(/* @vite-ignore */ fsModule) as
      { writeFileSync: (path: string, data: string) => void };
    const { resolution, context } = run;
    writeFileSync(target, JSON.stringify({
      surveyIssues: run.surveyIssues,
      contextIssues: context.issues,
      tvd: MINA28BD_SURVEY.map(([md]) => ({ md, tvd: run.wells.mdToTvd(run.fullWell, md) })),
      geometry: resolution.geometry.fullGeometry,
      stageGeometry: resolution.geometry.stages,
      volumes: resolution.volumes,
      transport: resolution.transport && { ...resolution.transport, snapshots: undefined,
        snapshotCount: resolution.transport.snapshots.length },
      hydraulics: resolution.hydraulics && { ...resolution.hydraulics, snapshots: undefined,
        profilesAtEnd: resolution.hydraulics.snapshots.at(-1)?.profiles },
    }, null, 1));
  }, 30_000);
});
