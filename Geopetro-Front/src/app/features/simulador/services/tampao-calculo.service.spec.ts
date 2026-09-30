import { describe, expect, it } from 'vitest';
import { CoreCalculoService } from './core-calculo.service';
import { WellGeometryService } from './well-geometry.service';
import { TampaoCalculoService, PlugWellContext } from './tampao-calculo.service';
import { TampaoInputs } from '../models/tampao.model';
import { WellGeometry } from '../models/well-geometry.model';
import { BBL_M } from '../models/constantes';

/** Poço com troca de diâmetro em 2000 m: revestido acima, aberto abaixo. */
const well: WellGeometry = {
  finalMD: 2500,
  finalTVD: 2500,
  phases: [
    {
      id: 'phase-1', name: 'Superfície', type: 'SURFACE',
      topMD: 0, bottomMD: 1200, topTVD: 0, bottomTVD: 1200,
      holeDiameterIn: 17.5,
      casing: { odIn: 13.375, idIn: 12.415, bottomMD: 1200 },
    },
    {
      id: 'phase-2', name: 'Intermediária', type: 'INTERMEDIATE',
      topMD: 1200, bottomMD: 2000, topTVD: 1200, bottomTVD: 2000,
      holeDiameterIn: 12.25,
      casing: { odIn: 9.625, idIn: 8.835, bottomMD: 2000 },
      shoe: { md: 2000, tvd: 2000 },
    },
    {
      id: 'phase-3', name: 'Poço aberto', type: 'OPEN_HOLE',
      topMD: 2000, bottomMD: 2500, topTVD: 2000, bottomTVD: 2500,
      holeDiameterIn: 8.5,
    },
  ],
};

const inputs: TampaoInputs = {
  // Campos legados de seção — propositalmente diferentes do intervalo da operação
  sectionStartMD: 1400, sectionEndMD: 1500,
  sectionStartTVD: 1400, sectionEndTVD: 1500,
  wellFinalMD: 2500, wellFinalTVD: 2500,
  holeID: 8.535, pipeOD: 3.5, pipeID: 2.764,
  backSpacerHeight: 30,
  mudWeightFront: 8.4, mudWeightBack: 8.4,
  completionWeight: 8.4,
  fracGrad: 16, poreGrad: 9,
  pumpRate: 3, surfaceTemp: 80.6, geoGradient: 1.5,
};

const context: PlugWellContext = { geometry: well, interval: { topMD: 1950, bottomMD: 2050 } };

describe('TampaoCalculoService com estrutura de fases', () => {
  const wellGeo = new WellGeometryService();
  const service = new TampaoCalculoService(new CoreCalculoService(), wellGeo);

  it('ancora o tampão no intervalo da operação, não na seção legada', () => {
    const plug = service.calcPlug(inputs, null, context);
    expect(plug.pBase).toBe(2050);
    expect(plug.pTop).toBe(1950);
    expect(plug.plugHeight).toBe(100);
  });

  it('soma o volume trecho a trecho quando o tampão atravessa fases', () => {
    const plug = service.calcPlug(inputs, null, context);
    // 50 m revestidos (ID 8,835") + 50 m de poço aberto (8,5")
    const expected = BBL_M * (8.835 ** 2) * 50 + BBL_M * (8.5 ** 2) * 50;
    expect(plug.volCementTotal).toBeCloseTo(expected, 9);
    // uma capacidade única daria outro número
    expect(plug.volCementTotal).not.toBeCloseTo(BBL_M * (8.5 ** 2) * 100, 4);
  });

  it('devolve ao topo do intervalo quando a pasta preenche o poço aberto', () => {
    const plug = service.calcPlug(inputs, null, context);
    // sem coluna, o volume geométrico enche exatamente 1950–2050
    expect(plug.topCementWithoutTubing).toBeCloseTo(1950, 6);
    expect(plug.cementHeightWithoutTubing).toBeCloseTo(100, 6);
  });

  it('sobe o cimento pelas duas geometrias no estado com coluna', () => {
    const plug = service.calcPlug(inputs, null, context);
    const openHoleCap = BBL_M * (8.5 ** 2 - 3.5 ** 2) + BBL_M * 2.764 ** 2;
    const casedCap = BBL_M * (8.835 ** 2 - 3.5 ** 2) + BBL_M * 2.764 ** 2;
    // consome os 50 m de poço aberto e o que sobrar sobe no trecho revestido
    const rest = plug.volCementTotal - openHoleCap * 50;
    expect(plug.topCementWithTubing).toBeCloseTo(2000 - rest / casedCap, 6);
    // o cimento com coluna sobe mais que sem coluna (menos espaço disponível)
    expect(plug.topCementWithTubing).toBeLessThan(plug.topCementWithoutTubing);
  });

  it('mantém a soma dos volumes anular + coluna igual ao volume total', () => {
    const plug = service.calcPlug(inputs, null, context);
    expect(plug.volCementAnn + plug.volCementPipe).toBeCloseTo(plug.volCementTotal, 6);
  });

  it('respeita um volume informado pelo usuário, subindo a partir da base', () => {
    const plug = service.calcPlug(inputs, 4, context);
    expect(plug.volCementTotal).toBe(4);
    const volumeUpToTop = wellGeo.calculateVolumeBetween(
      well, plug.topCementWithTubing, plug.pBase,
      wellGeo.capacityResolver({ kind: 'annulusPlusPipe', pipeOD: 3.5, pipeID: 2.764 }),
    );
    expect(volumeUpToTop).toBeCloseTo(4, 6);
  });

  it.each([
    [2000, 8.835],
    [2000.001, 8.5],
    [2500, 8.5],
  ])('usa a capacidade exata na base %s, inclusive junto à mudança de fase e no fundo', (bottomMD, diameter) => {
    const plug = service.calcPlug(inputs, null, {
      geometry: well, interval: { topMD: 1950, bottomMD },
    });
    expect(plug.capHole).toBeCloseTo(BBL_M * diameter ** 2, 9);
    expect(plug.capAnn).toBeCloseTo(BBL_M * (diameter ** 2 - inputs.pipeOD ** 2), 9);
    expect(plug.capPipe).toBeCloseTo(BBL_M * inputs.pipeID ** 2, 9);
  });

  it('cai no comportamento legado de capacidade única sem geometria', () => {
    const plug = service.calcPlug(inputs);
    expect(plug.pBase).toBe(1500);
    expect(plug.volCementTotal).toBeCloseTo(BBL_M * (8.535 ** 2) * 100, 9);
  });
});
