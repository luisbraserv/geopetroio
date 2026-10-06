import { chaveGrandeza } from './grandezas-de-card';

/** Dois níveis — RN-071. A ordem importa: é ela que ordena a lista do mais grave para o menos. */
export type SeveridadeAlarme = 'ATENCAO' | 'CRITICO';

export type LimiteViolado = 'MIN' | 'MAX';

/**
 * Um episódio de alarme aberto — a projeção de `specs/SDD/negocio/requisitos/alarmes.md §4`.
 *
 * **É projeção, não histórico.** Responde "o que está alarmando agora?"; "o que aconteceu?" se
 * responde pelo log de eventos, que ainda não tem rota.
 *
 * ⚠️ **O `episodioId` sobrevive à escalada.** Uma excursão que passa da atenção para a crítica é
 * *um* episódio que escala, não dois alarmes — e é por isso que a tela não deve contar episódios
 * pela severidade.
 */
export interface AlarmeAtivo {
  unidadeId: number;
  dispositivoId: string;
  /** Qual das séries de um card de stroke (RN-098); `null` nos demais tipos. */
  serie: string | null;
  episodioId: string;
  severidadeAtual: SeveridadeAlarme;
  /** Quando a excursão começou — não quando escalou. */
  desde: string;
  /** O pior valor do episódio, na direção violada. */
  valorExtremo: number | null;
  limiteViolado: LimiteViolado;
}

/**
 * Indexa os alarmes pela chave da grandeza.
 *
 * A chave inclui a série porque as três de um contador de stroke compartilham o `dispositivoId`
 * (RN-098) — indexar só por ele acenderia o destaque da vazão em cima do card de volume acumulado.
 */
export function alarmesPorGrandeza(
  alarmes: readonly AlarmeAtivo[] | null | undefined,
): Map<string, AlarmeAtivo> {
  const mapa = new Map<string, AlarmeAtivo>();
  for (const alarme of alarmes ?? []) {
    mapa.set(chaveGrandeza(alarme.dispositivoId, alarme.serie), alarme);
  }
  return mapa;
}

/** Crítico antes de atenção; entre iguais, o que está aberto há mais tempo. */
export function ordenarPorGravidade(alarmes: readonly AlarmeAtivo[]): AlarmeAtivo[] {
  return [...alarmes].sort((a, b) => {
    const gravidade = peso(b.severidadeAtual) - peso(a.severidadeAtual);
    return gravidade !== 0 ? gravidade : a.desde.localeCompare(b.desde);
  });
}

function peso(severidade: SeveridadeAlarme): number {
  return severidade === 'CRITICO' ? 2 : 1;
}
