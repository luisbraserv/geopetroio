import { Injectable } from '@angular/core';
import {
  ADITIVOS_CATALOGO,
  AdditiveDoseRange,
  AdditiveEffectProfile,
  Aditivo,
  AditivoCatalogo,
  AditivoRheologyCoefficients,
  FamiliaQuimica,
  IntensidadeEfeito,
  OrigemEfeito,
  PastaEffect,
  UnidadeDosagem,
  funcaoGenericaAditivo,
  hydrateAditivoFromCatalog,
  hydrateAditivosFromCatalog,
  unidadePadraoAditivo,
} from '../models/aditivo.model';

export const BASE_EFFECT_DELTA = {
  tempoEspessamentoMin: 20,
  resistenciaInicialPercent: 8,
  pvCp: 3,
  ypLbf100ft2: 4,
  gelLbf100ft2: 2,
  filtradoReductionPercent: 12,
  aguaLivrePercent: 0.5,
  sedimentacaoRisk: 1,
  perdaCargaPercent: 5,
  gasMigrationRisk: 1,
  corrosaoRisk: 1,
};

export interface SlurryEffectProperties {
  tempoEspessamentoMin?: number;
  resistenciaInicialPercent?: number;
  pvCp?: number;
  ypLbf100ft2?: number;
  gel10sLbf100ft2?: number;
  gel10minLbf100ft2?: number;
  gel30minLbf100ft2?: number;
  filtradoReductionPercent?: number;
  aguaLivrePercent?: number;
  sedimentacaoRisk?: number;
  densidadeTrend?: number;
  rendimentoTrend?: number;
  perdaCargaPercent?: number;
  gasMigrationRisk?: number;
  corrosaoRisk?: number;
  foamRisk?: number;
}

export interface AppliedPastaEffect extends PastaEffect {
  additiveName: string;
  origem: OrigemEfeito;
  fatorConcentracao: number;
  valorEstimado: number;
}

export interface AdditiveEffectResult {
  properties: SlurryEffectProperties;
  appliedEffects: {
    positivo: AppliedPastaEffect[];
    negativo: AppliedPastaEffect[];
  };
  warnings: string[];
  rheologyCoefficients: AditivoRheologyCoefficients;
  origem: OrigemEfeito;
}

@Injectable({ providedIn: 'root' })
export class AdditiveEffectEngineService {
  hydrateAdditiveFromCatalog(aditivoSelecionado: Partial<Aditivo>, catalogo: AditivoCatalogo[] = ADITIVOS_CATALOGO): Aditivo {
    return this.enrichEffectData(hydrateAditivoFromCatalog(aditivoSelecionado, catalogo));
  }

  hydrateAdditivesFromCatalog(aditivosSelecionados: Partial<Aditivo>[] = [], catalogo: AditivoCatalogo[] = ADITIVOS_CATALOGO): Aditivo[] {
    return hydrateAditivosFromCatalog(aditivosSelecionados, catalogo).map(add => this.enrichEffectData(add));
  }

  resolveDoseFactor(aditivo: Aditivo, conc = Number(aditivo.concentracaoUsada ?? aditivo.conc ?? 0)): number {
    const range = this.resolveDoseRange(aditivo);
    const media = Number(range.media) > 0 ? Number(range.media) : 1;
    const factor = conc / media;
    return Math.max(0.25, Math.min(3.0, Number.isFinite(factor) ? factor : 1));
  }

  applyPositiveNegativeEffects(baseSlurryProperties: SlurryEffectProperties = {}, hydratedAdditives: Aditivo[] = []): AdditiveEffectResult {
    const properties: SlurryEffectProperties = { ...baseSlurryProperties };
    const result: AdditiveEffectResult = {
      properties,
      appliedEffects: { positivo: [], negativo: [] },
      warnings: [],
      rheologyCoefficients: {},
      origem: 'estimado',
    };

    const additives = hydratedAdditives.map(add => this.enrichEffectData(add));
    for (const additive of additives) {
      const profile = this.resolveEffectProfile(additive);
      const origem = additive.origemEfeito ?? 'estimado';
      if (origem === 'laboratorio') result.origem = 'laboratorio';
      else if (origem === 'catalogo' && result.origem !== 'laboratorio') result.origem = 'catalogo';
      const factor = this.resolveDoseFactor(additive);
      this.applyEffectsForSide(profile.positivo, 'positivo', additive, origem, factor, result);
      this.applyEffectsForSide(profile.negativo, 'negativo', additive, origem, factor, result);
    }

    result.rheologyCoefficients = this.convertEffectsToRheologyCoefficients(result);
    result.warnings.push(...this.generateOperationalWarnings(additives, result));
    result.warnings = [...new Set(result.warnings)];
    return result;
  }

  convertEffectsToRheologyCoefficients(profileOrResult: AdditiveEffectProfile | AdditiveEffectResult): AditivoRheologyCoefficients {
    const effects = 'appliedEffects' in profileOrResult
      ? [...profileOrResult.appliedEffects.positivo, ...profileOrResult.appliedEffects.negativo]
      : [...profileOrResult.positivo, ...profileOrResult.negativo].map(effect => ({
          ...effect,
          additiveName: 'Aditivo',
          origem: 'estimado' as OrigemEfeito,
          fatorConcentracao: 1,
          valorEstimado: this.effectMagnitude(effect, 1),
        }));
    const coeffs: AditivoRheologyCoefficients = {};
    for (const effect of effects) {
      const signed = effect.direcao === 'aumenta' ? effect.valorEstimado : -effect.valorEstimado;
      if (effect.parametro === 'pv') coeffs.pvDeltaPerUnit = (coeffs.pvDeltaPerUnit || 0) + signed;
      if (effect.parametro === 'yp') coeffs.ypDeltaPerUnit = (coeffs.ypDeltaPerUnit || 0) + signed;
      if (effect.parametro === 'gel') {
        coeffs.gel10sDeltaPerUnit = (coeffs.gel10sDeltaPerUnit || 0) + signed;
        coeffs.gel10minDeltaPerUnit = (coeffs.gel10minDeltaPerUnit || 0) + signed * 1.5;
        coeffs.gel30minDeltaPerUnit = (coeffs.gel30minDeltaPerUnit || 0) + signed * 2;
      }
      if (effect.parametro === 'tempoEspessamento') coeffs.thickeningTimeDeltaMinPerUnit = (coeffs.thickeningTimeDeltaMinPerUnit || 0) + signed;
      if (effect.parametro === 'filtrado' && effect.direcao === 'reduz') {
        coeffs.fluidLossReductionFactorPerUnit = (coeffs.fluidLossReductionFactorPerUnit || 0) + Math.abs(signed) / 100;
      }
      if (effect.parametro === 'perdaCarga') coeffs.frictionFactorMultiplierDeltaPerUnit = (coeffs.frictionFactorMultiplierDeltaPerUnit || 0) + signed;
    }
    return coeffs;
  }

  generateOperationalWarnings(hydratedAdditives: Aditivo[], result: AdditiveEffectResult): string[] {
    const warnings: string[] = [];
    const families = new Set(hydratedAdditives.map(add => this.resolveFamily(add)));
    const funcs = new Set(hydratedAdditives.map(add => funcaoGenericaAditivo(add)));
    const hasAntifoam = funcs.has('antiespumante');
    const high = (add: Aditivo) => this.resolveDoseFactor(add) >= 2.0;

    if (funcs.has('acelerador') && funcs.has('retardador')) warnings.push('Acelerador + retardador: efeito incerto; recomendar teste de laboratorio.');
    if (funcs.has('dispersante') && hydratedAdditives.some(add => funcaoGenericaAditivo(add) === 'dispersante' && high(add))) {
      warnings.push('Dispersante em excesso: risco de sedimentacao e agua livre.');
    }
    if ((funcs.has('controladorGas') || families.has('latex')) && !hasAntifoam) warnings.push('Latex/controlador de gas sem antiespumante: risco de espuma.');
    if (families.has('sodiumChloride') && (funcs.has('dispersante') || funcs.has('controladorFiltrado'))) {
      warnings.push('Sal alto com dispersante/redutor de filtrado: possivel reducao de eficiencia.');
    }
    if (hydratedAdditives.some(add => ['hydroxycarboxylicAcid', 'saccharide'].includes(this.resolveFamily(add)) && high(add))) {
      warnings.push('Retardador forte em temperatura baixa/moderada: risco de sobrerretardo.');
    }
    if (hydratedAdditives.some(add => ['calciumChloride', 'calciumNitrite', 'calciumNitrate'].includes(this.resolveFamily(add)) && high(add))) {
      warnings.push('Acelerador forte em temperatura alta: risco de pega rapida.');
    }
    if (result.appliedEffects.negativo.some(effect => effect.parametro === 'riscoEspuma' && effect.direcao === 'aumenta') && !hasAntifoam) {
      warnings.push('Risco de espuma identificado pelos efeitos operacionais; avaliar antiespumante.');
    }
    return warnings;
  }

  resolveEffectProfile(additive: Aditivo): AdditiveEffectProfile {
    return additive.efeitoPasta || this.genericEffectProfile(this.resolveFamily(additive), funcaoGenericaAditivo(additive));
  }

  private enrichEffectData(additive: Aditivo): Aditivo {
    const familiaQuimica = additive.familiaQuimica ?? this.resolveFamily(additive);
    return {
      ...additive,
      familiaQuimica,
      doseRange: additive.doseRange ?? this.resolveDoseRange({ ...additive, familiaQuimica }),
      efeitoPasta: additive.efeitoPasta ?? this.genericEffectProfile(familiaQuimica, funcaoGenericaAditivo(additive)),
      origemEfeito: additive.origemEfeito ?? (additive.coefficients || additive.rheology?.coefficients ? 'catalogo' : 'estimado'),
    };
  }

  private resolveDoseRange(additive: Partial<Aditivo>): AdditiveDoseRange {
    if (additive.doseRange) return additive.doseRange;
    const unit = additive.unidadeDosagem ?? unidadePadraoAditivo(additive);
    const family = additive.familiaQuimica ?? this.resolveFamily(additive);
    const defaults: Partial<Record<FamiliaQuimica, [number, number, number]>> = {
      calciumChloride: [1, 2, 4],
      sodiumChloride: [2, 8, 18],
      lignosulfonate: [0.1, 0.3, 1],
      hydroxycarboxylicAcid: [0.05, 0.2, 0.8],
      saccharide: [0.03, 0.1, 0.4],
      naphthaleneSulfonate: [0.02, 0.1, 0.5],
      ketoneAldehydePolymer: [0.02, 0.1, 0.5],
      ampsPolymer: [0.3, 1, 2],
      celluloseDerivative: [0.3, 0.8, 1.5],
      latex: [0.5, 1.5, 3],
      bentonite: [1, 3, 6],
      sodiumSilicate: [0.2, 0.8, 2],
      hematite: [50, 150, 300],
      barite: [50, 150, 300],
      silicaFlour: [20, 35, 40],
      antifoam: [0.01, 0.03, 0.1],
      lcmGranular: [5, 15, 30],
      lcmFibrous: [3, 10, 20],
    };
    const [baixa, media, alta] = defaults[family] || [0.25, 1, 3];
    return { unidade: unit as UnidadeDosagem, baixa, media, alta };
  }

  private resolveFamily(additive: Partial<Aditivo>): FamiliaQuimica {
    if (additive.familiaQuimica) return additive.familiaQuimica;
    const id = `${additive.catalogId || ''} ${additive.name || ''} ${additive.commercialName || ''}`.toLowerCase();
    const category = additive.category ?? additive.categoria;
    if (id.includes('cacl') || id.includes('calcium chloride') || id.includes('cloreto de calcio')) return 'calciumChloride';
    if (id.includes('nacl') || id.includes('sodium chloride') || id.includes('cloreto de sodio')) return 'sodiumChloride';
    if (id.includes('formate') || id.includes('formiato')) return 'calciumFormate';
    if (id.includes('nitrite') || id.includes('nitrate')) return 'calciumNitrite';
    if (id.includes('ligno')) return 'lignosulfonate';
    if (id.includes('saccharide') || id.includes('sugar')) return 'saccharide';
    if (id.includes('cellulose') || id.includes('celulose')) return 'celluloseDerivative';
    if (id.includes('naphthalene') || id.includes('naftaleno')) return 'naphthaleneSulfonate';
    if (id.includes('ketone') || id.includes('aldehyde')) return 'ketoneAldehydePolymer';
    if (id.includes('amps')) return 'ampsPolymer';
    if (id.includes('latex')) return 'latex';
    if (id.includes('benton')) return 'bentonite';
    if (id.includes('silicate')) return 'sodiumSilicate';
    if (id.includes('hemat')) return 'hematite';
    if (id.includes('barit') || id.includes('barite')) return 'barite';
    if (id.includes('silica')) return 'silicaFlour';
    if (id.includes('foam') || category === 'antifoam') return 'antifoam';
    if (category === 'retarder') return 'lignosulfonate';
    if (category === 'accelerator') return 'calciumChloride';
    if (category === 'dispersant') return 'naphthaleneSulfonate';
    if (category === 'fluidLossControl' || category === 'fluid-loss') return 'ampsPolymer';
    if (category === 'gasMigrationControl') return 'latex';
    if (category === 'extender' || category === 'viscosifier') return 'bentonite';
    if (category === 'weightingAgent') return 'barite';
    if (category === 'silica') return 'silicaFlour';
    if (category === 'salt') return 'sodiumChloride';
    if (category === 'lostCirculationMaterial') return 'lcmGranular';
    return 'generic';
  }

  private genericEffectProfile(family: FamiliaQuimica, fallbackFunction: string): AdditiveEffectProfile {
    const e = (parametro: PastaEffect['parametro'], direcao: PastaEffect['direcao'], intensidade: IntensidadeEfeito, observacao?: string): PastaEffect =>
      ({ parametro, direcao, intensidade, observacao });
    const profile = (positivo: PastaEffect[], negativo: PastaEffect[]): AdditiveEffectProfile => ({ positivo, negativo });
    const profiles: Partial<Record<FamiliaQuimica, AdditiveEffectProfile>> = {
      lignosulfonate: profile([e('tempoEspessamento', 'aumenta', 'medio')], [e('resistenciaInicial', 'reduz', 'medio'), e('riscoSobrerretardo', 'aumenta', 'medio'), e('pv', 'reduz', 'baixo'), e('yp', 'reduz', 'baixo')]),
      hydroxycarboxylicAcid: profile([e('tempoEspessamento', 'aumenta', 'alto')], [e('resistenciaInicial', 'reduz', 'alto'), e('riscoSobrerretardo', 'aumenta', 'alto', 'Risco maior em temperaturas baixas/moderadas.')]),
      saccharide: profile([e('tempoEspessamento', 'aumenta', 'alto')], [e('riscoSobrerretardo', 'aumenta', 'alto', 'Alta sensibilidade a concentracao.')]),
      calciumChloride: profile([e('tempoEspessamento', 'reduz', 'alto'), e('resistenciaInicial', 'aumenta', 'alto')], [e('riscoCorrosao', 'aumenta', 'alto'), e('riscoPegaRapida', 'aumenta', 'medio'), e('pv', 'aumenta', 'baixo'), e('yp', 'aumenta', 'baixo')]),
      calciumFormate: profile([e('tempoEspessamento', 'reduz', 'medio'), e('resistenciaInicial', 'aumenta', 'medio')], [e('riscoPegaRapida', 'aumenta', 'baixo', 'Efeito inicial pode ser menor que CaCl2.')]),
      calciumNitrite: profile([e('tempoEspessamento', 'reduz', 'alto'), e('resistenciaInicial', 'aumenta', 'alto')], [e('riscoPegaRapida', 'aumenta', 'medio', 'Eficiencia variavel conforme cimento.')]),
      calciumNitrate: profile([e('tempoEspessamento', 'reduz', 'alto'), e('resistenciaInicial', 'aumenta', 'alto')], [e('riscoPegaRapida', 'aumenta', 'medio', 'Eficiencia variavel conforme cimento.')]),
      naphthaleneSulfonate: profile([e('pv', 'reduz', 'alto'), e('yp', 'reduz', 'alto'), e('perdaCarga', 'reduz', 'alto')], [e('sedimentacao', 'aumenta', 'medio'), e('aguaLivre', 'aumenta', 'medio'), e('tempoEspessamento', 'aumenta', 'baixo')]),
      ketoneAldehydePolymer: profile([e('pv', 'reduz', 'alto'), e('yp', 'reduz', 'alto'), e('perdaCarga', 'reduz', 'alto')], [e('sedimentacao', 'aumenta', 'medio'), e('aguaLivre', 'aumenta', 'medio'), e('tempoEspessamento', 'aumenta', 'medio')]),
      ampsPolymer: profile([e('filtrado', 'reduz', 'alto'), e('riscoGasMigration', 'reduz', 'medio')], [e('pv', 'aumenta', 'medio'), e('yp', 'aumenta', 'medio'), e('perdaCarga', 'aumenta', 'medio'), e('tempoEspessamento', 'aumenta', 'baixo')]),
      celluloseDerivative: profile([e('filtrado', 'reduz', 'alto'), e('riscoGasMigration', 'reduz', 'medio')], [e('pv', 'aumenta', 'medio'), e('yp', 'aumenta', 'medio'), e('perdaCarga', 'aumenta', 'medio'), e('tempoEspessamento', 'aumenta', 'medio')]),
      latex: profile([e('riscoGasMigration', 'reduz', 'alto'), e('filtrado', 'reduz', 'alto'), e('permeabilidadeEstimada', 'reduz', 'alto')], [e('pv', 'aumenta', 'alto'), e('yp', 'aumenta', 'alto'), e('riscoEspuma', 'aumenta', 'medio')]),
      bentonite: profile([e('densidade', 'reduz', 'alto'), e('rendimento', 'aumenta', 'alto')], [e('pv', 'aumenta', 'alto'), e('yp', 'aumenta', 'alto'), e('gel', 'aumenta', 'alto'), e('perdaCarga', 'aumenta', 'alto'), e('aguaLivre', 'reduz', 'medio', 'Aumenta agua requerida.')]),
      sodiumSilicate: profile([e('densidade', 'reduz', 'medio'), e('rendimento', 'aumenta', 'medio')], [e('gel', 'aumenta', 'alto'), e('riscoPegaRapida', 'aumenta', 'alto')]),
      hematite: profile([e('densidade', 'aumenta', 'alto')], [e('sedimentacao', 'aumenta', 'alto'), e('perdaCarga', 'aumenta', 'medio'), e('pv', 'aumenta', 'medio')]),
      barite: profile([e('densidade', 'aumenta', 'alto')], [e('sedimentacao', 'aumenta', 'medio'), e('perdaCarga', 'aumenta', 'medio'), e('pv', 'aumenta', 'baixo')]),
      silicaFlour: profile([e('estabilidadeTermica', 'aumenta', 'alto')], [e('pv', 'aumenta', 'medio'), e('perdaCarga', 'aumenta', 'medio')]),
      lcmGranular: profile([e('perdaCirculacao', 'reduz', 'alto')], [e('pv', 'aumenta', 'medio'), e('perdaCarga', 'aumenta', 'medio'), e('sedimentacao', 'aumenta', 'medio', 'Risco de ponteio/obstrucao se concentracao alta.')]),
      lcmFibrous: profile([e('perdaCirculacao', 'reduz', 'alto')], [e('pv', 'aumenta', 'alto'), e('perdaCarga', 'aumenta', 'alto'), e('sedimentacao', 'aumenta', 'medio', 'Risco de ponteio/obstrucao se concentracao alta.')]),
      antifoam: profile([e('riscoEspuma', 'reduz', 'alto'), e('arIncorporado', 'reduz', 'medio')], []),
    };
    if (profiles[family]) return profiles[family]!;
    if (fallbackFunction === 'antiespumante') return profiles.antifoam!;
    return profile([], []);
  }

  private applyEffectsForSide(
    effects: PastaEffect[],
    side: 'positivo' | 'negativo',
    additive: Aditivo,
    origem: OrigemEfeito,
    factor: number,
    result: AdditiveEffectResult,
  ): void {
    for (const effect of effects) {
      const magnitude = this.effectMagnitude(effect, factor);
      const signed = effect.direcao === 'aumenta' ? magnitude : -magnitude;
      this.applyToProperties(result.properties, effect, signed);
      result.appliedEffects[side].push({
        ...effect,
        additiveName: additive.name,
        origem,
        fatorConcentracao: factor,
        valorEstimado: magnitude,
      });
    }
  }

  private effectMagnitude(effect: PastaEffect, factor: number): number {
    const multiplier = this.intensityMultiplier(effect.intensidade);
    const f = multiplier * factor;
    switch (effect.parametro) {
      case 'tempoEspessamento': return BASE_EFFECT_DELTA.tempoEspessamentoMin * f;
      case 'resistenciaInicial': return BASE_EFFECT_DELTA.resistenciaInicialPercent * f;
      case 'pv': return BASE_EFFECT_DELTA.pvCp * f;
      case 'yp': return BASE_EFFECT_DELTA.ypLbf100ft2 * f;
      case 'gel': return BASE_EFFECT_DELTA.gelLbf100ft2 * f;
      case 'filtrado': return BASE_EFFECT_DELTA.filtradoReductionPercent * f;
      case 'aguaLivre': return BASE_EFFECT_DELTA.aguaLivrePercent * f;
      case 'perdaCarga': return BASE_EFFECT_DELTA.perdaCargaPercent * f;
      case 'riscoGasMigration': return BASE_EFFECT_DELTA.gasMigrationRisk * f;
      case 'riscoCorrosao': return BASE_EFFECT_DELTA.corrosaoRisk * f;
      case 'sedimentacao': return BASE_EFFECT_DELTA.sedimentacaoRisk * f;
      default: return multiplier * factor;
    }
  }

  private intensityMultiplier(intensidade: IntensidadeEfeito): number {
    if (intensidade === 'alto') return 3;
    if (intensidade === 'medio') return 2;
    return 1;
  }

  private applyToProperties(properties: SlurryEffectProperties, effect: PastaEffect, signed: number): void {
    if (effect.parametro === 'tempoEspessamento') properties.tempoEspessamentoMin = (properties.tempoEspessamentoMin || 0) + signed;
    if (effect.parametro === 'resistenciaInicial') properties.resistenciaInicialPercent = (properties.resistenciaInicialPercent || 0) + signed;
    if (effect.parametro === 'pv') properties.pvCp = (properties.pvCp || 0) + signed;
    if (effect.parametro === 'yp') properties.ypLbf100ft2 = (properties.ypLbf100ft2 || 0) + signed;
    if (effect.parametro === 'gel') {
      properties.gel10sLbf100ft2 = (properties.gel10sLbf100ft2 || 0) + signed;
      properties.gel10minLbf100ft2 = (properties.gel10minLbf100ft2 || 0) + signed * 1.5;
      properties.gel30minLbf100ft2 = (properties.gel30minLbf100ft2 || 0) + signed * 2;
    }
    if (effect.parametro === 'filtrado') properties.filtradoReductionPercent = (properties.filtradoReductionPercent || 0) + (effect.direcao === 'reduz' ? Math.abs(signed) : -Math.abs(signed));
    if (effect.parametro === 'aguaLivre') properties.aguaLivrePercent = (properties.aguaLivrePercent || 0) + signed;
    if (effect.parametro === 'sedimentacao') properties.sedimentacaoRisk = (properties.sedimentacaoRisk || 0) + signed;
    if (effect.parametro === 'densidade') properties.densidadeTrend = (properties.densidadeTrend || 0) + signed;
    if (effect.parametro === 'rendimento') properties.rendimentoTrend = (properties.rendimentoTrend || 0) + signed;
    if (effect.parametro === 'perdaCarga') properties.perdaCargaPercent = (properties.perdaCargaPercent || 0) + signed;
    if (effect.parametro === 'riscoGasMigration') properties.gasMigrationRisk = (properties.gasMigrationRisk || 0) + signed;
    if (effect.parametro === 'riscoCorrosao') properties.corrosaoRisk = (properties.corrosaoRisk || 0) + signed;
    if (effect.parametro === 'riscoEspuma') properties.foamRisk = (properties.foamRisk || 0) + signed;
  }
}
