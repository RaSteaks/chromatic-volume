// HDR and intermediate transfer functions used by the curve figures.

/** SMPTE ST 2084 inverse EOTF: absolute luminance (cd/m²) → PQ signal. */
export function pqEncode(nits: number): number {
  const m1 = 2610 / 16384,
    m2 = 2523 / 32,
    c1 = 3424 / 4096,
    c2 = 2413 / 128,
    c3 = 2392 / 128;
  const y = Math.max(nits, 0) / 10000;
  return ((c1 + c2 * y ** m1) / (1 + c3 * y ** m1)) ** m2;
}
/** ITU-R BT.2100 HLG OETF: normalized scene light E ∈ [0, 1] → signal. */
export function hlgEncode(scene: number): number {
  const a = 0.17883277,
    b = 1 - 4 * a,
    c = 0.5 - a * Math.log(4 * a);
  const e = Math.max(scene, 0);
  return e <= 1 / 12 ? Math.sqrt(3 * e) : a * Math.log(12 * e - b) + c;
}
/** HLG scene light that produces the BT.2408 reference-white signal of 75 %. */
export const HLG_REFERENCE_WHITE = (() => {
  const a = 0.17883277,
    b = 1 - 4 * a,
    c = 0.5 - a * Math.log(4 * a);
  return (Math.exp((0.75 - c) / a) + b) / 12;
})();

// Blackmagic DaVinci Wide Gamut Intermediate (DaVinci Resolve 17 white paper).
const DI = {
  A: 0.0075,
  B: 7,
  C: 0.07329248,
  M: 10.44426855,
  LIN_CUT: 0.00262409,
  LOG_CUT: 0.02740668,
};
export function davinciEncode(linear: number): number {
  return linear <= DI.LIN_CUT
    ? linear * DI.M
    : (Math.log2(linear + DI.A) + DI.B) * DI.C;
}
export function davinciDecode(signal: number): number {
  return signal <= DI.LOG_CUT
    ? signal / DI.M
    : 2 ** (signal / DI.C - DI.B) - DI.A;
}
