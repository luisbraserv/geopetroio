import type { PrimaryEvent, PrimaryHydraulicPoint } from '../models/primary-cementing.model';
import type { PrimaryFullSnapshot } from '../models/primary-hydraulics.model';

/**
 * Navegação sobre resultados já calculados. Reproduzir não executa o motor a cada
 * quadro e nunca interpola através de um evento de ferramenta: o estado entre dois
 * eventos é o do último snapshot válido, mantido até o próximo.
 */
export interface PrimaryPlaybackSelection {
  snapshot: PrimaryFullSnapshot | null;
  point: PrimaryHydraulicPoint | null;
  /** Eventos exatamente no instante selecionado. */
  events: PrimaryEvent[];
  index: number;
}

/** Último snapshot com tempo <= alvo; antes do primeiro, devolve o inicial. */
export function selectPrimaryInstant(snapshots: PrimaryFullSnapshot[], points: PrimaryHydraulicPoint[],
  events: PrimaryEvent[], timeMin: number): PrimaryPlaybackSelection {
  if (!snapshots.length) return { snapshot: null, point: null, events: [], index: -1 };
  if (!Number.isFinite(timeMin)) return { snapshot: null, point: null, events: [], index: -1 };
  let index = 0;
  for (let i = 0; i < snapshots.length; i++) {
    if (snapshots[i].timeMin <= timeMin + 1e-9) index = i; else break;
  }
  const snapshot = snapshots[index];
  return {
    snapshot, index,
    point: points.find(p => p.timeMin === snapshot.timeMin && p.stepId === snapshot.stepId)
      ?? points[index] ?? null,
    // O evento é anunciado só quando o cursor está nele. Entre dois eventos o
    // estado é o do último snapshot, mas nenhum evento é atribuído ao instante.
    events: events.filter(e => Math.abs(e.timeMin - timeMin) <= 1e-9),
  };
}

/** Instante do próximo evento após `timeMin`; null quando não há mais. */
export function nextPrimaryEventTime(events: PrimaryEvent[], timeMin: number): number | null {
  const next = events.filter(e => e.timeMin > timeMin + 1e-9).map(e => e.timeMin);
  return next.length ? Math.min(...next) : null;
}

export function previousPrimaryEventTime(events: PrimaryEvent[], timeMin: number): number | null {
  const previous = events.filter(e => e.timeMin < timeMin - 1e-9).map(e => e.timeMin);
  return previous.length ? Math.max(...previous) : null;
}

/**
 * Avanço de um quadro. `speed` multiplica minutos simulados por segundo real.
 * Para exatamente no próximo evento em vez de passar por cima dele.
 */
export function advancePrimaryTime(events: PrimaryEvent[], timeMin: number,
  deltaSeconds: number, speed: number, totalTimeMin: number): number {
  if (!Number.isFinite(deltaSeconds) || deltaSeconds <= 0 || !Number.isFinite(speed) || speed <= 0)
    return timeMin;
  const target = Math.min(totalTimeMin, timeMin + deltaSeconds * speed);
  const next = nextPrimaryEventTime(events, timeMin);
  return next !== null && next < target ? next : target;
}

/** Rótulo legível de um evento; o motor emite códigos, a tela mostra texto. */
export function primaryEventLabel(kind: PrimaryEvent['kind']): string {
  const labels: Record<PrimaryEvent['kind'], string> = {
    'bottom-plug-launched': 'Plugue inferior lançado',
    'bottom-plug-opened': 'Plugue inferior abriu no colar',
    'top-plug-launched': 'Plugue superior lançado',
    'top-plug-landed': 'Plugue superior assentado',
    'interface-at-outlet': 'Interface na saída ativa',
    'interface-at-return': 'Interface no retorno',
    'outside-model': 'Fora do modelo',
    'dart-launched': 'Dardo lançado',
    'liner-wiper-released': 'Plugue do liner liberado',
    'stage-opened': 'Estágio aberto',
    'stage-closed': 'Estágio fechado',
    'balance-reached': 'Tubo em U em equilíbrio',
  };
  return labels[kind] ?? kind;
}
