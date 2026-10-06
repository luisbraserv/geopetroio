// Constantes físicas e de conversão — migradas de shared/core.js
export const CW = 94.0;
export const CEMENT_WEIGHT = CW;
export const CV = 3.5908;
export const CEMENT_VOL = CV;
export const VWF = 0.1202;
export const VOL_WATER_FRESH = VWF;
export const VWS = 0.1176;
export const VOL_WATER_SEA = VWS;
export const VNaCl = 0.0420;
export const VOL_NACL = VNaCl;
export const VSil = 0.0453;
export const VOL_SILICA = VSil;
export const BBL_M = 0.0031871;
export const BBL_PER_M = BBL_M;
export const HYDRO = 0.052;
export const M_TO_FT = 3.28084;
export const HYDRO_M = HYDRO * M_TO_FT;
export const HYDRO_K = HYDRO_M;
export const FT_TO_M = 0.3048;
export const PPG_PER_GCM3 = 8.3454;
export const GCM3_PER_PPG = 0.119826;
export const LB_TO_KG = 0.453592;
export const GAL_TO_L = 3.78541;
export const FT3_TO_L = 28.3168;

export const API_TEMP_DEPTHS_FT = [1000,2000,4000,6000,8000,10000,12000,14000,16000,18000,20000,22000];
export const API_TEMP_GRADS_F = [0.9,1.1,1.3,1.5,1.7,1.9];
export const API_TEMP_D1_F = [
  [80,80,80,80,80,80],[89,89,90,90,91,91],[99,100,101,102,103,104],
  [112,114,116,118,120,126],[126,129,135,140,146,160],[141,146,158,167,180,200],
  [148,165,183,201,219,236],[164,185,207,228,250,271],[182,207,233,258,284,309],
  [201,231,261,291,321,350],[222,256,291,326,360,395],[244,284,324,364,404,444]
];
export const API_TEMP_D2_F = [
  [80,80,82,83,85,86],[86,89,92,95,98,101],[100,106,113,119,125,132],
  [115,124,134,144,153,163],[130,143,156,169,182,196],[146,163,179,196,213,229],
  [162,183,203,223,244,264],[179,204,228,252,276,300],[197,225,253,281,309,338],
  [215,248,280,312,344,376],[234,271,307,344,380,417],[254,295,336,377,418,459]
];

export interface CementClassProps {
  label: string;
  cv: number;
  waterGal: number;
  neatDen: number;
  neatYield: number;
}

export const CEMENT_CLASSES: Record<string, CementClassProps> = {
  A: { label: 'A – Uso geral', cv: 3.5908, waterGal: 5.19, neatDen: 15.6, neatYield: 1.17 },
  B: { label: 'B – Resistente a sulfatos', cv: 3.5908, waterGal: 5.19, neatDen: 15.6, neatYield: 1.17 },
  C: { label: 'C – Alta resist. inicial', cv: 3.7230, waterGal: 6.32, neatDen: 14.8, neatYield: 1.32 },
  D: { label: 'D – Mod./alta pressão', cv: 3.4679, waterGal: 4.29, neatDen: 16.4, neatYield: 1.05 },
  E: { label: 'E – Alta pressão/temp.', cv: 3.4679, waterGal: 4.29, neatDen: 16.4, neatYield: 1.05 },
  F: { label: 'F – Extrema pressão/temp.', cv: 3.4679, waterGal: 4.29, neatDen: 16.4, neatYield: 1.05 },
  G: { label: 'G – Uso geral c/ aditivos', cv: 3.5908, waterGal: 5.00, neatDen: 15.8, neatYield: 1.14 },
  H: { label: 'H – Alta densidade', cv: 3.4679, waterGal: 4.29, neatDen: 16.4, neatYield: 1.05 },
};
