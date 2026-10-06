import type { PrimaryConfiguration, PrimaryFluid, PrimaryPumpStep } from '../models/primary-cementing.model';
import type { PrimaryOperationFormValue } from '../models/primary-operation.form';
import type { WellPhaseFormValue } from '../models/well-geometry.form';
import type { SurveyStation, WellTrajectory } from '../models/well-geometry.model';
import { createPrimaryReportData, type PrimaryReportData } from '../models/primary-report-data.model';
import { createPrimaryDraft, type PrimaryScenario } from '../models/primary-scenario.model';
import { PRIMARY_REFERENCE_RHEOLOGY } from '../models/primary-default-rheology';

/**
 * Survey giroscópico do MINA-28BD, fase 12¼", RUN #8 (Gyrodata, job BZ0721GCM104,
 * 19/07/2021), mínima curvatura, profundidade a partir da mesa rotativa.
 * Colunas: MD (m), inclinação (°), azimute (°), TVD do relatório (m).
 * A TVD do relatório é gabarito independente: o simulador calcula a sua própria.
 */
export const MINA28BD_SURVEY: readonly [number, number, number, number][] = [
  [0.00, 0.00, 0.00, 0.00],
  [10.00, 0.31, 329.36, 10.00],
  [20.00, 0.31, 327.16, 20.00],
  [30.00, 0.26, 331.55, 30.00],
  [40.00, 0.27, 336.38, 40.00],
  [50.00, 0.30, 332.86, 50.00],
  [60.00, 0.27, 344.73, 60.00],
  [70.00, 0.33, 343.89, 70.00],
  [80.00, 0.37, 359.14, 80.00],
  [90.00, 0.41, 3.98, 90.00],
  [100.00, 0.50, 12.57, 100.00],
  [110.00, 0.70, 20.70, 110.00],
  [120.00, 1.23, 33.67, 120.00],
  [130.00, 2.02, 43.94, 129.99],
  [140.00, 2.56, 48.11, 139.98],
  [150.00, 3.18, 52.06, 149.97],
  [160.00, 3.74, 55.82, 159.95],
  [170.00, 4.27, 60.93, 169.93],
  [180.00, 4.78, 64.95, 179.90],
  [190.00, 5.24, 69.12, 189.86],
  [200.00, 5.79, 73.01, 199.81],
  [210.00, 6.29, 74.68, 209.76],
  [220.00, 6.75, 74.75, 219.69],
  [230.00, 7.16, 75.16, 229.62],
  [240.00, 7.59, 74.25, 239.54],
  [250.00, 8.00, 73.57, 249.44],
  [260.00, 8.21, 72.84, 259.34],
  [270.00, 8.46, 72.25, 269.24],
  [280.00, 8.97, 71.19, 279.12],
  [290.00, 9.63, 69.82, 288.99],
  [300.00, 10.49, 68.28, 298.84],
  [310.00, 11.18, 67.29, 308.66],
  [320.00, 12.12, 65.97, 318.45],
  [330.00, 13.01, 65.29, 328.21],
  [340.00, 13.74, 64.79, 337.94],
  [350.00, 13.98, 64.72, 347.65],
  [360.00, 14.16, 64.69, 357.35],
  [370.00, 14.44, 64.37, 367.04],
  [380.00, 15.08, 63.12, 376.71],
  [390.00, 15.75, 61.67, 386.35],
  [400.00, 16.28, 60.62, 395.96],
  [410.00, 16.90, 59.70, 405.55],
  [420.00, 17.80, 58.61, 415.09],
  [430.00, 18.23, 58.35, 424.60],
  [440.00, 18.52, 58.32, 434.09],
  [450.00, 18.72, 58.45, 443.57],
  [460.00, 19.05, 58.98, 453.03],
  [470.00, 19.25, 59.20, 462.48],
  [480.00, 19.23, 59.59, 471.92],
  [490.00, 19.26, 59.72, 481.36],
  [500.00, 19.51, 59.72, 490.79],
  [503.00, 19.51, 59.98, 493.62],
  [506.00, 19.65, 60.32, 496.45],
  [509.00, 19.79, 60.70, 499.27],
  [512.00, 19.85, 60.65, 502.09],
  [515.00, 19.91, 60.68, 504.92],
  [518.00, 19.99, 60.85, 507.74],
  [521.00, 20.00, 61.03, 510.55],
  [524.00, 20.06, 61.07, 513.37],
  [527.00, 20.13, 61.14, 516.19],
  [530.00, 20.19, 61.60, 519.01],
  [533.00, 20.24, 62.42, 521.82],
  [536.00, 20.33, 62.57, 524.64],
  [539.00, 20.39, 62.68, 527.45],
  [542.00, 20.38, 62.81, 530.26],
  [545.00, 20.32, 62.89, 533.07],
  [548.00, 20.36, 63.14, 535.89],
  [551.00, 20.37, 63.31, 538.70],
  [554.00, 20.36, 63.60, 541.51],
  [557.00, 20.24, 64.00, 544.32],
  [560.00, 20.22, 64.22, 547.14],
  [563.00, 20.28, 64.17, 549.95],
  [566.00, 20.30, 64.37, 552.77],
  [569.00, 20.26, 64.49, 555.58],
  [572.00, 20.15, 64.81, 558.40],
  [575.00, 20.11, 65.00, 561.21],
  [578.00, 20.12, 64.99, 564.03],
  [581.00, 20.15, 65.22, 566.85],
  [584.00, 20.09, 65.57, 569.66],
  [587.00, 20.05, 65.76, 572.48],
  [590.00, 20.08, 66.00, 575.30],
  [593.00, 20.14, 65.87, 578.12],
  [596.00, 20.15, 65.92, 580.93],
  [599.00, 19.97, 66.07, 583.75],
  [602.00, 19.95, 66.23, 586.57],
  [605.00, 19.85, 66.24, 589.39],
  [608.00, 19.74, 66.15, 592.22],
  [611.00, 19.58, 66.14, 595.04],
  [614.00, 19.47, 66.36, 597.87],
  [617.00, 19.35, 66.45, 600.70],
  [620.00, 19.25, 66.31, 603.53],
  [623.00, 19.07, 66.54, 606.36],
  [626.00, 18.84, 67.04, 609.20],
  [629.00, 18.52, 67.47, 612.04],
  [632.00, 18.13, 68.14, 614.89],
  [635.00, 17.57, 68.60, 617.75],
  [638.00, 17.22, 69.62, 620.61],
  [641.00, 16.75, 70.28, 623.48],
  [644.00, 16.38, 70.74, 626.35],
  [647.00, 16.12, 71.34, 629.23],
  [650.00, 15.64, 71.71, 632.12],
  [653.00, 15.32, 72.15, 635.01],
  [656.00, 15.01, 72.30, 637.91],
  [659.00, 14.62, 72.47, 640.81],
  [662.00, 14.48, 72.74, 643.71],
  [665.00, 14.48, 72.42, 646.61],
  [668.00, 14.26, 73.36, 649.52],
  [671.00, 13.73, 73.94, 652.43],
  [674.00, 13.03, 74.25, 655.35],
  [677.00, 12.41, 75.25, 658.28],
  [680.00, 11.95, 75.91, 661.21],
  [683.00, 11.45, 76.65, 664.15],
  [686.00, 10.95, 77.33, 667.09],
  [689.00, 10.57, 78.22, 670.04],
  [692.00, 9.99, 79.01, 672.99],
  [695.00, 9.34, 79.93, 675.95],
  [698.00, 8.59, 80.43, 678.91],
  [701.00, 7.76, 80.56, 681.88],
  [704.00, 6.89, 80.55, 684.85],
  [707.00, 6.30, 80.34, 687.83],
  [710.00, 6.10, 79.72, 690.82],
  [713.00, 6.09, 80.32, 693.80],
  [716.00, 6.00, 80.21, 696.78],
  [719.00, 5.95, 79.83, 699.77],
  [722.00, 5.92, 80.28, 702.75],
  [725.00, 5.81, 80.89, 705.73],
  [728.00, 5.62, 81.56, 708.72],
  [731.00, 5.43, 82.45, 711.71],
  [734.00, 5.27, 83.06, 714.69],
  [737.00, 5.18, 83.83, 717.68],
  [740.00, 5.13, 84.66, 720.67],
  [743.00, 5.05, 85.92, 723.66],
  [746.00, 4.91, 87.55, 726.65],
  [749.00, 4.81, 89.68, 729.63],
  [752.00, 4.76, 91.92, 732.62],
  [755.00, 4.72, 93.99, 735.61],
  [758.00, 4.59, 95.45, 738.60],
  [761.00, 4.40, 96.88, 741.59],
  [764.00, 4.20, 99.14, 744.59],
  [767.00, 4.04, 100.47, 747.58],
  [770.00, 3.77, 102.13, 750.57],
  [773.00, 3.47, 103.96, 753.57],
  [776.00, 3.26, 106.36, 756.56],
  [779.00, 3.12, 108.25, 759.56],
  [782.00, 3.04, 110.05, 762.55],
  [785.00, 2.98, 111.22, 765.55],
  [788.00, 2.97, 112.27, 768.54],
  [791.00, 2.90, 111.88, 771.54],
  [794.00, 2.83, 112.93, 774.54],
  [797.00, 2.78, 113.82, 777.53],
  [800.00, 2.73, 115.33, 780.53],
  [803.00, 2.71, 118.85, 783.52],
  [806.00, 2.73, 123.89, 786.52],
  [809.00, 2.75, 129.24, 789.52],
  [812.00, 2.78, 136.42, 792.51],
  [815.00, 2.84, 140.83, 795.51],
  [818.00, 2.87, 143.83, 798.51],
  [821.00, 2.87, 147.07, 801.50],
  [824.00, 2.87, 149.17, 804.50],
];

export const mina28bdStations = (fromMD: number, toMD: number): SurveyStation[] =>
  MINA28BD_SURVEY.filter(([md]) => md >= fromMD && md <= toMD)
    .map(([md, inclinationDeg, azimuthDeg]) => ({ md, inclinationDeg, azimuthDeg }));

/**
 * Fluidos do exemplo de projeto do R3 (Nelson e Guillot, Well Cementing, §12-7,
 * Tabela 12-5): 9⅝" em fase de 12¼" atravessando sal. A reologia de fundo do
 * livro é Herschel-Bulkley; o motor é lei de potência, então n e k vêm do ajuste
 * log-log entre 10 e 300 1/s, faixa das taxas de parede deste job.
 */
const R = PRIMARY_REFERENCE_RHEOLOGY;
export const MINA28BD_FLUIDS: PrimaryFluid[] = [
  mina28bdFluid('mud', 'mud', 'Lama salgada 9,8 ppg', 9.797504852581476, R.mud),
  mina28bdFluid('wash', 'wash', 'Lavador químico', 9.59721514520332, R.wash),
  mina28bdFluid('spacer', 'spacer', 'Espaçador 11,0 ppg', 11.015933905798594, R.spacer),
  mina28bdFluid('lead', 'cement', 'Pasta lead 11,5 ppg', 11.499967365295804, R.lead),
  mina28bdFluid('tail', 'cement', 'Pasta tail 15,9 ppg', 15.856268500770703, R.tail),
  mina28bdFluid('displacement', 'displacement', 'Deslocamento (lama)', 9.797504852581476, R.mud),
];

function mina28bdFluid(id: string, kind: PrimaryFluid['kind'], name: string,
  densityPpg: number, { n, kLbfSnFt2 }: { n: number; kLbfSnFt2: number }): PrimaryFluid {
  const reference = 'R3 §12-7, Tabela 12-5; lei de potência ajustada de 10 a 300 1/s';
  return { id, kind, name, densityPpg, rheology: { model: 'power-law', n, kLbfSnFt2 },
    propertySources: { densityPpg: { source: 'entered', reference },
      n: { source: 'entered', reference }, kLbfSnFt2: { source: 'entered', reference } } };
}

/**
 * Fases do MINA-28BD. Do survey vêm MD, inclinação e azimute; o resto é hipótese
 * declarada do cenário: 13⅜" 68 lb/ft (ID 12,415") até 200 m e 9⅝" 47 lb/ft
 * (ID 8,681") com sapata a 820 m, colar a 796 m e rathole até 824 m.
 */
export function mina28bdPhases(): WellPhaseFormValue[] {
  return [
    { id: 'surface', name: 'Superfície 17½"', type: 'SURFACE', topMD: 0, bottomMD: 200,
      topTVD: 0, bottomTVD: 199.81, holeDiameterIn: 17.5, casingOD: 13.375, casingID: 12.415,
      shoeMD: 200, shoeTVD: 199.81, survey: { enabled: true, stations: mina28bdStations(0, 200) } },
    { id: 'intermediate', name: 'Intermediária 12¼"', type: 'INTERMEDIATE', topMD: 200, bottomMD: 824,
      topTVD: 199.81, bottomTVD: 804.5, holeDiameterIn: 12.25, casingOD: 9.625, casingID: 8.681,
      shoeMD: 820, shoeTVD: 800.5, survey: { enabled: true, stations: mina28bdStations(200.001, 824) } },
  ];
}

/** Programa do R3 §12-7 (Tabela 12-6) com os volumes deste poço. */
export function mina28bdForm(): PrimaryOperationFormValue {
  const displace = (id: string, rateBpm: number, fraction: number): PrimaryPumpStep =>
    ({ id, kind: 'pump', fluidId: 'displacement', rateBpm,
      quantity: { source: 'displacement', deviceId: 'collar', fraction } });
  return {
    targetKind: 'conventional', shoeMD: 820, floatCollarMD: 796, linerTopMD: null,
    casingIdIn: 8.681, casingOdIn: 9.625, settingIdIn: null, settingOdIn: null,
    excessPct: 20, measuredHoleIn: null,
    headCondition: 'closed-head', returnPressurePsi: 0,
    internalFrictionLevel: 'low', annularFrictionLevel: 'low',
    poreTopPpg: 8.5, fractureTopPpg: 13, porePpg: 8.5, fracturePpg: 13,
    maxPressurePsi: 3000, maxRateBpm: 8, motorHp: 700, efficiency: 0.85,
    initialFluidId: 'mud',
    fluids: MINA28BD_FLUIDS.map(fluid => ({ ...fluid, rheology: { ...fluid.rheology } })),
    stages: [{ id: 'stage-1', name: 'Estágio único', targetTocMD: 0, outletMD: 820, seatMD: 796,
      placements: [
        { id: 'lead', fluidId: 'lead', topMD: 0, bottomMD: 670, mixingReserveBbl: 0 },
        { id: 'tail', fluidId: 'tail', topMD: 670, bottomMD: 820, mixingReserveBbl: 0 },
      ],
      steps: [
        { id: 's1-wash', kind: 'pump', fluidId: 'wash', rateBpm: 3, quantity: { source: 'entered', volumeBbl: 10 } },
        { id: 's1-spacer', kind: 'pump', fluidId: 'spacer', rateBpm: 6, quantity: { source: 'entered', volumeBbl: 40 } },
        { id: 's1-bottom', kind: 'tool-event', deviceId: 'collar', action: 'launch-bottom' },
        { id: 's1-pause-bottom', kind: 'pause', durationMin: 5 },
        { id: 's1-lead', kind: 'pump', fluidId: 'lead', rateBpm: 4, quantity: { source: 'placement', placementId: 'lead', fraction: 1 } },
        { id: 's1-tail', kind: 'pump', fluidId: 'tail', rateBpm: 5, quantity: { source: 'placement', placementId: 'tail', fraction: 1 } },
        { id: 's1-top', kind: 'tool-event', deviceId: 'collar', action: 'launch-top' },
        { id: 's1-pause-top', kind: 'pause', durationMin: 5 },
        displace('s1-displace-6', 6, 0.651),
        displace('s1-displace-4', 4, 0.151),
        displace('s1-displace-3', 3, 0.108),
        displace('s1-displace-2', 2, 0.09),
      ] }],
  };
}

/** Nome do cenário gravado no banco e no arquivo portátil. */
export const MINA28BD_SCENARIO_NAME = 'MINA-28BD — 9⅝" em 12¼" (survey Gyrodata RUN #8, programa R3 §12-7)';

/**
 * Cenário completo, no mesmo formato que a tela monta ao salvar: fases com o
 * survey, trajetória cumulativa, fase da operação e configuração da primária.
 */
export function mina28bdScenario(primary: PrimaryConfiguration, trajectory: WellTrajectory): PrimaryScenario {
  const draft = createPrimaryDraft();
  const rows = mina28bdPhases();
  return { ...draft, wellFinalMD: 824, wellFinalTVD: 804.5, fases: rows,
    trajectory: { enabled: true, stations: trajectory.stations.map(s => ({ ...s })) }, caliper: null,
    selectedPhaseId: 'intermediate', primary,
    presentation: { ...draft.presentation, references: [] } };
}

/** Dados do relatório: identificação e as hipóteses que o survey não traz. */
export function mina28bdReportData(): PrimaryReportData {
  return { ...createPrimaryReportData(), cliente: 'BRAKEM / HALLIBURTON', poco: 'MINA-28BD', campo: 'Tucano, Área 7',
    documento: 'Avaliação do simulador — cimentação primária do 9⅝"', data: '2026-09-23', versao: 'A',
    origem: 'Survey Gyrodata RUN #8 (job BZ0721GCM104, 19/07/2021); programa e fluidos do R3 §12-7',
    objetivo: 'Conferir o simulador hidráulico da primária num poço direcional real, contra um modelo de referência independente.',
    observacoes: 'Hipóteses do cenário (não constam do survey): 13⅜" 68 lb/ft até 200 m; 9⅝" 47 lb/ft com sapata a 820 m e colar a 796 m; '
      + 'poço nominal 12¼" com 20% de excesso, sem caliper; lead 11,5 ppg de 0 a 670 m e tail 15,9 ppg de 670 a 820 m; '
      + 'fluidos do R3 Tabela 12-5 ajustados à lei de potência entre 10 e 300 1/s; cabeça fechada; retorno atmosférico; '
      + 'atrito no nível baixo (1,00×) para comparar a correlação sem multiplicador; poro 8,5 ppg e fratura 13,0 ppg no poço aberto. '
      + 'MD a partir da mesa rotativa (air gap 5 m), sem correção de RKB.' };
}
