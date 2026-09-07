export interface ApiTubular {
  odIn: number;
  weightLbFt: number;
  idIn: number;
}

export const API_TUBING_SIZES: ApiTubular[] = [
  { odIn: 2.375, weightLbFt: 4.80,  idIn: 2.000 },
  { odIn: 2.375, weightLbFt: 4.85,  idIn: 1.995 },
  { odIn: 2.375, weightLbFt: 6.65,  idIn: 1.815 },

  { odIn: 2.875, weightLbFt: 6.45,  idIn: 2.469 },
  { odIn: 2.875, weightLbFt: 6.85,  idIn: 2.441 },
  { odIn: 2.875, weightLbFt: 8.35,  idIn: 2.323 },
  { odIn: 2.875, weightLbFt: 10.40, idIn: 2.151 },

  { odIn: 3.500, weightLbFt: 8.50,  idIn: 3.063 },
  { odIn: 3.500, weightLbFt: 9.50,  idIn: 2.992 },
  { odIn: 3.500, weightLbFt: 11.20, idIn: 2.900 },
  { odIn: 3.500, weightLbFt: 13.30, idIn: 2.764 },
  { odIn: 3.500, weightLbFt: 15.50, idIn: 2.602 },

  { odIn: 4.000, weightLbFt: 11.85, idIn: 3.476 },
  { odIn: 4.000, weightLbFt: 14.00, idIn: 3.340 },

  { odIn: 4.500, weightLbFt: 12.75, idIn: 4.000 },
  { odIn: 4.500, weightLbFt: 13.75, idIn: 3.958 },
  { odIn: 4.500, weightLbFt: 16.60, idIn: 3.826 },
  { odIn: 4.500, weightLbFt: 20.00, idIn: 3.640 },

  { odIn: 5.000, weightLbFt: 16.25, idIn: 4.408 },
  { odIn: 5.000, weightLbFt: 19.50, idIn: 4.276 },

  { odIn: 5.500, weightLbFt: 21.90, idIn: 4.778 },
  { odIn: 5.500, weightLbFt: 24.70, idIn: 4.670 },

  { odIn: 5.563, weightLbFt: 19.00, idIn: 4.975 },
  { odIn: 5.563, weightLbFt: 22.20, idIn: 4.859 },
  { odIn: 5.563, weightLbFt: 25.25, idIn: 4.733 },

  { odIn: 6.625, weightLbFt: 22.20, idIn: 6.065 },
  { odIn: 6.625, weightLbFt: 25.20, idIn: 5.965 },
  { odIn: 6.625, weightLbFt: 31.90, idIn: 5.761 },

  { odIn: 7.625, weightLbFt: 29.25, idIn: 6.969 },
  { odIn: 8.625, weightLbFt: 40.00, idIn: 7.825 },
];

export const API_CASING_SIZES: ApiTubular[] = [
  { odIn: 4.500,  weightLbFt: 10.50, idIn: 4.052 },
  { odIn: 4.500,  weightLbFt: 11.60, idIn: 4.000 },
  { odIn: 4.500,  weightLbFt: 13.50, idIn: 3.920 },

  { odIn: 5.000,  weightLbFt: 15.00, idIn: 4.408 },
  { odIn: 5.000,  weightLbFt: 18.00, idIn: 4.276 },

  { odIn: 5.500,  weightLbFt: 15.50, idIn: 4.950 },
  { odIn: 5.500,  weightLbFt: 17.00, idIn: 4.892 },
  { odIn: 5.500,  weightLbFt: 20.00, idIn: 4.778 },
  { odIn: 5.500,  weightLbFt: 23.00, idIn: 4.670 },
  { odIn: 5.500,  weightLbFt: 26.00, idIn: 4.548 },

  { odIn: 6.625,  weightLbFt: 24.00, idIn: 5.921 },
  { odIn: 6.625,  weightLbFt: 28.00, idIn: 5.791 },
  { odIn: 6.625,  weightLbFt: 32.00, idIn: 5.675 },

  { odIn: 7.000,  weightLbFt: 20.00, idIn: 6.456 },
  { odIn: 7.000,  weightLbFt: 23.00, idIn: 6.366 },
  { odIn: 7.000,  weightLbFt: 26.00, idIn: 6.276 },
  { odIn: 7.000,  weightLbFt: 29.00, idIn: 6.184 },
  { odIn: 7.000,  weightLbFt: 32.00, idIn: 6.094 },
  { odIn: 7.000,  weightLbFt: 35.00, idIn: 6.004 },
  { odIn: 7.000,  weightLbFt: 38.00, idIn: 5.920 },

  { odIn: 7.625,  weightLbFt: 29.70, idIn: 6.875 },
  { odIn: 7.625,  weightLbFt: 33.70, idIn: 6.765 },
  { odIn: 7.625,  weightLbFt: 39.00, idIn: 6.625 },

  { odIn: 8.625,  weightLbFt: 40.00, idIn: 7.725 },
  { odIn: 8.625,  weightLbFt: 44.00, idIn: 7.625 },
  { odIn: 8.625,  weightLbFt: 49.00, idIn: 7.511 },

  { odIn: 9.625,  weightLbFt: 36.00, idIn: 8.921 },
  { odIn: 9.625,  weightLbFt: 40.00, idIn: 8.835 },
  { odIn: 9.625,  weightLbFt: 43.50, idIn: 8.755 },
  { odIn: 9.625,  weightLbFt: 47.00, idIn: 8.681 },
  { odIn: 9.625,  weightLbFt: 53.50, idIn: 8.535 },

  { odIn: 10.750, weightLbFt: 40.50, idIn: 10.050 },
  { odIn: 10.750, weightLbFt: 45.50, idIn: 9.950  },
  { odIn: 10.750, weightLbFt: 51.00, idIn: 9.850  },
  { odIn: 10.750, weightLbFt: 55.50, idIn: 9.760  },
  { odIn: 10.750, weightLbFt: 60.70, idIn: 9.660  },

  { odIn: 11.750, weightLbFt: 47.00, idIn: 11.000 },
  { odIn: 11.750, weightLbFt: 54.00, idIn: 10.880 },
  { odIn: 11.750, weightLbFt: 60.00, idIn: 10.772 },

  { odIn: 13.375, weightLbFt: 54.50, idIn: 12.615 },
  { odIn: 13.375, weightLbFt: 61.00, idIn: 12.515 },
  { odIn: 13.375, weightLbFt: 68.00, idIn: 12.415 },
  { odIn: 13.375, weightLbFt: 72.00, idIn: 12.347 },

  { odIn: 16.000, weightLbFt: 75.00, idIn: 15.124 },
  { odIn: 16.000, weightLbFt: 84.00, idIn: 15.010 },
];

export function tubularLabel(t: ApiTubular): string {
  return `${t.odIn}" — ${t.weightLbFt} lb/ft  (ID ${t.idIn}")`;
}
