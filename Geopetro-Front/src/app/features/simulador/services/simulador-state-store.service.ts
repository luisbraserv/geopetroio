import { Injectable } from '@angular/core';

// Mantido para compatibilidade — formValue ainda é usado internamente
export interface SimuladorStateSnapshot {
  id: string;
  name: string;
  operacao: 'tampao' | 'squeeze';
  savedAt: string;
  formValue: Record<string, unknown>;
}

// Tipos exportados para o modal
export interface DadosRelatorio {
  cliente?: string;
  clienteLogoNome?: string;
  clienteLogoImagem?: string;
  preparadoPara?: string;
  documento?: string;
  preparadoPor?: string;
  revisadoPor?: string;
  data?: string;
  versao?: string;
  origem?: string;
  poco?: string;
  campo?: string;
  sonda?: string;
  jobNum?: string;
  pais?: string;
  revestimento?: string;
  zonaIsolarNome?: string;
  tipoReceitaRelatorio?: 'pasta' | 'volume';
  esquematicosSelecionados?: ('bombeio' | 'comTubing' | 'semTubing')[];
  graficosOperacionaisSelecionados?: ('cronograma' | 'pressao')[];
  vazoesBombeio?: {
    fluidoFrenteBpm?: number | string;
    pastaBpm?: number | string;
    fluidoAtrasBpm?: number | string;
    deslocamentoBpm?: number | string;
  };
  sequenciaOperacional?: Record<string, string | number>;
  zonaIsolarTopo?: string;
  zonaIsolarBase?: string;
  baseTampao?: string;
  topoCimento?: string;
  esquemaMecanicoNome?: string;
  esquemaMecanicoImagem?: string;
  secoesPersonalizadas?: any[];
  operacao?: string;
}

// Chave local de fallback (mantida apenas caso o usuário não esteja logado)
const KEY_PREFIX = 'geopetro-state-v1-';

@Injectable({ providedIn: 'root' })
export class SimuladorStateStoreService {

  // ── Fallback local (não autenticado) ──
  listLocal(operacao: 'tampao' | 'squeeze'): SimuladorStateSnapshot[] {
    try {
      const raw = localStorage.getItem(KEY_PREFIX + operacao);
      return raw ? JSON.parse(raw) : [];
    } catch { return []; }
  }

  saveLocal(operacao: 'tampao' | 'squeeze', name: string, formValue: Record<string, unknown>): SimuladorStateSnapshot {
    const list = this.listLocal(operacao);
    const snap: SimuladorStateSnapshot = {
      id: Date.now().toString(),
      name: name.trim() || `Cenário ${list.length + 1}`,
      operacao,
      savedAt: new Date().toISOString(),
      formValue,
    };
    list.unshift(snap);
    this.persistLocal(operacao, list);
    return snap;
  }

  updateLocal(operacao: 'tampao' | 'squeeze', id: string, formValue: Record<string, unknown>): void {
    const list = this.listLocal(operacao).map(s =>
      s.id === id ? { ...s, formValue, savedAt: new Date().toISOString() } : s,
    );
    this.persistLocal(operacao, list);
  }

  deleteLocal(operacao: 'tampao' | 'squeeze', id: string): void {
    this.persistLocal(operacao, this.listLocal(operacao).filter(s => s.id !== id));
  }

  private persistLocal(operacao: string, list: SimuladorStateSnapshot[]): void {
    try { localStorage.setItem(KEY_PREFIX + operacao, JSON.stringify(list)); } catch { }
  }

  // ── Dados do relatório (persistidos localmente por simplicidade) ──
  saveDadosRelatorio(operacao: string, dados: DadosRelatorio): void {
    try { localStorage.setItem(`geopetro-relatorio-${operacao}`, JSON.stringify(dados)); } catch { }
  }

  loadDadosRelatorio(operacao: string): DadosRelatorio {
    try {
      const raw = localStorage.getItem(`geopetro-relatorio-${operacao}`);
      return raw ? JSON.parse(raw) : {};
    } catch { return {}; }
  }
}
