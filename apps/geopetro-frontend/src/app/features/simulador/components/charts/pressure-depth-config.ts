import { DepthUnit, depthFromMetres } from '../../models/depth-unit';
import { ChartConfiguration } from 'chart.js';

/**
 * Configuração dos gráficos de pressão × profundidade (padrão da indústria):
 * pressão no eixo X **superior**, profundidade medida no eixo Y **invertido**
 * (0 no topo, fundo do poço embaixo). Cada série carrega seus próprios pontos,
 * então curvas que só existem em parte do poço (poro/fratura na seção aberta)
 * começam na profundidade certa em vez de serem preenchidas com zeros.
 */

/** Ponto de uma curva: x = pressão (psi), y = profundidade medida (m). */
export interface DepthPressurePoint { x: number; y: number; }

export interface DepthPressureSeries {
  label: string;
  color: string;
  points: DepthPressurePoint[];
  /** Curva tracejada — usada nos limites de formação (poro/fratura). */
  dashed?: boolean;
  /** Eixo X da série: 'x' = superior (psi), 'x1' = inferior (unidade secundária). */
  axis?: 'x' | 'x1';
}

export interface PressureDepthOptions {
  depthUnit?: DepthUnit;
  /** Título do eixo X superior. Padrão: 'psi'. */
  xTitle?: string;
  /** Título do eixo X inferior — só desenhado se alguma série usar o eixo 'x1'. */
  x1Title?: string;
  /** Título do eixo Y. Padrão: 'Profundidade Medida (m)'. */
  yTitle?: string;
  /** Profundidade máxima sugerida para o eixo Y (fundo do poço). */
  maxDepth?: number;
}

const GRID_COLOR = 'rgba(148, 163, 184, .30)';
const TICK_COLOR = '#64748b';
const TITLE_COLOR = '#475569';

/** Paleta padrão das curvas de pressão × profundidade. */
export const DEPTH_PRESSURE_COLORS = {
  poro: '#eab308',
  fratura: '#ef4444',
  anularMax: '#f97316',
  anularMin: '#06b6d4',
  coluna: '#3b82f6',
  ecd: '#8b5cf6',
} as const;

export function buildPressureDepthConfig(
  series: DepthPressureSeries[],
  options: PressureDepthOptions = {},
): ChartConfiguration {
  const drawn = series.filter(s => s.points.length > 0);
  const hasSecondaryAxis = drawn.some(s => s.axis === 'x1');

  return {
    type: 'scatter',
    data: {
      datasets: drawn.map(s => ({
        label: s.label,
        data: s.points.map(point => ({ x: point.x, y: depthFromMetres(point.y, options.depthUnit ?? 'm') })),
        xAxisID: s.axis ?? 'x',
        showLine: true,
        borderColor: s.color,
        backgroundColor: s.color,
        borderWidth: 2,
        borderDash: s.dashed ? [6, 3] : undefined,
        pointRadius: s.points.length === 1 ? 4 : 0,
        pointHoverRadius: 4,
        tension: 0,
      })),
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'nearest', intersect: false },
      plugins: {
        legend: {
          position: 'top',
          labels: { boxWidth: 14, boxHeight: 2, font: { size: 11 }, color: TITLE_COLOR },
        },
      },
      scales: {
        x: {
          type: 'linear',
          position: 'top',
          beginAtZero: true,
          title: { display: true, text: options.xTitle ?? 'psi', color: TITLE_COLOR, font: { size: 11 } },
          grid: { color: GRID_COLOR },
          border: { color: GRID_COLOR },
          ticks: { color: TICK_COLOR, font: { size: 10 } },
        },
        ...(hasSecondaryAxis ? {
          x1: {
            type: 'linear',
            position: 'bottom',
            beginAtZero: true,
            title: { display: true, text: options.x1Title ?? '', color: TITLE_COLOR, font: { size: 11 } },
            grid: { drawOnChartArea: false },
            ticks: { color: TICK_COLOR, font: { size: 10 } },
          },
        } : {}),
        y: {
          type: 'linear',
          reverse: true,
          beginAtZero: true,
          suggestedMax: options.maxDepth == null ? undefined : depthFromMetres(options.maxDepth, options.depthUnit ?? 'm'),
          title: { display: true, text: options.yTitle ?? `Profundidade Medida (${options.depthUnit ?? 'm'})`, color: TITLE_COLOR, font: { size: 11 } },
          grid: { color: GRID_COLOR },
          border: { color: GRID_COLOR },
          ticks: { color: TICK_COLOR, font: { size: 10 } },
        },
      },
    },
  } as ChartConfiguration;
}
