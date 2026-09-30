import type { PrimaryReport, PrimaryReportSection } from './primary-report';
import type { PrimarySequenceItem } from './primary-report-content';

/** Escapa antes de inserir: texto do usuário nunca vira marcação. */
function escape(value: string): string {
  return value.replace(/[&<>"']/g, char =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char] as string));
}

/**
 * Capítulos do relatório, na ordem do programa de squeeze e tampão: identificação,
 * poço, fluidos e volumes, sequência operacional, resultados, desenhos e, por fim,
 * convenções e alertas. As seções do relatório estruturado viram subseções N.M.
 */
const CHAPTERS: { title: string; match: (id: string) => boolean }[] = [
  { title: 'Identificação', match: id => id === 'identificacao' },
  { title: 'Poço', match: id => ['geometria', 'survey', 'caliper', 'dispositivos'].includes(id) },
  { title: 'Fluidos, volumes e programa', match: id => ['fluidos', 'volumes', 'programa'].includes(id) || id.startsWith('receita-') },
  { title: 'Sequência operacional', match: id => id === 'sequencia-operacional' },
  { title: 'Resultados', match: id => ['resultados', 'balanco', 'hidraulica', 'medicoes'].includes(id) },
];

/**
 * HTML do relatório, no desenho do relatório do squeeze e do tampão (títulos numerados
 * em azul, tabelas com rótulo em destaque e a sequência operacional em passos). O texto
 * corre entre páginas, porque tabelas de survey e de programa não têm tamanho fixo.
 * Impressão e preto e branco continuam legíveis: severidade e origem aparecem também
 * como texto, não apenas como cor.
 */
export function renderPrimaryReportHtml(report: PrimaryReport): string {
  const kv = (items: { label: string; value: string }[], columns: 2 | 4 = 2): string => {
    if (columns === 2) return `<table class="kv">${items.map(item =>
      `<tr><th>${escape(item.label)}</th><td>${escape(item.value)}</td></tr>`).join('')}</table>`;
    const rows: string[] = [];
    for (let i = 0; i < items.length; i += 2) {
      const [a, b] = [items[i], items[i + 1]];
      rows.push(`<tr><th>${escape(a.label)}</th><td>${escape(a.value)}</td>${b
        ? `<th>${escape(b.label)}</th><td>${escape(b.value)}</td>` : '<th></th><td></td>'}</tr>`);
    }
    return `<table class="kv kv--grid">${rows.join('')}</table>`;
  };
  const table = (headers: string[], body: string[][], className = 'data'): string => body.length
    ? `<table class="${className}"><thead><tr>${headers.map(header => `<th>${escape(header)}</th>`).join('')}</tr></thead>`
      + `<tbody>${body.map(row => `<tr>${row.map(cell => `<td>${escape(cell)}</td>`).join('')}</tr>`)
        .join('')}</tbody></table>`
    : '<p class="empty">Sem linhas para esta seção.</p>';
  const notes = (items?: string[]) => items?.length
    ? `<ul class="notes">${items.map(note => `<li>${escape(note)}</li>`).join('')}</ul>` : '';
  const sequence = (items: PrimarySequenceItem[]): string => `<ol class="sequence-list">${items.map(item => {
    const text = item.parts.map(part => part.strong ? `<strong>${escape(part.text)}</strong>` : escape(part.text)).join('');
    const embedded = item.table ? table(item.table.headers, item.table.rows, 'sequence-table') : '';
    const note = item.note ? `<div class="sequence-note">Observação: ${escape(item.note)}</div>` : '';
    return `<li class="sequence-item sequence-item--${item.kind}">${text}${embedded}${note}</li>`;
  }).join('')}</ol>`;
  const logo = report.document.clienteLogoImagem
    ? `<img class="chapter-logo" alt="Logo do cliente" src="${escape(report.document.clienteLogoImagem)}">` : '';
  const chapterTitle = (num: number, title: string) =>
    `<div class="chapter-title"><span class="num">${num}.</span><h1>${escape(title)}</h1>${logo}</div>`;

  // Seções nos capítulos; o que não tiver capítulo vai para as convenções, no fim.
  const grouped = CHAPTERS.map(chapter => ({ ...chapter, sections: report.sections.filter(s => chapter.match(s.id)) }));
  const rest = report.sections.filter(s => !CHAPTERS.some(chapter => chapter.match(s.id)));
  const subsection = (num: string, section: PrimaryReportSection, showTitle = true) => `
      <div class="subsection" id="${escape(section.id)}">
        ${showTitle ? `<div class="subtitle"><span class="num">${num}</span><h2>${escape(section.title)}</h2></div>` : ''}
        ${section.rows?.length ? kv(section.rows, section.id === 'identificacao' ? 4 : 2) : ''}
        ${section.table ? table(section.table.headers, section.table.rows) : ''}
        ${section.sequence ? sequence(section.sequence) : ''}
        ${notes(section.notes)}
      </div>`;
  let chapterNumber = 0;
  const index: { num: string; title: string; href: string; level: 1 | 2 }[] = [];
  const chapters = grouped.filter(chapter => chapter.sections.length).map(chapter => {
    const num = ++chapterNumber;
    index.push({ num: `${num}.`, title: chapter.title, href: `cap-${num}`, level: 1 });
    // Capítulo de uma seção só com o mesmo nome dispensa o subtítulo repetido.
    const single = chapter.sections.length === 1 && chapter.sections[0].title === chapter.title;
    const body = chapter.sections.map((section, i) => {
      if (!single) index.push({ num: `${num}.${i + 1}`, title: section.title, href: section.id, level: 2 });
      return subsection(`${num}.${i + 1}`, section, !single);
    }).join('');
    return `<section class="chapter" id="cap-${num}">${chapterTitle(num, chapter.title)}${body}</section>`;
  });

  // Um capítulo só, com os desenhos e gráficos uns embaixo dos outros; cada um inteiro na folha.
  if (report.visuals.length) {
    const num = ++chapterNumber;
    index.push({ num: `${num}.`, title: 'Desenhos e gráficos', href: `cap-${num}`, level: 1 });
    chapters.push(`<section class="chapter" id="cap-${num}">${chapterTitle(num, 'Desenhos e gráficos')}${report.visuals.map(visual => `
      <figure class="report-visual">
        <div class="visual-frame">${visual.svg}</div>
        <figcaption>${escape(visual.title)}</figcaption>
      </figure>`).join('')}
    </section>`);
  }

  const last = ++chapterNumber;
  const closing = [
    ...rest.map(section => ({ title: section.title, html: (n: string) => subsection(n, section) })),
    { title: 'Gráficos do relatório', html: (n: string) => subsection(n, { id: 'catalogo-graficos', title: 'Gráficos do relatório',
      table: { headers: ['Gráfico', 'Família', 'Eixos e unidades', 'Situação'],
        rows: report.charts.map(chart => [chart.title,
          chart.family === 'anexo' ? 'anexo (G1–G5)' : chart.family === 'complemento' ? 'complemento' : 'herdado do squeeze',
          chart.axes,
          chart.available ? 'disponível' : `indisponível — ${chart.unavailableReason ?? 'motivo não informado'}`]) } }) },
    { title: 'Instantes incluídos', html: (n: string) => subsection(n, { id: 'instantes', title: 'Instantes incluídos',
      table: { headers: ['Instante', 'Tempo (min)', 'Estágio', 'Motivo'],
        rows: report.snapshots.map(snapshot => [snapshot.label, snapshot.timeMin.toFixed(2), snapshot.stageId || '—',
          snapshot.reason === 'fim-de-estagio' ? 'fim de estágio (padrão)' : 'escolhido pelo usuário']) } }) },
    { title: 'Alertas e limitações', html: (n: string) => subsection(n, { id: 'alertas', title: 'Alertas e limitações',
      table: { headers: ['Severidade', 'Código', 'Mensagem', 'Estágio', 'Instante (min)'],
        rows: report.alerts.map(alert => [alert.severity, alert.code, alert.message,
          alert.stageId ?? '—', alert.timeMin === undefined ? '—' : alert.timeMin.toFixed(2)]) } }) },
  ];
  index.push({ num: `${last}.`, title: 'Convenções, alertas e observações', href: `cap-${last}`, level: 1 });
  closing.forEach((entry, i) => index.push({ num: `${last}.${i + 1}`, title: entry.title,
    href: rest[i]?.id ?? ['catalogo-graficos', 'instantes', 'alertas'][i - rest.length], level: 2 }));
  chapters.push(`<section class="chapter" id="cap-${last}">${chapterTitle(last, 'Convenções, alertas e observações')}
    ${closing.map((entry, i) => entry.html(`${last}.${i + 1}`)).join('')}
    <p class="conclusion">${escape(report.conclusion)}</p></section>`);

  const indexRows = index.map(entry => `<a class="indice-row indice-row--${entry.level}" href="#${escape(entry.href)}">`
    + `<span class="indice-number">${escape(entry.num)}</span><span class="indice-label">${escape(entry.title)}</span></a>`).join('');

  return `<!DOCTYPE html>
<html lang="pt-BR"><head><meta charset="utf-8">
<title>Cimentação primária — ${escape(report.revision.scenarioName)}</title>
<style>
  @page { margin: 16mm 18mm; size: A4 portrait; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: 'Arial Narrow', 'Arial Condensed Light', Arial, Helvetica, sans-serif; color: #111827;
    font-size: 9pt; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  h1, h2 { margin: 0; }
  td { overflow-wrap: anywhere; }
  tr { break-inside: avoid; }
  thead { display: table-header-group; }

  /* Capa */
  .cover { position: relative; min-height: 262mm; background: white; color: #1e3a5f; break-after: page; overflow: hidden;
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif; }
  .cover-accent { position: absolute; inset: 0 0 0 auto; width: 42%; background: linear-gradient(175deg,#1e3a5f 0%,#2d5a8e 45%,#3b7bc8 100%); clip-path: polygon(18% 0,100% 0,100% 100%,0 100%); }
  .cover-main { position: relative; width: 56%; padding: 12mm 6mm; }
  .cover-main h1 { font-size: 24pt; font-weight: 800; color: #0f172a; margin: 24mm 0 7mm; overflow-wrap: anywhere; line-height: 1.15; letter-spacing: -.02em; }
  .cover-main h2 { color: #2d5a8e; font-size: 12pt; margin: 6mm 0; }
  .cover-brand { font-size: 20pt; font-weight: 800; letter-spacing: 2px; color: #2d5a8e; }
  .cover-badge { display: inline-block; background: #eef6ff; color: #2d5a8e; padding: 5px 12px; border-radius: 99px; border: 1px solid #bde0ff;
    font-size: 8pt; font-weight: 700; letter-spacing: .1em; text-transform: uppercase; }
  .cover-info { position: absolute; right: 3%; top: 60mm; width: 29%; color: white; overflow-wrap: anywhere; font-size: 10pt; }
  .cover-info p { margin: 0 0 7mm; color: rgba(255,255,255,.85); }
  .cover-info strong { display: block; font-size: 11pt; color: white; }
  .cover img { max-width: 60mm; max-height: 24mm; object-fit: contain; background: white; padding: 2mm; }
  .cover table.kv th, .cover table.kv td { border: 0; border-bottom: 1px solid #eef2f7; background: white; padding: 2.2mm 0; font-size: 8.5pt; }
  .cover table.kv th { color: #64748b; font-weight: 500; width: 42%; }
  .cover .status { margin-top: 10mm; }

  /* Sumário */
  .document-index { break-after: page; }
  .index-title { font-size: 20pt; font-weight: 800; color: #0f172a; padding-bottom: 4mm; border-bottom: 2px solid #2d5a8e; margin-bottom: 6mm; }
  .indice-row { display: grid; grid-template-columns: 14mm 1fr; gap: 4mm; padding: 1.3mm 0; border-bottom: 1px solid #eef2f7;
    color: #1e293b; text-decoration: none; }
  .indice-row--1 { font-size: 10.5pt; font-weight: 700; padding-top: 2.6mm; }
  .indice-row--2 { font-size: 8.5pt; padding-left: 8mm; color: #334155; }
  .indice-number { color: #2d5a8e; font-weight: 800; }
  .report-state { margin-top: 8mm; }
  .draft { margin-top: 6mm; padding: 4mm 5mm; border: 1.5px solid #b45309; border-radius: 4px; color: #7c2d12; background: #fff7ed; font-size: 8.5pt; }
  .draft ul { margin: 2mm 0 0 5mm; padding: 0; }

  /* Capítulos: seguem na mesma folha quando cabem; o título não fica sozinho no pé. */
  .chapter { margin-top: 10mm; }
  .chapter-title { display: flex; align-items: baseline; gap: 7mm; border-top: 2px solid #2d5a8e; padding-top: 2mm;
    margin-bottom: 7mm; color: #2d5a8e; break-after: avoid; page-break-after: avoid; }
  tr, .kv, .sequence-list li { break-inside: avoid; page-break-inside: avoid; }
  .chapter-title .num, .chapter-title h1 { font-size: 15pt; font-weight: 700; letter-spacing: .01em; }
  .chapter-logo { margin-left: auto; max-width: 34mm; max-height: 12mm; object-fit: contain; align-self: center; }
  .subsection { margin: 0 0 7mm; }
  .subtitle { display: flex; align-items: baseline; gap: 5mm; margin-bottom: 3mm; color: #334155; break-after: avoid; }
  .subtitle .num { font-size: 8.5pt; font-weight: 700; }
  .subtitle h2 { font-size: 10pt; font-weight: 650; }

  /* Tabelas no desenho do relatório do squeeze: rótulo em destaque e borda escura */
  table { border-collapse: collapse; width: 100%; margin: 2mm 0 3mm; font-size: 8pt; }
  th, td { border: 1px solid #111827; padding: 1.6mm 2.4mm; text-align: left; vertical-align: top; }
  table.data th { background: #dceff4; font-weight: 700; color: #0f172a; }
  table.kv th { width: 34%; background: #dceff4; font-weight: 700; color: #0f172a; }
  table.kv--grid th { width: 17%; }
  table.kv--grid td { width: 33%; }

  /* Sequência operacional */
  .sequence-list { margin: 0; padding-left: 9mm; font-size: 9pt; line-height: 1.45; }
  .sequence-list li { padding-left: 2mm; margin-bottom: 3mm; }
  .sequence-list li::marker { font-weight: 700; color: #2d5a8e; }
  .sequence-list strong { font-weight: 800; }
  .sequence-item--stage { margin-top: 5mm; padding: 1.6mm 2.4mm; background: #eef6fb; border-left: 3px solid #2d5a8e; }
  .sequence-item--text { color: #334155; }
  .sequence-table { width: 150mm; max-width: 100%; margin: 2.5mm 0 1mm; font-size: 8pt; }
  .sequence-table th { background: transparent; font-style: italic; font-weight: 500; text-align: center; }
  .sequence-table td { text-align: center; }
  .sequence-table td:first-child { text-align: left; }
  .sequence-note { margin-top: 1mm; color: #475569; font-style: italic; font-size: 8.5pt; }

  .notes { margin: 1.5mm 0 3mm 5mm; padding: 0; font-size: 8pt; color: #475569; }
  .notes li { margin-bottom: .8mm; }
  .empty { font-size: 8.5pt; color: #64748b; font-style: italic; }
  .status { display: inline-block; padding: 1.4mm 4mm; border: 1.5px solid #2d5a8e; border-radius: 3px; color: #1e3a5f;
    font-weight: 700; font-size: 8.5pt; letter-spacing: .06em; }
  .conclusion { margin-top: 8mm; padding: 4mm 5mm; border: 1.5px solid #2d5a8e; border-radius: 4px; background: #eef6fb; font-size: 9pt; }

  /* Desenhos e gráficos: empilhados, dois por folha quando cabem, sem partir um ao meio. */
  .report-visual { margin: 0 0 7mm; break-inside: avoid; page-break-inside: avoid; }
  .visual-frame svg { width: 100%; height: auto; max-height: 118mm; display: block; }
  .report-visual figcaption { margin-top: 1.5mm; text-align: center; color: #2d5a8e; font-size: 8.5pt; font-weight: 650; }
  @media print { body { font-size: 9pt; } a { color: inherit; } }
</style></head>
<body>
  <div class="cover">
    <div class="cover-accent"></div>
    <div class="cover-main">
      <div class="cover-brand">BRASERV</div>
      <h1>${escape(report.document.documento || 'Cimentação Primária')}</h1>
      <span class="cover-badge">Programa de cimentação primária</span>
      <h2>${escape(report.document.cliente || 'Cliente não informado')}</h2>
      ${report.document.clienteLogoImagem ? '<img alt="Logo do cliente" src="' + escape(report.document.clienteLogoImagem) + '">' : ''}
      ${kv([{ label: 'Preparado para', value: report.document.preparadoPara || '—' }, { label: 'Preparado por', value: report.document.preparadoPor || '—' }, { label: 'Revisado por', value: report.document.revisadoPor || '—' }, { label: 'Data', value: report.document.data || '—' }, { label: 'Revisão', value: report.document.versao || '—' }])}
      <p class="status">${report.canIssue ? 'PROGRAMA DE OPERAÇÃO' : 'RASCUNHO — EMISSÃO FINAL BLOQUEADA'}</p>
    </div>
    <div class="cover-info"><p>Operador<strong>${escape(report.document.origem || '—')}</strong></p>
      <p>Poço<strong>${escape(report.document.poco || 'Não informado')}</strong></p>
      <p>Campo<strong>${escape(report.document.campo || '—')}</strong></p>
      <p>Sonda<strong>${escape(report.document.sonda || '—')}</strong></p>
      <p>Job #<strong>${escape(report.document.jobNum || '—')}</strong></p>
      <p>${escape(report.revision.scenarioName)}</p>
    </div>
  </div>
  <nav class="document-index">
    <h1 class="index-title">Sumário</h1>
    ${indexRows}
    <p class="report-state"><span class="status">${report.status === 'partial' ? 'RESULTADO PARCIAL' : 'RESULTADO COMPLETO'}</span></p>
    ${report.canIssue ? '' : '<div class="draft"><strong>RASCUNHO — EMISSÃO FINAL BLOQUEADA</strong><ul>' + report.blockingReasons.map(reason => '<li>' + escape(reason) + '</li>').join('') + '</ul></div>'}
  </nav>
  ${chapters.join('')}
</body></html>`;
}
