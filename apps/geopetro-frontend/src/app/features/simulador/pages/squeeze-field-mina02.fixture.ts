import type { WellPhaseFormValue } from '../models/well-geometry.form';
import { MINA02_PROGRAM, MINA02_SURVEY } from './primary-field-mina02.fixture';
import type { SimulatorExample } from './squeeze-tampao-examples.fixture';

/**
 * Squeeze corretivo no 9⅝" do MINA-02, depois da primária do programa Halliburton v3
 * (primary-field-mina02.fixture.ts). O programa prevê o squeeze como contingência
 * (risco 2, "preparar um programa para squeeze"), mas não o detalha: o caso é de teste.
 *
 * Hipótese: o perfil de cimentação mostra aderência ruim no tail, que é a zona de
 * interesse; canhoneia-se de 430 a 432 m, posiciona-se pasta 15,6 ppg de 400 a 440 m
 * com coluna de 3½" DP 13,3 lb/pé e packer recuperável, retira-se a coluna acima do
 * cimento, fixa-se o packer e comprimem-se 5 bbl em hesitação.
 * Do programa vêm o poço, o survey, a janela, o fluido de 9,0 ppg, a temperatura e a
 * pasta tail (densidade, rendimento, FAC e FAM do laboratório). São hipótese: os
 * canhoneados, o intervalo, a coluna, o volume a injetar e a hesitação.
 *
 * Por que packer e não retentor: com retentor a 420 m, a pasta de 15,6 ppg cai livre
 * na coluna contra o fluido de 9,0 ppg e ~2 bbl passam para o anular acima da ferramenta
 * antes de encaixar o stinger (PRIMARY_RETAINER_SLURRY_ABOVE), com ou sem cabeça fechada
 * e com menos água à frente. Num poço raso assim, o retentor pede outro programa.
 */
const shoe = MINA02_PROGRAM.shoeMD;
const previous = MINA02_PROGRAM.previousShoeMD;

export const MINA02_SQUEEZE_PERFS = { top: 430, base: 432 } as const;
export const MINA02_SQUEEZE_INTERVAL = { top: 400, base: 440 } as const;
export const MINA02_SQUEEZE_INJECT_BBL = 5;

const phases: WellPhaseFormValue[] = [
  { id: 'conductor', name: 'Condutor 17½"', type: 'CONDUCTOR', topMD: 0, bottomMD: previous, topTVD: 0, bottomTVD: previous,
    holeDiameterIn: 17.5, casingOD: 13.375, casingID: 12.615, shoeMD: previous, shoeTVD: previous },
  { id: 'surface', name: 'Superfície 12¼"', type: 'SURFACE', topMD: previous, bottomMD: MINA02_PROGRAM.wellTD,
    topTVD: previous, bottomTVD: MINA02_PROGRAM.wellTDTVD, holeDiameterIn: 12.25, casingOD: 9.625, casingID: 8.921,
    shoeMD: shoe, shoeTVD: MINA02_PROGRAM.shoeTVD },
];

/**
 * Hesitação (R3 §14-9.4): três injeções de ¼ a ½ bpm com pausas de 10 a 15 min,
 * subindo a pressão de superfície; somam os 5 bbl a injetar.
 */
const blocks = [
  { tipo: 'inject', volumeBbl: 2, vazaoBpm: 0.5, duracaoMin: 0, pressaoPsi: 150 },
  { tipo: 'pressurize', volumeBbl: 0, vazaoBpm: 0, duracaoMin: 10, pressaoPsi: 200 },
  { tipo: 'inject', volumeBbl: 2, vazaoBpm: 0.5, duracaoMin: 0, pressaoPsi: 200 },
  { tipo: 'pressurize', volumeBbl: 0, vazaoBpm: 0, duracaoMin: 10, pressaoPsi: 250 },
  { tipo: 'inject', volumeBbl: 1, vazaoBpm: 0.25, duracaoMin: 0, pressaoPsi: 250 },
  { tipo: 'pressurize', volumeBbl: 0, vazaoBpm: 0, duracaoMin: 15, pressaoPsi: 300 },
];

export const MINA02_SQUEEZE: SimulatorExample = {
  nome: 'MINA-02 — squeeze com packer no 9⅝" (canhoneados 430–432 m), pasta tail 15,6 ppg',
  operacao: 'squeeze',
  form: {
    fases: phases,
    wellFinalMD: MINA02_PROGRAM.wellTD, wellFinalTVD: MINA02_PROGRAM.wellTDTVD,
    // Survey da tabela de centralizadores (58,4 a 489 m), da superfície vertical ao fundo do
    // poço em tangente com a última estação: a trajetória precisa alcançar o MD final.
    trajectory: { enabled: true, stations: [{ md: 0, inclinationDeg: 0, azimuthDeg: 0 },
      ...MINA02_SURVEY.map(([md, inclinationDeg, azimuthDeg]) => ({ md, inclinationDeg, azimuthDeg })),
      { md: MINA02_PROGRAM.wellTD, inclinationDeg: MINA02_SURVEY.at(-1)![1], azimuthDeg: MINA02_SURVEY.at(-1)![2] }] },
    selectedPhaseId: 'surface',
    operacaoTopoMD: MINA02_SQUEEZE_INTERVAL.top, operacaoBaseMD: MINA02_SQUEEZE_INTERVAL.base,
    perforacoes: [{ ...MINA02_SQUEEZE_PERFS }],
    tubingOD: 3.5, tubingID: 2.764, backSpacerHeight: 30,
    // Gradiente geotérmico do programa: 1,7 °F/100 ft a partir de 80 °F.
    surfaceTemp: 80, geoGradient: 1.7, pause1: 0, pause2: 0, pause3: 0,
    density: 15.6, cementClass: 'A', waterSplitFresh: 100, waterSplitSea: 0, silica: 0, nacl: 0,
    _pastaParametrosSource: 'manual', _manualYieldFt3: 1.18, _manualFacGpc: 5.08, _manualFamGpc: 5.19,
    internalFrictionLevel: 'medium', annularFrictionLevel: 'medium', viscosidadeAguaCp: 1, headCondition: 'vented-free-surface',
    motorHP: 1000, pumpEff: 90, maxSurfacePressure: 3000, maxPumpRate: 8,
    completionWeight: 9.0, displacementWeight: 9.0, mudWeightFront: 8.33, mudWeightBack: 8.33,
    // Janela do programa: poro 8,5 ppg; fratura 13,5 ppg até 300 m e 16 ppg na sapata.
    gradMode: 'table', gradUnit: 'ppg',
    gradPoints: [
      { tvd: previous, poro: 8.5, fratura: 13.5 },
      { tvd: 300, poro: 8.5, fratura: 13.5 },
      { tvd: MINA02_PROGRAM.shoeTVD, poro: 8.5, fratura: 16.0 },
    ],
    fracGrad: 15.2, poreGrad: 8.5, pumpRate: 3,
    tecnicaSqueeze: 'packer', retentorMD: null, retentorFundoMD: null,
    // Packer recuperável de 9⅝": diferencial de trabalho de 5000 psi (hipótese).
    contrapressaoAnularPsi: 0, diferencialFerramentaPsi: 5000,
    // 9⅝" 36 lb/pé K-55: 3520 psi de pressão interna (API 5C2).
    rupturaRevestimentoPsi: 3520,
    volMaxInjetadoBbl: MINA02_SQUEEZE_INJECT_BBL,
    blocosCompressao: blocks,
    limiarInjetividadeBpmPsi: 0.001,
  },
  dadosRelatorio: {
    cliente: 'BRASKEM', poco: 'MINA-02', campo: 'Maceió/AL', sonda: 'OIL-122', origem: 'Braserv',
    zonaIsolarNome: 'Canhoneados 430–432 m (aderência ruim no tail do 9⅝")', tipoReceitaRelatorio: 'volume',
    graficosOperacionaisSelecionados: ['pressao', 'cronograma'],
    vazoesBombeio: { fluidoFrenteBpm: 3, pastaBpm: 3, fluidoAtrasBpm: 3, deslocamentoBpm: 3 },
  },
};
