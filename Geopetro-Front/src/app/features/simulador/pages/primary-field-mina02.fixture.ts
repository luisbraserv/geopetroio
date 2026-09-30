import type { WellCaliperProfile } from '../models/caliper.model';
import type { PrimaryConfiguration, PrimaryFluid, PrimaryPumpStep } from '../models/primary-cementing.model';
import type { PrimaryOperationFormValue } from '../models/primary-operation.form';
import { createPrimaryReportData, type PrimaryReportData } from '../models/primary-report-data.model';
import { createPrimaryDraft, type PrimaryScenario } from '../models/primary-scenario.model';
import type { WellPhaseFormValue } from '../models/well-geometry.form';
import type { WellTrajectory } from '../models/well-geometry.model';

/**
 * MINA-02 (Braskem, Maceió/AL, sonda OIL-122): cimentação do revestimento de
 * 9⅝" 36 lb/ft na fase de 12¼", pelo programa técnico da Halliburton (versão 3,
 * 15/11/2020, "MINA 02 - Programa Operacional de Cimentacao - Int. Rasa Rev
 * 9.625in v3_rev CG").
 *
 * O documento traz duas versões do mesmo job. As tabelas (§1.4, §1.5 e §2.2) são
 * da versão 3: sapata a 494,5 m, 13⅜" até 35 m, 40 bbl de espaçador bombeados e
 * deslocamento de 100/12/6,37 bbl. Os gráficos do iCem (§1.6) ficaram da versão
 * anterior: o título diz "at 489m MD", a pasta começa aos 50 bbl no eixo de volume,
 * a tabela de estágios põe o lead aos 15,0 min (50 bbl a 5 bpm + 5 min) e a sapata
 * anterior do envelope está a ~20 m. Por isso há duas variantes aqui: o programa,
 * que é o cenário do job, e a dos gráficos, para comparar curva a curva com o iCem.
 */

/** Survey da tabela de centralizadores do programa: MD (m), inclinação (°), azimute (°). */
export const MINA02_SURVEY: readonly [number, number, number][] = [
  [58.40, 0.6, 3.9], [97.60, 1.4, 350.7], [136.80, 1.6, 338.8], [176.00, 2.5, 32.6],
  [195.00, 2.2, 58.9], [214.60, 0.8, 149.3], [234.20, 1.4, 189.2], [253.80, 1.0, 220.3],
  [273.40, 1.2, 262.1], [293.00, 1.6, 273.0], [312.60, 2.3, 293.6], [332.20, 3.1, 324.3],
  [351.80, 3.6, 354.6], [371.40, 3.6, 41.7], [391.00, 2.9, 70.5], [401.60, 2.4, 91.7],
  [411.40, 2.3, 119.8], [421.20, 2.5, 135.6], [431.00, 2.8, 140.5], [440.80, 3.2, 139.5],
  [450.60, 3.5, 136.0], [460.40, 3.8, 133.7], [470.20, 3.9, 133.3], [480.00, 3.6, 137.08],
  [489.00, 3.2, 142.9],
];

/**
 * Leituras Fann (R1B1, 80 °F) do laboratório do programa, em graus para
 * 300/200/100/60/30/6/3 rpm, e a faixa de rpm do ajuste de lei de potência.
 * A faixa foi escolhida pela hierarquia reológica do iCem a 488,99 m: com ela, o
 * atrito do motor fica a 1% do iCem na lama e no espaçador e a 8–10% nas pastas,
 * que no iCem são Herschel-Bulkley (o tail é praticamente Bingham).
 */
export const MINA02_FANN = {
  mud: { readings: [24, 19, 15, 12, 9, 7, 4], fitRpm: '3–100' },
  spacer: { readings: [38, 33, 23, 18, 14, 9, 5], fitRpm: '3–100' },
  lead: { readings: [55, 41, 28, 24, 20, 15, 12], fitRpm: '30–300' },
  tail: { readings: [103, 74, 45, 28, 25, 20, 17], fitRpm: '6–100' },
} as const;

function fluid(id: string, kind: PrimaryFluid['kind'], name: string, densityPpg: number,
  n: number, kLbfSnFt2: number, fann: keyof typeof MINA02_FANN): PrimaryFluid {
  const test = MINA02_FANN[fann];
  const reference = `Halliburton MINA-02, Fann ${test.readings.join('/')} a 80 °F; lei de potência ajustada de ${test.fitRpm} rpm`;
  return { id, kind, name, densityPpg, rheology: { model: 'power-law', n, kLbfSnFt2 },
    propertySources: { densityPpg: { source: 'entered', reference: 'Programa Halliburton MINA-02' },
      n: { source: 'measured', reference, temperatureC: 26.7 },
      kLbfSnFt2: { source: 'measured', reference, temperatureC: 26.7 } } };
}

export const MINA02_FLUIDS: PrimaryFluid[] = [
  fluid('mud', 'mud', 'Fluido de perfuração 9,0 ppg', 9.0, 0.33071938080596097, 0.02836506134498069, 'mud'),
  fluid('spacer', 'spacer', 'Espaçador 11,0 ppg', 11.0, 0.39534480177122927, 0.03203591616770818, 'spacer'),
  fluid('lead', 'cement', 'Pasta lead 12,5 ppg', 12.5, 0.4360648089527271, 0.03540036700188605, 'lead'),
  fluid('tail', 'cement', 'Pasta tail 15,6 ppg', 15.6, 0.2469089301038277, 0.11190606551999982, 'tail'),
  fluid('displacement', 'displacement', 'Deslocamento (fluido de perfuração 9,0 ppg)', 9.0,
    0.33071938080596097, 0.02836506134498069, 'mud'),
];

export interface Mina02CaliperZone { topMD: number; bottomMD: number; diameterIn: number }

/** Shoe track de 28,26 m do programa. */
export const MINA02_SHOE_TRACK_M = 28.26;

export interface Mina02Variant {
  id: 'programa-v3' | 'graficos-icem';
  label: string;
  /** Sapata do 13⅜" (ID 12,615"). */
  previousShoeMD: number;
  shoeMD: number;
  /** TVD da sapata nas linhas da fase; a do cálculo vem do survey. */
  shoeTVD: number;
  wellTD: number;
  wellTDTVD: number;
  spacerBbl: number;
  tailTopMD: number;
  /** Degraus de deslocamento: vazão (bpm) e fração do volume até o colar. */
  displacement: readonly (readonly [number, number])[];
  /**
   * Diâmetro efetivo do poço aberto por zonas, já com os 5% de excesso sobre o
   * caliper LAS (que não está no documento). As zonas reproduzem os volumes do
   * programa: o anular de 149,98 bbl do iCem com 5% no poço aberto e os 32 bbl de
   * tail cobrindo o anular do intervalo mais o shoe track.
   */
  caliperZones: Mina02CaliperZone[];
  pressureWindow: PrimaryConfiguration['pressureWindow'];
}

/**
 * Programa (versão 3). Zonas: arrombado de 15,5" até 160 m, a divisão calibrada
 * contra a hidrostática do iCem na versão dos gráficos (o esquemático e o standoff
 * de 0% perto de 155 m só indicam onde fica); 13,06" no tail, para 32 bbl = 7,17 bbl de shoe
 * track + 24,83 bbl de anular de 394,5 a 494,5 m; e 13,45" no meio, para fechar
 * 7,42 bbl de anular revestido + 1,05 × 142,56 bbl de poço aberto = 157,11 bbl.
 * Fratura de 13,5 ppg até 300 m e 16 ppg abaixo, em rampa até a sapata como o
 * iCem desenha; poro de 8,5 ppg (considerado).
 */
export const MINA02_PROGRAM: Mina02Variant = {
  id: 'programa-v3', label: 'programa v3 (sapata a 494,5 m)',
  previousShoeMD: 35, shoeMD: 494.5, shoeTVD: 494.11, wellTD: 501, wellTDTVD: 500.6,
  spacerBbl: 40, tailTopMD: 394.5,
  displacement: [[8, 100 / 118.37], [4, 12 / 118.37], [2, 6.37 / 118.37]],
  caliperZones: [
    { topMD: 35, bottomMD: 160, diameterIn: 15.5 },
    { topMD: 160, bottomMD: 394.5, diameterIn: 13.4543 },
    { topMD: 394.5, bottomMD: 501, diameterIn: 13.0597 },
  ],
  pressureWindow: [
    { topMD: 35, bottomMD: 300, topPorePpg: 8.5, porePpg: 8.5, topFracturePpg: 13.5, fracturePpg: 13.5 },
    { topMD: 300, bottomMD: 494.5, topPorePpg: 8.5, porePpg: 8.5, topFracturePpg: 13.5, fracturePpg: 16.0 },
  ],
};

/**
 * Versão dos gráficos do iCem: sapata a 489 m, sapata anterior a 20,6 m (a linha
 * "Previous Casing Shoe" do envelope), 50 bbl de espaçador e deslocamento nas
 * proporções lidas no gráfico de vazões. Zonas escolhidas pela hidrostática na
 * sapata ao longo do job (RMS 2,9 psi contra o iCem) com o mesmo anular de 157,1
 * bbl; 13,03" no fundo, o diâmetro que a hierarquia reológica do iCem a 488,99 m
 * implica. Poro e fratura como o envelope do iCem mostra (8,5 → 8,69 e 13,4 → 16).
 */
export const MINA02_ICEM_CHARTS: Mina02Variant = {
  id: 'graficos-icem', label: 'versão dos gráficos do iCem (sapata a 489 m)',
  previousShoeMD: 20.6, shoeMD: 489, shoeTVD: 488.6, wellTD: 495, wellTDTVD: 494.6,
  spacerBbl: 50, tailTopMD: 388,
  displacement: [[8, 0.8326], [4, 0.1258], [2, 0.0416]],
  caliperZones: [
    { topMD: 20.6, bottomMD: 160, diameterIn: 15.5 },
    { topMD: 160, bottomMD: 388, diameterIn: 13.36 },
    { topMD: 388, bottomMD: 495, diameterIn: 13.03 },
  ],
  pressureWindow: [
    { topMD: 20.6, bottomMD: 300, topPorePpg: 8.5, porePpg: 8.5, topFracturePpg: 13.4, fracturePpg: 13.4 },
    { topMD: 300, bottomMD: 489, topPorePpg: 8.5, porePpg: 8.69, topFracturePpg: 13.4, fracturePpg: 16.0 },
  ],
};

export const mina02CollarMD = (variant: Mina02Variant) => variant.shoeMD - MINA02_SHOE_TRACK_M;

export function mina02Caliper(variant: Mina02Variant = MINA02_PROGRAM,
  zones: Mina02CaliperZone[] = variant.caliperZones): WellCaliperProfile {
  // Degraus: duas amostras por fronteira, a 1 cm uma da outra, para a interpolação
  // linear do perfil não inventar um diâmetro intermediário ao longo da zona.
  const samples = zones.flatMap((zone, index) => [
    { md: index === 0 ? zone.topMD : zone.topMD + 0.01, ehd1In: zone.diameterIn, ehd2In: zone.diameterIn },
    { md: zone.bottomMD, ehd1In: zone.diameterIn, ehd2In: zone.diameterIn },
  ]);
  const volumeM3 = zones.reduce((sum, z) => sum + Math.PI / 4 * (z.diameterIn * 0.0254) ** 2 * (z.bottomMD - z.topMD), 0);
  return { fileName: 'MINA-02 — diâmetro efetivo por zonas (caliper + 5%, reconstituído dos volumes do programa)',
    importedAt: '2026-09-23T00:00:00.000Z', depthMnemonic: 'DEPT', diameterMnemonics: ['EHD1', 'EHD2'],
    startMD: samples[0].md, stopMD: samples.at(-1)!.md, sampleCount: samples.length,
    calculatedHoleVolumeM3: volumeM3, reportedHoleVolumeM3: null, volumeDifferencePct: null, samples };
}

export function mina02Phases(variant: Mina02Variant = MINA02_PROGRAM): WellPhaseFormValue[] {
  const previous = variant.previousShoeMD;
  return [
    { id: 'conductor', name: 'Condutor 17½"', type: 'CONDUCTOR', topMD: 0, bottomMD: previous,
      topTVD: 0, bottomTVD: previous, holeDiameterIn: 17.5, casingOD: 13.375, casingID: 12.615,
      shoeMD: previous, shoeTVD: previous,
      survey: { enabled: true, stations: [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 }] } },
    { id: 'surface', name: 'Superfície 12¼"', type: 'SURFACE', topMD: previous, bottomMD: variant.wellTD,
      topTVD: previous, bottomTVD: variant.wellTDTVD, holeDiameterIn: 12.25, casingOD: 9.625, casingID: 8.921,
      shoeMD: variant.shoeMD, shoeTVD: variant.shoeTVD,
      survey: { enabled: true, stations: MINA02_SURVEY.map(([md, inclinationDeg, azimuthDeg]) => ({ md, inclinationDeg, azimuthDeg })) } },
  ];
}

/**
 * Programa de bombeio: espaçador a 5 bpm, plugue inferior e parada de 5 min,
 * 142 bbl de lead a 4 bpm (o volume acima do dimensionado pelo intervalo sai como
 * reserva bombeada e retorna na superfície, como o programa espera), 32 bbl de
 * tail a 3 bpm, plugue superior e parada de 5 min, deslocamento a 8, 4 e 2 bpm.
 * leadExtraBbl é 142 bbl menos o lead dimensionado pela geometria.
 */
export function mina02Form(leadExtraBbl: number, variant: Mina02Variant = MINA02_PROGRAM): PrimaryOperationFormValue {
  const collarMD = mina02CollarMD(variant);
  const displace = ([rateBpm, fraction]: readonly [number, number]): PrimaryPumpStep =>
    ({ id: `s1-displace-${rateBpm}`, kind: 'pump', fluidId: 'displacement', rateBpm,
      quantity: { source: 'displacement', deviceId: 'collar', fraction } });
  const top = variant.pressureWindow[0];
  const bottom = variant.pressureWindow.at(-1)!;
  return {
    targetKind: 'conventional', shoeMD: variant.shoeMD, floatCollarMD: collarMD, linerTopMD: null,
    casingIdIn: 8.921, casingOdIn: 9.625, settingIdIn: null, settingOdIn: null,
    excessPct: 0, measuredHoleIn: null,
    // O iCem mantém a cabeça em 0 psi durante a queda livre (gráfico de pressão de superfície).
    headCondition: 'vented-free-surface', returnPressurePsi: 0,
    internalFrictionLevel: 'low', annularFrictionLevel: 'low',
    poreTopPpg: top.topPorePpg ?? top.porePpg, fractureTopPpg: top.topFracturePpg ?? top.fracturePpg,
    porePpg: bottom.porePpg, fracturePpg: bottom.fracturePpg,
    pressureWindowRows: variant.pressureWindow.map(row => ({ ...row })),
    maxPressurePsi: 3000, maxRateBpm: 8, motorHp: null, efficiency: null,
    initialFluidId: 'mud',
    fluids: MINA02_FLUIDS.map(f => ({ ...f, rheology: { ...f.rheology } })),
    stages: [{ id: 'stage-1', name: 'Estágio único', targetTocMD: 0, outletMD: variant.shoeMD, seatMD: collarMD,
      placements: [
        { id: 'lead', fluidId: 'lead', topMD: 0, bottomMD: variant.tailTopMD, mixingReserveBbl: 0 },
        { id: 'tail', fluidId: 'tail', topMD: variant.tailTopMD, bottomMD: variant.shoeMD, mixingReserveBbl: 0 },
      ],
      steps: [
        { id: 's1-spacer', kind: 'pump', fluidId: 'spacer', rateBpm: 5, quantity: { source: 'entered', volumeBbl: variant.spacerBbl } },
        { id: 's1-bottom', kind: 'tool-event', deviceId: 'collar', action: 'launch-bottom' },
        { id: 's1-pause-bottom', kind: 'pause', durationMin: 5 },
        { id: 's1-lead', kind: 'pump', fluidId: 'lead', rateBpm: 4, quantity: { source: 'placement', placementId: 'lead', fraction: 1 } },
        ...(leadExtraBbl > 1e-9 ? [{ id: 's1-lead-extra', kind: 'pump' as const, fluidId: 'lead', rateBpm: 4,
          quantity: { source: 'reserve-extra' as const, placementId: 'lead', volumeBbl: leadExtraBbl } }] : []),
        { id: 's1-tail', kind: 'pump', fluidId: 'tail', rateBpm: 3, quantity: { source: 'placement', placementId: 'tail', fraction: 1 } },
        { id: 's1-top', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
        { id: 's1-pause-top', kind: 'pause', durationMin: 5 },
        ...variant.displacement.map(displace),
      ] }],
  };
}

export const mina02ScenarioName = (variant: Mina02Variant) => variant.id === 'programa-v3'
  ? 'MINA-02 — 9⅝" em 12¼" (programa Halliburton v3, sapata a 494,5 m)'
  : 'MINA-02 — 9⅝" em 12¼" (versão dos gráficos do iCem, sapata a 489 m)';

/** Cenário completo, no formato que a tela monta ao salvar, com o caliper por zonas. */
export function mina02Scenario(primary: PrimaryConfiguration, trajectory: WellTrajectory,
  variant: Mina02Variant = MINA02_PROGRAM): PrimaryScenario {
  const draft = createPrimaryDraft();
  return { ...draft, wellFinalMD: variant.wellTD, wellFinalTVD: variant.wellTDTVD, fases: mina02Phases(variant),
    trajectory: { enabled: true, stations: trajectory.stations.map(s => ({ ...s })) }, caliper: mina02Caliper(variant),
    selectedPhaseId: 'surface', primary,
    presentation: { ...draft.presentation, references: [] } };
}

export function mina02ReportData(variant: Mina02Variant = MINA02_PROGRAM): PrimaryReportData {
  const program = variant.id === 'programa-v3';
  return { ...createPrimaryReportData(), cliente: 'BRASKEM / HALLIBURTON', poco: 'MINA-02', campo: 'Maceió/AL — sonda OIL-122',
    documento: 'Avaliação do simulador — cimentação primária do 9⅝" contra o iCem', data: '2026-09-23', versao: program ? 'A' : 'B',
    origem: 'Programa técnico de cimentação Halliburton CP-BRK-HAL-CMT-2020-001, versão 3 (15/11/2020)',
    objetivo: program
      ? 'Simular o job com os dados do programa v3 e conferir pressão final, diferencial estático, topos e retorno de pasta.'
      : 'Reproduzir os gráficos do iCem do programa, que foram gerados com a sapata a 489 m e 50 bbl de espaçador.',
    observacoes: (program
      ? 'Sapata a 494,5 m (494,11 m TVD), colar a 466,24 m (shoe track de 28,26 m), 13⅜" até 35 m, rathole até 501 m; '
        + '40 bbl de espaçador 11,0 ppg a 5 bpm; 142 bbl de lead 12,5 ppg a 4 bpm; 32 bbl de tail 15,6 ppg a 3 bpm (topo a 394,5 m); '
        + 'deslocamento de 100 bbl a 8, 12 bbl a 4 e 6,37 bbl a 2 bpm. Esperado pelo programa: pressão final de 348 psi e diferencial estático de 314 psi. '
      : 'Sapata a 489 m, 13⅜" até 20,6 m, 50 bbl de espaçador; proporções do deslocamento lidas no gráfico de vazões do iCem. ')
      + 'O caliper LAS não está no documento: o poço aberto é reconstituído em três zonas que fecham os volumes do programa (anular + 5%). '
      + 'Reologia: leituras Fann do laboratório a 80 °F ajustadas à lei de potência (o iCem usa Herschel-Bulkley). '
      + 'Cabeça aberta durante a queda livre, como no gráfico de pressão de superfície do iCem.' };
}
