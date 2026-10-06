import { describe, expect, it } from 'vitest';
import { primaryContractExample } from '../models/primary-cementing.examples';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { buildWellGeometry } from '../models/well-geometry.form';
import { K, PRIMARY_ATMOSPHERIC_PSI, createPrimaryRateModel, primaryNaturalRate, primaryPressureBalance,
  resolvePrimaryHydraulics } from './primary-hydraulics';
import { simulatePrimaryTransport } from './primary-transport';
import { resolvePrimaryProgramVolumes } from './primary-volumes';
import { WellGeometryService } from './well-geometry.service';

const service = new WellGeometryService();

/** Caso base da SPEC §11.1, o mesmo usado em P4 e P5. */
function baseCase(): PrimaryScenario {
  const s = primaryContractExample('conventional');
  s.fases = [{ id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: 0, topTVD: 0,
    bottomMD: 1500, bottomTVD: 1500, holeDiameterIn: 8.5,
    casingOD: null, casingID: null, shoeMD: null, shoeTVD: null }];
  const p = s.primary;
  p.assemblies = [{ id: 'target', name: 'target', role: 'target-casing',
    sections: [{ id: 'target-section', topMD: 0, bottomMD: 1500, idIn: 6.276, odIn: 7 }] }];
  p.target = { kind: 'conventional', casingAssemblyId: 'target', floatCollarMD: 1480, shoeMD: 1500 };
  p.outerBoundaries = [{ id: 'outer-hole', kind: 'open-hole', topMD: 0, bottomMD: 1500,
    phaseId: 'open', diameter: { source: 'nominal', excessFraction: 0 } }];
  p.devices = [{ id: 'collar', name: 'Colar', kind: 'float-collar', assemblyId: 'target',
    outletMD: 1500, seatMD: 1480, launchMD: 0, initialState: 'open' }];
  p.retainedVolumes = [{ id: 'track', kind: 'shoe-track', assemblyId: 'target', zone: 'internal',
    topMD: 1480, bottomMD: 1500 }];
  p.paths = [{ id: 'shoe-path', name: 'Circulação pela sapata', legs: [
    { id: 'in', zone: 'internal', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'down' },
    { id: 'out', zone: 'casing-annulus', assemblyId: 'target', topMD: 0, bottomMD: 1500, direction: 'up' },
  ] }];
  p.stages = [{ id: 'stage-1', name: 'Estágio 1', deviceId: 'collar', outletMD: 1500, seatMD: 1480,
    targetTocMD: 500, activePathId: 'shoe-path',
    placements: [{ id: 'cement-1', fluidId: 'cement', topMD: 500, bottomMD: 1500, retainedVolumeIds: ['track'] }],
    steps: [
      { id: 's1-cement', kind: 'pump', fluidId: 'cement', rateBpm: 5, quantity: { source: 'placement', placementId: 'cement-1', fraction: 1 } },
      { id: 's1-launch', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
      { id: 's1-displace', kind: 'pump', fluidId: 'displacement', rateBpm: 5, quantity: { source: 'displacement', deviceId: 'collar', fraction: 1 } },
    ] }];
  s.wellFinalMD = s.wellFinalTVD = 1500;
  return s;
}

/** Motor como a tela o usa: transporte e hidráulica acoplados pelo modelo de vazão. */
const solve = (s: PrimaryScenario, coupled = true) => {
  const well = buildWellGeometry(s.wellFinalMD, s.wellFinalTVD, s.fases);
  const geometry = service.resolvePrimaryStageGeometry(well, s.primary);
  const tvdOf = service.mdToTvdResolver(well);
  const transport = simulatePrimaryTransport(s.primary, geometry, resolvePrimaryProgramVolumes(s.primary, geometry),
    coupled ? { rateModel: createPrimaryRateModel(s.primary, geometry, tvdOf) } : {});
  return { transport, hydraulics: resolvePrimaryHydraulics(s.primary, geometry, transport, tvdOf, s.presentation.references) };
};
const run = (s: PrimaryScenario) => solve(s).hydraulics;
/** Transporte de P5 sem modelo de vazão: a hidráulica só detecta a queda livre e para. */
const runUncoupled = (s: PrimaryScenario) => solve(s, false).hydraulics;

describe('primary hydraulics, window and free-fall domain (P6)', () => {
  it('reproduces the prescribed pressure balance of the SPEC', () => {
    // Interior 10 ppg em 1500 m; anular 10/12/16 ppg em 500/700/300 m.
    const internalHydrostaticPsi = K * 10 * 1500;
    const annularHydrostaticPsi = K * (10 * 500 + 12 * 700 + 16 * 300);
    expect(internalHydrostaticPsi).toBeCloseTo(2559.0552, 9);
    expect(annularHydrostaticPsi).toBeCloseTo(3104.986976, 9);
    const balance = primaryPressureBalance({ returnPressurePsi: 100,
      internalHydrostaticPsi, annularHydrostaticPsi,
      pipeFrictionPsi: 100, annularFrictionPsi: 200, localLossPsi: 50, outletTVD: 1500 });
    expect(balance.requiredPumpPressurePsi).toBeCloseTo(995.931776, 9);
    expect(balance.bhpPsi).toBeCloseTo(3404.986976, 9);
    expect(balance.ecdPpg).toBeCloseTo(13.30564098812718, 12);
  });

  it('detects the internal column being used as if it were the annular one', () => {
    // Trocar só os últimos 30 m internos para 16 ppg não muda o BHP anular.
    const annularHydrostaticPsi = K * (10 * 500 + 12 * 700 + 16 * 300);
    const heavier = K * (10 * 1470 + 16 * 30);
    expect(heavier).toBeCloseTo(2589.7638624, 9);
    const balance = primaryPressureBalance({ returnPressurePsi: 100,
      internalHydrostaticPsi: heavier, annularHydrostaticPsi,
      pipeFrictionPsi: 100, annularFrictionPsi: 200, localLossPsi: 50, outletTVD: 1500 });
    expect(balance.requiredPumpPressurePsi).toBeCloseTo(965.2231136, 9);
    expect(balance.bhpPsi).toBeCloseTo(3404.986976, 9);
  });

  it('gives ECD equal to the density with no friction and no back pressure', () => {
    const balance = primaryPressureBalance({ returnPressurePsi: 0,
      internalHydrostaticPsi: K * 10 * 1500, annularHydrostaticPsi: K * 10 * 1500,
      pipeFrictionPsi: 0, annularFrictionPsi: 0, localLossPsi: 0, outletTVD: 1500 });
    expect(balance.bhpPsi).toBeCloseTo(2559.0552, 9);
    expect(balance.ecdPpg).toBeCloseTo(10, 12);
    // Mesmo fluido nos dois ramos: a bomba só vence as perdas.
    expect(balance.requiredPumpPressurePsi).toBeCloseTo(0, 12);
    expect(primaryPressureBalance({ returnPressurePsi: 0, internalHydrostaticPsi: 0,
      annularHydrostaticPsi: 0, pipeFrictionPsi: 0, annularFrictionPsi: 0, localLossPsi: 0,
      outletTVD: 0 }).ecdPpg).toBeNull();
  });

  it('applies the selected friction level independently to pipe and annular losses', () => {
    const lowScenario = baseCase();
    const highScenario = baseCase();
    for (const scenario of [lowScenario, highScenario]) {
      scenario.primary.fluids.find(f => f.id === 'mud')!.densityPpg = 16;
      scenario.primary.fluids.find(f => f.id === 'cement')!.densityPpg = 12;
    }
    lowScenario.primary.frictionSettings = { internal: 'low', annular: 'low' };
    highScenario.primary.frictionSettings = { internal: 'high', annular: 'high' };
    const low = run(lowScenario).points.find(point => point.state === 'full' && point.pumpRateBpm > 0)!;
    const high = run(highScenario).points.find(point => point.state === 'full' && point.pumpRateBpm > 0)!;

    expect(high.pipeFrictionPsi).toBeCloseTo(low.pipeFrictionPsi! * 1.35, 9);
    expect(high.annularFrictionPsi).toBeCloseTo(low.annularFrictionPsi! * 1.35, 9);
    expect(high.requiredPumpPressurePsi).toBeGreaterThan(low.requiredPumpPressurePsi!);
    expect(high.ecdPpg).toBeGreaterThan(low.ecdPpg!);
  });

  it('finds the natural rate as a root and refuses to guess one', () => {
    // Perdas quadráticas sintéticas: a raiz de 4·Q² = 100 é Q = 5.
    const rate = primaryNaturalRate(q => 4 * q * q, 100, 50, 1e-9);
    expect(rate).toBeCloseTo(5, 6);
    // Sem raiz no intervalo, nada é devolvido.
    expect(primaryNaturalRate(q => 4 * q * q, 1e9, 50)).toBeNull();
    expect(primaryNaturalRate(() => null, 100)).toBeNull();
    expect(primaryNaturalRate(q => 4 * q * q, -10)).toBeNull();
  });

  it('builds the annular column from its own fluids, not from the internal one', () => {
    // Pasta mais leve que a lama: o interior alivia enquanto o anular segue pesado.
    const scenario = baseCase();
    scenario.primary.fluids.find(f => f.id === 'mud')!.densityPpg = 16;
    scenario.primary.fluids.find(f => f.id === 'cement')!.densityPpg = 12;
    const result = run(scenario);
    const pumping = result.points.filter(p => p.state === 'full' && p.pumpRateBpm > 0);
    expect(pumping.length).toBeGreaterThan(1);
    for (const point of pumping) {
      expect(point.bhpPsi).toBeCloseTo(point.annularHydrostaticPsi! + point.annularFrictionPsi!, 9);
      expect(point.requiredPumpPressurePsi).toBeCloseTo(
        point.annularHydrostaticPsi! - point.internalHydrostaticPsi!
        + point.pipeFrictionPsi! + point.annularFrictionPsi! + point.localLossPsi!, 9);
    }
    // No início tudo é lama: as duas colunas valem o mesmo e a bomba só vence o atrito.
    const first = pumping[0];
    expect(first.annularHydrostaticPsi).toBeCloseTo(first.internalHydrostaticPsi!, 6);
    expect(first.requiredPumpPressurePsi).toBeCloseTo(
      first.pipeFrictionPsi! + first.annularFrictionPsi!, 9);
    // Depois, as colunas divergem: a interna não é copiada para o anular.
    const last = pumping.at(-1)!;
    expect(last.internalHydrostaticPsi!).toBeLessThan(last.annularHydrostaticPsi!);
    expect(last.uTubeDrivePsi!).toBeLessThan(0);
    expect(last.requiredPumpPressurePsi!).toBeGreaterThan(0);
  });

  it('resolves the SPEC base case free fall instead of stopping at it', () => {
    // Pasta de 16 ppg empurrando lama de 10 ppg com retorno atmosférico: a coluna
    // interna cai mais rápido que o bombeio e puxa vácuo sob a cabeça fechada.
    const { transport, hydraulics } = solve(baseCase());
    expect(transport.diagnostics.map(d => d.code)).toContain('PRIMARY_FREE_FALL');
    expect(transport.halted).toBeFalsy();
    const falling = hydraulics.points.filter(p => p.state === 'free-fall');
    expect(falling.length).toBeGreaterThan(0);
    for (const point of falling) {
      // A cabeça fica no vácuo; a vazão de saída vem do balanço, não da bomba.
      expect(point.pumpPressurePsi).toBeCloseTo(-PRIMARY_ATMOSPHERIC_PSI, 9);
      expect(point.outletRateBpm!).toBeGreaterThanOrEqual(0);
      expect(point.returnRateBpm).toBe(point.outletRateBpm);
      expect(point.bhpPsi).toBeCloseTo(point.annularHydrostaticPsi! + point.annularFrictionPsi!, 9);
      expect(point.uTubeDrivePsi!).toBeGreaterThan(0);
    }
    // Retorno acima do bombeado e vazio aberto no topo do interno.
    expect(falling.some(p => p.outletRateBpm! > p.pumpRateBpm + 1e-6)).toBe(true);
    expect(Math.max(...falling.map(p => p.voidVolumeBbl ?? 0))).toBeGreaterThan(0);
    // Conservação por fluido em todos os instantes, com vazio e sem ele.
    for (const snapshot of transport.snapshots)
      for (const entry of snapshot.inventory) expect(Math.abs(entry.balanceErrorBbl)).toBeLessThan(1e-8);
    // O programa termina: assentamento com o vazio já preenchido.
    expect(transport.events.some(e => e.kind === 'top-plug-landed')).toBe(true);
    expect(transport.snapshots.at(-1)!.voidBbl).toBeLessThan(1e-8);
  });

  it('holds zero friction once the plug is seated, and a null pump pressure without void', () => {
    const result = run(baseCase());
    const seated = result.points.filter(p => p.state === 'plug-landed');
    expect(seated.length).toBeGreaterThan(0);
    for (const point of seated) {
      expect(point.pipeFrictionPsi).toBe(0);
      expect(point.annularFrictionPsi).toBe(0);
      expect(point.outletRateBpm).toBe(0);
      expect(point.bhpPsi).toBeCloseTo(point.annularHydrostaticPsi!, 9);
      // Com o interno cheio, a pressão após o assentamento é condição informada, não
      // inferida; enquanto o bombeio ainda enche o vazio, a cabeça segue no vácuo.
      if ((point.voidVolumeBbl ?? 0) <= 1e-9) {
        expect(point.pumpPressurePsi).toBeNull();
        expect(point.requiredPumpPressurePsi).toBeNull();
      } else expect(point.pumpPressurePsi).toBeCloseTo(-PRIMARY_ATMOSPHERIC_PSI, 9);
    }
  });

  it('records the dynamic state at the instant the top plug arrives, before it closes', () => {
    // É ali que ficam a pressão final de circulação e o maior ECD do deslocamento.
    const scenario = baseCase();
    scenario.primary.fluids.find(f => f.id === 'mud')!.densityPpg = 16;
    scenario.primary.fluids.find(f => f.id === 'cement')!.densityPpg = 12;
    const { transport, hydraulics } = solve(scenario);
    const landing = transport.events.find(e => e.kind === 'top-plug-landed')!;
    const atLanding = hydraulics.points.filter(p => Math.abs(p.timeMin - landing.timeMin) < 1e-9);
    const dynamic = atLanding.find(p => p.state === 'full' && p.pumpRateBpm > 0)!;
    expect(dynamic.pumpPressurePsi).not.toBeNull();
    expect(dynamic.annularFrictionPsi!).toBeGreaterThan(0);
    expect(atLanding.some(p => p.state === 'plug-landed')).toBe(true);
    // É o último instante com circulação: depois dele só há o estado assentado.
    const lastFlowing = hydraulics.points.filter(p => p.state === 'full' && p.pumpRateBpm > 0).at(-1)!;
    expect(lastFlowing.timeMin).toBeCloseTo(landing.timeMin, 9);
    expect(dynamic.pumpPressurePsi!).toBeGreaterThan(0);
  });

  it('leaves the window null behind previous casing and warns when crossed', () => {
    const scenario = baseCase();
    scenario.primary.outerBoundaries = [
      { id: 'outer-previous', kind: 'previous-casing', topMD: 0, bottomMD: 300, assemblyId: 'previous' },
      { id: 'outer-hole', kind: 'open-hole', topMD: 300, bottomMD: 1500, phaseId: 'open',
        diameter: { source: 'nominal', excessFraction: 0 } }];
    scenario.primary.assemblies.push({ id: 'previous', name: 'previous', role: 'previous-casing',
      sections: [{ id: 'previous-section', topMD: 0, bottomMD: 300, idIn: 8.5, odIn: 9.625 }] });
    scenario.fases = [
      { id: 'surface', name: 'Superfície', type: 'SURFACE', topMD: 0, topTVD: 0, bottomMD: 300,
        bottomTVD: 300, holeDiameterIn: 12.25, casingOD: 9.625, casingID: 8.5, shoeMD: 300, shoeTVD: 300 },
      { id: 'open', name: 'Poço aberto', type: 'OPEN_HOLE', topMD: 300, topTVD: 300, bottomMD: 1500,
        bottomTVD: 1500, holeDiameterIn: 8.5, casingOD: null, casingID: null, shoeMD: null, shoeTVD: null }];
    // Fratura baixa o bastante para ser atravessada pela coluna de pasta.
    scenario.primary.pressureWindow = [{ topMD: 0, bottomMD: 1500, porePpg: 9, fracturePpg: 12 }];
    const result = run(scenario);
    const cased = result.envelope.filter(e => e.md < 300);
    expect(cased.length).toBeGreaterThan(0);
    for (const entry of cased) {
      expect(entry.porePsi).toBeNull();
      expect(entry.fracturePsi).toBeNull();
    }
    expect(result.envelope.some(e => e.md > 300 && e.fracturePsi !== null)).toBe(true);
    expect(result.diagnostics.map(d => d.code)).toContain('PRIMARY_LIMIT_FRACTURE');
    const breach = result.breaches.find(b => b.limit === 'fracture')!;
    expect(breach.endTimeMin).toBeGreaterThanOrEqual(breach.startTimeMin);
    expect(breach.md).toBeGreaterThan(300);
    expect(result.narrowestFractureMargin!.psi).toBeLessThan(0);
  });

  it('keeps the envelope as a min/max across instants, never one profile', () => {
    const result = run(baseCase());
    expect(result.envelope.length).toBeGreaterThan(1);
    for (const entry of result.envelope) {
      expect(entry.maxAnnularPsi!).toBeGreaterThanOrEqual(entry.minAnnularPsi!);
      expect(entry.minHydrostaticPsi).not.toBeNull();
      expect(entry.maxHydrostaticPsi).not.toBeNull();
      expect(entry.maxHydrostaticPsi!).toBeGreaterThanOrEqual(entry.minHydrostaticPsi!);
      expect(entry.maxAnnularPsi!).toBeGreaterThanOrEqual(entry.maxHydrostaticPsi!);
      expect(Number.isFinite(entry.tvd)).toBe(true);
    }
    const deepest = result.envelope.at(-1)!;
    const shallowest = result.envelope[0];
    expect(deepest.maxAnnularPsi!).toBeGreaterThan(shallowest.maxAnnularPsi!);
  });

  it('keeps return backpressure out of the hydrostatic envelope', () => {
    const scenario = baseCase();
    scenario.primary.returnPressurePsi = 500;
    const result = run(scenario);
    const deepest = result.envelope.at(-1)!;
    const maximumPureHydrostatic = Math.max(...result.points
      .map(point => point.annularHydrostaticPsi)
      .filter((value): value is number => value !== null));
    expect(deepest.maxHydrostaticPsi).toBeCloseTo(maximumPureHydrostatic, 6);
    expect(deepest.maxAnnularPsi!).toBeGreaterThanOrEqual(deepest.maxHydrostaticPsi! + 500);
  });

  it('interpolates pore and fracture gradients by TVD between formation control points', () => {
    const scenario = baseCase();
    scenario.primary.pressureWindow = [{ topMD: 300, bottomMD: 1500,
      topPorePpg: 8.5, porePpg: 9, topFracturePpg: 13.4, fracturePpg: 15 }];
    const result = run(scenario);
    const middle = result.envelope.find(entry => Math.abs(entry.md - 900) < 1e-6)!;
    expect(middle.porePsi! / (K * middle.tvd)).toBeCloseTo(8.75, 6);
    expect(middle.fracturePsi! / (K * middle.tvd)).toBeCloseTo(14.2, 6);

    const casedScenario = primaryContractExample('conventional');
    casedScenario.primary.pressureWindow = [{ topMD: 300, bottomMD: 1500,
      topPorePpg: 8.5, porePpg: 9, topFracturePpg: 13.4, fracturePpg: 15 }];
    const atPreviousShoe = run(casedScenario).envelope.find(entry => entry.md === 300)!;
    expect(atPreviousShoe.porePsi! / (K * atPreviousShoe.tvd)).toBeCloseTo(8.5, 6);
    expect(atPreviousShoe.fracturePsi! / (K * atPreviousShoe.tvd)).toBeCloseTo(13.4, 6);
  });

  it('warns about an exceeded equipment limit without trimming the program', () => {
    const scenario = baseCase();
    scenario.primary.equipmentLimits = { maxPressurePsi: 1, maxRateBpm: 1, motorHp: 1, efficiency: 0.5 };
    const limited = run(scenario);
    const plain = run(baseCase());
    expect(limited.diagnostics.map(d => d.code)).toContain('PRIMARY_LIMIT_PUMP_RATE');
    const rate = limited.breaches.find(b => b.limit === 'pump-rate')!;
    expect(rate.peakValue).toBe(5);
    expect(rate.limitValue).toBe(1);
    expect(limited.hydraulicPowerUsagePct).toBeGreaterThan(100);
    // O programa não foi podado: mesmas vazões e mesmo número de pontos.
    expect(limited.points.map(p => p.pumpRateBpm)).toEqual(plain.points.map(p => p.pumpRateBpm));
    expect(limited.points.at(-1)!.pumpedVolumeBbl).toBeCloseTo(plain.points.at(-1)!.pumpedVolumeBbl, 9);
  });

  it('without a rate model, stops the physical curves at the first free fall instead of truncating', () => {
    const scenario = baseCase();
    // Pasta muito pesada com retorno atmosférico: o tubo em U vence as perdas.
    scenario.primary.fluids.find(f => f.id === 'cement')!.densityPpg = 30;
    const result = runUncoupled(scenario);
    expect(result.diagnostics.map(d => d.code)).toContain('PRIMARY_FREE_FALL_UNRESOLVED');
    expect(result.status).toBe('partial');
    // O primeiro estado fora do modelo encerra as séries: nada depois dele.
    const last = result.points.at(-1)!;
    expect(last.state).toBe('outside-model');
    expect(result.points.filter(p => p.state === 'outside-model')).toHaveLength(1);
    // Nada é truncado em zero: as curvas físicas ficam indisponíveis.
    expect(last.pumpPressurePsi).toBeNull();
    expect(last.bhpPsi).toBeNull();
    expect(last.ecdPpg).toBeNull();
    expect(last.uTubeDrivePsi!).toBeGreaterThan(0);
    expect(result.snapshots.at(-1)!.profiles).toEqual([]);
    // Pressão de bombeio negativa nunca é publicada como se o circuito estivesse cheio.
    for (const point of result.points) if (point.pumpPressurePsi !== null)
      expect(point.pumpPressurePsi).toBeGreaterThanOrEqual(-PRIMARY_ATMOSPHERIC_PSI);
  });

  it('names the correlation and its regime limits, which depend on n, in every profile', () => {
    const scenario = baseCase();
    const result = run(scenario);
    const profiles = result.snapshots.flatMap(s => s.profiles);
    expect(profiles.length).toBeGreaterThan(0);
    const fluids = new Map(scenario.primary.fluids.map(f => [f.id, f]));
    for (const profile of profiles) {
      const n = fluids.get(profile.fluidId!)!.rheology.n;
      expect(profile.correlationId).toBe('r3-guillot-4-6');
      expect(profile.maxLaminarRe).toBeCloseTo(3250 - 1150 * n, 9);
      expect(profile.minTurbulentRe).toBeCloseTo(4150 - 1150 * n, 9);
      expect(Number.isFinite(profile.md)).toBe(true);
    }
  });

  it('carries the static annular column below an inactive outlet', () => {
    const result = run(primaryContractExample('two-stage'));
    const second = result.points.filter(p => p.stageId === 'stage-2' && p.state === 'full' && p.pumpRateBpm > 0);
    expect(second.length).toBeGreaterThan(0);
    // A saída ativa é a porta, mas o anular abaixo dela continua com pressão.
    expect(second[0].activeOutletMD).toBe(1000);
    const deep = result.envelope.filter(e => e.md > 1000);
    expect(deep.length).toBeGreaterThan(0);
    for (const entry of deep) expect(entry.maxAnnularPsi!).toBeGreaterThan(0);
  });
});
