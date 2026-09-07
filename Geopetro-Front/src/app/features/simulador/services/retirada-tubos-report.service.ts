import { Injectable } from '@angular/core';
import { RelatorioBuilderService } from '../components/relatorio/relatorio-builder.service';
import { RelatorioCapaData } from '../components/relatorio/relatorio-capa-modal.component';
import { ReverseCirculationCalculoService, ReverseCirculationResult } from './reverse-circulation-calculo.service';
import { DadosRelatorio } from './simulador-state-store.service';

export interface CalculationRow {
  label: string;
  value: string;
}

export interface CalculationSection {
  title: string;
  rows?: CalculationRow[];
  formulas?: string[];
  notes?: string[];
}

export interface RetiradaTubosCalculation {
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

type Sequencia = RelatorioCapaData['sequenciaOperacional'];

interface RetiradaParams {
  operacao: string;
  v: any;
  dadosRelatorio: DadosRelatorio;
  topoCimentoRetiradaM: number | string;
}

interface CirculacaoReversaParams extends RetiradaParams {
  tubingIdIn: number;
}

/**
 * Gera as páginas de cálculo de "retirada de tubos" e "circulação reversa".
 * Lógica compartilhada entre os simuladores de squeeze e tampão.
 */
@Injectable({ providedIn: 'root' })
export class RetiradaTubosReportService {
  constructor(
    private relatorioBuilder: RelatorioBuilderService,
    private reverseCirculationCalc: ReverseCirculationCalculoService,
  ) {}

  buildCalculation(
    v: any,
    topoCimentoRetiradaM: number | string,
    sequencia?: Sequencia,
  ): RetiradaTubosCalculation {
    const tubeLengthM = this.toNumber(sequencia?.comprimentoTuboM, 9.4);
    const sectionsAboveTop = this.toNumber(sequencia?.secoesAcimaTopoCimento, 2);
    const tubesPerSection = this.toNumber(sequencia?.tubosPorSecao, 2);
    const baseDepth = this.toNumber(v.sectionEndMD, 0);
    const cementTopDepth = this.toNumber(topoCimentoRetiradaM, this.toNumber(v.sectionStartMD, baseDepth));
    const tampaoTubesCount = Math.max(0, Math.round(Math.abs(baseDepth - cementTopDepth) / tubeLengthM));
    const sectionTubesCount = Math.max(0, Math.round(sectionsAboveTop * tubesPerSection));
    const totalTubesCount = tampaoTubesCount + sectionTubesCount;
    const openEndDepthM = Math.max(0, baseDepth - (totalTubesCount * tubeLengthM));
    return {
      tubeLengthM,
      sectionsAboveTop,
      tubesPerSection,
      baseDepth,
      cementTopDepth,
      tampaoTubesCount,
      sectionTubesCount,
      totalTubesCount,
      openEndDepthM,
    };
  }

  abrirRetirada(p: RetiradaParams): void {
    const calc = this.buildCalculation(p.v, p.topoCimentoRetiradaM, p.dadosRelatorio.sequenciaOperacional as unknown as Sequencia);
    this.openCalculationPage(
      'Cálculo completo da retirada de tubos',
      'Cálculo gerado com a mesma regra usada na sequência operacional do relatório.',
      [
        this.buildScenarioSection(p.operacao, p.v, p.dadosRelatorio),
        ...this.buildRetiradaTubosSections(calc),
      ],
    );
  }

  abrirCirculacaoReversa(p: CirculacaoReversaParams): void {
    const retirada = this.buildCalculation(p.v, p.topoCimentoRetiradaM, p.dadosRelatorio.sequenciaOperacional as unknown as Sequencia);
    const result = this.reverseCirculationCalc.calculateReverseCirculation({
      tubingIdIn: p.tubingIdIn,
      openEndDepthM: retirada.openEndDepthM,
    });
    this.openCalculationPage(
      'Cálculo completo da circulação reversa',
      'A profundidade aberta é recalculada após a retirada dos tubos, igual ao relatório.',
      [
        this.buildScenarioSection(p.operacao, p.v, p.dadosRelatorio),
        ...this.buildRetiradaTubosSections(retirada),
        this.buildCirculacaoReversaSection(p.tubingIdIn, result),
      ],
    );
  }

  private buildScenarioSection(operacao: string, v: any, dadosRelatorio: DadosRelatorio): CalculationSection {
    return {
      title: 'Dados do cenário',
      rows: [
        { label: 'Operação', value: operacao },
        { label: 'Cliente', value: dadosRelatorio.cliente || '-' },
        { label: 'Poço', value: dadosRelatorio.poco || '-' },
        { label: 'Campo', value: dadosRelatorio.campo || '-' },
        { label: 'Sonda', value: dadosRelatorio.sonda || '-' },
        { label: 'Início da seção', value: `${this.fmt(Number(v.sectionStartMD), 1)} m MD` },
        { label: 'Fim da seção / profundidade da coluna', value: `${this.fmt(Number(v.sectionEndMD), 1)} m MD` },
        { label: 'Fonte dos parâmetros operacionais', value: 'Dados do Relatório + geometria atual do simulador' },
      ],
    };
  }

  private buildRetiradaTubosSections(calc: RetiradaTubosCalculation): CalculationSection[] {
    const depthDiff = Math.abs(calc.baseDepth - calc.cementTopDepth);
    const tubesUntilTopRaw = calc.tubeLengthM > 0 ? depthDiff / calc.tubeLengthM : 0;
    const additionalRaw = calc.sectionsAboveTop * calc.tubesPerSection;
    return [
      {
        title: 'Entradas para retirada de tubos',
        rows: [
          { label: 'Profundidade da coluna antes da retirada', value: `${this.fmt(calc.baseDepth, 1)} m` },
          { label: 'Topo do cimento para retirada', value: `${this.fmt(calc.cementTopDepth, 1)} m` },
          { label: 'Comprimento médio de cada tubo', value: `${this.fmt(calc.tubeLengthM, 2)} m` },
          { label: 'Seções acima do topo do cimento', value: this.fmt(calc.sectionsAboveTop, 2) },
          { label: 'Tubos por seção', value: `${this.fmt(calc.tubesPerSection, 0)} tubos/seção` },
          { label: 'Regra de arredondamento', value: 'round(), mesma regra aplicada no relatório' },
        ],
      },
      {
        title: 'Passo a passo da quantidade de tubos',
        rows: [
          { label: 'Diferença de profundidade até o topo', value: `|${this.fmt(calc.baseDepth, 1)} - ${this.fmt(calc.cementTopDepth, 1)}| = ${this.fmt(depthDiff, 2)} m` },
          { label: 'Tubos até o topo sem arredondar', value: `${this.fmt(depthDiff, 2)} / ${this.fmt(calc.tubeLengthM, 2)} = ${this.fmt(tubesUntilTopRaw, 3)}` },
          { label: 'Tubos até o topo arredondado', value: `round(${this.fmt(tubesUntilTopRaw, 3)}) = ${this.fmt(calc.tampaoTubesCount, 0)} tubos` },
          { label: 'Tubos adicionais sem arredondar', value: `${this.fmt(calc.sectionsAboveTop, 2)} × ${this.fmt(calc.tubesPerSection, 0)} = ${this.fmt(additionalRaw, 3)}` },
          { label: 'Tubos adicionais arredondados', value: `round(${this.fmt(additionalRaw, 3)}) = ${this.fmt(calc.sectionTubesCount, 0)} tubos` },
          { label: 'Total de tubos retirados', value: `${this.fmt(calc.tampaoTubesCount, 0)} + ${this.fmt(calc.sectionTubesCount, 0)} = ${this.fmt(calc.totalTubesCount, 0)} tubos` },
          { label: 'Profundidade aproximada após retirada', value: `${this.fmt(calc.baseDepth, 1)} - (${this.fmt(calc.totalTubesCount, 0)} × ${this.fmt(calc.tubeLengthM, 2)}) = ${this.fmt(calc.openEndDepthM, 1)} m` },
        ],
        formulas: [
          'Tubos até o topo = round(abs(profundidade da coluna - topo do cimento) / comprimento do tubo)',
          'Tubos adicionais = round(seções acima do topo × tubos por seção)',
          'Total retirado = tubos até o topo + tubos adicionais',
          'Profundidade após retirada = profundidade da coluna - (total retirado × comprimento do tubo)',
        ],
      },
      {
        title: 'Resultado da retirada',
        rows: [
          { label: 'Tubos até o topo do cimento', value: `${this.fmt(calc.tampaoTubesCount, 0)} tubos` },
          { label: 'Tubos adicionais acima do topo', value: `${this.fmt(calc.sectionTubesCount, 0)} tubos` },
          { label: 'Quantidade total de tubos retirados', value: `${this.fmt(calc.totalTubesCount, 0)} tubos` },
          { label: 'Profundidade aproximada final', value: `${this.fmt(calc.openEndDepthM, 1)} m` },
        ],
      },
    ];
  }

  private buildCirculacaoReversaSection(tubingIdIn: number, result: ReverseCirculationResult): CalculationSection {
    return {
      title: 'Passo a passo da circulação reversa',
      rows: [
        { label: 'ID interno do tubing', value: `${this.fmt(tubingIdIn, 3)} in` },
        { label: 'Constante de capacidade', value: '0,0031871 bbl/m por pol²' },
        { label: 'Capacidade interna calculada', value: `0,0031871 × ${this.fmt(tubingIdIn, 3)}² = ${this.fmt(result.tubingCapacityBblPerM, 5)} bbl/m` },
        { label: 'Profundidade aberta após retirada', value: `${this.fmt(result.internalTubingVolumeBbl / result.tubingCapacityBblPerM, 1)} m` },
        { label: 'Volume interno da coluna', value: `${this.fmt(result.tubingCapacityBblPerM, 5)} × ${this.fmt(result.internalTubingVolumeBbl / result.tubingCapacityBblPerM, 1)} = ${this.fmt(result.internalTubingVolumeBbl, 2)} bbl` },
        { label: 'Fator de segurança', value: `${this.fmt(result.safetyFactor, 2)}×` },
        { label: 'Volume de circulação reversa', value: `${this.fmt(result.internalTubingVolumeBbl, 2)} × ${this.fmt(result.safetyFactor, 2)} = ${this.fmt(result.reverseCirculationVolumeBbl, 2)} bbl` },
      ],
      formulas: [
        'Capacidade interna do tubing = 0,0031871 × ID²',
        'Volume interno da coluna = capacidade interna × profundidade aberta após retirada',
        'Circulação reversa = volume interno da coluna × fator de segurança',
      ],
      notes: [
        'A profundidade usada aqui é a profundidade aproximada depois da retirada dos tubos, não a profundidade original da coluna.',
      ],
    };
  }

  private openCalculationPage(title: string, subtitle: string, sections: CalculationSection[]): void {
    const sectionsHtml = sections.map(section => this.buildCalculationSectionHtml(section)).join('');
    this.relatorioBuilder.openInNewTab(`<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<title>${this.escapeHtml(title)}</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#eef2f6;color:#172033;font-family:Inter,Segoe UI,Arial,sans-serif}
  .page{max-width:980px;margin:24px auto;padding:32px;background:#fff;border:1px solid #dbe3ef;border-radius:8px}
  .header{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;border-bottom:2px solid #2d5a8e;padding-bottom:18px;margin-bottom:22px}
  h1{margin:0;color:#1f4977;font-size:25px;letter-spacing:0}
  .subtitle{margin:8px 0 0;color:#526273;font-size:14px;line-height:1.45}
  .print{border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:9px 14px;font-weight:700;cursor:pointer}
  section{margin:0 0 22px}
  h2{margin:0 0 10px;color:#2d5a8e;font-size:17px}
  table{width:100%;border-collapse:collapse;margin:0}
  td{border:1px solid #dbe3ef;padding:9px 11px;font-size:13px;vertical-align:top}
  td:first-child{width:42%;background:#f8fafc;font-weight:700;color:#42526a}
  .formulas{margin-top:10px;padding:12px 14px;border:1px solid #dbe3ef;border-radius:8px;background:#f8fafc}
  .formulas div{font-family:Consolas,monospace;font-size:13px;line-height:1.5;color:#1f2937}
  .notes{margin-top:10px;padding-left:18px;color:#526273;font-size:13px;line-height:1.5}
  @media print{body{background:#fff}.page{margin:0;border:0;border-radius:0}.print{display:none}}
</style>
</head>
<body>
  <main class="page">
    <div class="header">
      <div>
        <h1>${this.escapeHtml(title)}</h1>
        <p class="subtitle">${this.escapeHtml(subtitle)}</p>
      </div>
      <button class="print" onclick="window.print()">Imprimir</button>
    </div>
    ${sectionsHtml}
  </main>
</body>
</html>`);
  }

  private buildCalculationSectionHtml(section: CalculationSection): string {
    const rowsHtml = section.rows?.length
      ? `<table><tbody>${section.rows.map(row => `<tr><td>${this.escapeHtml(row.label)}</td><td>${this.escapeHtml(row.value)}</td></tr>`).join('')}</tbody></table>`
      : '';
    const formulasHtml = section.formulas?.length
      ? `<div class="formulas">${section.formulas.map(formula => `<div>${this.escapeHtml(formula)}</div>`).join('')}</div>`
      : '';
    const notesHtml = section.notes?.length
      ? `<ul class="notes">${section.notes.map(note => `<li>${this.escapeHtml(note)}</li>`).join('')}</ul>`
      : '';
    return `<section><h2>${this.escapeHtml(section.title)}</h2>${rowsHtml}${formulasHtml}${notesHtml}</section>`;
  }

  private escapeHtml(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private fmt(v: number | null | undefined, dec = 2): string {
    if (v == null || !Number.isFinite(v)) return '-';
    return v.toLocaleString('pt-BR', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  }

  private toNumber(value: unknown, fallback = 0): number {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }
}
