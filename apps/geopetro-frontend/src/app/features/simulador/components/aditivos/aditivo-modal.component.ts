import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TuiButton, TuiIcon } from '@taiga-ui/core';
import {
  ADITIVO_MISTURADO_EM,
  ADITIVO_UNIDADES_DOSAGEM,
  Aditivo,
  AditivoCatalogo,
  AditivoUsado,
  MisturadoEm,
  UnidadeDosagem,
  PastaEffect,
  funcaoGenericaAditivo,
  hydrateAditivoFromCatalog,
  unidadePadraoAditivo,
} from '../../models/aditivo.model';
import { SlurryCalculoService } from '../../services/slurry-calculo.service';
import { RheologyAdjustmentService } from '../../services/rheology-adjustment.service';
import { AdditiveEffectEngineService } from '../../services/additive-effect-engine.service';

type SectionId = 'simple' | 'advanced';

@Component({
  selector: 'app-aditivo-modal',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, TuiButton, TuiIcon],
  template: `
    @if (open) {
      <div class="modal-backdrop" role="presentation" (click)="cancelar()">
        <section class="modal" role="dialog" aria-modal="true" aria-labelledby="aditivo-title" (click)="$event.stopPropagation()">
          <header class="modal-head">
            <div>
              <span class="eyebrow">Cadastro de cimentacao</span>
              <h2 id="aditivo-title">Aditivos da pasta</h2>
            </div>
            <button tuiButton type="button" size="s" appearance="secondary" (click)="cancelar()">
              <tui-icon icon="@tui.x"></tui-icon>
              Cancelar
            </button>
          </header>

          <div class="actions">
            <select class="catalog" (change)="adicionarCatalogo($any($event.target).value); $any($event.target).value = ''">
              <option value="">Adicionar aditivo do catalogo</option>
              @for (cat of catalogo; track cat.catalogId) {
                <option [value]="cat.catalogId">{{ cat.name }} - {{ cat.funcaoPrincipal || cat.primaryFunction || categoryLabel(cat) }}</option>
              }
            </select>
            <button tuiButton type="button" size="s" appearance="secondary" [disabled]="selectedIndex < 0" (click)="removerSelecionado()">
              <tui-icon icon="@tui.trash-2"></tui-icon>
              Remover
            </button>
            <div class="actions-sep"></div>
            <button tuiButton type="button" size="s" appearance="secondary" (click)="exportarJson()">
              <tui-icon icon="@tui.download"></tui-icon>
              Exportar JSON
            </button>
            <button tuiButton type="button" size="s" appearance="secondary" (click)="fileInput.click()">
              <tui-icon icon="@tui.upload"></tui-icon>
              Importar JSON
            </button>
            <input #fileInput type="file" accept=".json" style="display:none" (change)="onImportFile($any($event.target).files)">
            <button tuiButton type="button" size="s" appearance="primary" (click)="salvar()">
              <tui-icon icon="@tui.save"></tui-icon>
              Salvar
            </button>
          </div>

          <div class="grid">
            <aside class="list">
              <h3>Aditivos selecionados</h3>
              @if (!formArray || formArray.length === 0) {
                <div class="empty">Nenhum aditivo selecionado.</div>
              } @else {
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th>Nome</th>
                        <th>Funcao</th>
                        <th>Conc.</th>
                        <th>Unidade</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      @for (row of controls(); track $index) {
                        <tr [class.active]="$index === selectedIndex" (click)="select($index)">
                          <td>{{ value(row, 'name') || catalogName(value(row, 'catalogId')) }}</td>
                          <td>{{ value(row, 'funcaoPrincipal') || catalogFunction(value(row, 'catalogId')) }}</td>
                          <td>{{ value(row, 'conc') }}</td>
                          <td>{{ unitLabel(value(row, 'unidadeDosagem')) }}</td>
                          <td>{{ value(row, 'ativo') === false ? 'Inativo' : 'Ativo' }}</td>
                        </tr>
                      }
                    </tbody>
                  </table>
                </div>
              }
            </aside>

            <main class="editor">
              @if (selectedForm(); as group) {
                <nav class="tabs" aria-label="Secoes do aditivo">
                  <button type="button" [class.active]="activeSection === 'simple'" (click)="activeSection = 'simple'">Simples</button>
                  <button type="button" [class.active]="activeSection === 'advanced'" (click)="activeSection = 'advanced'">Avancado</button>
                </nav>

                <form [formGroup]="group" class="form">
                  @if (activeSection === 'simple') {
                    <div class="fields two">
                      <label>Aditivo
                        <select formControlName="catalogId" (change)="onCatalogChange(group)">
                          <option value="">Selecione</option>
                          @for (cat of catalogo; track cat.catalogId) {
                            <option [value]="cat.catalogId">{{ cat.name }}</option>
                          }
                        </select>
                      </label>
                      <label>Funcao<input formControlName="funcaoPrincipal" readonly></label>
                      <label>Concentracao<input type="number" step="0.001" formControlName="conc"></label>
                      <label>Unidade
                        <select formControlName="unidadeDosagem">
                          @for (u of allowedUnits(group); track u.value) { <option [value]="u.value">{{ u.label }}</option> }
                        </select>
                      </label>
                      <label>Misturado em
                        <select formControlName="misturadoEm">
                          @for (m of misturadoEm; track m.value) { <option [value]="m.value">{{ m.label }}</option> }
                        </select>
                      </label>
                      <label class="check"><input type="checkbox" formControlName="ativo"> Ativo na receita</label>
                    </div>
                  } @else {
                    @if (hydrated(group); as add) {
                      <div class="advanced">
                        <div class="badge-row">
                          <span class="badge">{{ reologiaBadge(add) }}</span>
                          <span class="badge muted">{{ funcaoGenerica(add) }}</span>
                          <span class="badge muted">{{ origemEfeito(add) }}</span>
                          @if (add._usesEstimatedTechnicalData) { <span class="badge warn">Dados incompletos</span> }
                        </div>
                        <div class="effect-cards">
                          <section class="effect-card">
                            <h4>Efeitos positivos na pasta</h4>
                            @for (effect of positiveEffects(add); track $index) {
                              <div class="effect-row">
                                <strong>{{ effectLabel(effect.parametro) }}</strong>
                                <span>{{ directionLabel(effect.direcao) }} - {{ intensityLabel(effect.intensidade) }}</span>
                                @if (effect.observacao) { <small>{{ effect.observacao }}</small> }
                              </div>
                            } @empty {
                              <p>Nenhum efeito positivo cadastrado.</p>
                            }
                          </section>
                          <section class="effect-card">
                            <h4>Efeitos negativos / riscos operacionais</h4>
                            @for (effect of negativeEffects(add); track $index) {
                              <div class="effect-row risk">
                                <strong>{{ effectLabel(effect.parametro) }}</strong>
                                <span>{{ directionLabel(effect.direcao) }} - {{ intensityLabel(effect.intensidade) }}</span>
                                @if (effect.observacao) { <small>{{ effect.observacao }}</small> }
                              </div>
                            } @empty {
                              <p>Nenhum risco operacional cadastrado.</p>
                            }
                          </section>
                        </div>
                        <dl>
                          <div><dt>Estado fisico</dt><dd>{{ add.type }}</dd></div>
                          <div><dt>Densidade</dt><dd>{{ add.densidadeLbGal ?? add.densityLbGal ?? add.densityLb ?? '-' }} lb/gal</dd></div>
                          <div><dt>Volume absoluto</dt><dd>{{ add.volumeAbsolutoGalPerLb ?? add.absoluteVolumeGalLb ?? '-' }} gal/lb</dd></div>
                          <div><dt>Massa especifica</dt><dd>{{ add.massaEspecifica ?? add.specificGravity ?? '-' }} {{ add.massaEspecificaUnidade || 'sg' }}</dd></div>
                          <div><dt>Coeficientes</dt><dd>{{ coefficientSummary(add) }}</dd></div>
                          <div><dt>Compatibilidade</dt><dd>{{ compatibilitySummary(add) }}</dd></div>
                        </dl>
                        <div class="coef-editor">
                          <h4>Coeficientes numericos</h4>
                          <label>Delta PV/unid.<input type="number" step="0.001" formControlName="pvDeltaPerUnit"></label>
                          <label>Delta YP/unid.<input type="number" step="0.001" formControlName="ypDeltaPerUnit"></label>
                          <label>Delta Gel 10s/unid.<input type="number" step="0.001" formControlName="gel10sDeltaPerUnit"></label>
                          <label>Delta TT min/unid.<input type="number" step="0.001" formControlName="thickeningTimeDeltaMinPerUnit"></label>
                          <label>Delta perda carga/unid.<input type="number" step="0.001" formControlName="frictionFactorMultiplierDeltaPerUnit"></label>
                          <label>Reducao filtrado/unid.<input type="number" step="0.001" formControlName="fluidLossReductionFactorPerUnit"></label>
                        </div>
                      </div>
                    }
                  }

                  <div class="calc-box">
                    <strong>Calculo por saco</strong>
                    <span>Massa: {{ additiveCalc(group).wt | number:'1.3-3' }} lb/sk</span>
                    <span>Volume: {{ additiveCalc(group).vol | number:'1.3-3' }} gal/sk</span>
                    <span>Volume absoluto: {{ additiveCalc(group).absoluteVolumeGal | number:'1.3-3' }} gal/sk</span>
                  </div>

                  @for (warning of warnings(group); track warning) {
                    <div class="warning">{{ warning }}</div>
                  }
                </form>
              } @else {
                <div class="empty editor-empty">Selecione um aditivo para editar.</div>
              }
            </main>
          </div>
        </section>
      </div>
    }
  `,
  styles: [`
    .modal-backdrop{position:fixed;inset:0;z-index:50;background:rgba(15,23,42,.45);display:grid;place-items:center;padding:20px}
    .modal{width:min(1080px,96vw);max-height:92vh;overflow:hidden;background:#f8fafc;border:1px solid #dbe3ef;border-radius:12px;box-shadow:0 24px 70px rgba(15,23,42,.28);display:flex;flex-direction:column;color:#233044}
    .modal-head,.actions{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 18px;border-bottom:1px solid #e2e8f0;background:#fff}
    .eyebrow{font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#607086;font-weight:700}.modal h2{margin:2px 0 0;font-size:22px}.actions{justify-content:flex-start;flex-wrap:wrap}.catalog{min-height:34px;border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:0 10px}.actions-sep{width:1px;height:28px;background:#e2e8f0;margin:0 4px;flex-shrink:0}
    .grid{display:grid;grid-template-columns:minmax(360px,43%) 1fr;min-height:0;overflow:hidden}.list,.editor{padding:16px;overflow:auto}.list{border-right:1px solid #e2e8f0;background:#f1f5f9}.list h3{margin:0 0 10px;font-size:15px}
    .table-wrap{overflow:auto;border:1px solid #d9e2ee;border-radius:10px;background:#fff}table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:9px 8px;border-bottom:1px solid #e8edf5;text-align:left;white-space:nowrap}th{background:#eef4fb;color:#475569;font-weight:700}tr{cursor:pointer}tr.active,tbody tr:hover{background:#e0f2fe}
    .tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px}.tabs button{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:7px 10px;font-size:12px;color:#334155}.tabs button.active{background:#0f766e;color:#fff;border-color:#0f766e}
    .fields{display:grid;grid-template-columns:1fr;gap:10px}.fields.two{grid-template-columns:repeat(2,minmax(0,1fr))}.fields label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:#475569}.fields input,.fields select{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:8px 9px;font:inherit;color:#1f2937}.fields input[readonly]{background:#f1f5f9}.check{align-self:end;flex-direction:row!important;align-items:center}
    .calc-box{margin-top:14px;display:flex;flex-wrap:wrap;gap:10px;padding:10px 12px;border:1px solid #cfe8e5;background:#ecfdf5;border-radius:10px;font-size:12px}.calc-box strong{width:100%;font-size:13px}.warning{margin-top:8px;padding:9px 10px;border:1px solid #facc15;background:#fefce8;border-radius:8px;color:#854d0e;font-size:12px}.empty{border:1px dashed #cbd5e1;border-radius:10px;padding:16px;text-align:center;color:#64748b;background:#fff}.editor-empty{margin-top:34px}
    .advanced dl{display:grid;grid-template-columns:1fr;gap:8px;margin:0}.advanced div{display:grid;grid-template-columns:150px 1fr;gap:10px}.advanced dt{font-size:12px;font-weight:700;color:#64748b}.advanced dd{margin:0;font-size:13px;color:#1f2937}.badge-row{display:flex!important;grid-template-columns:none!important;flex-wrap:wrap;gap:8px;margin-bottom:12px}.badge{display:inline-flex;border-radius:999px;background:#e0f2fe;color:#075985;padding:4px 8px;font-size:11px;font-weight:700}.badge.muted{background:#e2e8f0;color:#475569}.badge.warn{background:#fef3c7;color:#92400e}
    .effect-cards{display:grid!important;grid-template-columns:1fr 1fr!important;gap:10px!important;margin:10px 0 14px}.effect-card{border:1px solid #dbe3ef;background:#fff;border-radius:8px;padding:10px}.effect-card h4,.coef-editor h4{margin:0 0 8px;font-size:13px;color:#334155}.effect-card p{margin:0;color:#64748b;font-size:12px}.effect-row{display:flex!important;grid-template-columns:none!important;flex-direction:column;gap:2px;padding:7px 0;border-top:1px solid #eef2f7}.effect-row:first-of-type{border-top:0}.effect-row strong{font-size:12px;color:#0f766e}.effect-row.risk strong{color:#b45309}.effect-row span,.effect-row small{font-size:12px;color:#475569}.coef-editor{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:10px!important;margin-top:14px;border-top:1px solid #e2e8f0;padding-top:12px}.coef-editor h4{grid-column:1/-1}.coef-editor label{display:flex;flex-direction:column;gap:5px;font-size:12px;font-weight:700;color:#475569}.coef-editor input{border:1px solid #cbd5e1;border-radius:8px;background:#fff;padding:8px 9px;font:inherit;color:#1f2937}
    @media(max-width:900px){.grid{grid-template-columns:1fr}.list{border-right:0;border-bottom:1px solid #e2e8f0}.fields.two{grid-template-columns:1fr}.modal{max-height:96vh}}
  `],
})
export class AditivoModalComponent {
  @Input() open = false;
  @Input() formArray!: FormArray;
  @Input() catalogo: AditivoCatalogo[] = [];
  @Output() closed = new EventEmitter<void>();
  @Output() exportJson = new EventEmitter<void>();
  @Output() importJson = new EventEmitter<unknown[]>();
  @ViewChild('fileInput') fileInputRef!: ElementRef<HTMLInputElement>;

  selectedIndex = -1;
  activeSection: SectionId = 'simple';
  readonly unidades = ADITIVO_UNIDADES_DOSAGEM;
  readonly misturadoEm = ADITIVO_MISTURADO_EM;

  constructor(
    private fb: FormBuilder,
    private slurryCalc: SlurryCalculoService,
    private rheology: RheologyAdjustmentService,
    private effectEngine: AdditiveEffectEngineService,
  ) {}

  controls(): FormGroup[] {
    return (this.formArray?.controls || []) as FormGroup[];
  }

  selectedForm(): FormGroup | null {
    const group = this.selectedIndex >= 0 ? this.formArray?.at(this.selectedIndex) as FormGroup : null;
    if (group) this.ensureSimpleControls(group);
    return group;
  }

  select(index: number): void {
    this.selectedIndex = index;
    this.ensureSimpleControls(this.formArray.at(index) as FormGroup);
  }

  adicionarCatalogo(catalogId: string): void {
    const cat = this.catalogo.find(item => item.catalogId === catalogId);
    if (!cat) return;
    this.formArray.push(this.createGroup(cat));
    this.selectedIndex = this.formArray.length - 1;
    this.activeSection = 'simple';
  }

  removerSelecionado(): void {
    if (this.selectedIndex < 0) return;
    this.formArray.removeAt(this.selectedIndex);
    this.selectedIndex = Math.min(this.selectedIndex, this.formArray.length - 1);
  }

  salvar(): void {
    if (this.formArray.invalid) {
      this.formArray.markAllAsTouched();
      return;
    }
    this.closed.emit();
  }

  cancelar(): void {
    this.closed.emit();
  }

  exportarJson(): void {
    this.exportJson.emit();
  }

  onImportFile(files: FileList | null): void {
    const file = files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result as string);
        if (Array.isArray(parsed)) this.importJson.emit(parsed);
      } catch { /* JSON invalido: ignora */ }
      if (this.fileInputRef) this.fileInputRef.nativeElement.value = '';
    };
    reader.readAsText(file);
  }

  onCatalogChange(group: FormGroup): void {
    const cat = this.catalogo.find(item => item.catalogId === group.get('catalogId')?.value);
    if (!cat) return;
    group.patchValue({
      name: cat.name,
      funcaoPrincipal: cat.funcaoPrincipal ?? cat.primaryFunction ?? '',
      unidadeDosagem: unidadePadraoAditivo(cat),
      misturadoEm: cat.misturadoEm ?? 'aguaMistura',
    });
  }

  additiveCalc(group: FormGroup) {
    return this.slurryCalc.getAdditiveCalcs([this.hydrated(group)])[0] || { wt: 0, vol: 0, absoluteVolumeGal: 0 };
  }

  warnings(group: FormGroup): string[] {
    const aditivo = this.hydrated(group);
    const out = [...(aditivo._hydrationWarnings || [])];
    const conc = Number(aditivo.conc);
    if (!Number.isFinite(conc) || conc < 0) out.push('Concentracao nao pode ser negativa.');
    if (aditivo.afetaReologia && !this.rheology.hasAutomaticRheologyData(aditivo)) {
      out.push('Este aditivo usara perfil reologico estimado por funcao.');
    }
    const calcWarning = this.additiveCalc(group).warning;
    if (calcWarning) out.push(calcWarning);
    return [...new Set(out)];
  }

  hydrated(group: FormGroup): Aditivo {
    const raw = group.getRawValue();
    const hydrated = hydrateAditivoFromCatalog(raw, this.catalogo);
    return {
      ...hydrated,
      coefficients: this.mergeCoefficientOverrides(hydrated, raw),
    };
  }

  allowedUnits(group: FormGroup): { value: UnidadeDosagem; label: string }[] {
    const add = this.hydrated(group);
    const simpleUnit = unidadePadraoAditivo(add);
    return this.unidades.filter(u => u.value === simpleUnit);
  }

  value(row: FormGroup, control: string): any {
    return row.get(control)?.value;
  }

  categoryLabel(add: AditivoCatalogo): string {
    return String(add.category || '-');
  }

  catalogName(catalogId: string): string {
    return this.catalogo.find(c => c.catalogId === catalogId)?.name || 'Aditivo';
  }

  catalogFunction(catalogId: string): string {
    const cat = this.catalogo.find(c => c.catalogId === catalogId);
    return cat?.funcaoPrincipal || cat?.primaryFunction || '';
  }

  unitLabel(value: UnidadeDosagem | string): string {
    return this.unidades.find(u => u.value === value)?.label || String(value || '-');
  }

  funcaoGenerica(add: Aditivo): string {
    return funcaoGenericaAditivo(add);
  }

  reologiaBadge(add: Aditivo): string {
    if (this.rheology.hasAutomaticRheologyData(add)) return 'Catalogo';
    if (add.afetaReologia) return 'Estimado';
    return 'Base';
  }

  positiveEffects(add: Aditivo): PastaEffect[] {
    return this.effectEngine.resolveEffectProfile(add).positivo;
  }

  negativeEffects(add: Aditivo): PastaEffect[] {
    return this.effectEngine.resolveEffectProfile(add).negativo;
  }

  origemEfeito(add: Aditivo): string {
    const origem = add.origemEfeito || (this.rheology.hasAutomaticRheologyData(add) ? 'catalogo' : 'estimado');
    return origem === 'laboratorio' ? 'Laboratorio' : origem === 'catalogo' ? 'Catalogo' : 'Estimado';
  }

  effectLabel(parametro: PastaEffect['parametro']): string {
    const labels: Record<string, string> = {
      tempoEspessamento: 'Tempo de bombeabilidade',
      resistenciaInicial: 'Resistencia inicial',
      pv: 'PV',
      yp: 'YP',
      gel: 'Gel',
      filtrado: 'Filtrado',
      aguaLivre: 'Agua livre',
      sedimentacao: 'Sedimentacao',
      densidade: 'Densidade',
      rendimento: 'Rendimento',
      perdaCarga: 'Perda de carga',
      riscoGasMigration: 'Risco gas migration',
      riscoCorrosao: 'Risco corrosao',
      riscoSobrerretardo: 'Risco sobrerretardo',
      riscoPegaRapida: 'Risco pega rapida',
      riscoEspuma: 'Risco espuma',
      estabilidadeTermica: 'Estabilidade termica',
      perdaCirculacao: 'Perda de circulacao',
      permeabilidadeEstimada: 'Permeabilidade estimada',
      arIncorporado: 'Ar incorporado',
    };
    return labels[parametro] || parametro;
  }

  directionLabel(direction: PastaEffect['direcao']): string {
    return direction === 'aumenta' ? 'aumenta' : 'reduz';
  }

  intensityLabel(intensity: PastaEffect['intensidade']): string {
    return intensity === 'medio' ? 'medio' : intensity;
  }

  coefficientSummary(add: Aditivo): string {
    const coeffs = add.coefficients || add.rheology?.coefficients || {};
    const keys = Object.entries(coeffs).filter(([, value]) => Number.isFinite(Number(value))).map(([key]) => key);
    return keys.length ? keys.join(', ') : '-';
  }

  compatibilitySummary(add: Aditivo): string {
    const items = [
      add.compativelComAguaDoce ? 'Agua doce' : '',
      add.compativelComAguaMar ? 'Agua do mar' : '',
      add.compativelComSalmoura ? 'Salmoura' : '',
      add.compativelComLatex ? 'Latex' : '',
      add.compativelComSilica ? 'Silica' : '',
      add.compativelComEspumada ? 'Espumada' : '',
    ].filter(Boolean);
    return items.length ? items.join(', ') : '-';
  }

  createGroup(data: Partial<AditivoCatalogo & AditivoUsado> = {}): FormGroup {
    const source = data as Partial<Aditivo>;
    return this.fb.group({
      catalogId: [data.catalogId ?? '', Validators.required],
      name: [data.name ?? '', Validators.required],
      funcaoPrincipal: [data.funcaoPrincipal ?? data.primaryFunction ?? ''],
      conc: [data.conc ?? data.defaultConc ?? data.concentracaoPadrao ?? 0, [Validators.required, Validators.min(0)]],
      unidadeDosagem: [data.unidadeDosagem ?? unidadePadraoAditivo(source), Validators.required],
      misturadoEm: [data.misturadoEm ?? 'aguaMistura' as MisturadoEm],
      ativo: [data.ativo ?? true],
      pvDeltaPerUnit: [data.coefficients?.pvDeltaPerUnit ?? null],
      ypDeltaPerUnit: [data.coefficients?.ypDeltaPerUnit ?? null],
      gel10sDeltaPerUnit: [data.coefficients?.gel10sDeltaPerUnit ?? null],
      thickeningTimeDeltaMinPerUnit: [data.coefficients?.thickeningTimeDeltaMinPerUnit ?? null],
      frictionFactorMultiplierDeltaPerUnit: [data.coefficients?.frictionFactorMultiplierDeltaPerUnit ?? null],
      fluidLossReductionFactorPerUnit: [data.coefficients?.fluidLossReductionFactorPerUnit ?? null],
    });
  }

  private ensureSimpleControls(group: FormGroup): void {
    const raw = group.getRawValue();
    const hydrated = hydrateAditivoFromCatalog(raw, this.catalogo);
    const defaults: AditivoUsado = {
      catalogId: raw.catalogId ?? hydrated.catalogId ?? '',
      name: raw.name ?? hydrated.name,
      funcaoPrincipal: raw.funcaoPrincipal ?? hydrated.funcaoPrincipal ?? hydrated.primaryFunction ?? '',
      conc: raw.conc ?? hydrated.conc ?? 0,
      unidadeDosagem: raw.unidadeDosagem ?? unidadePadraoAditivo(hydrated),
      misturadoEm: raw.misturadoEm ?? hydrated.misturadoEm ?? 'aguaMistura',
      ativo: raw.ativo ?? true,
    };
    for (const [key, value] of Object.entries(defaults)) {
      if (!group.get(key)) group.addControl(key, this.fb.control(value));
    }
    const coeffs = hydrated.coefficients || hydrated.rheology?.coefficients || {};
    const coefficientDefaults: Record<string, number | null | undefined> = {
      pvDeltaPerUnit: coeffs.pvDeltaPerUnit,
      ypDeltaPerUnit: coeffs.ypDeltaPerUnit,
      gel10sDeltaPerUnit: coeffs.gel10sDeltaPerUnit,
      thickeningTimeDeltaMinPerUnit: coeffs.thickeningTimeDeltaMinPerUnit,
      frictionFactorMultiplierDeltaPerUnit: coeffs.frictionFactorMultiplierDeltaPerUnit,
      fluidLossReductionFactorPerUnit: coeffs.fluidLossReductionFactorPerUnit,
    };
    for (const [key, value] of Object.entries(coefficientDefaults)) {
      if (!group.get(key)) group.addControl(key, this.fb.control(value ?? null));
    }
  }

  private mergeCoefficientOverrides(add: Aditivo, raw: Record<string, unknown>) {
    const coeffs = { ...(add.coefficients || add.rheology?.coefficients || {}) };
    for (const key of [
      'pvDeltaPerUnit',
      'ypDeltaPerUnit',
      'gel10sDeltaPerUnit',
      'thickeningTimeDeltaMinPerUnit',
      'frictionFactorMultiplierDeltaPerUnit',
      'fluidLossReductionFactorPerUnit',
    ]) {
      const value = this.optionalNumber(raw[key]);
      if (value != null) (coeffs as Record<string, number>)[key] = value;
    }
    return coeffs;
  }

  private optionalNumber(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
}
