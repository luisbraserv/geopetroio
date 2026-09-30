import { describe, expect, it } from 'vitest';
import { expandReportChartSelection, reportChartId, SQUEEZE_REPORT_CHARTS, TAMPAO_REPORT_CHARTS } from './report-chart-selection';

describe('seleção de gráficos do relatório, um a um', () => {
  it('os grupos antigos valem por todos os seus gráficos, na ordem do relatório', () => {
    const pressao = SQUEEZE_REPORT_CHARTS.filter(option => option.group === 'pressao').map(option => option.id);
    expect(expandReportChartSelection(['pressao'], SQUEEZE_REPORT_CHARTS)).toEqual(pressao);
    expect(expandReportChartSelection(['pressao', 'cronograma'], SQUEEZE_REPORT_CHARTS)).toEqual(SQUEEZE_REPORT_CHARTS.map(o => o.id));
    expect(expandReportChartSelection(['fracture-risk', 'cronograma', 'nao-existe'], SQUEEZE_REPORT_CHARTS))
      .toEqual(['cronograma', 'uca', 'fracture-risk']);
    expect(expandReportChartSelection(undefined, SQUEEZE_REPORT_CHARTS)).toEqual([]);
  });

  it('o tampão não tem compressão nem risco de fratura', () => {
    const ids = TAMPAO_REPORT_CHARTS.map(option => option.id);
    expect(ids).not.toContain('compressao');
    expect(ids).not.toContain('fracture-risk');
    expect(expandReportChartSelection(['fracture-risk'], TAMPAO_REPORT_CHARTS)).toEqual([]);
  });

  it('o id do SVG com a fase volta ao id do catálogo', () => {
    expect(reportChartId('pressure-envelope-all')).toBe('pressure-envelope');
    expect(reportChartId('profile-phase-3')).toBe('profile');
    expect(reportChartId('plan')).toBe('plan');
    expect(reportChartId('fracture-risk')).toBe('fracture-risk');
  });
});
