import type { Vec3 } from '../model';
import { D65, invert, multiply, type Mat3 } from './linear';
// ZCAM (Safdar et al. 2021, Optics Express 29(4)). Constants are checked
// against Colour Science 0.4.4 in tests/figures-science.test.ts.

const B = 1.15,
  G = 0.66,
  EPSILON = 3.7035226210190005e-11;
const XYZ_TO_LMS: Mat3 = [
  [0.41478972, 0.579999, 0.014648],
  [-0.20151, 1.120649, 0.0531008],
  [-0.0166008, 0.2648, 0.6684799],
];
const LMS_P_TO_IZAZBZ: Mat3 = [
  [0, 1, 0],
  [3.524, -4.066708, 0.542708],
  [0.199076, 1.096799, -1.295875],
];
const CAT02: Mat3 = [
  [0.7328, 0.4296, -0.1624],
  [-0.7036, 1.6975, 0.0061],
  [0.003, 0.0136, 0.9834],
];
const LMS_TO_XYZ = invert(XYZ_TO_LMS);
const IZAZBZ_TO_LMS_P = invert(LMS_P_TO_IZAZBZ);
const CAT02_INVERSE = invert(CAT02);
// ST 2084 constants, with the Jzazbz / ZCAM exponent m₂ = 1.7 · 2523 / 32.
const M1 = 2610 / 16384,
  M2 = (1.7 * 2523) / 32,
  C1 = 3424 / 4096,
  C2 = 2413 / 128,
  C3 = 2392 / 128;
const pqEncode = (value: number) => {
  const y = Math.max(value, 0) / 10000;
  return ((C1 + C2 * y ** M1) / (1 + C3 * y ** M1)) ** M2;
};
const pqDecode = (value: number) => {
  const v = Math.max(value, 0) ** (1 / M2);
  return 10000 * (Math.max(v - C1, 0) / (C2 - C3 * v)) ** (1 / M1);
};

export interface ZcamViewing {
  /** Absolute luminance of the adopted white, cd/m². */
  whiteLuminance: number;
  adaptingLuminance: number;
  backgroundLuminance: number;
  surround: { F_s: number; F: number };
}
/** SDR/HDR reference white at 203 cd/m² (BT.2408), 20 % grey surround, average. */
export const ZCAM_VIEWING: ZcamViewing = {
  whiteLuminance: 203,
  adaptingLuminance: 0.2 * 203,
  backgroundLuminance: 0.2 * 203,
  surround: { F_s: 0.69, F: 1 },
};

function izazbz(xyz: Vec3): Vec3 {
  const [X, Y, Z] = xyz;
  const lms = multiply(XYZ_TO_LMS, [
    B * X - (B - 1) * Z,
    G * Y - (G - 1) * X,
    Z,
  ]);
  const result = multiply(LMS_P_TO_IZAZBZ, lms.map(pqEncode) as Vec3);
  result[0] -= EPSILON;
  return result;
}
function izazbzToXyz(values: Vec3): Vec3 {
  const shifted: Vec3 = [values[0] + EPSILON, values[1], values[2]];
  const lms = multiply(IZAZBZ_TO_LMS_P, shifted).map(pqDecode) as Vec3;
  const [Xp, Yp, Z] = multiply(LMS_TO_XYZ, lms);
  const X = (Xp + (B - 1) * Z) / B;
  return [X, (Yp + (G - 1) * X) / G, Z];
}
function factors(viewing: ZcamViewing) {
  const white = D65.map((v) => v * viewing.whiteLuminance) as Vec3;
  const { F_s, F } = viewing.surround;
  const L_A = viewing.adaptingLuminance;
  const D = F * (1 - (1 / 3.6) * Math.exp((-L_A - 42) / 92));
  const F_b = Math.sqrt(viewing.backgroundLuminance / white[1]);
  const F_L = 0.171 * Math.cbrt(L_A) * (1 - Math.exp((-48 / 9) * L_A));
  const I_zw = izazbz(white)[0];
  const exponent = (1.6 * F_s) / F_b ** 0.12;
  const brightness = F_s ** 2.2 * F_b ** 0.5 * F_L ** 0.2;
  const Q_w = 2700 * I_zw ** exponent * brightness;
  // Zhai & Luo (2018) two-step CAT02 to the D65 reference, D_b = D_d = D.
  const unit: Vec3 = [1, 1, 1];
  const rgbW = multiply(CAT02, white),
    rgbD = multiply(CAT02, D65),
    rgbO = multiply(CAT02, unit);
  const gain = rgbW.map((_, i) => {
    const b = D * white[1] * (rgbO[i] / rgbW[i]) + 1 - D;
    const d = D * D65[1] * (rgbO[i] / rgbD[i]) + 1 - D;
    return b / d;
  }) as Vec3;
  return { F_b, F_L, I_zw, exponent, brightness, Q_w, gain };
}
const cache = new Map<ZcamViewing, ReturnType<typeof factors>>();
const viewingFactors = (viewing: ZcamViewing) => {
  let value = cache.get(viewing);
  if (!value) cache.set(viewing, (value = factors(viewing)));
  return value;
};

/** Relative XYZ (D65, white Y = 1) → ZCAM J_z, C_z, h_z. */
export function xyzToZcam(xyz: Vec3, viewing = ZCAM_VIEWING): Vec3 {
  const f = viewingFactors(viewing);
  const absolute = xyz.map((v) => v * viewing.whiteLuminance) as Vec3;
  const adapted = multiply(
    CAT02_INVERSE,
    multiply(CAT02, absolute).map((v, i) => v * f.gain[i]) as Vec3,
  );
  const [I, a, b] = izazbz(adapted);
  const hue = ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360;
  const e = 1.015 + Math.cos(((89.038 + hue) * Math.PI) / 180);
  const Q = 2700 * Math.sign(I) * Math.abs(I) ** f.exponent * f.brightness;
  const M =
    100 *
    (a * a + b * b) ** 0.37 *
    ((e ** 0.068 * f.F_L ** 0.2) / (f.F_b ** 0.1 * f.I_zw ** 0.78));
  return [(100 * Q) / f.Q_w, (100 * M) / f.Q_w, hue];
}
/** Inverse of {@link xyzToZcam}. */
export function zcamToXyz([J, C, h]: Vec3, viewing = ZCAM_VIEWING): Vec3 {
  const f = viewingFactors(viewing);
  const hue = Number.isFinite(h) ? h : 0;
  const Q = (J * f.Q_w) / 100;
  const I = (Q / (2700 * f.brightness)) ** (1 / f.exponent);
  const M = (C * f.Q_w) / 100;
  const e = 1.015 + Math.cos(((89.038 + hue) * Math.PI) / 180);
  const radius =
    (M /
      (100 *
        ((e ** 0.068 * f.F_L ** 0.2) / (f.F_b ** 0.1 * f.I_zw ** 0.78)))) **
    (1 / (2 * 0.37));
  const angle = (hue * Math.PI) / 180;
  const adapted = izazbzToXyz([
    I,
    radius * Math.cos(angle),
    radius * Math.sin(angle),
  ]);
  const absolute = multiply(
    CAT02_INVERSE,
    multiply(CAT02, adapted).map((v, i) => v / f.gain[i]) as Vec3,
  );
  return absolute.map((v) => v / viewing.whiteLuminance) as Vec3;
}
