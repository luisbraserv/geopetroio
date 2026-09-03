import { Component, EventEmitter, Input, Output, OnChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

export interface RelatorioCapaData {
  cliente: string;
  clienteLogoNome?: string;
  clienteLogoImagem?: string;
  preparadoPara: string;
  documento: string;
  preparadoPor: string;
  revisadoPor: string;
  data: string;
  versao: string;
  origem: string;
  poco: string;
  campo: string;
  sonda: string;
  jobNum: string;
  pais?: string;
  revestimento?: string;
  zonaIsolarNome?: string;
  tipoReceitaRelatorio?: 'pasta' | 'volume';
  calculoTampaoPor?: 'altura' | 'volume';
  zonaIsolarTopo?: string;
  zonaIsolarBase?: string;
  inicioTampao?: string;
  fimTampao?: string;
  baseTampao?: string;
  topoCimento?: string;
  esquemaMecanicoNome?: string;
  esquemaMecanicoImagem?: string;
  geoGradient?: number | string;
  bhst?: number | string;
  bhct?: number | string;
  bombeioRows?: RelatorioBombeioRow[];
  receitaRows?: RelatorioReceitaRow[];
  pastaResumo?: RelatorioPastaResumoData;
  esquematicosSelecionados?: RelatorioEsquematicoTipo[];
  esquematicoImages?: RelatorioEsquematicoImage[];
  graficosOperacionaisSelecionados?: GraficoOperacionalTipo[];
  graficosOperacionaisImages?: GraficoOperacionalImage[];
  secoesPersonalizadas?: SecaoPersonalizada[];
  vazoesBombeio: RelatorioVazoesBombeioData;
  sequenciaOperacional: RelatorioSequenciaOperacionalData;
  operacao: string;
}

export interface RelatorioBombeioRow {
  fluido: string;
  volumeBbl: number | string;
  vazaoBpm: number | string;
  densidadePpg?: number | string;
}

export interface RelatorioReceitaRow {
  aditivo: string;
  codigo: string;
  concentracao: string;
  quantidade: string;
}

export interface RelatorioPastaResumoData {
  tipo: string;
  origem: string;
  rendimentoFt3PerFt3Cement?: number | string;
  facGpc?: number | string;
  famGpc?: number | string;
}

export interface RelatorioVazoesBombeioData {
  fluidoFrenteBpm: number | string;
  pastaBpm: number | string;
  fluidoAtrasBpm: number | string;
  deslocamentoBpm: number | string;
}

export type RelatorioEsquematicoTipo = 'bombeio' | 'comTubing' | 'semTubing';
export type GraficoOperacionalTipo = 'cronograma' | 'pressao';
export interface GraficoOperacionalImage { label: string; imagem: string; }

export interface RelatorioEsquematicoImage {
  tipo: string;
  label: string;
  imagem: string;
}

export interface SecaoImagem {
  nome: string;
  data: string;
}

export interface SecaoPersonalizada {
  titulo: string;
  texto: string;
  imagens: SecaoImagem[];
}

export interface RelatorioSequenciaOperacionalData {
  colunaTrabalho: string;
  colunaProfundidadeM: number | string;
  testeInjetividadeDefinidoPor: string;
  pressaoTesteLinhasPsi: number | string;
  volumeCirculacaoReversaBbl: number | string;
  pressaoMaxSqueezePsi: number | string;
  volumeMaxInjetadoBbl: number | string;
  tempoMaxPressurizacaoH: string;
  comprimentoTuboM: number | string;
  topoCimentoRetiradaM?: number | string;
  secoesAcimaTopoCimento: number | string;
  tubosPorSecao: 2 | 3 | number | string;
  minPrimeirosTubos: number | string;
  minDemaisTubos: number | string;
  tempoBombeabilidade: string;
  pressaoResistenciaPsi: number | string;
  tempoResistencia: string;
}

@Component({
  selector: 'app-relatorio-capa-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    @if (open) {
      <div class="overlay" (click)="fechar()">
        <div class="modal" (click)="$event.stopPropagation()">

          <div class="modal-head">
            <div>
              <h2>Gerar Relatório</h2>
              <p class="modal-sub">Preencha os dados para a capa do documento</p>
            </div>
            <button class="btn-close" type="button" (click)="fechar()">✕</button>
          </div>

          <div class="modal-body">
            <div class="section section--options">
              <div class="section-title">Opcoes do Relatorio</div>
              <div class="field">
                <label>Receita do relatorio</label>
                <select [(ngModel)]="form.tipoReceitaRelatorio">
                  <option value="pasta">Receita da pasta</option>
                  <option value="volume">Receita por volume</option>
                </select>
              </div>
              <div class="field">
                <label>Esquema mecanico</label>
                <input type="file" accept="image/*" (change)="onMechanicalSchematicSelected($event)" />
                @if (form.esquemaMecanicoNome) {
                  <small class="file-name">{{ form.esquemaMecanicoNome }}</small>
                }
              </div>
              <div class="field field--wide">
                <label>Esquemáticos do relatório</label>
                <div class="check-grid">
                  <label class="check-item">
                    <input type="checkbox" [checked]="isSchematicSelected('bombeio')" (change)="toggleSchematic('bombeio', $event)" />
                    <span>Esquemático de bombeio</span>
                  </label>
                  <label class="check-item">
                    <input type="checkbox" [checked]="isSchematicSelected('semTubing')" (change)="toggleSchematic('semTubing', $event)" />
                    <span>Sem tubing / final</span>
                  </label>
                </div>
              </div>
              <div class="field field--wide">
                <label>Gráficos operacionais</label>
                <div class="check-grid">
                  <label class="check-item">
                    <input type="checkbox" [checked]="isGraficoSelected('cronograma')" (change)="toggleGrafico('cronograma', $event)" />
                    <span>Cronograma operacional (visão geral e zoom)</span>
                  </label>
                  <label class="check-item">
                    <input type="checkbox" [checked]="isGraficoSelected('pressao')" (change)="toggleGrafico('pressao', $event)" />
                    <span>Gráficos de pressão</span>
                  </label>
                </div>
              </div>
            </div>

            <div class="section section--bpm">
              <div class="section-title">Vazoes de Bombeio</div>
              <div class="field">
                <label>Água a frente (bpm)</label>
                <input type="number" step="0.1" [(ngModel)]="form.vazoesBombeio.fluidoFrenteBpm" placeholder="Vazao geral" />
              </div>
              <div class="field">
                <label>Pasta (bpm)</label>
                <input type="number" step="0.1" [(ngModel)]="form.vazoesBombeio.pastaBpm" placeholder="Vazao geral" />
              </div>
              <div class="field">
                <label>Água atrás (bpm)</label>
                <input type="number" step="0.1" [(ngModel)]="form.vazoesBombeio.fluidoAtrasBpm" placeholder="Vazao geral" />
              </div>
              <div class="field">
                <label>Deslocamento (bpm)</label>
                <input type="number" step="0.1" [(ngModel)]="form.vazoesBombeio.deslocamentoBpm" placeholder="Vazao geral" />
              </div>
            </div>

            @if (hasReviewData()) {
              <div class="section section--review">
                <div class="section-title">Revis&atilde;o do Relat&oacute;rio</div>

                <div class="review-block">
                  <h3>Temperatura</h3>
                  <table class="review-table">
                    <tbody>
                      <tr><td>Gradiente geot&eacute;rmico</td><td>{{ formatReviewMetric(form.geoGradient, 2, '°F/100ft') }}</td></tr>
                      <tr><td>BHST</td><td>{{ formatReviewMetric(form.bhst, 0, '°F') }}</td></tr>
                      <tr><td>SQT</td><td>{{ formatReviewMetric(form.bhct, 0, '°F') }}</td></tr>
                    </tbody>
                  </table>
                </div>

                <div class="review-block review-block--wide">
                  <h3>Bombeio</h3>
                  <table class="review-table">
                    <thead>
                      <tr><th>Fluido</th><th>Volume</th><th>Vaz&atilde;o</th><th>Dens.</th></tr>
                    </thead>
                    <tbody>
                      @for (row of form.bombeioRows ?? []; track $index) {
                        <tr>
                          <td>{{ row.fluido }}</td>
                          <td>{{ formatReviewMetric(row.volumeBbl, 2, 'bbl') }}</td>
                          <td>{{ formatReviewMetric(row.vazaoBpm, 2, 'bpm') }}</td>
                          <td>{{ formatReviewMetric(row.densidadePpg, 2, 'ppg') }}</td>
                        </tr>
                      } @empty {
                        <tr><td colspan="4">Sem dados de bombeio calculados.</td></tr>
                      }
                    </tbody>
                  </table>
                </div>

                <div class="review-block">
                  <h3>Receita da pasta</h3>
                  <table class="review-table">
                    <tbody>
                      <tr><td>Fonte</td><td>{{ form.pastaResumo?.origem || '-' }}</td></tr>
                      <tr><td>Rendimento</td><td>{{ formatReviewMetric(form.pastaResumo?.rendimentoFt3PerFt3Cement, 4, 'ft³/ft³') }}</td></tr>
                      <tr><td>FAC</td><td>{{ formatReviewMetric(form.pastaResumo?.facGpc, 2, 'gpc') }}</td></tr>
                      <tr><td>FAM</td><td>{{ formatReviewMetric(form.pastaResumo?.famGpc, 2, 'gpc') }}</td></tr>
                    </tbody>
                  </table>

                  <table class="review-table review-table--recipe">
                    <thead>
                      <tr><th>Aditivo</th><th>C&oacute;digo</th><th>Concentra&ccedil;&atilde;o</th><th>Qtd.</th></tr>
                    </thead>
                    <tbody>
                      @for (row of form.receitaRows ?? []; track $index) {
                        <tr>
                          <td>{{ row.aditivo }}</td>
                          <td>{{ row.codigo }}</td>
                          <td>{{ row.concentracao }}</td>
                          <td>{{ row.quantidade }}</td>
                        </tr>
                      } @empty {
                        <tr><td colspan="4">Sem receita calculada.</td></tr>
                      }
                    </tbody>
                  </table>
                </div>
              </div>
            }

            <!-- Coluna esquerda: dados do documento -->
            <div class="section">
              <div class="section-title">Dados do Documento</div>
              <div class="field">
                <label>Cliente</label>
                <input [(ngModel)]="form.cliente" placeholder="Nome do cliente" />
              </div>
              <div class="field">
                <label>Preparado para</label>
                <input [(ngModel)]="form.preparadoPara" placeholder="Nome(s) do destinatário" />
              </div>
              <div class="field">
                <label>Documento</label>
                <input [(ngModel)]="form.documento" placeholder="Tipo de documento" />
              </div>
              <div class="field">
                <label>Preparado por</label>
                <input [(ngModel)]="form.preparadoPor" placeholder="Nome do autor" />
              </div>
              <div class="field">
                <label>Revisado por</label>
                <input [(ngModel)]="form.revisadoPor" placeholder="Nome do revisor" />
              </div>
              <div class="field-row">
                <div class="field">
                  <label>Data</label>
                  <input type="date" [(ngModel)]="form.data" />
                </div>
                <div class="field">
                  <label>Versão</label>
                  <input [(ngModel)]="form.versao" placeholder="01" style="width:80px" />
                </div>
              </div>
            </div>

            <!-- Coluna direita: dados do poço -->
            <div class="section">
              <div class="section-title">Dados do Poço</div>
              <div class="field">
                <label>Origem / Operador</label>
                <input [(ngModel)]="form.origem" placeholder="ORIGEM" />
              </div>
              <div class="field">
                <label>Poço</label>
                <input [(ngModel)]="form.poco" placeholder="7-PIR-100-AL" />
              </div>
              <div class="field">
                <label>Campo / Localização</label>
                <input [(ngModel)]="form.campo" placeholder="Pilar" />
              </div>
              <div class="field">
                <label>Sonda</label>
                <input [(ngModel)]="form.sonda" placeholder="SPT-145" />
              </div>
              <div class="field">
                <label>Job #</label>
                <input [(ngModel)]="form.jobNum" placeholder="" />
              </div>
              <div class="field">
                <label>Operação</label>
                <input [(ngModel)]="form.operacao" [disabled]="true" />
              </div>
            </div>

            <div class="section section--sequence">
              <div class="section-title">Sequencia Operacional</div>
              <div class="field field--info">
                <span class="field-auto">⚙ Diâmetro e profundidade da coluna preenchidos automaticamente a partir da geometria</span>
              </div>
              <div class="field field--info">
                <span class="field-auto">⚙ Teste definido por: preenchido automaticamente com o campo Cliente</span>
              </div>
              <div class="field field--info">
                <span class="field-auto">⚙ Pressão de teste = Pressão de Operação + 1000 psi (preenchida automaticamente)</span>
              </div>
              <div class="field">
                <label>Tempo max. pressurizacao</label>
                <input [(ngModel)]="form.sequenciaOperacional.tempoMaxPressurizacaoH" placeholder="01:00h" />
              </div>
              <div class="field">
                <label>Comprimento tubo (m)</label>
                <input type="number" [(ngModel)]="form.sequenciaOperacional.comprimentoTuboM" placeholder="9.4" />
              </div>
              <div class="field">
                <label>Secoes acima do topo</label>
                <input type="number" [(ngModel)]="form.sequenciaOperacional.secoesAcimaTopoCimento" placeholder="2" />
              </div>
              <div class="field">
                <label>Tubos por secao</label>
                <select [ngModel]="form.sequenciaOperacional.tubosPorSecao"
                        (ngModelChange)="form.sequenciaOperacional.tubosPorSecao = $event; syncMinPorSecao()">
                  <option [ngValue]="2">2 tubos</option>
                  <option [ngValue]="3">3 tubos</option>
                </select>
              </div>
              <div class="field">
                <label>Min. por tubo</label>
                <input type="number" [ngModel]="form.sequenciaOperacional.minPrimeirosTubos"
                       (ngModelChange)="form.sequenciaOperacional.minPrimeirosTubos = $event; syncMinPorSecao()" placeholder="3" />
              </div>
              <div class="field">
                <label>Min. por secao (auto)</label>
                <input type="number" [value]="form.sequenciaOperacional.minDemaisTubos" disabled
                       title="Calculado automaticamente: tubos por seção × min. por tubo" />
              </div>
              <div class="field">
                <label>Tempo bombeabilidade</label>
                <input [(ngModel)]="form.sequenciaOperacional.tempoBombeabilidade" placeholder="04:31 h" />
              </div>
              <div class="field">
                <label>Resistencia compressiva</label>
                <input [(ngModel)]="form.sequenciaOperacional.tempoResistencia" placeholder="08:00 h" />
              </div>
              <div class="field">
                <label>Pressao resistencia (psi)</label>
                <input type="number" [(ngModel)]="form.sequenciaOperacional.pressaoResistenciaPsi" placeholder="1500" />
              </div>
            </div>

            <div class="section section--secoes">
              <div class="section-title">Seções Personalizadas</div>
              @for (sec of form.secoesPersonalizadas ?? []; track $index; let i = $index) {
                <div class="secao-card">
                  <div class="secao-header">
                    <span class="secao-num">Seção {{ i + 1 }}</span>
                    <button class="btn-rm-secao" type="button" (click)="removeSecao(i)">✕ Remover</button>
                  </div>
                  <div class="field">
                    <label>Título</label>
                    <input [(ngModel)]="sec.titulo" placeholder="Título da seção" />
                  </div>
                  <div class="field">
                    <label>Texto</label>
                    <textarea [(ngModel)]="sec.texto" placeholder="Texto da seção..." rows="3"></textarea>
                  </div>
                  <div class="field">
                    <label>Imagens</label>
                    <input type="file" accept="image/*" multiple (change)="addImagensSecao(i, $event)" />
                  </div>
                  @if (sec.imagens.length > 0) {
                    <div class="secao-imgs">
                      @for (img of sec.imagens; track $index; let j = $index) {
                        <div class="secao-img-item">
                          <img [src]="img.data" [alt]="img.nome" class="secao-img-thumb" />
                          <span class="secao-img-nome">{{ img.nome }}</span>
                          <button type="button" class="btn-rm-img" (click)="removeImagemSecao(i, j)">✕</button>
                        </div>
                      }
                    </div>
                  }
                </div>
              }
              <button type="button" class="btn-add-secao" (click)="addSecao()">
                + Adicionar Seção
              </button>
            </div>
          </div>

          <div class="modal-footer">
            <button class="btn-cancel" type="button" (click)="fechar()">Cancelar</button>
            <button class="btn-gerar" type="button" [disabled]="isGenerating" (click)="gerar()">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
              Gerar Relatório
            </button>
          </div>

        </div>
      </div>
    }
  `,
  styles: [`
    .overlay {
      position: fixed; inset: 0; background: rgba(0,0,0,.5); z-index: 2000;
      display: flex; align-items: center; justify-content: center; padding: 20px;
    }
    .modal {
      background: #fff; border-radius: 12px; width: min(96vw, 1500px); max-width: 1500px;
      box-shadow: 0 20px 60px rgba(0,0,0,.25); display: flex; flex-direction: column;
      max-height: 90vh; overflow: hidden;
    }
    .modal-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      padding: 20px 24px 16px; border-bottom: 1px solid #e2e8f0; flex-shrink: 0;
    }
    .modal-head h2 { margin: 0 0 2px; font-size: 1rem; font-weight: 700; color: #1e293b; }
    .modal-sub { margin: 0; font-size: .8rem; color: #64748b; }
    .btn-close {
      background: none; border: none; cursor: pointer; color: #94a3b8;
      font-size: 1.1rem; padding: 4px; line-height: 1; flex-shrink: 0;
    }
    .btn-close:hover { color: #475569; }

    .modal-body {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0;
      overflow-y: auto; padding: 20px 24px; gap: 24px;
    }
    .section { display: flex; flex-direction: column; gap: 12px; }
    .section--options {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(2, minmax(0, 1fr));
      gap: 12px 18px;
      padding: 14px;
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      background: #f8fafc;
    }
    .section--options .section-title { grid-column: 1 / -1; }
    .section--bpm {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      gap: 12px;
      padding: 14px;
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      background: #fff;
    }
    .section--bpm .section-title { grid-column: 1 / -1; }
    .section--review {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: minmax(220px, .8fr) minmax(360px, 1.35fr) minmax(260px, 1fr);
      gap: 12px;
      padding: 14px;
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      background: #fff;
    }
    .section--review .section-title { grid-column: 1 / -1; }
    .review-block {
      min-width: 0;
      border: 1px solid #e2e8f0;
      border-radius: 8px;
      overflow: hidden;
      background: #f8fafc;
    }
    .review-block h3 {
      margin: 0;
      padding: 8px 10px;
      border-bottom: 1px solid #e2e8f0;
      color: #1e293b;
      font-size: .82rem;
      font-weight: 700;
    }
    .review-table {
      width: 100%;
      border-collapse: collapse;
      background: #fff;
      font-size: .76rem;
    }
    .review-table th,
    .review-table td {
      padding: 7px 9px;
      border-bottom: 1px solid #edf2f7;
      text-align: left;
      color: #334155;
      vertical-align: middle;
    }
    .review-table th {
      background: #f8fafc;
      color: #64748b;
      font-weight: 700;
    }
    .review-table td:last-child,
    .review-table th:last-child {
      text-align: right;
      white-space: nowrap;
    }
    .review-table tr:last-child td { border-bottom: none; }
    .review-table--recipe { border-top: 1px solid #e2e8f0; }
    .section--sequence {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 12px;
      padding: 14px;
      border: 1px solid #dbe3ef;
      border-radius: 10px;
      background: #fff;
    }
    .section--sequence .section-title { grid-column: 1 / -1; }
    .field--wide { grid-column: 1 / -1; }
    .check-grid { display: flex; flex-wrap: wrap; gap: 10px; }
    .check-item {
      display: inline-flex; align-items: center; gap: 7px; padding: 8px 10px;
      border: 1px solid #dbe3ef; border-radius: 8px; background: #fff;
      color: #334155; font-size: .82rem; cursor: pointer;
    }
    .check-item input { width: auto; padding: 0; margin: 0; }
    .section-title {
      font-size: .72rem; font-weight: 700; text-transform: uppercase;
      letter-spacing: .08em; color: #4291e1; padding-bottom: 6px;
      border-bottom: 2px solid #e2e8f0;
    }
    .field { display: flex; flex-direction: column; gap: 4px; }
    .field--info { background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 6px; padding: 6px 10px; }
    .field-auto { font-size: .75rem; color: #0369a1; }
    .field-row { display: flex; gap: 12px; }
    .field-row .field { flex: 1; }
    label { font-size: .78rem; font-weight: 600; color: #475569; }
    input, select {
      width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: .85rem; color: #1e293b; outline: none; box-sizing: border-box;
      transition: border-color .15s;
      background: #fff;
    }
    input:focus, select:focus { border-color: #4291e1; box-shadow: 0 0 0 3px rgba(66,145,225,.12); }
    input:disabled { background: #f8fafc; color: #94a3b8; cursor: not-allowed; }
    input[type="file"] { padding: 6px 8px; }
    .file-name { color: #64748b; font-size: .74rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

    .modal-footer {
      display: flex; align-items: center; justify-content: flex-end; gap: 10px;
      padding: 16px 24px; border-top: 1px solid #e2e8f0; flex-shrink: 0;
    }
    .btn-cancel {
      padding: 8px 18px; border: 1px solid #e2e8f0; border-radius: 8px;
      background: #f8fafc; color: #64748b; font-size: .85rem; cursor: pointer;
    }
    .btn-gerar {
      display: inline-flex; align-items: center; gap: 7px;
      padding: 8px 20px; border: none; border-radius: 8px;
      background: #4291e1; color: #fff; font-size: .85rem; font-weight: 600; cursor: pointer;
      transition: background .15s;
    }
    .btn-gerar:hover { background: #2563eb; }
    .btn-gerar:disabled { opacity: .7; cursor: wait; }
    textarea {
      width: 100%; padding: 7px 10px; border: 1px solid #cbd5e1; border-radius: 6px;
      font-size: .85rem; color: #1e293b; outline: none; box-sizing: border-box;
      resize: vertical; font-family: inherit; background: #fff;
    }
    textarea:focus { border-color: #4291e1; box-shadow: 0 0 0 3px rgba(66,145,225,.12); }
    .section--secoes {
      grid-column: 1 / -1;
      display: flex; flex-direction: column; gap: 10px;
      padding: 14px; border: 1px solid #dbe3ef; border-radius: 10px; background: #fff;
    }
    .secao-card {
      display: flex; flex-direction: column; gap: 10px;
      padding: 12px; border: 1px solid #e2e8f0; border-radius: 8px; background: #f8fafc;
    }
    .secao-header {
      display: flex; align-items: center; justify-content: space-between;
    }
    .secao-num { font-size: .8rem; font-weight: 700; color: #4291e1; }
    .btn-rm-secao {
      padding: 3px 10px; border: 1px solid #fca5a5; border-radius: 6px;
      background: #fff; color: #dc2626; font-size: .75rem; cursor: pointer;
    }
    .btn-rm-secao:hover { background: #fee2e2; }
    .secao-imgs { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
    .secao-img-item {
      display: flex; flex-direction: column; align-items: center; gap: 4px;
      padding: 6px; border: 1px solid #dbe3ef; border-radius: 6px; background: #fff;
      max-width: 120px;
    }
    .secao-img-thumb { width: 100px; height: 70px; object-fit: cover; border-radius: 4px; }
    .secao-img-nome { font-size: .68rem; color: #64748b; text-align: center; word-break: break-all; }
    .btn-rm-img {
      padding: 2px 8px; border: 1px solid #fca5a5; border-radius: 4px;
      background: #fff; color: #dc2626; font-size: .72rem; cursor: pointer;
    }
    .btn-add-secao {
      align-self: flex-start; padding: 7px 16px; border: 1px dashed #4291e1;
      border-radius: 8px; background: transparent; color: #4291e1;
      font-size: .82rem; font-weight: 600; cursor: pointer; transition: background .15s;
    }
    .btn-add-secao:hover { background: #eff6ff; }

    @media (max-width: 900px) {
      .section--review { grid-template-columns: 1fr; }
    }
  `],
})
export class RelatorioCapaModalComponent implements OnChanges {
  @Input() open = false;
  @Input() operacaoLabel = 'SQUEEZE';
  @Input() prefill: Partial<RelatorioCapaData> | Record<string, any> = {};
  @Output() closed = new EventEmitter<void>();
  @Output() gerado = new EventEmitter<RelatorioCapaData>();

  form: RelatorioCapaData = this.defaultForm();
  isGenerating = false;

  private pendingMechanicalSchematicRead: Promise<void> = Promise.resolve();
  private mechanicalSchematicReadVersion = 0;

  ngOnChanges(): void {
    if (this.open) {
      this.mechanicalSchematicReadVersion++;
      this.pendingMechanicalSchematicRead = Promise.resolve();
      const defaults = this.defaultForm();
      this.form = {
        ...defaults,
        ...this.prefill,
        graficosOperacionaisSelecionados: (this.prefill as Partial<RelatorioCapaData>).graficosOperacionaisSelecionados ?? [],
        secoesPersonalizadas: (this.prefill as Partial<RelatorioCapaData>).secoesPersonalizadas ?? [],
        vazoesBombeio: {
          ...defaults.vazoesBombeio,
          ...(this.prefill as Partial<RelatorioCapaData>).vazoesBombeio,
        },
        sequenciaOperacional: {
          ...defaults.sequenciaOperacional,
          ...(this.prefill as Partial<RelatorioCapaData>).sequenciaOperacional,
        },
        operacao: this.operacaoLabel,
      };
      this.syncMinPorSecao();
    }
  }

  // Min. por seção = tubos por seção × min. por tubo (sempre automático)
  syncMinPorSecao(): void {
    const seq = this.form?.sequenciaOperacional;
    if (!seq) return;
    const tubos = Number(seq.tubosPorSecao) || 0;
    const minPorTubo = Number(seq.minPrimeirosTubos) || 0;
    seq.minDemaisTubos = tubos * minPorTubo;
  }

  fechar(): void { this.closed.emit(); }

  hasReviewData(): boolean {
    return this.hasValue(this.form.geoGradient)
      || this.hasValue(this.form.bhst)
      || this.hasValue(this.form.bhct)
      || !!this.form.bombeioRows?.length
      || !!this.form.receitaRows?.length
      || !!this.form.pastaResumo;
  }

  formatReviewNumber(value: unknown, decimals = 1): string {
    if (!this.hasValue(value)) return '-';
    const n = Number(String(value).replace(',', '.'));
    if (!Number.isFinite(n)) return String(value);
    return n.toLocaleString('pt-BR', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  formatReviewMetric(value: unknown, decimals = 1, unit = ''): string {
    const formatted = this.formatReviewNumber(value, decimals);
    return formatted === '-' || !unit ? formatted : `${formatted} ${unit}`;
  }

  private hasValue(value: unknown): boolean {
    return value != null && String(value).trim() !== '';
  }

  async gerar(): Promise<void> {
    if (this.isGenerating) return;

    this.isGenerating = true;
    await this.pendingMechanicalSchematicRead;
    this.gerado.emit({ ...this.form });
    this.closed.emit();
    this.isGenerating = false;
  }

  onMechanicalSchematicSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      alert('Selecione uma imagem com no máximo 5 MB.');
      input.value = '';
      return;
    }

    const readVersion = ++this.mechanicalSchematicReadVersion;
    this.pendingMechanicalSchematicRead = new Promise<void>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        if (readVersion === this.mechanicalSchematicReadVersion) {
          this.form = {
            ...this.form,
            esquemaMecanicoNome: file.name,
            esquemaMecanicoImagem: String(reader.result || ''),
          };
        }
        resolve();
      };
      reader.onerror = () => resolve();
      reader.onabort = () => resolve();
      reader.readAsDataURL(file);
    });
  }

  isSchematicSelected(tipo: RelatorioEsquematicoTipo): boolean {
    return (this.form.esquematicosSelecionados || []).includes(tipo);
  }

  toggleSchematic(tipo: RelatorioEsquematicoTipo, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const atual = new Set(this.form.esquematicosSelecionados || []);
    checked ? atual.add(tipo) : atual.delete(tipo);
    this.form.esquematicosSelecionados = Array.from(atual);
  }

  isGraficoSelected(tipo: GraficoOperacionalTipo): boolean {
    return (this.form.graficosOperacionaisSelecionados || []).includes(tipo);
  }

  toggleGrafico(tipo: GraficoOperacionalTipo, event: Event): void {
    const checked = (event.target as HTMLInputElement).checked;
    const atual = new Set(this.form.graficosOperacionaisSelecionados || []);
    checked ? atual.add(tipo) : atual.delete(tipo);
    this.form.graficosOperacionaisSelecionados = Array.from(atual);
  }

  addSecao(): void {
    if (!this.form.secoesPersonalizadas) this.form.secoesPersonalizadas = [];
    this.form.secoesPersonalizadas.push({ titulo: '', texto: '', imagens: [] });
  }

  removeSecao(i: number): void {
    this.form.secoesPersonalizadas?.splice(i, 1);
  }

  addImagensSecao(sI: number, event: Event): void {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files || []);
    const secao = this.form.secoesPersonalizadas?.[sI];
    if (!secao || files.length === 0) return;
    files.forEach(file => {
      if (file.size > 10 * 1024 * 1024) { alert(`Imagem "${file.name}" excede 10 MB.`); return; }
      const reader = new FileReader();
      reader.onload = () => secao.imagens.push({ nome: file.name, data: String(reader.result || '') });
      reader.readAsDataURL(file);
    });
    input.value = '';
  }

  removeImagemSecao(sI: number, imgI: number): void {
    this.form.secoesPersonalizadas?.[sI]?.imagens.splice(imgI, 1);
  }

  private defaultForm(): RelatorioCapaData {
    const today = new Date().toISOString().split('T')[0];
    return {
      cliente: '',
      clienteLogoNome: '',
      clienteLogoImagem: '',
      preparadoPara: '',
      documento: `Programa de Cimentação para ${this.operacaoLabel}`,
      preparadoPor: '',
      revisadoPor: '',
      data: today,
      versao: '01',
      origem: '',
      poco: '',
      campo: '',
      sonda: '',
      jobNum: '',
      tipoReceitaRelatorio: 'volume',
      esquematicosSelecionados: ['bombeio', 'semTubing'],
      graficosOperacionaisSelecionados: [],
      secoesPersonalizadas: [],
      vazoesBombeio: {
        fluidoFrenteBpm: '',
        pastaBpm: '',
        fluidoAtrasBpm: '',
        deslocamentoBpm: '',
      },
      sequenciaOperacional: {
        colunaTrabalho: '2 7/8" EU',
        colunaProfundidadeM: 1225,
        testeInjetividadeDefinidoPor: 'ORIGEM',
        pressaoTesteLinhasPsi: 3000,
        volumeCirculacaoReversaBbl: 0,
        pressaoMaxSqueezePsi: 0,
        volumeMaxInjetadoBbl: 0,
        tempoMaxPressurizacaoH: '01:00h',
        comprimentoTuboM: 9.4,
        secoesAcimaTopoCimento: 2,
        tubosPorSecao: 2,
        minPrimeirosTubos: 3,
        minDemaisTubos: 6,
        tempoBombeabilidade: '04:31 h',
        pressaoResistenciaPsi: 1500,
        tempoResistencia: '08:00 h',
      },
      operacao: this.operacaoLabel,
    };
  }
}
