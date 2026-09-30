import type { PrimaryFlowSegment, PrimaryOuterBoundary, PrimaryPathZone, PrimaryTarget, PrimaryTubularAssembly } from './primary-cementing.model';
import type { WellGeometryIssue } from './well-geometry.model';

/** P2: geometria até a sapata, independente do circuito ativo de um estágio. */
export interface PrimaryAssemblyGeometryInput {
  target: PrimaryTarget;
  assemblies: PrimaryTubularAssembly[];
  outerBoundaries: PrimaryOuterBoundary[];
  /** TOCs, limites de pastas e referências adicionais que precisam de corte exato. */
  splitMDs: number[];
}

export interface ConventionalPrimaryGeometryInput extends PrimaryAssemblyGeometryInput {
  target: Extract<PrimaryTarget, { kind: 'conventional' }>;
}

export interface PrimaryGeometrySegment extends Omit<PrimaryFlowSegment, 'pathId'> {
  phaseId: string;
  diameterSource: 'nominal' | 'measured' | 'caliper' | 'previous-casing';
  excessFraction: number;
  /** Eixos reais do caliper quando o trecho foi resolvido por LAS. */
  caliperEhd1In?: number;
  caliperEhd2In?: number;
}

export interface PrimaryGeometryResolution {
  segments: PrimaryGeometrySegment[];
  issues: WellGeometryIssue[];
  /** null se houver erro; capacidade não é o volume planejado de pasta. */
  capacities: {
    internalBbl: number;
    annularBbl: number;
    shoeTrackBbl: number;
    displacementToCollarBbl: number;
  } | null;
}

export interface PrimaryStageGeometry {
  stageId: string;
  pathId: string;
  outletMD: number;
  seatMD: number;
  segments: PrimaryGeometrySegment[];
  /** Fora da circulação desta etapa. Pressão/conectividade dependem dos dispositivos em P5/P6. */
  nonCirculatingSegments: PrimaryGeometrySegment[];
  displacementBbl: number;
  internalToOutletBbl: number;
  annularToReturnBbl: number;
  /** No liner: lançamento na cabeça → topo; topo → assento. Somar uma vez. */
  dartTravelBbl: number | null;
  wiperTravelBbl: number | null;
  accessoryIds: string[];
  nonCirculatingAccessoryIds: string[];
}

export interface PrimaryResolvedAccessory {
  id: string;
  assemblyId: string;
  zone: PrimaryPathZone;
  md: number;
  volumeBbl: number;
  ownerSegmentId: string;
}

export interface PrimaryStageGeometryResolution {
  stages: PrimaryStageGeometry[];
  fullGeometry: PrimaryGeometryResolution;
  accessories: PrimaryResolvedAccessory[];
  /** Tubos + cavidades adicionais; fullGeometry.capacities permanece só tubular. */
  inventoryCapacities: PrimaryGeometryResolution['capacities'];
  issues: WellGeometryIssue[];
}

export interface PrimaryCircuitCell {
  id: string;
  kind: 'tubular' | 'accessory';
  segmentId: string;
  accessoryId?: string;
  assemblyId: string;
  zone: PrimaryPathZone;
  topMD: number;
  bottomMD: number;
  volumeBbl: number;
}

export interface PrimaryConnectivityResolution {
  nodes: { id: string; md: number; zone: PrimaryPathZone }[];
  cells: (PrimaryCircuitCell & {
    connectivity: 'circulating' | 'static-connected' | 'isolated';
    componentId: string;
    pressureBoundaries: ('head' | 'return')[];
  })[];
  connections: { from: string; to: string; kind: 'cell' | 'continuity' | 'shoe' | 'stage-outlet';
    cellId?: string; deviceId?: string }[];
  /** Ordem de transporte, da cabeça até o retorno. Vazia em estado parado/bloqueado. */
  flowCellIds: string[];
  circulation: 'open' | 'blocked' | 'idle' | 'invalid';
  issues: WellGeometryIssue[];
}
