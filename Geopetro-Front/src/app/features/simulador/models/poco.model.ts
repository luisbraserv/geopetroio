import { WellPhaseFormValue } from './well-geometry.form';
import { TrajectoryFormValue } from './well-trajectory.form';
import type { WellCaliperProfile } from './caliper.model';

export interface PocoGeometry {
  wellFinalMD: number | null;
  wellFinalTVD: number | null;
  fases: WellPhaseFormValue[];
  trajectory: TrajectoryFormValue;
  caliper?: WellCaliperProfile | null;
}
export interface PocoApi {
  id: number;
  nome: string;
  geometria: PocoGeometry;
  version: number;
  atualizadoPor: string;
  atualizadoEm: string;
}
export const POCO_GEOMETRY_KEYS = ['wellFinalMD', 'wellFinalTVD', 'fases', 'trajectory', 'caliper'] as const;
export function pocoGeometryFromForm(form: Record<string, any>): PocoGeometry {
  return {
    wellFinalMD: form['wellFinalMD'] ?? null, wellFinalTVD: form['wellFinalTVD'] ?? null,
    fases: (form['fases'] ?? []).map((p: WellPhaseFormValue) => ({
      id: p.id, name: p.name, type: p.type, topMD: p.topMD, bottomMD: p.bottomMD,
      topTVD: p.topTVD, bottomTVD: p.bottomTVD, holeDiameterIn: p.holeDiameterIn,
      casingOD: p.casingOD ?? null, casingID: p.casingID ?? null,
      shoeMD: p.shoeMD ?? null, shoeTVD: p.shoeTVD ?? null,
      ...(p.survey ? { survey: {
        enabled: p.survey?.enabled === true,
        stations: (p.survey?.stations ?? []).map(s => ({
          md: s.md, inclinationDeg: s.inclinationDeg, azimuthDeg: s.azimuthDeg,
        })),
      } } : {}),
    })),
    trajectory: {
      enabled: form['trajectory']?.enabled === true,
      stations: (form['trajectory']?.stations ?? []).map((s: any) => ({
        md: s.md, inclinationDeg: s.inclinationDeg, azimuthDeg: s.azimuthDeg,
      })),
    },
    caliper: form['caliper'] ? structuredClone(form['caliper']) : null,
  };
}
export function samePocoGeometry(a: PocoGeometry, b: PocoGeometry): boolean {
  return JSON.stringify(pocoGeometryFromForm(a)) === JSON.stringify(pocoGeometryFromForm(b));
}
/** Metadado de contexto nunca é persistido dentro do cenário. */
export function scenarioPayload(form: Record<string, unknown>) {
  const { _poco, ...value } = form;
  const poco = _poco as PocoApi | null | undefined;
  if (poco && !samePocoGeometry(pocoGeometryFromForm(value), poco.geometria)) {
    throw new Error('Salve as alterações da geometria no poço antes de salvar o cenário.');
  }
  if (poco) for (const key of POCO_GEOMETRY_KEYS) delete value[key];
  return { formValue: JSON.stringify(value), pocoId: poco?.id ?? null, pocoVersion: poco?.version ?? null };
}
export function scenarioForm(cenario: { formValue: string; poco?: PocoApi | null }): Record<string, unknown> {
  const value = JSON.parse(cenario.formValue);
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Cenário inválido.');
  return { ...value, ...(cenario.poco ? pocoGeometryFromForm(cenario.poco.geometria) : {}), _poco: cenario.poco ?? null };
}
