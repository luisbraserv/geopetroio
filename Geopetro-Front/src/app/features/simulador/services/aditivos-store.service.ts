import { Injectable } from '@angular/core';

const KEYS: Record<string, string> = {
  squeeze: 'geopetro-aditivos-squeeze-v1',
  tampao:  'geopetro-aditivos-tampao-v1',
};

@Injectable({ providedIn: 'root' })
export class AditivosStoreService {

  save(operacao: 'squeeze' | 'tampao', aditivos: unknown[]): void {
    try {
      localStorage.setItem(KEYS[operacao], JSON.stringify(aditivos));
    } catch { /* quota exceeded — ignore */ }
  }

  load(operacao: 'squeeze' | 'tampao'): unknown[] {
    try {
      const raw = localStorage.getItem(KEYS[operacao]);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  }

  clear(operacao: 'squeeze' | 'tampao'): void {
    localStorage.removeItem(KEYS[operacao]);
  }

  exportJson(operacao: 'squeeze' | 'tampao', aditivos: unknown[]): void {
    const blob = new Blob([JSON.stringify(aditivos, null, 2)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `aditivos-${operacao}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importJson(file: File): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        try {
          const parsed = JSON.parse(reader.result as string);
          resolve(Array.isArray(parsed) ? parsed : []);
        } catch { reject(new Error('JSON inválido')); }
      };
      reader.onerror = () => reject(new Error('Erro ao ler arquivo'));
      reader.readAsText(file);
    });
  }
}
