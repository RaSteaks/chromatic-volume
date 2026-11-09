import type { Vec3 } from '../model';
import { invert, multiply, type Mat3 } from './linear';

/** Reinhard (2002) global operator, x / (1 + x). */
export const reinhard = (x: number) => x / (1 + x);

/** Hable / Uncharted 2 filmic curve with the published defaults, white 11.2. */
export function hable(x: number, exposureBias = 2): number {
  const A = 0.15,
    B = 0.5,
    C = 0.1,
    D = 0.2,
    E = 0.02,
    F = 0.3,
    W = 11.2;
  const curve = (v: number) =>
    (v * (A * v + C * B) + D * E) / (v * (A * v + B) + D * F) - E / F;
  // Values above the white point W clip at display white.
  return Math.min(curve(x * exposureBias) / curve(W), 1);
}

// Stephen Hill's fit of the ACES 1.x RRT + sRGB ODT (BakingLab, ACES.hlsl).
// This is a fit to ACES 1.x output, not ACES 2.0.
const ACES_INPUT: Mat3 = [
  [0.59719, 0.35458, 0.04823],
  [0.076, 0.90834, 0.01566],
  [0.0284, 0.13383, 0.83777],
];
const ACES_OUTPUT: Mat3 = [
  [1.60475, -0.53108, -0.07367],
  [-0.10208, 1.10813, -0.00605],
  [-0.00327, -0.07276, 1.07602],
];
const rrtOdtFit = (v: number) =>
  (v * (v + 0.0245786) - 0.000090537) /
  (v * (0.983729 * v + 0.432951) + 0.238081);
/** Linear Rec.709 scene → linear Rec.709 display (0–1, clamped). */
export function acesFitted(rgb: Vec3): Vec3 {
  const fitted = multiply(ACES_INPUT, rgb).map(rrtOdtFit) as Vec3;
  return multiply(ACES_OUTPUT, fitted).map((v) =>
    Math.min(Math.max(v, 0), 1),
  ) as Vec3;
}

// AgX, polynomial approximation of the default contrast look
// (Benjamin Wrensch, "Minimal AgX implementation", 2023).
const AGX_INSET: Mat3 = [
  [0.842479062253094, 0.0784335999999992, 0.0792237451477643],
  [0.0423282422610123, 0.878468636469772, 0.0791661274605434],
  [0.0423756549057051, 0.0784336, 0.879142973793104],
];
const AGX_OUTSET = invert(AGX_INSET);
const MIN_EV = -12.47393,
  MAX_EV = 4.026069;
function agxContrast(x: number) {
  const x2 = x * x,
    x4 = x2 * x2;
  return (
    15.5 * x4 * x2 -
    40.14 * x4 * x +
    31.96 * x4 -
    6.868 * x2 * x +
    0.4298 * x2 +
    0.1191 * x -
    0.00232
  );
}
/** Linear Rec.709 scene → linear Rec.709 display (0–1, clamped). */
export function agx(rgb: Vec3): Vec3 {
  const encoded = multiply(AGX_INSET, rgb).map((v) => {
    const ev = Math.min(
      Math.max(Math.log2(Math.max(v, 1e-10)), MIN_EV),
      MAX_EV,
    );
    return agxContrast((ev - MIN_EV) / (MAX_EV - MIN_EV));
  }) as Vec3;
  // AgX's contrast fit and outset produce Gamma 2.2 code values, not sRGB.
  // Decode them so callers can apply the same display encoding as other maps.
  return multiply(AGX_OUTSET, encoded).map(
    (v) => Math.min(Math.max(v, 0), 1) ** 2.2,
  ) as Vec3;
}
