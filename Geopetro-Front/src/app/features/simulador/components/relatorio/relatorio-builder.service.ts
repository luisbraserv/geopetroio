import { Injectable } from '@angular/core';
import { RelatorioCapaData, RelatorioBombeioRow } from './relatorio-capa-modal.component';

/** Um bloco do texto técnico: o paginador põe quantos couberem em cada folha, sem quebrar o bloco. */
interface FlowBlock { html: string; keepNext?: boolean; toc?: string; figure?: boolean }
/** Tópico numerado do relatório: uma linha no sumário e os blocos em sequência. */
export interface RelatorioTopico { id: string; numero: number; titulo: string; blocos: FlowBlock[] }

/**
 * Paginação no navegador: depois de carregar imagens e fontes, distribui os blocos do texto
 * técnico em folhas A4, tantos quantos couberem, sem deixar um título sozinho no pé da folha;
 * o tópico que continua ganha "(continuação)". Depois, põe no sumário a página de cada tópico.
 * Sem o script, o texto fica corrido numa folha só, e a impressão quebra as páginas.
 */
const PAGINATOR_SCRIPT = `(function(){
  function paginate(){
    var flow=document.getElementById('tech-flow'); var tpl=document.getElementById('tech-page-template');
    if(!flow||!tpl||!tpl.content) return;
    var blocks=Array.prototype.slice.call(flow.children); var body=null;
    function newPage(){ var page=tpl.content.firstElementChild.cloneNode(true); flow.parentNode.insertBefore(page,flow); body=page.querySelector('.tech-page-body'); }
    function over(){ return body.scrollHeight>body.clientHeight+1; }
    newPage();
    blocks.forEach(function(b){
      body.appendChild(b);
      if(!over()||body.children.length<2) return;
      body.removeChild(b);
      var moving=[b];
      while(body.lastElementChild&&body.lastElementChild.getAttribute('data-keep')==='next'&&body.children.length>1){ moving.unshift(body.lastElementChild); body.removeChild(body.lastElementChild); }
      newPage();
      var first=moving[0];
      if(!first.hasAttribute('data-toc')&&first.getAttribute('data-topic')){ var c=document.createElement('div'); c.className='flow-continuation'; c.textContent=first.getAttribute('data-topic')+' (continua\u00e7\u00e3o)'; body.appendChild(c); }
      moving.forEach(function(m){ body.appendChild(m); });
    });
    flow.parentNode.removeChild(flow);
    var pages=Array.prototype.slice.call(document.querySelectorAll('.page'));
    Array.prototype.forEach.call(document.querySelectorAll('.tech-page [data-toc]'),function(el){
      var n=pages.indexOf(el.closest('.page'))+1;
      var cell=document.querySelector('.indice-page-num[data-toc="'+el.getAttribute('data-toc')+'"]');
      if(cell&&n>0) cell.textContent=String(n);
    });
    document.body.setAttribute('data-paginated','true');
  }
  function ready(){
    var waits=Array.prototype.slice.call(document.images).map(function(img){ return img.complete?null:new Promise(function(r){ img.addEventListener('load',r); img.addEventListener('error',r); }); });
    if(document.fonts&&document.fonts.ready) waits.push(document.fonts.ready);
    Promise.all(waits).then(paginate,paginate);
  }
  if(document.readyState==='complete') ready(); else window.addEventListener('load',ready);
})();`;

@Injectable({ providedIn: 'root' })
export class RelatorioBuilderService {

  openInNewTab(html: string): void {
    const win = window.open('', '_blank');
    if (!win) return;
    win.document.open();
    win.document.write(html);
    win.document.close();
  }

  downloadAsWord(html: string, filename = 'relatorio', preserveStyles = false): void {
    const wordHtml = `
<!DOCTYPE html>
<html xmlns:o="urn:schemas-microsoft-com:office:office"
      xmlns:w="urn:schemas-microsoft-com:office:word"
      xmlns="http://www.w3.org/TR/REC-html40">
<head>
  <meta charset="utf-8">
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <!--[if gte mso 9]><xml>
    <w:WordDocument>
      <w:View>Print</w:View>
      <w:Zoom>90</w:Zoom>
      <w:DoNotOptimizeForBrowser/>
    </w:WordDocument>
  </xml><![endif]-->
  <style>
    @page { margin: 2cm 2.5cm; size: A4; }
    body { font-family: Arial, sans-serif; font-size: 10pt; color: #1e293b; }
    table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; }
    th, td { border: 1px solid #cbd5e1; padding: 5pt 8pt; font-size: 9pt; text-align: left; }
    th { background: #f1f5f9; font-weight: 700; }
    h1 { font-size: 14pt; color: #1e3a5f; margin-bottom: 6pt; }
    h2 { font-size: 12pt; color: #1e3a5f; margin-bottom: 4pt; }
    h3 { font-size: 11pt; color: #334155; margin-bottom: 4pt; }
    p, li { font-size: 10pt; line-height: 1.5; margin-bottom: 4pt; }
    ol, ul { margin-left: 16pt; }
    strong { font-weight: 700; }
    .page { page-break-after: always; padding: 0; }
    .page:last-child { page-break-after: avoid; }
    img { max-width: 16cm; }
  </style>
${preserveStyles ? (html.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? []).join('\n') : ''}
</head>
<body>
${this.extractBodyContent(html)}
</body>
</html>`;

    const blob = new Blob(['﻿', wordHtml], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${filename}.doc`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  private extractBodyContent(html: string): string {
    const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    return match?.[1] ?? html;
  }

  buildCapa(d: RelatorioCapaData): string {
    const reportData = this.withVazoesBombeio(d);
    const dataFmt = d.data
      ? new Date(d.data + 'T12:00:00').toLocaleDateString('pt-BR')
      : '';
    const op = d.operacao || 'SQUEEZE';
    const base = window.location.origin;
    const logoUrl = `${base}/logo.png`;
    const topicos = this.buildTopicos(reportData, op, dataFmt);
    const indiceRows = this.buildIndiceRows(topicos);
    const technicalPages = this.buildTechnicalFlow(reportData, topicos);
    const clienteLogo = this.buildClienteLogoImg(reportData);

    const fichaRows = [
      ...(d.faseOperacao ? [{ label: 'Fase da operação', value: this.escape(d.faseOperacao) }] : []),
      { label: 'Cliente',        value: `<span class="v-cliente">${d.cliente || '—'}</span>` },
      { label: 'Preparado para', value: d.preparadoPara || '—' },
      { label: 'Documento',      value: d.documento || '—' },
      { label: 'Preparado por',  value: d.preparadoPor || '—' },
      { label: 'Revisado por',   value: d.revisadoPor || '—' },
      { label: 'Data',           value: dataFmt },
      { label: 'Versão',         value: `<span class="v-versao">${d.versao || '01'}</span>` },
    ].map(r => `<tr><td class="fl">${r.label}</td><td class="fv">${r.value}</td></tr>`).join('');

    return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<base href="${base}/">
<title>${d.documento || 'Relatório BRASERV'}</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}

@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');

@page{size:A4;margin:0}

body{
  font-family:'Inter','Segoe UI',Arial,sans-serif;
  background:#f0f4f8;
  display:flex;
  flex-direction:column;
  align-items:center;
  padding:20px 0 40px;
  -webkit-print-color-adjust:exact;
  print-color-adjust:exact;
}

/* ── FOLHA A4 ── */
.page{
  width:210mm;
  height:297mm;
  background:#fff;
  position:relative;
  overflow:hidden;
  box-shadow:0 4px 40px rgba(0,0,0,.18);
  margin-bottom:20px;
  page-break-after:always;
}

/* ═══════════════ CAPA ═══════════════ */

/* Bloco azul diagonal no topo direito */
.cover-accent{
  position:absolute;
  top:0;right:0;
  width:88mm;
  height:297mm;
  background:linear-gradient(175deg,#1e3a5f 0%,#2d5a8e 45%,#3b7bc8 100%);
  clip-path:polygon(18% 0,100% 0,100% 100%,0 100%);
  z-index:1;
}

/* Círculo decorativo */
.cover-circle{
  position:absolute;
  bottom:-30mm;
  right:20mm;
  width:100mm;
  height:100mm;
  border-radius:50%;
  background:rgba(255,255,255,.06);
  z-index:2;
}
.cover-circle-2{
  position:absolute;
  top:60mm;
  right:48mm;
  width:40mm;
  height:40mm;
  border-radius:50%;
  background:rgba(255,255,255,.08);
  z-index:2;
}

/* Info no bloco azul */
.cover-info{
  position:absolute;
  top:0;right:0;
  width:72mm;
  height:297mm;
  z-index:3;
  display:flex;
  flex-direction:column;
  justify-content:center;
  padding:0 22px;
  color:#fff;
}
.cover-info-origin{
  font-size:8pt;
  font-weight:700;
  letter-spacing:.12em;
  text-transform:uppercase;
  color:rgba(255,255,255,.6);
  margin-bottom:14px;
}
.cover-info-row{
  font-size:10pt;
  font-weight:400;
  color:rgba(255,255,255,.92);
  line-height:1.7;
}
.cover-info-row strong{
  font-weight:700;
  color:#fff;
  font-size:11pt;
}
.cover-info-divider{
  width:36px;
  height:2px;
  background:rgba(255,255,255,.3);
  border-radius:1px;
  margin:16px 0;
}
.cover-info-date{
  font-size:9pt;
  color:rgba(255,255,255,.6);
  margin-top:20px;
}

/* Conteúdo principal (esquerda) */
.cover-main{
  position:absolute;
  top:0;left:0;
  width:138mm;
  height:297mm;
  z-index:3;
  display:flex;
  flex-direction:column;
  padding:22mm 16mm 14mm 18mm;
}

.cover-logo{
  height:36px;
  object-fit:contain;
  object-position:left;
  display:block;
  margin-bottom:auto;
}

.cover-badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  background:#eef6ff;
  color:#2d5a8e;
  font-size:8pt;
  font-weight:700;
  letter-spacing:.1em;
  text-transform:uppercase;
  padding:5px 12px;
  border-radius:99px;
  margin-bottom:8mm;
  width:fit-content;
  border:1px solid #bde0ff;
}

.cover-title{
  font-size:26pt;
  font-weight:800;
  color:#0f172a;
  line-height:1.15;
  letter-spacing:-.02em;
  margin-bottom:5mm;
}
.cover-title span{
  color:#2d5a8e;
}

.cover-subtitle{
  font-size:10.5pt;
  color:#64748b;
  font-weight:400;
  line-height:1.5;
  margin-bottom:auto;
}

/* Linha separadora */
.cover-rule{
  height:2px;
  background:linear-gradient(90deg,#2d5a8e,#bde0ff 60%,transparent);
  border-radius:1px;
  margin:10mm 0 6mm;
}

.cover-meta{
  display:flex;
  gap:18px;
}
.cover-meta-item{
  display:flex;
  flex-direction:column;
  gap:2px;
}
.cover-meta-label{
  font-size:7.5pt;
  font-weight:700;
  letter-spacing:.08em;
  text-transform:uppercase;
  color:#94a3b8;
}
.cover-meta-value{
  font-size:9.5pt;
  font-weight:600;
  color:#1e293b;
}

/* Rodapé */
.cover-footer{
  position:absolute;
  bottom:0;left:0;
  width:138mm;
  padding:5mm 18mm;
  border-top:1px solid #e2e8f0;
  z-index:4;
  display:flex;
  align-items:center;
  justify-content:space-between;
}
.cover-footer-brand{
  font-size:8pt;
  font-weight:800;
  color:#2d5a8e;
  letter-spacing:.12em;
  text-transform:uppercase;
}
.cover-footer-copy{
  font-size:7.5pt;
  color:#94a3b8;
}

/* Fonte de todas as páginas após a capa (ficha, índice, técnicas). A capa
   mantém a fonte do body (Inter). */
.ficha-page,.indice-page,.tech-page{
  font-family:'Arial Condensed Light','Arial Narrow',Arial,sans-serif;
}

/* ═══════════════ FICHA ═══════════════ */
.ficha-page{
  padding:24mm 20mm 20mm;
}
.ficha-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8mm;
  padding-bottom:5mm;
  border-bottom:2px solid #2d5a8e;
  margin-bottom:8mm;
}
.ficha-header img{height:28px;object-fit:contain}
.ficha-header-right{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8mm;
  text-align:right;
  font-size:8.5pt;
}
.ficha-header-text{min-width:0}
.report-client-logo{
  display:block;
  max-width:34mm;
  max-height:14mm;
  object-fit:contain;
}
.fh-label{font-size:7.5pt;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#4291e1}
.fh-value{color:#334155;margin-top:2px}

.ficha-title{
  font-size:14pt;font-weight:700;color:#0f172a;margin-bottom:8mm;
}

table.ficha{width:100%;border-collapse:collapse;font-size:10pt}
table.ficha tr{border-bottom:1px solid #f1f5f9}
table.ficha tr:last-child{border-bottom:none}
td.fl{
  width:36%;padding:10px 14px 10px 14px;
  color:#64748b;font-weight:500;vertical-align:top;
}
td.fv{
  padding:10px 14px;color:#0f172a;font-weight:400;vertical-align:top;
}
.v-cliente{font-size:1.08em;font-weight:700;text-transform:uppercase;color:#0f172a}
.v-versao{color:#2d5a8e;font-weight:700}

.ficha-wrap{
  border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;
}

/* Indice */
.indice-page{
  padding:18mm 16mm;
}
.indice-header{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:8mm;
  padding-bottom:5mm;
  border-bottom:2px solid #2d5a8e;
  margin-bottom:10mm;
}
.indice-header img{height:28px;object-fit:contain}
.indice-header-right{
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:8mm;
  text-align:right;
}
.indice-kicker{
  font-size:7.5pt;
  font-weight:700;
  letter-spacing:.1em;
  text-transform:uppercase;
  color:#4291e1;
  text-align:right;
}
.indice-title{
  font-size:21pt;
  font-weight:800;
  color:#0f172a;
  margin-bottom:4mm;
}
.indice-subtitle{
  font-size:9pt;
  color:#64748b;
  margin-bottom:10mm;
}
.indice-list{
  border-top:1px solid #dbe4ef;
}
.indice-row{
  display:grid;
  grid-template-columns:12mm 1fr 18mm;
  align-items:baseline;
  gap:5mm;
  padding:4.2mm 0;
  border-bottom:1px solid #eef2f7;
}
.indice-number{
  font-size:9pt;
  font-weight:800;
  color:#2d5a8e;
}
.indice-label{
  display:flex;
  align-items:baseline;
  gap:3mm;
  min-width:0;
  font-size:10.5pt;
  font-weight:650;
  color:#1e293b;
}
.indice-label::after{
  content:"";
  flex:1;
  border-bottom:1px dotted #cbd5e1;
  transform:translateY(-2px);
}
.indice-page-num{
  font-size:10pt;
  font-weight:700;
  color:#475569;
  text-align:right;
}
.indice-note{
  position:absolute;
  left:16mm;
  right:16mm;
  bottom:15mm;
  padding-top:4mm;
  border-top:1px solid #e2e8f0;
  color:#94a3b8;
  font-size:8pt;
  line-height:1.5;
}

/* Corpo tecnico */
.tech-page{
  padding:16mm 18mm;
  color:#111827;
  font-family:'Arial Condensed Light','Arial Narrow',Arial,sans-serif;
}
/* Com o logo do cliente no canto, o texto começa abaixo dele. */
.tech-page--client-logo{
  padding-top:27mm;
}
.tech-page-body{
  height:100%;
  overflow:hidden;
}
/* Texto técnico antes da paginação (ou sem o script): uma folha corrida. */
.tech-flow{
  width:210mm;
  background:#fff;
  padding:16mm 18mm;
  box-shadow:0 4px 40px rgba(0,0,0,.18);
  margin-bottom:20px;
  color:#111827;
  font-family:'Arial Condensed Light','Arial Narrow',Arial,sans-serif;
}
.flow-block{
  break-inside:avoid;
  page-break-inside:avoid;
}
/* Um tópico que começa no meio da folha abre um respiro acima do título. */
.flow-topic{
  margin-top:8mm;
}
.tech-page-body > .flow-topic:first-child,
.tech-flow > .flow-topic:first-child{
  margin-top:0;
}
.flow-continuation{
  margin-bottom:5mm;
  padding-bottom:1.5mm;
  border-bottom:1px solid #e2e8f0;
  color:#64748b;
  font-size:8.5pt;
  font-weight:600;
}
.report-figure{
  margin:2mm 0 6mm;
}
.report-figure img{
  display:block;
  margin:0 auto;
  width:100%;
  max-width:165mm;
  max-height:215mm;
  object-fit:contain;
  border:1px solid #e2e8f0;
  border-radius:4px;
}
.report-figure figcaption{
  text-align:center;
  margin-top:2mm;
  color:#2d5a8e;
  font-size:9.5pt;
  font-weight:650;
}
.tech-client-logo{
  position:absolute;
  top:10mm;
  right:18mm;
  max-width:34mm;
  max-height:14mm;
  object-fit:contain;
}
.tech-section-title{
  display:flex;
  align-items:baseline;
  gap:7mm;
  margin-bottom:6mm;
  padding-bottom:2mm;
  border-bottom:2px solid #2d5a8e;
  color:#2d5a8e;
}
.tech-section-title .num{
  font-size:15pt;
  font-weight:700;
}
.tech-section-title h1{
  font-size:15pt;
  font-weight:700;
  letter-spacing:.01em;
}
.section-continuation{
  margin-left:auto;
  color:#64748b;
  font-size:8.5pt;
  font-weight:600;
}
.tech-subsection{
  margin:0 0 7mm;
}
.tech-subtitle{
  display:flex;
  align-items:baseline;
  gap:5mm;
  margin-bottom:4mm;
  color:#334155;
}
.tech-subtitle .num{
  font-size:8.5pt;
  font-weight:700;
}
.tech-subtitle h2{
  font-size:9.5pt;
  font-weight:650;
}
.tech-list{
  margin-left:15mm;
  font-size:10pt;
  line-height:1.65;
}
.well-table{
  width:100%;
  border-collapse:collapse;
  margin-top:3mm;
  font-size:7.8pt;
}
.well-table td{
  border:1px solid #111827;
  padding:2.1mm 2.6mm;
  vertical-align:middle;
}
.well-table .label{
  width:17%;
  background:#dceff4;
  font-weight:700;
  color:#0f172a;
}
.well-table .value{
  width:33%;
  color:#0f172a;
}
.mechanical-wrap{
  width:100%;
  display:flex;
  justify-content:center;
  align-items:center;
  margin-top:4mm;
}
.mechanical-img{
  max-width:100%;
  max-height:215mm;
  object-fit:contain;
  border:1px solid #111827;
}
.mechanical-empty{
  width:100%;
  min-height:60mm;
  display:grid;
  place-items:center;
  border:1px dashed #94a3b8;
  color:#64748b;
  font-size:9pt;
  background:#f8fafc;
}
.secao-texto{
  font-size:9pt;
  line-height:1.6;
  color:#1e293b;
  white-space:pre-wrap;
  margin:4mm 0;
}
.secao-figuras{
  display:flex;
  flex-direction:column;
  gap:6mm;
  margin-top:4mm;
}
.secao-figura{
  display:flex;
  flex-direction:column;
  align-items:flex-start;
  gap:2mm;
  width:100%;
}
.secao-img{
  width:100%;
  max-height:200mm;
  object-fit:contain;
  border:1px solid #e2e8f0;
}
.secao-figura figcaption{
  font-size:7pt;
  color:#64748b;
}
.operation-table{
  border-collapse:collapse;
  margin:4mm auto 8mm;
  font-size:8.5pt;
  color:#111827;
}
.operation-table th,
.operation-table td{
  border:1px solid #111827;
  padding:2.2mm 3mm;
  text-align:center;
  vertical-align:middle;
}
.operation-table th{
  background:#d9d9d9;
  font-weight:500;
}
.operation-table td:first-child{
  text-align:left;
  min-width:42mm;
}
.operation-table--temp td:first-child{
  min-width:42mm;
}
.sequence-list{
  margin:0;
  padding-left:9mm;
  font-size:8.5pt;
  line-height:1.38;
  color:#111827;
}
.sequence-list li{
  padding-left:2mm;
  margin-bottom:3.2mm;
}
.sequence-list li::marker{
  font-weight:700;
}
.sequence-list strong{
  font-weight:800;
}
.sequence-sublist{
  margin:1.5mm 0 0 0;
  padding-left:6mm;
  list-style:none;
}
.sequence-sublist li{
  position:relative;
  margin-bottom:1.2mm;
  padding-left:4mm;
}
.sequence-sublist li::before{
  content:"\\27A2";
  position:absolute;
  left:0;
}
.sequence-bullets{
  margin:1.5mm 0 0 0;
  padding-left:7mm;
}
.sequence-bullets li{
  margin-bottom:1.2mm;
}
.sequence-table{
  width:148mm;
  margin:2.5mm 0 3mm;
  border-collapse:collapse;
  font-size:8pt;
}
.sequence-table th,
.sequence-table td{
  border:1px solid #111827;
  padding:1.2mm 2mm;
  text-align:center;
}
.sequence-table th{
  font-style:italic;
  font-weight:500;
}
.sequence-table td:first-child{
  text-align:center;
}
.sequence-table--recipe{
  width:148mm;
}
.sequence-table--recipe td:first-child{
  text-align:left;
}

/* Print */
@media print{
  body{background:#fff;padding:0}
  .page,.tech-flow{box-shadow:none;margin:0}
  .no-print{display:none!important}
}

/* Barra de impressão (só tela) */
.print-bar{
  width:210mm;
  display:flex;
  align-items:center;
  justify-content:flex-end;
  gap:10px;
  margin-bottom:12px;
}
.btn-print{
  display:inline-flex;align-items:center;gap:7px;
  padding:9px 20px;border:none;border-radius:8px;
  background:#2d5a8e;color:#fff;font-size:.88rem;
  font-weight:600;cursor:pointer;font-family:inherit;
  box-shadow:0 2px 8px rgba(45,90,142,.3);
  transition:background .15s;
}
.btn-print:hover{background:#1e3a5f}
.btn-docx{
  display:inline-flex;align-items:center;gap:7px;
  padding:9px 20px;border:none;border-radius:8px;
  background:#1d6f42;color:#fff;font-size:.88rem;
  font-weight:600;cursor:pointer;font-family:inherit;
  box-shadow:0 2px 8px rgba(29,111,66,.3);
  transition:background .15s;
}
.btn-docx:hover{background:#155232}
.btn-docx:disabled{background:#6b9e82;cursor:wait}
</style>
<script>
function _loadScript(src){
  return new Promise(function(resolve,reject){
    if(document.querySelector('script[src="'+src+'"]')){resolve();return;}
    var s=document.createElement('script');
    s.src=src;s.onload=resolve;s.onerror=reject;
    document.head.appendChild(s);
  });
}

async function _downloadDocx(){
  var btn=document.getElementById('btn-docx');
  var orig=btn?btn.innerHTML:'';
  try{
    if(btn){btn.disabled=true;btn.textContent='Gerando DOCX...';}

    await Promise.all([
      _loadScript('https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js'),
      _loadScript('https://cdn.jsdelivr.net/npm/docx@8.5.0/build/index.umd.js'),
    ]);

    var D=window.docx;
    var pages=Array.from(document.querySelectorAll('.page'));
    var SCALE=1.5;
    // A4 usable width: 210mm - 2*15mm = 180mm = 680px at 96dpi
    var A4_USE_W=680;
    var children=[];

    for(var i=0;i<pages.length;i++){
      if(btn) btn.textContent='Gerando DOCX... ('+(i+1)+'/'+pages.length+')';
      var canvas=await html2canvas(pages[i],{
        scale:SCALE,useCORS:true,backgroundColor:'#ffffff',logging:false,
        width:pages[i].scrollWidth,height:pages[i].scrollHeight,
      });
      var dataUrl=canvas.toDataURL('image/png');
      var b64=dataUrl.split(',')[1];
      var bin=atob(b64);
      var bytes=new Uint8Array(bin.length);
      for(var j=0;j<bin.length;j++) bytes[j]=bin.charCodeAt(j);

      var natW=canvas.width/SCALE;
      var natH=canvas.height/SCALE;
      var ratio=Math.min(1,A4_USE_W/natW);
      var imgW=Math.round(natW*ratio);
      var imgH=Math.round(natH*ratio);

      if(i>0){
        children.push(new D.Paragraph({pageBreakBefore:true,children:[]}));
      }
      children.push(new D.Paragraph({
        alignment:D.AlignmentType?D.AlignmentType.CENTER:'center',
        children:[new D.ImageRun({data:bytes,transformation:{width:imgW,height:imgH}})],
      }));
    }

    var doc=new D.Document({
      sections:[{
        properties:{page:{
          size:{width:11906,height:16838},
          margin:{top:851,right:851,bottom:851,left:851},
        }},
        children:children,
      }],
    });

    var blob=await D.Packer.toBlob(doc);
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download=(document.title||'relatorio')+'.docx';
    document.body.appendChild(a);a.click();document.body.removeChild(a);
    setTimeout(function(){URL.revokeObjectURL(url);},2000);
  }catch(e){
    alert('Erro ao gerar DOCX: '+e.message);
    console.error(e);
  }finally{
    if(btn){btn.disabled=false;btn.innerHTML=orig;}
  }
}
</script>
</head>
<body>

<div class="print-bar no-print">
  <button id="btn-docx" class="btn-docx" onclick="_downloadDocx()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
    Baixar DOCX (.docx)
  </button>
  <button class="btn-print" onclick="window.print()">
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
    Imprimir / Salvar PDF
  </button>
</div>

<!-- ══════════════════ CAPA ══════════════════ -->
<div class="page">
  <div class="cover-accent"></div>
  <div class="cover-circle"></div>
  <div class="cover-circle-2"></div>

  <div class="cover-info">
    <div class="cover-info-origin">${d.origem || 'BRASERV'}</div>
    <div class="cover-info-row"><strong>Poço</strong></div>
    <div class="cover-info-row">${d.poco || '—'}</div>
    <div class="cover-info-divider"></div>
    <div class="cover-info-row">${op}${d.campo ? '<br>' + d.campo : ''}</div>
    ${d.sonda ? `<div class="cover-info-row">Sonda: ${d.sonda}</div>` : ''}
    <div class="cover-info-date">${dataFmt}</div>
  </div>

  <div class="cover-main">
    <img class="cover-logo" src="${logoUrl}" alt="BRASERV" />

    <div>
      <div class="cover-badge">
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
        Cimentação ${op}
      </div>
      <div class="cover-title">
        Programa de<br><span>Cimentação</span><br>${op}
      </div>
      <div class="cover-subtitle">
        ${d.poco ? `Poço ${d.poco}` : ''}${d.campo ? ` &mdash; ${d.campo}` : ''}
      </div>
    </div>

    <div class="cover-rule"></div>

    <div class="cover-meta">
      ${d.preparadoPor ? `<div class="cover-meta-item"><div class="cover-meta-label">Preparado por</div><div class="cover-meta-value">${d.preparadoPor}</div></div>` : ''}
      ${d.versao ? `<div class="cover-meta-item"><div class="cover-meta-label">Versão</div><div class="cover-meta-value">${d.versao}</div></div>` : ''}
      ${dataFmt ? `<div class="cover-meta-item"><div class="cover-meta-label">Data</div><div class="cover-meta-value">${dataFmt}</div></div>` : ''}
    </div>
  </div>

  <div class="cover-footer">
    <span class="cover-footer-brand">BRASERV</span>
    <span class="cover-footer-copy">Programa de Cimentação &copy; ${new Date().getFullYear()}</span>
  </div>
</div>

<!-- ══════════════════ FICHA ══════════════════ -->
<div class="page ficha-page">

  <div class="ficha-header">
    <img src="${logoUrl}" alt="BRASERV" />
    <div class="ficha-header-right">
      <div class="ficha-header-text">
      <div class="fh-label">Cimentação ${op}</div>
      <div class="fh-value">${d.origem || ''}</div>
      </div>
      ${clienteLogo}
    </div>
  </div>

  <div class="ficha-title">Cimentação ${op}</div>

  <div class="ficha-wrap">
    <table class="ficha">
      <tbody>${fichaRows}</tbody>
    </table>
  </div>

</div>

<!-- SUMARIO -->
<div class="page indice-page">
  <div class="indice-header">
    <img src="${logoUrl}" alt="BRASERV" />
    <div class="indice-header-right">
    <div class="indice-kicker">Cimenta&ccedil;&atilde;o ${op}</div>
      ${clienteLogo}
    </div>
  </div>

  <div class="indice-title">Sum&aacute;rio</div>
  <div class="indice-subtitle">
    T&oacute;picos do programa de cimenta&ccedil;&atilde;o e a p&aacute;gina em que cada um come&ccedil;a.
  </div>

  <div class="indice-list">
    ${indiceRows}
  </div>

  <div class="indice-note">
    Numera&ccedil;&atilde;o calculada automaticamente conforme as se&ccedil;&otilde;es inclu&iacute;das no relat&oacute;rio.
  </div>
</div>

${technicalPages}

<script>${PAGINATOR_SCRIPT}</script>
</body>
</html>`;
  }

  /**
   * Tópicos do texto técnico, numerados na ordem em que aparecem. Cada gráfico não é um
   * tópico: todos entram em "Simulação", uns embaixo dos outros.
   */
  buildTopicos(d: RelatorioCapaData, op: string, dataFmt: string): RelatorioTopico[] {
    const esquematicos = (d.esquematicoImages || []).filter(item => item.imagem);
    const graficos = (d.graficosOperacionaisImages || []).filter(item => item.imagem);
    const specs: { id: string; titulo: string; blocos: (n: number) => FlowBlock[] }[] = [
      { id: 'cimentacao', titulo: `Cimentação ${op.toUpperCase()}`, blocos: n => this.cimentacaoBlocks(d, n) },
      { id: 'poco', titulo: 'Poço', blocos: n => this.pocoBlocks(d, n, dataFmt) },
      { id: 'operacao', titulo: 'Operação', blocos: n => this.operationBlocks(d, n) },
      ...(esquematicos.length ? [{ id: 'esquematico', titulo: 'Esquemático de bombeio',
        blocos: () => esquematicos.map(item => this.figure(item.imagem, item.label, item.label)) }] : []),
      ...(graficos.length ? [{ id: 'simulacao', titulo: 'Simulação',
        blocos: () => graficos.map(item => this.figure(item.imagem, item.label)) }] : []),
      { id: 'sequencia', titulo: 'Sequência operacional', blocos: () => this.sequenceBlocks(d) },
      ...(d.secoesPersonalizadas || []).map((sec, i) => ({ id: `secao-${i + 1}`, titulo: sec.titulo || 'Seção personalizada',
        blocos: () => [
          ...(sec.texto ? [{ html: `<p class="secao-texto">${this.escape(sec.texto).replace(/\n/g, '<br>')}</p>` }] : []),
          ...(sec.imagens || []).map(img => this.figure(img.data, img.nome)),
        ] })),
    ];
    return specs.map((spec, i) => {
      const numero = i + 1;
      return { id: spec.id, numero, titulo: spec.titulo, blocos: [
        { toc: spec.id, keepNext: true, html: `
    <div class="tech-section-title">
      <span class="num">${numero}.</span>
      <h1>${this.escape(spec.titulo)}</h1>
    </div>` },
        ...spec.blocos(numero),
      ] };
    });
  }

  /** O texto técnico em blocos, e a folha que o paginador copia para cada página. */
  private buildTechnicalFlow(d: RelatorioCapaData, topicos: RelatorioTopico[]): string {
    const blocks = topicos.flatMap(topico => topico.blocos.map(block => {
      const classes = ['flow-block', block.toc ? 'flow-topic' : '', block.figure ? 'flow-figure' : ''].filter(Boolean).join(' ');
      return `<div class="${classes}" data-topic="${this.escape(`${topico.numero}. ${topico.titulo}`)}"`
        + `${block.keepNext ? ' data-keep="next"' : ''}${block.toc ? ` data-toc="${block.toc}"` : ''}>${block.html}</div>`;
    })).join('\n');
    return `
<template id="tech-page-template"><div class="${this.techPageClass(d)}">${this.buildTechClienteLogo(d)}<div class="tech-page-body"></div></div></template>
<div id="tech-flow" class="tech-flow">
${blocks}
</div>`;
  }

  private subtitle(num: string, title: string): FlowBlock {
    return { keepNext: true, html: `
    <div class="tech-subtitle">
      <span class="num">${num}</span>
      <h2>${title}</h2>
    </div>` };
  }

  private figure(src: string, alt: string, caption?: string): FlowBlock {
    return { figure: true, html: `
    <figure class="report-figure">
      <img src="${src}" alt="${this.escape(alt)}" />
      ${caption ? `<figcaption>${this.escape(caption)}</figcaption>` : ''}
    </figure>` };
  }

  private cimentacaoBlocks(d: RelatorioCapaData, n: number): FlowBlock[] {
    return [this.subtitle(`${n}.1`, 'Objetivos principais'), { html: `
    <ul class="tech-list">
      <li>Isolar zonas intervalo: ${this.buildZoneText(d)}</li>
      ${this.buildObjetivosTampaoRows(d)}
    </ul>` }];
  }

  private pocoBlocks(d: RelatorioCapaData, n: number, dataFmt: string): FlowBlock[] {
    const titleOp = (d.operacao || 'SQUEEZE').toUpperCase();
    const job = this.escape(d.jobNum || (d.baseTampao ? `${titleOp} @ ${this.formatMeters(d.baseTampao)}` : titleOp));
    const esquema = d.esquemaMecanicoImagem
      ? `<img class="mechanical-img" src="${d.esquemaMecanicoImagem}" alt="Esquema mecânico" />`
      : `<div class="mechanical-empty">Selecione uma imagem de esquema mecânico no modal do relatório.</div>`;
    return [this.subtitle(`${n}.1`, 'Geral'), { html: `
    <table class="well-table">
      <tbody>
        <tr>
          <td class="label">Date:</td><td class="value">${this.escape(dataFmt)}</td>
          <td class="label">Rig:</td><td class="value">${this.escape(d.sonda || '')}</td>
        </tr>
        <tr>
          <td class="label">Operator:</td><td class="value">${this.escape(d.origem || '')}</td>
          <td class="label">Job #:</td><td class="value">${this.escape(d.jobNum || '')}</td>
        </tr>
        <tr>
          <td class="label">Well:</td><td class="value">${this.escape(d.poco || '')}</td>
          <td class="label">Contractor:</td><td class="value">${this.escape(d.cliente || '')}</td>
        </tr>
        <tr>
          <td class="label">Location:</td><td class="value">${this.escape(d.campo || '')}</td>
          <td class="label">Job:</td><td class="value">${job}</td>
        </tr>
        <tr>
          <td class="label">Country:</td><td class="value">${this.escape(d.pais || 'Brasil')}</td>
          <td class="label">By:</td><td class="value">${this.escape(d.preparadoPor || '')}</td>
        </tr>
        <tr>
          <td class="label">Casing:</td><td class="value" colspan="3">${this.escape(d.revestimento || '')}</td>
        </tr>
      </tbody>
    </table>` },
      this.subtitle(`${n}.2`, 'Esquema mecânico'),
      { figure: true, html: `<div class="mechanical-wrap">${esquema}</div>` }];
  }

  private operationBlocks(d: RelatorioCapaData, n: number): FlowBlock[] {
    const bombeioRows = this.bombeioRowsWithVazoes(d)
      .map(row => `
        <tr>
          <td>${this.escape(row.fluido)}</td>
          <td>${this.formatNumber(row.volumeBbl)}</td>
          <td>${this.formatNumber(row.vazaoBpm)}</td>
          <td>${row.densidadePpg != null ? this.formatNumber(row.densidadePpg) : '-'}</td>
        </tr>
      `)
      .join('');
    const resumo = d.pastaResumo;
    return [
      this.subtitle(`${n}.1`, 'Temperatura'), { html: `
    <table class="operation-table operation-table--temp">
      <thead>
        <tr><th colspan="2">Temperatura</th></tr>
      </thead>
      <tbody>
        <tr><td>Gradiente Geotermico</td><td>${this.formatNumber(d.geoGradient, 2)} °F/100ft</td></tr>
        <tr><td>BHST</td><td>${this.formatNumber(d.bhst, 0)} °F</td></tr>
        <tr><td>SQT</td><td>${this.formatNumber(d.bhct, 0)} °F</td></tr>
      </tbody>
    </table>` },
      this.subtitle(`${n}.2`, 'Bombeio'), { html: `
    <table class="operation-table">
      <thead>
        <tr>
          <th>Fluido</th>
          <th>Volume (bbl)</th>
          <th>Vazão (bpm)</th>
          <th>Dens. (ppg)</th>
        </tr>
      </thead>
      <tbody>
        ${bombeioRows || '<tr><td colspan="4">Sem dados de bombeio calculados.</td></tr>'}
      </tbody>
    </table>` },
      ...(resumo ? [this.subtitle(`${n}.3`, 'Receita da pasta'), { html: `
    <table class="operation-table">
      <thead>
        <tr>
          <th>Fonte</th>
          <th>Rendimento</th>
          <th>FAC</th>
          <th>FAM</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${this.escape(resumo.tipo || '')} - ${this.escape(resumo.origem || '')}</td>
          <td>${this.formatMetric(resumo.rendimentoFt3PerFt3Cement, 4, 'ft&sup3;/ft&sup3;')}</td>
          <td>${this.formatMetric(resumo.facGpc, 2, 'gpc')}</td>
          <td>${this.formatMetric(resumo.famGpc, 2, 'gpc')}</td>
        </tr>
      </tbody>
    </table>` }] : []),
    ];
  }

  /** Cada passo da sequência é um bloco, numerado pela posição: a lista continua na folha seguinte. */
  private sequenceBlocks(d: RelatorioCapaData): FlowBlock[] {
    const seq = d.sequenciaOperacional;
    const bombeio = this.bombeioRowsWithVazoes(d);
    const receitaRows = d.receitaRows || [];
    const recipeTable = this.buildSequenceRecipeTable(receitaRows);
    const injectivityTable = this.buildInjectivityTable();
    const origem = this.escape(seq?.testeInjetividadeDefinidoPor || d.origem || 'ORIGEM');
    const coluna = this.escape(seq?.colunaTrabalho || '2 7/8" EU');
    const colunaDepth = this.formatMeters(String(seq?.colunaProfundidadeM || d.baseTampao || ''));
    const lineTest = this.formatNumber(seq?.pressaoTesteLinhasPsi, 0) || '3000';
    const reverseVol = this.formatNumber(seq?.volumeCirculacaoReversaBbl) || '31';
    const maxPressure = this.formatNumber(seq?.pressaoMaxSqueezePsi, 0) || '2000';
    const maxInjected = this.formatNumber(seq?.volumeMaxInjetadoBbl) || '2,0';
    const maxTime = this.escape(seq?.tempoMaxPressurizacaoH || '01:00h');
    const tubeLengthM = this.toNumber(seq?.comprimentoTuboM, 9.4);
    const sectionsAboveTop = this.toNumber(seq?.secoesAcimaTopoCimento, 2);
    const tubesPerSection = this.toNumber(seq?.tubosPorSecao, 2);
    const baseDepth = this.toNumber(d.baseTampao, this.toNumber(seq?.colunaProfundidadeM, 0));
    const cementTopDepth = this.toNumber(seq?.topoCimentoRetiradaM, this.toNumber(d.topoCimento, baseDepth));
    const tampaoTubesCount = Math.max(0, Math.round(Math.abs(baseDepth - cementTopDepth) / tubeLengthM));
    const sectionTubesCount = Math.max(0, Math.round(sectionsAboveTop * tubesPerSection));
    const totalTubesCount = tampaoTubesCount + sectionTubesCount;
    const approxDepthM = totalTubesCount > 0 ? baseDepth - (totalTubesCount * tubeLengthM) : NaN;
    const totalTubes = this.formatNumber(totalTubesCount, 0) || '-';
    const tampaoTubes = this.formatNumber(tampaoTubesCount, 0) || '-';
    const approxDepth = Number.isFinite(approxDepthM) ? this.formatNumber(approxDepthM, 0) : '';
    const firstTubeMin = this.formatNumber(seq?.minPrimeirosTubos, 0) || '3';
    const otherTubeMin = this.formatNumber(seq?.minDemaisTubos, 0) || '6';
    const pumpability = this.escape(seq?.tempoBombeabilidade || '04:31 h');
    const resistancePsi = this.formatNumber(seq?.pressaoResistenciaPsi, 0) || '1500';
    const resistanceTime = this.escape(seq?.tempoResistencia || '08:00 h');
    const slurryVol = this.formatNumber(bombeio[1]?.volumeBbl);
    const slurryRate = this.formatNumber(bombeio[1]?.vazaoBpm);
    const frontVol = this.formatNumber(bombeio[0]?.volumeBbl);
    const frontRate = this.formatNumber(bombeio[0]?.vazaoBpm);
    const backVol = this.formatNumber(bombeio[2]?.volumeBbl);
    const backRate = this.formatNumber(bombeio[2]?.vazaoBpm);
    const displacementVol = this.formatNumber(bombeio[3]?.volumeBbl);
    const displacementRate = this.formatNumber(bombeio[3]?.vazaoBpm);
    const density = this.extractDensity(d);
    const waterQty = this.extractRecipeQuantity(receitaRows, 'Agua');
    const cementQty = this.extractRecipeQuantity(receitaRows, 'Cimento');
    const bhst = this.formatNumber(d.bhst, 1);

    const steps = [
      `Descer coluna de trabalho de <strong>${coluna}</strong> ate <strong>${colunaDepth}</strong>;`,
      'Circular poco para homogenizar temperatura e garantir a circulacao plena;',
      `Realizar teste de injetividade, se <strong>definido pela ${origem}</strong>, conforme volumes e vazoes definidos na tabela a seguir. Anotar pressoes durante o bombeio;
        ${injectivityTable}`,
      `Preparar a agua de mistura da pasta para ${slurryVol || '-'} bbl de pasta de cimento ${density || '-'} ppg, de acordo com quadro abaixo;
        ${recipeTable}`,
      'Realizar reuniao de seguranca e programacao da operacao entre todos os participantes da operacao e ao final;',
      `Realizar teste de linhas com <strong>${lineTest} psi</strong>;`,
      `Unidade de Cimentacao bombeia <strong>${frontVol || '-'} bbl</strong> de agua industrial a frente @ <strong>${frontRate || '-'} bpm</strong>;`,
      `Misturar <strong>${waterQty || '-'}</strong> de agua com <strong>${cementQty || '-'}</strong> de cimento G e aditivos para <strong>${slurryVol || '-'} bbl</strong> pasta de cimento <strong>${density || '-'} ppg</strong>, bombear com Unidade de Cimentacao @ <strong>${slurryRate || '-'} bpm</strong>;`,
      `Unidade de Cimentacao bombeia <strong>${backVol || '-'} bbl</strong> de agua industrial atras @ <strong>${backRate || '-'} bpm</strong>;`,
      `Unidade de Cimentacao realiza o deslocamento com <strong>${displacementVol || '-'} bbl</strong> fluido de completacao @ <strong>${displacementRate || '-'} bpm</strong>;`,
      'Para o bombeio e aguardar balanco do tampao, observar volume nos tanques de deslocamento, tanto por retorno de fluido como por reducao de volume para o balanceio;',
      `Parar o bombeio e desconectar linhas. Iniciar retirada <strong>${totalTubes} tubos</strong> da coluna de trabalho ate a profundidade aproximada de <strong>${approxDepth || '-'} m</strong>;
        <ul class="sequence-bullets">
          <li>Retirar os primeiros <strong>${tampaoTubes} tubos</strong> com velocidade de <strong>${firstTubeMin} minutos</strong> por tubo ou <strong>${otherTubeMin} minutos</strong> por secao;</li>
          <li>Retirar os demais tubos com velocidade normal.</li>
        </ul>`,
      `Realizar circulacao reversa com <strong>${reverseVol} bbl</strong> de fluido de completacao para garantir a limpeza da coluna de trabalho;`,
      'Realizar o fechamento do BOP/Packer;',
      `Iniciar o SQUEEZE de acordo com os dados do teste de injetividade, limitando o volume injetado ate <strong>${maxInjected} bbl</strong> e a pressao ate <strong>${maxPressure} psi</strong>, por ate <strong>${maxTime}</strong>;
        <ul class="sequence-bullets">
          <li>Iniciar bombeio com 0,5 bbl com vazao entre 0,5 bpm e 1,0 bpm. Parar o bombeio e observar se houve queda de pressao;</li>
          <li>Reiniciar bombeio com 0,5 bbl e vazao de ate 1,0 bpm. Parar o bombeio e observar se houve queda de pressao;</li>
          <li>Continuar com o bombeio incrementando a pressao maxima em 250 psi a cada repeticao, limitando o volume injetado ate ${maxInjected} bbl e ate 20 minutos de hesitacao;</li>
          <li>Manter o poco fechado e pressurizado ate completar o tempo de pega da pasta de cimento.</li>
        </ul>`,
      `Apos finalizada operacao, seguir procedimento definido pela ${origem}.`,
      `O tempo de bombeabilidade da pasta de cimento e de <strong>${pumpability}</strong>${bhst ? ` a ${bhst} &deg;F` : ''}. Para atingir ${resistancePsi} psi de resistencia compressiva sao necessarias <strong>${resistanceTime}</strong> apos o inicio da mistura.`,
    ];
    return steps.map((step, i) => ({ html: `<ol class="sequence-list" start="${i + 1}"><li>${step}</li></ol>` }));
  }

  private buildInjectivityTable(): string {
    const rows = [
      ['0.00', '0,5'],
      ['2.00', '1,0'],
      ['4.00', '1,5'],
      ['6.00', '2,0'],
      ['8.00', '2,5'],
      ['10.00', '3,0'],
    ].map(([tempo, vazao]) => `<tr><td>${tempo}</td><td>${vazao}</td><td></td><td></td></tr>`).join('');

    return `
      <table class="sequence-table">
        <thead>
          <tr><th>Tempo</th><th>Vazao</th><th>Volume bombeado</th><th>Pressao</th></tr>
          <tr><th>Min</th><th>BPM</th><th>BBL</th><th>Psi</th></tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;
  }

  private buildSequenceRecipeTable(rows: NonNullable<RelatorioCapaData['receitaRows']>): string {
    const body = rows.length
      ? rows.map(row => `
        <tr>
          <td>${this.escape(row.aditivo)}</td>
          <td>${this.escape(row.codigo)}</td>
          <td>${this.escape(row.concentracao)}</td>
          <td>${this.escape(row.quantidade)}</td>
        </tr>
      `).join('')
      : '<tr><td colspan="4">Receita nao calculada.</td></tr>';

    return `
      <table class="sequence-table sequence-table--recipe">
        <thead><tr><th>Aditivo</th><th>Codigo</th><th>Concentracao</th><th>Quantidade</th></tr></thead>
        <tbody>${body}</tbody>
      </table>`;
  }

  /** Uma linha por tópico; a página sai da paginação, no navegador. */
  private buildIndiceRows(topicos: RelatorioTopico[]): string {
    return topicos
      .map(topico => `
        <div class="indice-row">
          <div class="indice-number">${String(topico.numero).padStart(2, '0')}</div>
          <div class="indice-label">${this.escape(topico.titulo)}</div>
          <div class="indice-page-num" data-toc="${topico.id}">&ndash;</div>
        </div>`)
      .join('');
  }

  private buildZoneText(d: RelatorioCapaData): string {
    return this.escape(d.zonaIsolarNome || '-');
  }

  private buildObjetivosTampaoRows(d: RelatorioCapaData): string {
    if (d.calculoTampaoPor === 'altura') {
      return `
      <li>In&iacute;cio do tamp&atilde;o: ${this.formatMeters(d.inicioTampao)}</li>
      <li>Fim do tamp&atilde;o: ${this.formatMeters(d.fimTampao)}</li>`;
    }

    return `
      <li>Base do tamp&atilde;o: ${this.formatMeters(d.baseTampao)}</li>
      <li>Topo de cimento: ${this.formatMeters(d.topoCimento)}</li>`;
  }

  private extractDensity(d: RelatorioCapaData): string {
    const pastaRow = (d.bombeioRows || []).find(row => /pasta/i.test(row.fluido));
    const match = pastaRow?.fluido.match(/(\d+(?:[,.]\d+)?)\s*ppg/i);
    return match?.[1] || '';
  }

  private extractRecipeQuantity(rows: NonNullable<RelatorioCapaData['receitaRows']>, label: string): string {
    const normalized = label.toLowerCase();
    return rows.find(row => row.aditivo.toLowerCase() === normalized)?.quantidade || '';
  }

  private withVazoesBombeio(d: RelatorioCapaData): RelatorioCapaData {
    return {
      ...d,
      bombeioRows: this.bombeioRowsWithVazoes(d),
    };
  }

  private bombeioRowsWithVazoes(d: RelatorioCapaData): RelatorioBombeioRow[] {
    const rows = d.bombeioRows || [];
    const vazoes = [
      d.vazoesBombeio?.fluidoFrenteBpm,
      d.vazoesBombeio?.pastaBpm,
      d.vazoesBombeio?.fluidoAtrasBpm,
      d.vazoesBombeio?.deslocamentoBpm,
    ];

    return rows.map((row, index) => ({
      ...row,
      vazaoBpm: this.hasValue(vazoes[index]) ? vazoes[index]! : row.vazaoBpm,
    }));
  }

  private hasValue(value: unknown): boolean {
    return value != null && String(value).trim() !== '';
  }

  private toNumber(value: unknown, fallback = 0): number {
    const n = Number(String(value ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : fallback;
  }

  private formatMeters(value?: string): string {
    const formatted = this.formatNumber(value);
    return formatted ? `${formatted} m` : '-';
  }

  private formatNumber(value?: string | number, decimals = 1): string {
    if (value == null || value === '') return '';
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n)) return this.escape(String(value));
    return n.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  private formatMetric(value: string | number | undefined, decimals: number, unit: string): string {
    const formatted = this.formatNumber(value, decimals);
    return formatted ? `${formatted} ${unit}` : '-';
  }

  private buildClienteLogoImg(d: RelatorioCapaData, className = 'report-client-logo'): string {
    if (!d.clienteLogoImagem) return '';
    return `<img class="${className}" src="${this.escape(d.clienteLogoImagem)}" alt="${this.escape(d.clienteLogoNome || 'Logo do cliente')}" />`;
  }

  private buildTechClienteLogo(d: RelatorioCapaData): string {
    return this.buildClienteLogoImg(d, 'tech-client-logo');
  }

  private techPageClass(d: RelatorioCapaData, extraClass = ''): string {
    return ['page', 'tech-page', extraClass, d.clienteLogoImagem ? 'tech-page--client-logo' : '']
      .filter(Boolean)
      .join(' ');
  }

  private escape(value: string): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
