import { Injectable } from '@angular/core';

export interface ReverseCirculationInputs {
  tubingIdIn: number;
  openEndDepthM: number;
  safetyFactor?: number;
}

export interface ReverseCirculationResult {
  tubingCapacityBblPerM: number;
  internalTubingVolumeBbl: number;
  reverseCirculationVolumeBbl: number;
  safetyFactor: number;
}

const INTERNAL_CAPACITY_BBL_M_FACTOR = 0.0031871;
const DEFAULT_REVERSE_CIRCULATION_SAFETY_FACTOR = 1.5;

@Injectable({ providedIn: 'root' })
export class ReverseCirculationCalculoService {
  calculateReverseCirculation({
    tubingIdIn,
    openEndDepthM,
    safetyFactor = DEFAULT_REVERSE_CIRCULATION_SAFETY_FACTOR,
  }: ReverseCirculationInputs): ReverseCirculationResult {
    this.assertPositive(tubingIdIn, 'tubingIdIn');
    this.assertPositive(openEndDepthM, 'openEndDepthM');
    this.assertPositive(safetyFactor, 'safetyFactor');

    const tubingCapacityBblPerM = INTERNAL_CAPACITY_BBL_M_FACTOR * tubingIdIn ** 2;
    const internalTubingVolumeBbl = tubingCapacityBblPerM * openEndDepthM;
    const reverseCirculationVolumeBbl = safetyFactor * internalTubingVolumeBbl;

    return {
      tubingCapacityBblPerM,
      internalTubingVolumeBbl,
      reverseCirculationVolumeBbl,
      safetyFactor,
    };
  }

  private assertPositive(value: number, field: string): void {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`${field} deve ser maior que zero.`);
    }
  }
}
