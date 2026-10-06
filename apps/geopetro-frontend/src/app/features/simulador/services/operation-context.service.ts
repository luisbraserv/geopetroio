import { Injectable, inject } from '@angular/core';
import type { OperationInterval, WellGeometry, WellGeometryIssue, WellPhase } from '../models/well-geometry.model';
import { WellGeometryService } from './well-geometry.service';

export interface OperationContext {
  geometry: WellGeometry;
  phase: WellPhase | null;
  issues: WellGeometryIssue[];
}

/** A fase seleciona o alvo; o percurso anterior continua fazendo parte do poço. */
@Injectable({ providedIn: 'root' })
export class OperationContextService {
  private readonly wells = inject(WellGeometryService);

  resolve(well: WellGeometry, selectedPhaseId: string | null,
    operation: 'squeeze' | 'tampao' | 'primaria'): OperationContext {
    const matches = well.phases.filter(phase => phase.id === selectedPhaseId);
    const issue = (code: string, message: string): WellGeometryIssue =>
      ({ code, message, level: 'error', ...(selectedPhaseId ? { phaseId: selectedPhaseId } : {}) });
    if (matches.length !== 1) return { geometry: well, phase: null, issues: [issue(
      'OPERATION_PHASE_REQUIRED', selectedPhaseId
        ? 'A fase da operação não está disponível ou seu identificador está duplicado. Selecione uma fase válida.'
        : 'Cadastre as fases e selecione a fase da operação para calcular.')] };
    const selected = matches[0];
    const geometry = this.wells.deriveTrajectoryTvd({
      ...well, finalMD: selected.bottomMD, finalTVD: selected.bottomTVD,
      phases: well.phases.filter(phase => phase.id === selected.id || phase.bottomMD <= selected.topMD)
        .map(phase => ({ ...phase, ...(phase.casing ? { casing: { ...phase.casing } } : {}),
          ...(phase.shoe ? { shoe: { ...phase.shoe } } : {}) }))
        .sort((a, b) => a.topMD - b.topMD),
    });
    const phase = geometry.phases.find(row => row.id === selected.id)!;
    const issues = this.wells.validate(geometry);
    if (well.phases.some(row => row.id !== selected.id && row.topMD < selected.bottomMD && row.bottomMD > selected.topMD))
      issues.push(issue('OPERATION_PHASE_OVERLAP', 'A fase selecionada se sobrepõe a outra fase. Corrija o cadastro antes de calcular.'));
    if (operation === 'primaria' && (!phase.casing || !Number.isFinite(phase.casing.bottomMD)))
      issues.push(issue('PRIMARY_PHASE_CASING_REQUIRED',
        'Cadastre o revestimento/liner e a sapata da fase selecionada antes de calcular a primária.'));
    return { geometry, phase, issues };
  }

  validateInterval(context: OperationContext, interval: OperationInterval, name = 'Operação'): WellGeometryIssue[] {
    const phase = context.phase;
    if (!phase) return [];
    return interval.topMD < phase.topMD || interval.bottomMD > phase.bottomMD
      ? [{ code: 'OPERATION_OUTSIDE_SELECTED_PHASE', level: 'error', phaseId: phase.id,
        message: `${name}: o intervalo deve ficar dentro da fase ${phase.name} (${phase.topMD}–${phase.bottomMD} m MD). Corrija os limites da operação.` }]
      : [];
  }
}
