/**
 * Regra da retirada de tubos do tampão e do squeeze: sobe da base até o topo do
 * cimento e mais algumas seções acima dele. É a mesma conta do relatório de
 * retirada e da posição da extremidade que o motor usa depois de retirar a coluna.
 */
export interface RetiradaTubosInput {
  /** Base do tampão / extremidade da coluna antes da retirada (MD, m). */
  baseDepthMD: number;
  /** Topo do cimento sem coluna, do dimensionamento (MD, m). */
  cementTopMD: number;
  tubeLengthM?: number;
  sectionsAboveTop?: number;
  tubesPerSection?: number;
}

export interface RetiradaTubosResult {
  tubeLengthM: number;
  sectionsAboveTop: number;
  tubesPerSection: number;
  baseDepth: number;
  cementTopDepth: number;
  tampaoTubesCount: number;
  sectionTubesCount: number;
  totalTubesCount: number;
  openEndDepthM: number;
}

export const RETIRADA_PADRAO = { tubeLengthM: 9.4, sectionsAboveTop: 2, tubesPerSection: 2 } as const;

export function retiradaTubos(input: RetiradaTubosInput): RetiradaTubosResult {
  const tubeLengthM = input.tubeLengthM ?? RETIRADA_PADRAO.tubeLengthM;
  const sectionsAboveTop = input.sectionsAboveTop ?? RETIRADA_PADRAO.sectionsAboveTop;
  const tubesPerSection = input.tubesPerSection ?? RETIRADA_PADRAO.tubesPerSection;
  const baseDepth = input.baseDepthMD;
  const cementTopDepth = input.cementTopMD;
  const tampaoTubesCount = Math.max(0, Math.round(Math.abs(baseDepth - cementTopDepth) / tubeLengthM));
  const sectionTubesCount = Math.max(0, Math.round(sectionsAboveTop * tubesPerSection));
  const totalTubesCount = tampaoTubesCount + sectionTubesCount;
  const openEndDepthM = Math.max(0, baseDepth - (totalTubesCount * tubeLengthM));
  return { tubeLengthM, sectionsAboveTop, tubesPerSection, baseDepth, cementTopDepth,
    tampaoTubesCount, sectionTubesCount, totalTubesCount, openEndDepthM };
}
