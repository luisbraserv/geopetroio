import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import type { PocoApi } from '../models/poco.model';
import type { PrimaryScenario } from '../models/primary-scenario.model';
import { primaryScenarioFromApi, primaryScenarioPayload, PrimaryScenarioError } from './primary-scenario-codec';
import { SimuladorStateApiService, type CenarioApi } from './simulador-state-api.service';
import { parsePrimaryReportData, type PrimaryReportData } from '../models/primary-report-data.model';

export const PRIMARY_OPERATION = 'primaria';

export interface PrimarySaveState {
  /** Só vira `saved` depois da resposta de sucesso da API. */
  status: 'unsaved' | 'saving' | 'saved' | 'failed';
  scenarioId: number | null;
  scenarioName: string | null;
  savedAt: string | null;
  message: string | null;
}

/**
 * Persistência do cenário de primária pelo contrato existente de cenários,
 * com `operacao: 'primaria'`. Não cria endpoint nem tabela por antecipação e
 * nunca marca salvo antes da resposta. Cálculos continuam no front.
 */
@Injectable({ providedIn: 'root' })
export class PrimaryScenarioStoreService {
  private readonly api = inject(SimuladorStateApiService);
  private revision = 0;
  private epoch = 0;

  private readonly state = signal<PrimarySaveState>({
    status: 'unsaved', scenarioId: null, scenarioName: null, savedAt: null, message: null });

  readonly saveState = computed(() => this.state());
  readonly isSaved = computed(() => this.state().status === 'saved');

  /** Qualquer edição derruba o "salvo": o que está na tela deixou de ser o gravado. */
  markDirty(): void {
    this.revision++;
    const current = this.state();
    if (current.status === 'saving') return;
    this.state.set({ ...current, status: 'unsaved', message: null });
  }

  reset(): void {
    this.epoch++; this.revision++;
    this.state.set({ status: 'unsaved', scenarioId: null, scenarioName: null,
      savedAt: null, message: null });
  }

  listar(pastaId?: number): Promise<CenarioApi[]> {
    return firstValueFrom(this.api.listarCenarios(PRIMARY_OPERATION, pastaId));
  }

  /**
   * Abre um cenário do banco. Operação incompatível é recusada: importar squeeze
   * não converte para primária.
   */
  async abrir(id: number): Promise<{ scenario: PrimaryScenario; cenario: CenarioApi; reportData: PrimaryReportData }> {
    if (this.state().status === 'saving') throw new Error('Aguarde o salvamento antes de abrir outro cenário.');
    const epoch = ++this.epoch;
    const revision = this.revision;
    const cenario = await firstValueFrom(this.api.buscarCenario(id));
    const scenario = primaryScenarioFromApi(cenario);
    const reportData = parsePrimaryReportData(cenario.dadosRelatorio);
    if (epoch !== this.epoch || revision !== this.revision)
      throw new Error('O cenário atual mudou durante o carregamento. Suas alterações foram preservadas; abra novamente o cenário desejado.');
    this.state.set({ status: 'saved', scenarioId: cenario.id, scenarioName: cenario.nome,
      savedAt: cenario.atualizadoEm, message: null });
    return { scenario, cenario, reportData };
  }

  /**
   * Cria ou atualiza. Falha de rede mantém o estado não salvo e a mensagem, para
   * que o usuário ainda possa exportar o arquivo em vez de perder o trabalho.
   */
  async salvar(scenario: PrimaryScenario, options: {
    nome: string; pastaId?: number | null; poco?: PocoApi | null;
    dadosRelatorio?: string | null; asNew?: boolean;
  }): Promise<CenarioApi | null> {
    const current = this.state();
    if (current.status === 'saving') return null;
    const revision = this.revision;
    const epoch = this.epoch;
    this.state.set({ ...current, status: 'saving', message: null });
    let payload: ReturnType<typeof primaryScenarioPayload>;
    try {
      if (!options.nome.trim()) throw new Error('Informe o nome do cenário.');
      parsePrimaryReportData(options.dadosRelatorio);
      payload = primaryScenarioPayload(scenario, options.poco ?? null);
    } catch (error) {
      // Payload inválido nem chega à rede, e o cenário aberto continua como está.
      if (epoch === this.epoch) this.state.set({ ...current, status: 'failed', message: describe(error) });
      return null;
    }
    const body = { ...payload, nome: options.nome, pastaId: options.pastaId ?? null,
      dadosRelatorio: options.dadosRelatorio ?? null };
    try {
      const saved = await firstValueFrom(current.scenarioId && !options.asNew
        ? this.api.atualizarCenario(current.scenarioId, body)
        : this.api.criarCenario(body));
      if (epoch !== this.epoch) return null;
      this.state.set({ status: revision === this.revision ? 'saved' : 'unsaved', scenarioId: saved.id, scenarioName: saved.nome,
        savedAt: saved.atualizadoEm, message: null });
      return saved;
    } catch (error) {
      if (epoch === this.epoch) this.state.set({ ...current, status: 'failed', message: describe(error) });
      return null;
    }
  }

  /** Adota um cenário importado: novo, editável e ainda não salvo no banco. */
  adopt(nome: string | null): void {
    this.epoch++; this.revision++;
    this.state.set({ status: 'unsaved', scenarioId: null, scenarioName: nome,
      savedAt: null, message: null });
  }
}

function describe(error: unknown): string {
  if (error instanceof PrimaryScenarioError) return error.message;
  const status = (error as { status?: number } | null)?.status;
  if (status === 409) return 'A geometria do poço mudou desde que o cenário foi aberto. Revise antes de salvar.';
  if (error instanceof Error && error.message) return error.message;
  return 'Não foi possível salvar. O cenário continua não salvo e pode ser exportado.';
}
