import spectral from '../data/spectral.json' with { type: 'json' };
import type { Vec3 } from '../model';
import { bradford, D65, xyzToXy } from './linear';

export type Spectrum = number[];
export const WAVELENGTHS: number[] = spectral.cmf.x.map(
  (_, i) => spectral.start + i * spectral.step,
);
export const CMF = spectral.cmf;
/** CIE 1964 10° standard observer, same 380–780 nm / 5 nm grid. */
export const CMF_10 = spectral.cmf10;
export const D65_SPD: Spectrum = spectral.d65;
export const A_SPD: Spectrum = spectral.a;
export const RGB_CMF = spectral.rgbCmf;
export const CAMERAS = spectral.cameras as Record<
  string,
  { start: number; step: number; r: number[]; g: number[]; b: number[] }
>;

/** Tristimulus values of an emission spectrum (relative units). */
export function emissionToXYZ(spd: Spectrum): Vec3 {
  let X = 0,
    Y = 0,
    Z = 0;
  spd.forEach((value, i) => {
    X += value * CMF.x[i];
    Y += value * CMF.y[i];
    Z += value * CMF.z[i];
  });
  return [X, Y, Z];
}
/** Reflectance under an illuminant, normalized so the perfect diffuser has Y = 1. */
export function reflectanceToXYZ(
  reflectance: Spectrum,
  illuminant: Spectrum = D65_SPD,
): Vec3 {
  const product = reflectance.map((r, i) => r * illuminant[i]);
  const [X, Y, Z] = emissionToXYZ(product);
  const k = 1 / emissionToXYZ(illuminant)[1];
  return [X * k, Y * k, Z * k];
}
/** Spectral radiance of a Planckian radiator (c₁ cancels in chromaticity). */
export function planck(wavelengthNm: number, temperature: number): number {
  const c2 = 1.4388e-2; // CIE 15 (ITS-90) second radiation constant
  const lambda = wavelengthNm * 1e-9;
  return 1 / (lambda ** 5 * (Math.exp(c2 / (lambda * temperature)) - 1));
}
export function blackbodySpd(temperature: number, normalizeAt = 560): Spectrum {
  const reference = planck(normalizeAt, temperature);
  return WAVELENGTHS.map((w) => planck(w, temperature) / reference);
}
export const blackbodyXy = (temperature: number) =>
  xyzToXy(emissionToXYZ(blackbodySpd(temperature)));
/** CIE daylight locus, 4000 K – 25000 K. */
export function daylightXy(temperature: number): [number, number] {
  const t = temperature;
  const x =
    t <= 7000
      ? -4.607e9 / t ** 3 + 2.9678e6 / t ** 2 + 0.09911e3 / t + 0.244063
      : -2.0064e9 / t ** 3 + 1.9018e6 / t ** 2 + 0.24748e3 / t + 0.23704;
  return [x, -3 * x * x + 2.87 * x - 0.275];
}
export function xyToUv([x, y]: [number, number]): [number, number] {
  const d = -2 * x + 12 * y + 3;
  return [(4 * x) / d, (6 * y) / d];
}
export function uvToXy([u, v]: [number, number]): [number, number] {
  const d = 2 * u - 8 * v + 4;
  return [(3 * u) / d, (2 * v) / d];
}
/** CIE 1976 u′v′. */
export function uvPrimeToXy([u, v]: [number, number]): [number, number] {
  const d = 6 * u - 16 * v + 12;
  return [(9 * u) / d, (4 * v) / d];
}
/** CIE 1976 u′v′. */
export function xyToUvPrime(xy: [number, number]): [number, number] {
  const [u, v] = xyToUv(xy);
  return [u, 1.5 * v];
}
/** Iso-temperature line through the Planckian locus, ±Duv in CIE 1960 uv. */
export function isotherm(temperature: number, duv = 0.05) {
  const [u, v] = xyToUv(blackbodyXy(temperature));
  const [u1, v1] = xyToUv(blackbodyXy(temperature * 1.001));
  const length = Math.hypot(u1 - u, v1 - v);
  const normal: [number, number] = [-(v1 - v) / length, (u1 - u) / length];
  return [-duv, duv].map((d) =>
    uvToXy([u + normal[0] * d, v + normal[1] * d]),
  ) as [[number, number], [number, number]];
}
export const spectralLocus = (
  cmf: { x: number[]; y: number[]; z: number[] } = CMF,
): [number, number][] =>
  WAVELENGTHS.map((_, i) => xyzToXy([cmf.x[i], cmf.y[i], cmf.z[i]]));

// Planckian locus in CIE 1960 uv, tabulated by mired (10–1000 MK⁻¹, 1000–100000 K).
let planckTable: [number, number][] | null = null;
const planckUv = (mired: number) => xyToUv(blackbodyXy(1e6 / mired));
/**
 * Correlated colour temperature and Duv: the nearest point of the Planckian
 * locus in CIE 1960 uv, found by a table search and golden-section refinement.
 * Duv is positive above the locus. Same definition as Ohno (2013), solved
 * directly instead of by the triangular/parabolic approximation.
 * Returns null when the nearest point lies outside 1000–100000 K.
 */
export function cctDuv(
  xy: [number, number],
): { cct: number; duv: number } | null {
  const [u, v] = xyToUv(xy);
  planckTable ??= Array.from({ length: 991 }, (_, i) => planckUv(10 + i));
  const distance = (p: [number, number]) => Math.hypot(u - p[0], v - p[1]);
  let best = 0;
  planckTable.forEach((p, i) => {
    if (distance(p) < distance(planckTable![best])) best = i;
  });
  // Extend endpoint brackets by one sample so an out-of-range minimum
  // cannot masquerade as a valid result at the table boundary.
  let a = 10 + best - 1,
    b = 10 + best + 1;
  const ratio = (Math.sqrt(5) - 1) / 2;
  let c = b - ratio * (b - a),
    d = a + ratio * (b - a);
  let fc = distance(planckUv(c)),
    fd = distance(planckUv(d));
  for (let i = 0; i < 40; i++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - ratio * (b - a);
      fc = distance(planckUv(c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + ratio * (b - a);
      fd = distance(planckUv(d));
    }
  }
  const nearest = (a + b) / 2;
  // Allow the refinement's numerical error at the two inclusive endpoints.
  if (nearest < 10 - 1e-6 || nearest > 1000 + 1e-6) return null;
  const mired = Math.min(Math.max(nearest, 10), 1000);
  const p = planckUv(mired);
  return { cct: 1e6 / mired, duv: Math.sign(v - p[1]) * distance(p) };
}

/**
 * MacAdam limits: slices of the Rösch–MacAdam optimal colour solid at constant
 * luminance under the equal-energy illuminant. For each start wavelength the
 * (wrapping) band of full reflectance grows until it reaches Y; the last bin is
 * filled fractionally. XYZ is adapted from E to D65 (Bradford).
 */
export function macAdamLimit(luminance: number): Vec3[] {
  const n = WAVELENGTHS.length;
  const total = CMF.y.reduce((a, b) => a + b, 0);
  const target = luminance * total;
  const ring: Vec3[] = [];
  for (let start = 0; start < n; start++) {
    let X = 0,
      Y = 0,
      Z = 0;
    for (let k = 0; k < n; k++) {
      const i = (start + k) % n;
      const remaining = target - Y;
      const fraction = CMF.y[i] > 0 ? Math.min(1, remaining / CMF.y[i]) : 1;
      X += CMF.x[i] * fraction;
      Y += CMF.y[i] * fraction;
      Z += CMF.z[i] * fraction;
      if (Y >= target - 1e-12) break;
    }
    ring.push(bradford([X / total, Y / total, Z / total], [1, 1, 1], D65));
  }
  return ring;
}
/** MacAdam limits at CIELAB L* = 10, 20, …, 90. */
export function optimalColourRings(): Vec3[][] {
  return [10, 20, 30, 40, 50, 60, 70, 80, 90].map((L) =>
    macAdamLimit(((L + 16) / 116) ** 3),
  );
}
/** XYZ of a rectangular reflectance [start, end] nm under illuminant E (Y_white = 1). */
export function pulseXYZ(start: number, end: number): Vec3 {
  const pulse = WAVELENGTHS.map((w) => (w >= start && w <= end ? 1 : 0));
  return reflectanceToXYZ(
    pulse,
    WAVELENGTHS.map(() => 1),
  );
}

/**
 * A metameric pair under D65: base + a "metameric black" (the part of a
 * perturbation orthogonal to the D65-weighted colour matching functions).
 */
export function metamericPair(): { first: Spectrum; second: Spectrum } {
  const base = WAVELENGTHS.map(
    (w) =>
      0.42 +
      0.18 * Math.exp(-(((w - 470) / 45) ** 2)) +
      0.14 * Math.exp(-(((w - 610) / 50) ** 2)),
  );
  const perturbation = WAVELENGTHS.map((w) =>
    Math.sin(((w - 380) / 400) * Math.PI * 5),
  );
  const weights = [CMF.x, CMF.y, CMF.z].map((cmf) =>
    cmf.map((value, i) => value * D65_SPD[i]),
  );
  // Project out span(weights): p − W (WᵀW)⁻¹ Wᵀ p.
  const gram = weights.map((a) =>
    weights.map((b) => a.reduce((sum, v, i) => sum + v * b[i], 0)),
  );
  const rhs = weights.map((w) =>
    w.reduce((sum, v, i) => sum + v * perturbation[i], 0),
  );
  const coefficients = solve3(gram, rhs);
  const black = perturbation.map(
    (p, i) =>
      p - weights.reduce((sum, w, k) => sum + w[i] * coefficients[k], 0),
  );
  const peak = Math.max(...black.map(Math.abs));
  const scale = (0.36 / peak) * 0.95;
  return {
    first: base,
    second: base.map((value, i) => value + black[i] * scale),
  };
}
function solve3(m: number[][], b: number[]): number[] {
  const a = m.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < 3; c++) {
    let pivot = c;
    for (let r = c + 1; r < 3; r++)
      if (Math.abs(a[r][c]) > Math.abs(a[pivot][c])) pivot = r;
    [a[c], a[pivot]] = [a[pivot], a[c]];
    for (let r = 0; r < 3; r++) {
      if (r === c) continue;
      const f = a[r][c] / a[c][c];
      for (let k = c; k < 4; k++) a[r][k] -= f * a[c][k];
    }
  }
  return a.map((row, i) => row[3] / row[i]);
}

/** Kubelka–Munk single-constant mixing of reflectance spectra. */
export function kubelkaMunkMix(
  reflectances: Spectrum[],
  concentrations: number[],
): Spectrum {
  const total = concentrations.reduce((a, b) => a + b, 0) || 1;
  return WAVELENGTHS.map((_, i) => {
    const ks = reflectances.reduce((sum, r, k) => {
      const R = Math.min(Math.max(r[i], 1e-4), 1);
      return sum + (concentrations[k] / total) * ((1 - R) ** 2 / (2 * R));
    }, 0);
    return 1 + ks - Math.sqrt(ks * ks + 2 * ks);
  });
}
