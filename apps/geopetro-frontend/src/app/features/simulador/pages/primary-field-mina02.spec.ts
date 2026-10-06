import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { defaultPreflushQuantity, type PrimaryPumpQuantity } from '../models/primary-cementing.model';
import { buildPrimaryConfiguration, primaryFormFromConfiguration } from '../models/primary-operation.form';
import { buildWellGeometry } from '../models/well-geometry.form';
import { OperationContextService } from '../services/operation-context.service';
import { buildPrimaryTrajectory, validatePhaseSurveys } from '../services/phase-survey';
import { K } from '../services/primary-hydraulics';
import { PrimaryProgramService } from '../services/primary-program.service';
import { primaryScenarioFromApi, primaryScenarioPayload } from '../services/primary-scenario-codec';
import { resolvePrimaryProgramVolumes } from '../services/primary-volumes';
import { WellGeometryService } from '../services/well-geometry.service';
import type { WellCaliperProfile } from '../models/caliper.model';
import { exportPrimaryScenario, importPrimaryScenario } from '../services/primary-scenario-portable';
import { MINA02_ICEM_CHARTS, MINA02_PROGRAM, type Mina02Variant, mina02Caliper, mina02CollarMD, mina02Form,
  mina02Phases, mina02ReportData, mina02Scenario, mina02ScenarioName, mina02TexturedCaliper } from './primary-field-mina02.fixture';

/**
 * Curvas do iCem digitalizadas dos gráficos do programa (versão de 489 m):
 * volume bombeado (bbl), hidrostática a 489 m (psi), ECD a 489 m (ppg), pressão na
 * cabeça (psi; null onde o traço some sob o eixo) e vazão de saída (bpm).
 */
const ICEM_CURVES: readonly [number, number, number, number | null, number][] = [
  [5, 749.0, 9.154, null, 5.00], [30, 749.0, 9.166, 1.7, 6.09], [45, 749.0, 9.166, 1.7, 6.10],
  [80, 749.9, 9.177, 1.7, 5.55], [95, 750.9, 9.177, 1.7, 5.50], [110, 764.2, 9.349, 1.7, 3.81],
  [130, 790.8, 9.674, 1.7, 3.79], [150, 817.5, 10.000, 1.7, 3.78], [170, 849.8, 10.400, 1.7, 3.15],
  [192, 890.7, 10.909, null, 3.08], [205, 913.1, 11.200, 1.7, 2.97], [240, 960.6, 11.783, 1.7, 4.81],
  [255, 973.5, 11.949, 1.7, 4.84], [275, 998.2, 12.343, 52.2, 8.01], [290, 1013.4, 12.549, 103.5, 8.01],
  [312, 1024.9, 12.686, 166.0, 8.01], [325, 1050.5, 12.891, 232.7, 3.99], [335, 1077.2, 13.240, 305.4, 3.99],
  [340, 1090.0, 13.337, 333.7, 1.99],
];
/** Envelope do iCem: TVD (m) e ECD máximo (ppg). */
const ICEM_MAX_ECD: readonly [number, number][] = [
  [100, 12.660], [200, 12.664], [300, 12.695], [390, 12.719], [420, 12.927], [450, 13.142], [480, 13.323], [488, 13.371],
];

/** Mesmo caminho da tela: fases → trajetória com caliper → fase da operação → configuração → motor. */
function runMina02(variant: Mina02Variant, caliper: WellCaliperProfile = mina02Caliper(variant)) {
  const wells = TestBed.inject(WellGeometryService);
  const rows = mina02Phases(variant);
  const fullWell = wells.deriveTrajectoryTvd({
    ...buildWellGeometry(variant.wellTD, variant.wellTDTVD, rows),
    trajectory: buildPrimaryTrajectory(rows), caliper,
  });
  const context = TestBed.inject(OperationContextService).resolve(fullWell, 'surface', 'primaria');
  // O lead do programa é 142 bbl; o que passa do dimensionado pelo intervalo vai como reserva.
  const sized = buildPrimaryConfiguration(mina02Form(0, variant), context.geometry);
  const volumes = resolvePrimaryProgramVolumes(sized, wells.resolvePrimaryStageGeometry(context.geometry, sized));
  const leadPlannedBbl = volumes.stages[0].placements.find(p => p.placementId === 'lead')!.plannedBbl;
  const form = mina02Form(142 - leadPlannedBbl, variant);
  const primary = buildPrimaryConfiguration(form, context.geometry);
  const resolution = TestBed.inject(PrimaryProgramService).resolve(context.geometry, primary, [
    { id: 'sapata', name: 'Sapata', md: variant.shoeMD, zone: 'casing-annulus', assemblyId: 'target' },
    { id: 'md489', name: '489 m', md: 489, zone: 'casing-annulus', assemblyId: 'target' },
  ]);
  return { wells, rows, fullWell, context, form, primary, resolution, leadPlannedBbl };
}

/** Valor por volume bombeado, interpolado entre amostras vizinhas. */
function atVolume<T extends { pumpedVolumeBbl: number }>(points: T[], pick: (p: T) => number | null, volumeBbl: number) {
  const rows = points.filter(p => pick(p) !== null);
  const i = rows.findIndex(p => p.pumpedVolumeBbl >= volumeBbl);
  if (i <= 0) return i === 0 ? pick(rows[0])! : null;
  const a = rows[i - 1]; const b = rows[i];
  const span = b.pumpedVolumeBbl - a.pumpedVolumeBbl;
  return span <= 0 ? pick(b)! : pick(a)! + (pick(b)! - pick(a)!) * (volumeBbl - a.pumpedVolumeBbl) / span;
}
const rms = (pairs: [number | null, number | null][]) => {
  const d = pairs.filter(([a, b]) => a !== null && b !== null).map(([a, b]) => a! - b!);
  return Math.sqrt(d.reduce((sum, x) => sum + x * x, 0) / d.length);
};

describe('caso de campo MINA-02 (programa Halliburton v3 e gráficos do iCem)', () => {
  it('simula o programa v3 com os volumes, topos e pressões que ele espera', () => {
    const { wells, fullWell, resolution, leadPlannedBbl } = runMina02(MINA02_PROGRAM);
    // 494,5 m MD / 494,11 m TVD no programa.
    expect(Math.abs(wells.mdToTvd(fullWell, 494.5) - 494.11)).toBeLessThan(0.05);
    const stage = resolution.volumes.stages[0];
    expect(resolution.volumes.valid).toBe(true);
    expect(stage.placements.find(p => p.placementId === 'tail')!.plannedBbl).toBeCloseTo(32, 2);
    expect(leadPlannedBbl).toBeCloseTo(132.28, 1);
    expect(stage.placements.find(p => p.placementId === 'lead')!.programmedBbl).toBeCloseTo(142, 6);
    // 118,37 bbl do programa = 118,26 bbl até o colar + 0,11 bbl de linhas de superfície.
    expect(stage.displacementTargetBbl).toBeCloseTo(118.26, 1);
    expect(resolution.volumes.totalPumpedBbl).toBeCloseTo(332.37 - 0.11, 1);
    expect(resolution.volumes.totalTimeMin).toBeCloseTo(82.85, 1);

    const transport = resolution.transport!;
    const hydraulics = resolution.hydraulics!;
    expect(transport.status).toBe('complete');
    expect(hydraulics.status).toBe('complete');
    const lead = transport.placements.find(p => p.placementId === 'lead')!;
    const tail = transport.placements.find(p => p.placementId === 'tail')!;
    expect(lead.actualTocMD).toBeCloseTo(0, 3);
    expect(tail.actualIntervals).toHaveLength(1);
    expect(tail.actualIntervals[0].topMD).toBeCloseTo(394.5, 1);
    // "Ao final do deslocamento é esperado retorno de pasta na superfície."
    expect(lead.returnedBbl).toBeCloseTo(142 - leadPlannedBbl, 1);
    expect(tail.returnedBbl).toBeLessThan(1e-6);

    // Pressão final de bombeio de 348 psi e diferencial estático de 314 psi (esperados).
    const landing = transport.events.find(e => e.kind === 'top-plug-landed')!.timeMin;
    const final = hydraulics.points.find(p => Math.abs(p.timeMin - landing) < 1e-9 && p.state === 'full')!;
    expect(Math.abs(final.pumpPressurePsi! - 348) / 348).toBeLessThan(0.03);
    expect(Math.abs(final.annularHydrostaticPsi! - final.internalHydrostaticPsi! - 314) / 314).toBeLessThan(0.015);
    // Poço aberto com fratura de 16 ppg na sapata: o ECD final fica abaixo, sem ruptura.
    expect(final.ecdPpg!).toBeLessThan(13.5);
    expect(hydraulics.breaches.some(b => b.limit === 'fracture')).toBe(false);
    // A queda livre começa no espaçador, como a vazão de saída do iCem (acima de 5 bpm aos ~15 bbl).
    const falling = hydraulics.points.filter(p => p.state === 'free-fall');
    expect(falling[0].pumpedVolumeBbl).toBeGreaterThan(10);
    expect(falling[0].pumpedVolumeBbl).toBeLessThan(20);
    for (const snapshot of transport.snapshots)
      for (const entry of snapshot.inventory) expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
  }, 30_000);

  it('calcula o espaçador do programa pelo critério do simulador: 8 min a 5 bpm dão os 40 bbl', () => {
    const { wells, context, form } = runMina02(MINA02_PROGRAM);
    const resolve = (quantity: PrimaryPumpQuantity) => {
      const steps = form.stages[0].steps.map(step => step.id === 's1-spacer' && step.kind === 'pump' ? { ...step, quantity } : step);
      const primary = buildPrimaryConfiguration({ ...form, stages: [{ ...form.stages[0], steps }] }, context.geometry);
      return resolvePrimaryProgramVolumes(primary, wells.resolvePrimaryStageGeometry(context.geometry, primary));
    };
    const informed = resolve({ source: 'entered', volumeBbl: 40 });
    const calculated = resolve(defaultPreflushQuantity('spacer'));
    const spacer = calculated.stages[0].steps.find(step => step.stepId === 's1-spacer')!;
    const tail = calculated.stages[0].placements.find(p => p.placementId === 'tail')!;
    // Pasta de fundo: 24,83 bbl de anular em 100 m (os 32 bbl do tail menos o shoe track).
    expect(tail.annularBbl).toBeCloseTo(24.83, 1);
    expect(spacer.preflush!.capacityBblM).toBeCloseTo(tail.annularBbl / 100, 12);
    expect(spacer.preflush!.annularBbl).toBeCloseTo(152.4 * tail.annularBbl / 100, 9);
    expect(spacer.preflush!.annularBbl).toBeCloseTo(37.84, 1);
    // O contato governa: 8 min × 5 bpm = 40 bbl, o volume do programa v3.
    expect(spacer.preflush!.contactBbl).toBeCloseTo(40, 12);
    expect(spacer.preflush!.governing).toBe('contact');
    expect(spacer.volumeBbl).toBeCloseTo(40, 12);
    expect(calculated.valid).toBe(true);
    expect(calculated.totalPumpedBbl).toBeCloseTo(informed.totalPumpedBbl, 9);
    expect(calculated.totalTimeMin).toBeCloseTo(informed.totalTimeMin, 9);
    // 10 min de contato dão os 50 bbl da versão dos gráficos do iCem.
    const tenMinutes = resolve({ ...defaultPreflushQuantity('spacer'), contactTimeMin: 10 });
    expect(tenMinutes.stages[0].steps.find(step => step.stepId === 's1-spacer')!.volumeBbl).toBeCloseTo(50, 12);
    // Volume informado substitui o calculado, e a base continua visível.
    const override = resolve({ ...defaultPreflushQuantity('spacer'), overrideBbl: 45 });
    const overridden = override.stages[0].steps.find(step => step.stepId === 's1-spacer')!;
    expect(overridden.volumeBbl).toBe(45);
    expect(overridden.preflush!.calculatedBbl).toBeCloseTo(40, 12);
    // Um comprimento anular maior passa a governar: 250 m × C.
    const longer = resolve({ ...defaultPreflushQuantity('spacer'), annularLengthM: 250 });
    const byLength = longer.stages[0].steps.find(step => step.stepId === 's1-spacer')!;
    expect(byLength.preflush!.governing).toBe('annular');
    expect(byLength.volumeBbl).toBeCloseTo(250 * tail.annularBbl / 100, 9);
  }, 30_000);

  it.each([
    ['por zonas', mina02Caliper(MINA02_ICEM_CHARTS)],
    ['irregular do cenário de apresentação', mina02TexturedCaliper(MINA02_ICEM_CHARTS)],
  ])('reproduz as curvas do iCem com os dados da versão em que os gráficos foram gerados (caliper %s)', (_label, caliper) => {
    const { wells, fullWell, resolution } = runMina02(MINA02_ICEM_CHARTS, caliper);
    const hydraulics = resolution.hydraulics!;
    expect(resolution.transport!.status).toBe('complete');
    expect(hydraulics.status).toBe('complete');
    const all = hydraulics.points;
    const pumping = all.filter(p => p.pumpRateBpm > 0);
    const tvd489 = wells.mdToTvd(fullWell, 489);
    const ecd489 = (p: typeof all[number]) => {
      const row = p.references.find(r => r.id === 'md489');
      return row?.pressurePsi == null ? null : row.pressurePsi / (K * tvd489);
    };
    const hydro = rms(ICEM_CURVES.map(([v, psi]) => [psi, atVolume(all, p => p.annularHydrostaticPsi, v)]));
    const ecd = rms(ICEM_CURVES.map(([v, , ppg]) => [ppg, atVolume(pumping, ecd489, v)]));
    const head = rms(ICEM_CURVES.map(([v, , , psi]) => [psi, atVolume(pumping, p => p.pumpPressurePsi, v)]));
    const outlet = rms(ICEM_CURVES.map(([v, , , , bpm]) => [bpm, atVolume(pumping, p => p.outletRateBpm, v)]));
    expect(hydro).toBeLessThan(4);      // psi (2,9 na bancada)
    expect(ecd).toBeLessThan(0.06);     // ppg (0,047)
    expect(head).toBeLessThan(3);       // psi (2,1)
    expect(outlet).toBeLessThan(0.3);   // bpm, fora do fim da queda livre
    const envelope = rms(ICEM_MAX_ECD.map(([tvd, ppg]) => {
      const near = hydraulics.envelope.filter(e => e.maxAnnularPsi !== null && e.tvd > 0 && Math.abs(e.tvd - tvd) <= 6)
        .map(e => e.maxAnnularPsi! / (K * e.tvd)).sort((a, b) => a - b);
      return [ppg, near.length ? near[Math.floor(near.length / 2)] : null];
    }));
    expect(envelope).toBeLessThan(0.06);
  }, 30_000);

  it('grava e reabre os dois cenários pelo formato do banco sem mudar o resultado', async () => {
    const target = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.['PRIMARY_DUMP_MINA02'];
    const dumps: Record<string, unknown> = {};
    for (const variant of [MINA02_PROGRAM, MINA02_ICEM_CHARTS]) {
      // O cenário gravado leva o caliper irregular, que desenha o poço como o esquemático do iCem.
      const caliper = mina02TexturedCaliper(variant);
      const run = runMina02(variant, caliper);
      const scenario = mina02Scenario(run.primary, buildPrimaryTrajectory(run.rows)!, variant, caliper);
      const payload = primaryScenarioPayload(scenario);
      const reopened = primaryScenarioFromApi({ operacao: payload.operacao, formValue: payload.formValue });
      expect(validatePhaseSurveys(reopened.fases)).toEqual([]);
      expect(reopened.caliper?.samples).toEqual(caliper.samples);
      const wells = TestBed.inject(WellGeometryService);
      const last = reopened.fases.at(-1)!;
      const well = wells.deriveTrajectoryTvd({ ...buildWellGeometry(last.bottomMD, last.bottomTVD, reopened.fases),
        trajectory: buildPrimaryTrajectory(reopened.fases), caliper: reopened.caliper });
      const context = TestBed.inject(OperationContextService).resolve(well, reopened.selectedPhaseId, 'primaria');
      const form = primaryFormFromConfiguration(reopened.primary, run.form);
      expect(form.floatCollarMD).toBeCloseTo(mina02CollarMD(variant), 9);
      const again = TestBed.inject(PrimaryProgramService).resolve(context.geometry, buildPrimaryConfiguration(form, context.geometry));
      const peak = (points: { bhpPsi: number | null }[]) => Math.max(...points.map(p => p.bhpPsi ?? -Infinity));
      expect(peak(again.hydraulics!.points)).toBeCloseTo(peak(run.resolution.hydraulics!.points), 9);
      expect(again.transport!.placements).toEqual(run.resolution.transport!.placements);
      dumps[`${variant.id}-db`] = { nome: mina02ScenarioName(variant), operacao: payload.operacao,
        formValue: payload.formValue, dadosRelatorio: JSON.stringify(mina02ReportData(variant)) };
      // Arquivo do botão "Importar" da tela: abre como rascunho com o mesmo cenário.
      const file = exportPrimaryScenario(scenario, { scenarioName: mina02ScenarioName(variant) },
        new Date().toISOString(), mina02ReportData(variant));
      const imported = importPrimaryScenario(file);
      expect(imported.summary.name).toBe(mina02ScenarioName(variant));
      expect(imported.scenario.caliper?.samples).toEqual(caliper.samples);
      expect(imported.scenario.primary).toEqual(reopened.primary);
      dumps[`${variant.id}-portatil`] = JSON.parse(file);
    }
    if (!target) return;
    // Sem tipos do Node no projeto: o especificador em variável passa pela checagem.
    const fsModule = 'node:fs';
    const { writeFileSync } = await import(/* @vite-ignore */ fsModule) as
      { writeFileSync: (path: string, data: string) => void };
    for (const [id, row] of Object.entries(dumps)) writeFileSync(target.replace(/\.json$/, `-${id}.json`), JSON.stringify(row));
  }, 60_000);
});
