export interface Rheology {
  theta300: number;
  theta200: number;
  theta100: number;
  theta60: number;
  theta30: number;
  theta20: number;
  theta10: number;
  theta6: number;
  theta3: number;
  pv?: number;
  yp?: number;
  n?: number;
  k?: number;
}

export interface ThickeningResult {
  t30: number;
  t50: number;
  t70: number;
  t100: number;
  maxHours: number;
  bhcp: number;
  t: number[];
  temp: number[];
  pressure: number[];
  bc: number[];
}

export interface UCAResult {
  t: number[];
  strength: number[];
  transit: number[];
  temp: number[];
}

export interface RheoTableRow {
  label: string;
  theta300: number;
  theta200: number;
  theta100: number;
  theta60: number;
  theta30: number;
  theta20: number;
  theta10: number;
  theta6: number;
  theta3: number;
  pv: number;
  yp: number;
  n: number;
  k: number;
}
