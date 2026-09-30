import type { DadosRelatorio } from '../services/simulador-state-store.service';
import type { WellPhaseFormValue } from '../models/well-geometry.form';

/**
 * Cenários de exemplo do tampão e do squeeze (SPEC squeeze-tampao S8), com pasta de
 * 15,8 ppg, para ficarem salvos no banco e mostrarem como a tela se preenche. São os
 * campos que a página grava: carregados por `onCarregarEstado`, como um cenário salvo.
 */
export interface SimulatorExample {
  nome: string;
  operacao: 'tampao' | 'squeeze';
  /** Campos do formulário; os ausentes ficam no padrão da página. */
  form: Record<string, unknown>;
  dadosRelatorio: DadosRelatorio;
}

const phase = (row: Partial<WellPhaseFormValue> & Pick<WellPhaseFormValue, 'id' | 'name' | 'type' | 'topMD' | 'bottomMD'>): WellPhaseFormValue => ({
  topTVD: row.topMD, bottomTVD: row.bottomMD, holeDiameterIn: null, casingOD: null, casingID: null,
  shoeMD: null, shoeTVD: null, ...row,
} as WellPhaseFormValue);

const common = {
  surfaceTemp: 80.6, geoGradient: 1.5, pause1: 0, pause2: 0, pause3: 0,
  density: 15.8, cementClass: 'G', waterSplitFresh: 100, waterSplitSea: 0, silica: 35, nacl: 0,
  internalFrictionLevel: 'medium', annularFrictionLevel: 'medium', viscosidadeAguaCp: 1, headCondition: 'vented-free-surface',
  motorHP: 1000, pumpEff: 90, maxSurfacePressure: 5000, maxPumpRate: 8,
  completionWeight: 9.0, displacementWeight: 9.0, mudWeightFront: 8.33, mudWeightBack: 8.33,
  trajectory: { enabled: false, stations: [] },
};

/**
 * Tampão de abandono no poço aberto de 8½", abaixo do 9⅝" (a geometria do exemplo F-20
 * do Petroguia, sem o excesso de 50%): 2370 a 2510 m, coluna 4½" 16,6 lb/pé.
 */
export const TAMPAO_EXAMPLE: SimulatorExample = {
  nome: 'Exemplo — tampão de abandono 8½" (2370–2510 m), pasta 15,8 ppg',
  operacao: 'tampao',
  form: {
    ...common,
    fases: [
      phase({ id: 'surface', name: 'Superfície 17½"', type: 'SURFACE', topMD: 0, bottomMD: 500, holeDiameterIn: 17.5,
        casingOD: 13.375, casingID: 12.415, shoeMD: 500, shoeTVD: 500 }),
      phase({ id: 'intermediate', name: 'Intermediária 12¼"', type: 'INTERMEDIATE', topMD: 500, bottomMD: 1800,
        holeDiameterIn: 12.25, casingOD: 9.625, casingID: 8.681, shoeMD: 1800, shoeTVD: 1800 }),
      phase({ id: 'open', name: 'Poço aberto 8½"', type: 'OPEN_HOLE', topMD: 1800, bottomMD: 2600, holeDiameterIn: 8.5 }),
    ],
    wellFinalMD: 2600, wellFinalTVD: 2600,
    selectedPhaseId: 'open', operacaoTopoMD: 2370, operacaoBaseMD: 2510,
    pipeOD: 4.5, pipeID: 3.826, backSpacerHeight: 100,
    fracGrad: 15, poreGrad: 8.5, pumpRate: 3,
  },
  dadosRelatorio: {
    cliente: 'Exemplo', poco: 'EX-TAMPAO-01', campo: 'Campo Exemplo', sonda: 'SPT-EX', origem: 'Braserv',
    zonaIsolarNome: 'Arenito de exemplo', tipoReceitaRelatorio: 'volume',
    graficosOperacionaisSelecionados: ['pressao', 'cronograma'],
    vazoesBombeio: { fluidoFrenteBpm: 3, pastaBpm: 3, fluidoAtrasBpm: 3, deslocamentoBpm: 3 },
  },
};

/**
 * Squeeze Bradenhead em canhoneados de 1850 a 1860 m no revestimento de 7" 26 lb/pé,
 * pasta de 1780 a 1880 m, coluna 2⅞" 6,5 lb/pé; 3 bbl para a formação em hesitação.
 */
export const SQUEEZE_EXAMPLE: SimulatorExample = {
  nome: 'Exemplo — squeeze Bradenhead 7" (canhoneados 1850–1860 m), pasta 15,8 ppg',
  operacao: 'squeeze',
  form: {
    ...common,
    fases: [
      phase({ id: 'surface', name: 'Superfície 17½"', type: 'SURFACE', topMD: 0, bottomMD: 500, holeDiameterIn: 17.5,
        casingOD: 13.375, casingID: 12.415, shoeMD: 500, shoeTVD: 500 }),
      phase({ id: 'production', name: 'Produção 8½"', type: 'PRODUCTION', topMD: 500, bottomMD: 2000, holeDiameterIn: 8.5,
        casingOD: 7, casingID: 6.276, shoeMD: 2000, shoeTVD: 2000 }),
    ],
    wellFinalMD: 2000, wellFinalTVD: 2000,
    selectedPhaseId: 'production', operacaoTopoMD: 1780, operacaoBaseMD: 1880,
    perforacoes: [{ top: 1850, base: 1860 }],
    tubingOD: 2.875, tubingID: 2.441, backSpacerHeight: 50,
    fracGrad: 15.5, poreGrad: 8.5, pumpRate: 2,
    tecnicaSqueeze: 'bradenhead', retentorMD: null, retentorFundoMD: null, contrapressaoAnularPsi: 0,
    diferencialFerramentaPsi: null, rupturaRevestimentoPsi: 7240,
    blocosCompressao: [
      { tipo: 'inject', volumeBbl: 1, vazaoBpm: 0.25, duracaoMin: 0, pressaoPsi: 800 },
      { tipo: 'pressurize', volumeBbl: 0, vazaoBpm: 0, duracaoMin: 10, pressaoPsi: 1000 },
      { tipo: 'inject', volumeBbl: 1, vazaoBpm: 0.25, duracaoMin: 0, pressaoPsi: 1000 },
      { tipo: 'pressurize', volumeBbl: 0, vazaoBpm: 0, duracaoMin: 10, pressaoPsi: 1200 },
      { tipo: 'inject', volumeBbl: 1, vazaoBpm: 0.25, duracaoMin: 0, pressaoPsi: 1200 },
      { tipo: 'pressurize', volumeBbl: 0, vazaoBpm: 0, duracaoMin: 15, pressaoPsi: 1200 },
    ],
    limiarInjetividadeBpmPsi: 0.001,
  },
  dadosRelatorio: {
    cliente: 'Exemplo', poco: 'EX-SQUEEZE-01', campo: 'Campo Exemplo', sonda: 'SPT-EX', origem: 'Braserv',
    zonaIsolarNome: 'Canhoneados 1850–1860 m', tipoReceitaRelatorio: 'volume',
    graficosOperacionaisSelecionados: ['pressao', 'cronograma'],
    vazoesBombeio: { fluidoFrenteBpm: 2, pastaBpm: 2, fluidoAtrasBpm: 2, deslocamentoBpm: 2 },
  },
};
