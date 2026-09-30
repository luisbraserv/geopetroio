import { describe, expect, it } from 'vitest';
import { primaryAnnularFriction, primaryEccentricityFactor, primaryPipeFriction, primaryRegimeLimits } from './primary-friction';

/** Conversões para escrever os exemplos do livro, que estão em SI. */
const PPG = 119.826427;          // kg/m³ por ppg
const LBF_FT2 = 47.880259;       // Pa·sⁿ por lbf·sⁿ/ft²
const BPM = 0.158987294928 / 60; // m³/s por bpm
const PSI = 6894.757293;         // Pa por psi
const inches = (mm: number) => mm / 25.4;
/** Gradiente em Pa/m a partir da perda em psi num trecho de 1 m. */
const paPerMeter = (psi: number | null) => psi! * PSI;

describe('atrito da primária pelo R3 (Well Cementing §4-6)', () => {
  it('reproduz os três exemplos resolvidos de tubo do livro (p. 134)', () => {
    // ρ = 1300 kg/m³, n = 0,5, k = 1,0 Pa·sⁿ, d = 127 mm.
    const base = { densityPpg: 1300 / PPG, n: 0.5, kLbfSnFt2: 1 / LBF_FT2, lengthM: 1 };
    const cases = [
      { q: 0.01, re: 822, f: 0.0195, gradient: 248, regime: 'laminar' },
      { q: 0.03, re: 4271, f: 0.00645, gradient: 740, regime: 'turbulent' },
      { q: 0.024, re: 3056, f: 0.00637, gradient: 468, regime: 'transitional' },
    ];
    for (const c of cases) {
      const result = primaryPipeFriction({ ...base, flowRateBpm: c.q / BPM }, inches(127));
      expect(result.regime).toBe(c.regime);
      expect(Math.abs(result.reynolds! - c.re)).toBeLessThan(1);
      expect(Math.abs(result.frictionFactor! - c.f) / c.f).toBeLessThan(0.005);
      expect(Math.abs(paPerMeter(result.pressureDropPsi) - c.gradient)).toBeLessThan(1);
    }
  });

  it('reproduz os três exemplos resolvidos de anular do livro (p. 135–136)', () => {
    // ρ = 1300 kg/m³, n = 0,5, k = 0,4 Pa·sⁿ, anular 215,9 × 177,8 mm.
    const base = { densityPpg: 1300 / PPG, n: 0.5, kLbfSnFt2: 0.4 / LBF_FT2, lengthM: 1 };
    const cases = [
      { q: 0.008, re: 1065, f: 0.0225, gradient: 709, regime: 'laminar' },
      { q: 0.02, re: 4210, f: 0.00749, gradient: 1473, regime: 'turbulent' },
      { q: 0.016, re: 3012, f: 0.00854, gradient: 1075, regime: 'transitional' },
    ];
    for (const c of cases) {
      const result = primaryAnnularFriction({ ...base, flowRateBpm: c.q / BPM }, inches(215.9), inches(177.8));
      expect(result.regime).toBe(c.regime);
      expect(Math.abs(result.reynolds! - c.re)).toBeLessThan(1);
      expect(Math.abs(result.frictionFactor! - c.f) / c.f).toBeLessThan(0.005);
      expect(Math.abs(paPerMeter(result.pressureDropPsi) - c.gradient)).toBeLessThan(1);
    }
    // Folga anular como diâmetro hidráulico, não 0,861·(D−OD) do Petroguia.
    expect(primaryAnnularFriction({ ...base, flowRateBpm: 5 }, 8.5, 7).hydraulicDiameterIn).toBeCloseTo(1.5, 12);
  });

  it('usa os limites de regime de R3, que dependem de n', () => {
    expect(primaryRegimeLimits(1)).toEqual({ laminar: 2100, turbulent: 3000 });
    expect(primaryRegimeLimits(0.5)).toEqual({ laminar: 2675, turbulent: 3575 });
    const result = primaryPipeFriction({ flowRateBpm: 5, densityPpg: 12, n: 0.6, kLbfSnFt2: 0.01, lengthM: 10 }, 6.276);
    expect(result.laminarLimitRe).toBeCloseTo(3250 - 1150 * 0.6, 9);
    expect(result.turbulentLimitRe).toBeCloseTo(4150 - 1150 * 0.6, 9);
  });

  it('não deixa a perda cair quando a vazão sobe, em tubo e anular, para n de 0,2 a 1,2', () => {
    // A tabela F-40 do Petroguia caía à metade ou menos em Re = 400; aqui a perda
    // é contínua e crescente em toda a faixa de vazão.
    for (const n of [0.2, 0.25, 0.3, 0.45, 0.6, 0.8, 1, 1.2]) {
      for (const k of [0.00002, 0.002, 0.05]) {
        let previousPipe = 0;
        let previousAnnulus = 0;
        for (let q = 0.05; q <= 60; q *= 1.05) {
          const input = { flowRateBpm: q, densityPpg: 12, n, kLbfSnFt2: k, lengthM: 100 };
          const pipe = primaryPipeFriction(input, 6.276).pressureDropPsi!;
          const annulus = primaryAnnularFriction(input, 8.5, 7).pressureDropPsi!;
          expect(pipe).toBeGreaterThan(previousPipe);
          expect(annulus).toBeGreaterThan(previousAnnulus);
          previousPipe = pipe;
          previousAnnulus = annulus;
        }
      }
    }
  });

  it('é contínua nos dois limites da transição', () => {
    const at = (re: number, n: number) => {
      // Vazão que produz o Reynolds pedido no tubo de 6,276": Re ∝ Q^(2−n).
      const probe = primaryPipeFriction({ flowRateBpm: 1, densityPpg: 10, n, kLbfSnFt2: 0.001, lengthM: 1 }, 6.276);
      const q = (re / probe.reynolds!) ** (1 / (2 - n));
      return primaryPipeFriction({ flowRateBpm: q, densityPpg: 10, n, kLbfSnFt2: 0.001, lengthM: 1 }, 6.276).frictionFactor!;
    };
    for (const n of [0.4, 0.7, 1]) {
      const { laminar, turbulent } = primaryRegimeLimits(n);
      expect(at(laminar * (1 + 1e-9), n)).toBeCloseTo(at(laminar * (1 - 1e-9), n), 9);
      expect(at(turbulent * (1 + 1e-9), n)).toBeCloseTo(at(turbulent * (1 - 1e-9), n), 9);
    }
  });

  it('confere o laminar newtoniano com a solução analítica de Hagen-Poiseuille', () => {
    // SPEC §12.2: μ = 0,1 Pa·s, L = 100 m, Q = 1e-5 m³/s, D = 0,1 m → 40,7436654315 Pa.
    const result = primaryPipeFriction({ flowRateBpm: 1e-5 / BPM, densityPpg: 1000 / PPG, n: 1,
      kLbfSnFt2: 0.1 / LBF_FT2, lengthM: 100 }, 100 / 25.4);
    expect(result.regime).toBe('laminar');
    expect(result.pressureDropPsi! * PSI).toBeCloseTo(40.7436654315, 6);
  });

  it('devolve perda zero sem vazão e null para reologia inválida, sem pasta padrão', () => {
    const input = { flowRateBpm: 5, densityPpg: 10, n: 0.6, kLbfSnFt2: 0.01, lengthM: 100 };
    const still = primaryPipeFriction({ ...input, flowRateBpm: 0 }, 6.276);
    expect(still.pressureDropPsi).toBe(0);
    expect(still.regime).toBe('static');
    expect(still.reynolds).toBeNull();
    expect(primaryPipeFriction({ ...input, n: 0 }, 6.276).pressureDropPsi).toBeNull();
    expect(primaryPipeFriction({ ...input, kLbfSnFt2: -1 }, 6.276).pressureDropPsi).toBeNull();
    expect(primaryPipeFriction(input, 0).pressureDropPsi).toBeNull();
    // Parede externa menor que o tubo não produz um anular negativo.
    expect(primaryAnnularFriction(input, 6, 7).pressureDropPsi).toBeNull();
  });

  it('mantém a correção opcional de excentricidade do Petroguia restrita ao domínio', () => {
    expect(primaryEccentricityFactor('8.5x7', 0.7, 100)).toBeCloseTo(1, 12);
    expect(primaryEccentricityFactor('8.5x7', 0.7, 0)).toBeCloseTo(1 - (0.44 + 0.18 * 0.7), 12);
    expect(primaryEccentricityFactor('8.5x7', 0.7, 150)).toBeNull();
  });
});
