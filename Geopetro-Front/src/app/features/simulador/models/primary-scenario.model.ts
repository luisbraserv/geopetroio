import type { DepthUnit } from './depth-unit';
import type { PocoGeometry } from './poco.model';
import type { PrimaryConfiguration, PrimaryReference, PrimaryVolumeAxis } from './primary-cementing.model';
import type { PrimaryMeasuredDataset } from './primary-measurements.model';

export const PRIMARY_SCENARIO_SCHEMA_VERSION = 2 as const;

export interface PrimaryPresentation {
  depthUnit: DepthUnit;
  volumeAxis: PrimaryVolumeAxis;
  references: PrimaryReference[];
  visibleSeries: string[];
  selectedTimeMin: number;
  snapshotTimesMin: number[];
}

/** Forma hidratada/editável. Campos de PocoGeometry removidos na API se vinculada. */
export interface PrimaryScenario extends PocoGeometry {
  operation: 'primaria';
  selectedPhaseId: string | null;
  schemaVersion: typeof PRIMARY_SCENARIO_SCHEMA_VERSION;
  /** null enquanto não houver resultado de um motor implementado. */
  engineVersion: string | null;
  status: 'draft' | 'validated';
  primary: PrimaryConfiguration;
  measurements: PrimaryMeasuredDataset[];
  presentation: PrimaryPresentation;
}

export function createPrimaryDraft(): PrimaryScenario {
  return {
    operation: 'primaria', selectedPhaseId: null, schemaVersion: PRIMARY_SCENARIO_SCHEMA_VERSION,
    engineVersion: null, status: 'draft',
    wellFinalMD: null, wellFinalTVD: null, fases: [],
    trajectory: { enabled: false, stations: [] },
    caliper: null,
    primary: {
      target: null, assemblies: [], outerBoundaries: [], paths: [], devices: [],
      retainedVolumes: [], stages: [], fluids: [], initialFluidId: null,
      headCondition: 'closed-head', returnPressurePsi: 0, pressureWindow: [],
      frictionSettings: { internal: 'medium', annular: 'medium' },
      equipmentLimits: { maxPressurePsi: null, maxRateBpm: null, motorHp: null, efficiency: null },
    },
    measurements: [],
    presentation: { depthUnit: 'm', volumeAxis: 'total-pumped', references: [],
      visibleSeries: [], selectedTimeMin: 0, snapshotTimesMin: [] },
  };
}
