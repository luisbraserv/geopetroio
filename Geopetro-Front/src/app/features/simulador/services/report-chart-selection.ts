/**
 * Gráficos e tabelas que o relatório do squeeze e do tampão pode levar, um a um. O grupo é a
 * seleção antiga ("pressao" e "cronograma"), que continua valendo por todos os do grupo.
 */
export interface ReportChartOption { id: string; label: string; group: 'cronograma' | 'pressao' }

const CRONOGRAMA: ReportChartOption[] = [
  { id: 'cronograma', label: 'Cronograma operacional', group: 'cronograma' },
  { id: 'uca', label: 'Resistência à compressão (UCA)', group: 'cronograma' },
];
const PRESSAO_INICIO: ReportChartOption[] = [
  { id: 'premissas', label: 'Premissas da simulação', group: 'pressao' },
];
const JANELA: ReportChartOption = { id: 'janela-operacional', label: 'Janela operacional — ponto crítico por etapa', group: 'pressao' };
const PRESSAO_GRAFICOS: ReportChartOption[] = [
  { id: 'hydrostatic-ecd', label: 'ECD e pressão hidrostática', group: 'pressao' },
  { id: 'pressure-envelope', label: 'Envelope de pressão', group: 'pressao' },
];
const PRESSAO_FIM: ReportChartOption[] = [
  { id: 'injected-volume-time', label: 'Volume injetado × tempo', group: 'pressao' },
  { id: 'profile', label: 'Perfil direcional e cimentação', group: 'pressao' },
  { id: 'plan', label: 'Planta da trajetória', group: 'pressao' },
];

/** Na ordem em que entram no relatório. */
export const SQUEEZE_REPORT_CHARTS: ReportChartOption[] = [...CRONOGRAMA, ...PRESSAO_INICIO,
  { id: 'compressao', label: 'Técnica e compressão (blocos)', group: 'pressao' }, JANELA, ...PRESSAO_GRAFICOS,
  { id: 'fracture-risk', label: 'Risco de fratura nos canhoneados', group: 'pressao' }, ...PRESSAO_FIM];
export const TAMPAO_REPORT_CHARTS: ReportChartOption[] = [...CRONOGRAMA, ...PRESSAO_INICIO, JANELA, ...PRESSAO_GRAFICOS, ...PRESSAO_FIM];

/** Seleção salva → ids do catálogo: um grupo antigo vale por todos os seus gráficos. */
export function expandReportChartSelection(selected: readonly string[] | null | undefined,
  options: readonly ReportChartOption[]): string[] {
  const chosen = new Set(selected ?? []);
  return options.filter(option => chosen.has(option.id) || chosen.has(option.group)).map(option => option.id);
}

/** Id do catálogo a partir do id do SVG: o envelope, o perfil e a planta levam a fase no id. */
export function reportChartId(visualId: string): string {
  for (const prefix of ['pressure-envelope', 'profile', 'plan', 'caliper'])
    if (visualId === prefix || visualId.startsWith(`${prefix}-`)) return prefix;
  return visualId;
}
