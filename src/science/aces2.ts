import type { Vec3 } from '../model';
import {
  bradford,
  invert,
  primariesMatrix,
  product,
  xyToXYZ,
  type Mat3,
} from './linear';

// ACES 2.0 Output Transform, SDR 100 cd/m² with Rec.709 limiting primaries and
// D65 white (Output.Academy.Rec709-D65_100nit_in_Rec709-D65_sRGB-Piecewise).
// Ported from the reference CTL in aces-core: Lib.Academy.OutputTransform and
// Lib.Academy.Tonescale (transform IDs …:v2.0:…a2.v1). Forward path:
// ACES2065-1 → JMh (simplified Hellwig 2022 CAM) → tonescale on J → chroma
// compression on M → gamut compression toward a hue-dependent focus → Rec.709.
// The CTL multiplies row vectors (v · M); matrices here keep that convention.

type XY = [number, number];
interface Chromaticities {
  red: XY;
  green: XY;
  blue: XY;
  white: XY;
}
const AP0: Chromaticities = {
  red: [0.7347, 0.2653],
  green: [0, 1],
  blue: [0.0001, -0.077],
  white: [0.32168, 0.33767],
};
const AP1: Chromaticities = {
  red: [0.713, 0.293],
  green: [0.165, 0.83],
  blue: [0.128, 0.044],
  white: [0.32168, 0.33767],
};
const REC709: Chromaticities = {
  red: [0.64, 0.33],
  green: [0.3, 0.6],
  blue: [0.15, 0.06],
  white: [0.3127, 0.329],
};
const CAM16: Chromaticities = {
  red: [0.8336, 0.1735],
  green: [2.3854, -1.4659],
  blue: [0.087, -0.125],
  white: [0.333, 0.333],
};

const transpose = (m: Mat3): Mat3 =>
  [0, 1, 2].map((column) => m.map((row) => row[column])) as Mat3;
/** Row vector times matrix, as CTL mult_f3_f33. */
const vm = ([a, b, c]: Vec3, m: Mat3): Vec3 => [
  a * m[0][0] + b * m[1][0] + c * m[2][0],
  a * m[0][1] + b * m[1][1] + c * m[2][1],
  a * m[0][2] + b * m[1][2] + c * m[2][2],
];
const rgbToXyz = (c: Chromaticities) =>
  transpose(primariesMatrix([c.red, c.green, c.blue], c.white));
const scale = (s: number, v: Vec3) => v.map((x) => x * s) as Vec3;
const lerp = (a: number, b: number, t: number) => a + t * (b - a);
const wrap360 = (hue: number) => {
  const y = hue % 360;
  return y < 0 ? y + 360 : y;
};
const hueIndex = (hue: number, size: number) =>
  Math.trunc((wrap360(hue) / 360) * size);

// CAM parameters
const REF_LUMINANCE = 100;
const L_A = 100;
const Y_B = 20;
const SURROUND: Vec3 = [0.9, 0.59, 0.9]; // dim
const J_SCALE = 100;
const NL_OFFSET = 0.2713 * 100;
const NL_SCALE = 4 * 100;
const MODEL_GAMMA = SURROUND[1] * (1.48 + Math.sqrt(Y_B / REF_LUMINANCE));
const MODEL_GAMMA_INV = 1 / MODEL_GAMMA;

// Chroma compression
const CHROMA_COMPRESS = 2.4;
const CHROMA_COMPRESS_FACT = 3.3;
const CHROMA_EXPAND = 1.3;
const CHROMA_EXPAND_FACT = 0.69;
const CHROMA_EXPAND_THR = 0.5;

// Gamut compression
const SMOOTH_CUSPS = 0.12;
const SMOOTH_M = 0.27;
const CUSP_MID_BLEND = 1.3;
const FOCUS_GAIN_BLEND = 0.3;
const FOCUS_DISTANCE = 1.35;
const FOCUS_DISTANCE_SCALING = 1.75;
const COMPRESSION_THRESHOLD = 0.75;

// Tables: 360 hue samples padded by one wrapped entry at each end.
const TABLE = 360;
const BASE = 1;
const TOTAL = TABLE + 2;
const CORNERS = 6;

interface JMhParams {
  toCam: Mat3;
  fromCam: Mat3;
  toAab: Mat3;
  fromAab: Mat3;
  F_L_n: number;
  A_w_J: number;
}

const compressFwd = (Rc: number) => {
  const F = Rc ** 0.42;
  return F / (NL_OFFSET + F);
};
const compressInv = (Ra: number) => {
  const limited = Math.min(Ra, 0.99);
  return ((NL_OFFSET * limited) / (1 - limited)) ** (1 / 0.42);
};
const signedFwd = (v: number) => Math.sign(v) * compressFwd(Math.abs(v));
const signedInv = (v: number) => Math.sign(v) * compressInv(Math.abs(v));
const achromaticToJ = (A: number) => J_SCALE * A ** MODEL_GAMMA;
const jToAchromatic = (J: number) => (J / J_SCALE) ** MODEL_GAMMA_INV;

function initJMh(primaries: Chromaticities): JMhParams {
  const M16 = invert(rgbToXyz(CAM16));
  const base: Mat3 = [
    [2, 1, 1 / 9],
    [1, -12 / 11, 1 / 9],
    [1 / 20, 1 / 11, -2 / 9],
  ];
  const RGB_TO_XYZ = rgbToXyz(primaries);
  const XYZ_w = vm([REF_LUMINANCE, REF_LUMINANCE, REF_LUMINANCE], RGB_TO_XYZ);
  const Y_w = XYZ_w[1];
  const RGB_w = vm(XYZ_w, M16);
  const k = 1 / (5 * L_A + 1);
  const k4 = k ** 4;
  const F_L = 0.2 * k4 * (5 * L_A) + 0.1 * (1 - k4) ** 2 * (5 * L_A) ** (1 / 3);
  const F_L_n = F_L / REF_LUMINANCE;
  const D = RGB_w.map((v) => (F_L_n * Y_w) / v) as Vec3;
  const RGB_Aw = RGB_w.map((v, i) => signedFwd(D[i] * v)) as Vec3;
  const cone = base.map((row) => scale(NL_SCALE, row)) as Mat3;
  const A_w =
    cone[0][0] * RGB_Aw[0] + cone[1][0] * RGB_Aw[1] + cone[2][0] * RGB_Aw[2];
  const toCam = product(
    product(RGB_TO_XYZ, M16).map((row) => scale(REF_LUMINANCE, row)) as Mat3,
    [
      [D[0], 0, 0],
      [0, D[1], 0],
      [0, 0, D[2]],
    ],
  );
  const toAab = cone.map(([a, b, c]) => [
    a / A_w,
    b * 43 * SURROUND[2],
    c * 43 * SURROUND[2],
  ]) as Mat3;
  return {
    toCam,
    fromCam: invert(toCam),
    toAab,
    fromAab: invert(toAab),
    F_L_n,
    A_w_J: compressFwd(F_L),
  };
}

const rgbToAab = (rgb: Vec3, p: JMhParams) =>
  vm(vm(rgb, p.toCam).map(signedFwd) as Vec3, p.toAab);
function aabToJMh([A, a, b]: Vec3): Vec3 {
  if (A <= 0) return [0, 0, 0];
  return [
    achromaticToJ(A),
    Math.sqrt(a * a + b * b),
    wrap360((Math.atan2(b, a) * 180) / Math.PI),
  ];
}
const rgbToJMh = (rgb: Vec3, p: JMhParams) => aabToJMh(rgbToAab(rgb, p));
function jmhToRgb([J, M, h]: Vec3, p: JMhParams): Vec3 {
  const hr = (h / 180) * Math.PI;
  const Aab: Vec3 = [jToAchromatic(J), M * Math.cos(hr), M * Math.sin(hr)];
  return vm(vm(Aab, p.fromAab).map(signedInv) as Vec3, p.fromCam);
}
const jToY = (J: number, p: JMhParams) =>
  compressInv(p.A_w_J * jToAchromatic(Math.abs(J))) / p.F_L_n;
const yToJ = (Y: number, p: JMhParams) =>
  Math.sign(Y) * achromaticToJ(compressFwd(Math.abs(Y) * p.F_L_n) / p.A_w_J);

// Tonescale (Lib.Academy.Tonescale), Daniele Siragusano's curve with flare.
function initTonescale(peak: number) {
  const n_r = 100; // normalised white in nits
  const g = 1.15; // surround / contrast
  const c = 0.18; // scene grey anchor
  const c_d = 10.013; // display luminance of scene grey, nits
  const w_g = 0.14;
  const t_1 = 0.04; // shadow toe / flare
  const r_hit =
    128 + (896 - 128) * (Math.log(peak / n_r) / Math.log(10000 / 100));
  const m_0 = peak / n_r;
  const m_1 = 0.5 * (m_0 + Math.sqrt(m_0 * (m_0 + 4 * t_1)));
  const u = (r_hit / m_1 / (r_hit / m_1 + 1)) ** g;
  const m = m_1 / u;
  const w_i = Math.log(peak / 100) / Math.log(2);
  const c_t = (c_d / n_r) * (1 + w_i * w_g);
  const g_ip = 0.5 * (c_t + Math.sqrt(c_t * (c_t + 4 * t_1)));
  const g_ipp2 = -(m_1 * (g_ip / m) ** (1 / g)) / ((g_ip / m) ** (1 / g) - 1);
  const w_2 = c / g_ipp2;
  const s_2 = w_2 * m_1;
  const u_2 = (r_hit / m_1 / (r_hit / m_1 + w_2)) ** g;
  return {
    n_r,
    g,
    t_1,
    c_t,
    s_2,
    m_2: m_1 / u_2,
    forwardLimit: 8 * r_hit,
    logPeak: Math.log10(peak / n_r),
  };
}
type Tonescale = ReturnType<typeof initTonescale>;
/** Scene-linear value → display luminance in cd/m². */
function tonescaleFwd(x: number, ts: Tonescale) {
  const f = ts.m_2 * (Math.max(0, x) / (x + ts.s_2)) ** ts.g;
  return Math.max(0, (f * f) / (f + ts.t_1)) * ts.n_r;
}

interface ODTParams {
  peak: number;
  input: JMhParams;
  reach: JMhParams;
  limit: JMhParams;
  ts: Tonescale;
  limitJMax: number;
  reachM: Float64Array;
  sat: number;
  satThr: number;
  compr: number;
  chromaCompressScale: number;
  midJ: number;
  focusDist: number;
  lowerHullGammaInv: number;
  cusps: Vec3[];
  hues: Float64Array;
  upperHullGammaInv: Float64Array;
}

function reachMFromTable(h: number, table: Float64Array) {
  const base = hueIndex(h, TABLE);
  return lerp(table[base + BASE], table[base + BASE + 1], h - base);
}

// Toe that remaps x between 0 and limit; k1, k2 set its size and shape.
function toe(x: number, limit: number, k1In: number, k2In: number) {
  if (x > limit) return x;
  const k2 = Math.max(k2In, 0.001);
  const k1 = Math.sqrt(k1In * k1In + k2 * k2);
  const k3 = (limit + k1) / (limit + k2);
  const minusB = k3 * x - k1;
  const minusC = k2 * k3 * x;
  return 0.5 * (minusB + Math.sqrt(minusB * minusB + 4 * minusC));
}

function chromaCompressNorm(h: number, compressScale: number) {
  const hr = (h / 180) * Math.PI;
  const a = Math.cos(hr),
    b = Math.sin(hr);
  const cos2 = a * a - b * b,
    sin2 = 2 * a * b;
  const cos3 = 4 * a * a * a - 3 * a,
    sin3 = 3 * b - 4 * b * b * b;
  const M =
    11.34072 * a +
    16.46899 * cos2 +
    7.8838 * cos3 +
    14.66441 * b -
    6.37224 * sin2 +
    9.19364 * sin3 +
    77.12896;
  return M * compressScale;
}

// In-gamut chroma compression: rescale M with the tonescaled J, expand
// low-saturation shadows and mid-tones, then roll off highlight colourfulness.
function chromaCompressFwd([J, M, h]: Vec3, J_ts: number, p: ODTParams): Vec3 {
  if (M === 0) return [J_ts, M, h];
  const nJ = J_ts / p.limitJMax;
  const snJ = Math.max(0, 1 - nJ);
  const Mnorm = chromaCompressNorm(h, p.chromaCompressScale);
  const limit = (nJ ** MODEL_GAMMA_INV * reachMFromTable(h, p.reachM)) / Mnorm;
  let compressed = (M * (J_ts / J) ** MODEL_GAMMA_INV) / Mnorm;
  compressed =
    limit -
    toe(
      limit - compressed,
      limit - 0.001,
      snJ * p.sat,
      Math.sqrt(nJ * nJ + p.satThr),
    );
  compressed = toe(compressed, limit, nJ * p.compr, snJ);
  return [J_ts, compressed * Mnorm, h];
}

function tonemapAndCompress(JMh: Vec3, p: ODTParams): Vec3 {
  const linear = jToY(JMh[0], p.input) / REF_LUMINANCE;
  const J_ts = yToJ(tonescaleFwd(linear, p.ts), p.input);
  return chromaCompressFwd(JMh, J_ts, p);
}

function compressionVectorSlope(
  intersectJ: number,
  focusJ: number,
  limitJMax: number,
  slopeGain: number,
) {
  const direction = intersectJ < focusJ ? intersectJ : limitJMax - intersectJ;
  return (direction * (intersectJ - focusJ)) / (focusJ * slopeGain);
}

function solveJIntersect(
  J: number,
  M: number,
  focusJ: number,
  maxJ: number,
  slopeGain: number,
) {
  const scaled = M / slopeGain;
  const a = scaled / focusJ;
  if (J < focusJ) {
    const b = 1 - scaled;
    const c = -J;
    return (-2 * c) / (b + Math.sqrt(b * b - 4 * a * c));
  }
  const b = -(1 + scaled + maxJ * a);
  const c = maxJ * scaled + J;
  return (-2 * c) / (b - Math.sqrt(b * b - 4 * a * c));
}

// Smooth minimum about the scaled reference, a cubic polynomial blend.
function sminScaled(a: number, b: number, reference: number) {
  const s = SMOOTH_CUSPS * reference;
  const h = Math.max(s - Math.abs(a - b), 0) / s;
  return Math.min(a, b) - h * h * h * s * (1 / 6);
}

// Line J = slope·M + intersect against the hull J = J_max·(M / M_max)^(1/γ),
// approximated by shifting the intersect through the inverse power.
function lineBoundaryM(
  intersectJ: number,
  slope: number,
  invGamma: number,
  J_max: number,
  M_max: number,
  referenceJ: number,
) {
  const shifted = referenceJ * (intersectJ / referenceJ) ** invGamma;
  return (shifted * M_max) / (J_max - slope * M_max);
}

function gamutBoundaryM(
  cusp: [number, number],
  J_max: number,
  gammaTopInv: number,
  gammaBottomInv: number,
  intersectSource: number,
  slope: number,
  intersectCusp: number,
) {
  const lower = lineBoundaryM(
    intersectSource,
    slope,
    gammaBottomInv,
    cusp[0],
    cusp[1],
    intersectCusp,
  );
  // The upper hull is flipped, zeroed at J_max, with the slope negated.
  const upper = lineBoundaryM(
    J_max - intersectSource,
    -slope,
    gammaTopInv,
    J_max - cusp[0],
    cusp[1],
    J_max - intersectCusp,
  );
  return sminScaled(lower, upper, cusp[1]);
}

function focusGain(
  J: number,
  threshold: number,
  limitJMax: number,
  focusDist: number,
) {
  let gain = limitJMax * focusDist;
  if (J > threshold) {
    const adjust = Math.log10(
      (limitJMax - threshold) / Math.max(0.0001, limitJMax - J),
    );
    gain *= adjust * adjust + 1;
  }
  return gain;
}

function remapM(M: number, gamutM: number, reachM: number) {
  const proportion = Math.max(gamutM / reachM, COMPRESSION_THRESHOLD);
  const threshold = proportion * gamutM;
  if (M <= threshold || proportion >= 1) return M;
  const offset = M - threshold;
  const gamutOffset = gamutM - threshold;
  const reachOffset = reachM - threshold;
  const s = reachOffset / (reachOffset / gamutOffset - 1);
  const nd = offset / s;
  return threshold + (s * nd) / (1 + nd);
}

const focusJFor = (cuspJ: number, midJ: number, limitJMax: number) =>
  lerp(cuspJ, midJ, Math.min(1, CUSP_MID_BLEND - cuspJ / limitJMax));

interface HueGamut {
  cusp: [number, number];
  gammaTopInv: number;
  focusJ: number;
  threshold: number;
}

// Upper index of the hue-table interval (hues[i − 1], hues[i]] containing h.
function hueInterval(h: number, hues: Float64Array) {
  let lo = 0,
    hi = BASE + TABLE;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (h > hues[mid]) lo = mid;
    else hi = mid;
  }
  return hi;
}

function hueGamut(h: number, p: ODTParams): HueGamut {
  const i = hueInterval(h, p.hues);
  const lo = p.cusps[i - 1],
    hi = p.cusps[i];
  const t = (h - lo[2]) / (hi[2] - lo[2]);
  const cusp: [number, number] = [lerp(lo[0], hi[0], t), lerp(lo[1], hi[1], t)];
  return {
    cusp,
    // The CTL weights the hull gamma by h − h_lo, assuming ~1° spacing.
    gammaTopInv: lerp(
      p.upperHullGammaInv[i - 1],
      p.upperHullGammaInv[i],
      h - p.hues[i - 1],
    ),
    focusJ: focusJFor(cusp[0], p.midJ, p.limitJMax),
    threshold: lerp(cusp[0], p.limitJMax, FOCUS_GAIN_BLEND),
  };
}

function compressGamut([J, M, h]: Vec3, p: ODTParams, g: HueGamut): Vec3 {
  const slopeGain = focusGain(J, g.threshold, p.limitJMax, p.focusDist);
  const intersectSource = solveJIntersect(
    J,
    M,
    g.focusJ,
    p.limitJMax,
    slopeGain,
  );
  const slope = compressionVectorSlope(
    intersectSource,
    g.focusJ,
    p.limitJMax,
    slopeGain,
  );
  const intersectCusp = solveJIntersect(
    g.cusp[0],
    g.cusp[1],
    g.focusJ,
    p.limitJMax,
    slopeGain,
  );
  const boundary = gamutBoundaryM(
    g.cusp,
    p.limitJMax,
    g.gammaTopInv,
    p.lowerHullGammaInv,
    intersectSource,
    slope,
    intersectCusp,
  );
  if (boundary <= 0) return [J, 0, h];
  const reachBoundary = lineBoundaryM(
    intersectSource,
    slope,
    MODEL_GAMMA_INV,
    p.limitJMax,
    reachMFromTable(h, p.reachM),
    p.limitJMax,
  );
  const remapped = remapM(M, boundary, reachBoundary);
  return [intersectSource + remapped * slope, remapped, h];
}

function gamutCompressFwd(JMh: Vec3, p: ODTParams): Vec3 {
  const [J, M, h] = JMh;
  if (J <= 0) return [0, 0, h];
  if (M < 0 || J > p.limitJMax) return [J, 0, h];
  return compressGamut(JMh, p, hueGamut(h, p));
}

// ---- Table construction (init_ODTParams) ----

/** Unit-cube corners in hue order R, Y, G, C, B, M. */
const cubeCorner = (corner: number): Vec3 => [
  (corner + 1) % CORNERS < 3 ? 1 : 0,
  (corner + 5) % CORNERS < 3 ? 1 : 0,
  (corner + 3) % CORNERS < 3 ? 1 : 0,
];

/** Arrange six corners into a hue cycle, lowest hue at [1], wrapped ends. */
function cycle<T>(
  items: T[],
  hueOf: (item: T) => number,
  wrap: (item: T, offset: number) => T,
) {
  let min = 0;
  items.forEach((item, i) => {
    if (hueOf(item) < hueOf(items[min])) min = i;
  });
  const rotated = items.map((_, i) => items[(i + min) % CORNERS]);
  return [wrap(rotated[CORNERS - 1], -360), ...rotated, wrap(rotated[0], 360)];
}
const wrapJMh = (v: Vec3, offset: number): Vec3 => [v[0], v[1], v[2] + offset];

function reachCorners(p: ODTParams): Vec3[] {
  // Scale each corner along its RGB direction until J reaches limit J max,
  // searching on the achromatic response A to avoid the inverse model.
  const limitA = jToAchromatic(p.limitJMax);
  const corners = Array.from({ length: CORNERS }, (_, i) => {
    const direction = cubeCorner(i);
    let lower = 0,
      upper = p.ts.forwardLimit;
    while (upper - lower > 1e-3) {
      const test = (lower + upper) / 2;
      if (rgbToAab(scale(test, direction), p.reach)[0] < limitA) lower = test;
      else upper = test;
    }
    return rgbToJMh(scale(upper, direction), p.reach);
  });
  return cycle(corners, (v) => v[2], wrapJMh);
}

function limitingCorners(p: ODTParams) {
  const corners = Array.from({ length: CORNERS }, (_, i) => {
    const rgb = scale(p.peak / REF_LUMINANCE, cubeCorner(i));
    return { rgb, jmh: rgbToJMh(rgb, p.limit) };
  });
  return cycle(
    corners,
    (c) => c.jmh[2],
    (c, offset) => ({ rgb: c.rgb, jmh: wrapJMh(c.jmh, offset) }),
  );
}

function sortedCubeHues(reach: Vec3[], limit: Vec3[]) {
  const hues: number[] = [];
  let r = 1,
    l = 1;
  while (r < CORNERS + 1 || l < CORNERS + 1) {
    const reachHue = reach[r][2],
      limitHue = limit[l][2];
    if (reachHue === limitHue) {
      hues.push(reachHue);
      r++;
      l++;
    } else if (reachHue < limitHue) {
      hues.push(reachHue);
      r++;
    } else {
      hues.push(limitHue);
      l++;
    }
  }
  return hues;
}

// Sample hues as uniformly as possible while hitting every cube corner hue.
function buildHueTable(sorted: number[]) {
  const table = new Float64Array(TOTAL);
  const counts: number[] = [];
  let lastIndex = -1;
  let minIndex = sorted[0] === 0 ? 0 : 1;
  sorted.forEach((hue, k) => {
    let nominal = Math.min(
      Math.max(Math.round((hue * TABLE) / 360), minIndex),
      TABLE - 1,
    );
    if (lastIndex === nominal) {
      if (k > 1 && counts[k - 2] !== counts[k - 1] - 1) counts[k - 1] -= 1;
      else nominal += 1;
    }
    counts[k] = Math.min(nominal, TABLE - 1);
    lastIndex = minIndex = nominal;
  });
  const fill = (
    samples: number,
    lower: number,
    upper: number,
    start: number,
  ) => {
    const delta = (upper - lower) / samples;
    for (let i = 0; i < samples; i++) table[start + i] = lower + i * delta;
  };
  let total = 0;
  fill(counts[0], 0, sorted[0], total + 1);
  total += counts[0];
  for (let k = 1; k < sorted.length; k++) {
    const samples = counts[k] - counts[k - 1];
    fill(samples, sorted[k - 1], sorted[k], total + 1);
    total += samples;
  }
  fill(TABLE - total, sorted[sorted.length - 1], 360, total + 1);
  table[0] = table[BASE + TABLE - 1] - 360;
  table[BASE + TABLE] = table[BASE] + 360;
  return table;
}

// Bisect along the cube edge between the two corners that bracket the hue.
function displayCusp(
  hue: number,
  corners: { rgb: Vec3; jmh: Vec3 }[],
  p: JMhParams,
): [number, number] {
  let upper = 1;
  while (upper < corners.length - 1 && !(corners[upper].jmh[2] > hue)) upper++;
  const lower = upper - 1;
  if (corners[lower].jmh[2] === hue)
    return [corners[lower].jmh[0], corners[lower].jmh[1]];
  const from = corners[lower].rgb,
    to = corners[upper].rgb;
  const at = (t: number) =>
    rgbToJMh(from.map((v, i) => lerp(v, to[i], t)) as Vec3, p);
  let lowT = 0,
    highT = 1;
  while (highT - lowT > 1e-7) {
    const t = (lowT + highT) / 2;
    const h = at(t)[2];
    if (h < corners[lower].jmh[2]) highT = t;
    else if (h >= corners[upper].jmh[2]) lowT = t;
    else if (h > hue) highT = t;
    else lowT = t;
  }
  const JMh = at((lowT + highT) / 2);
  return [JMh[0], JMh[1]];
}

function buildCuspTable(hues: Float64Array, p: ODTParams): Vec3[] {
  const corners = limitingCorners(p);
  const table: Vec3[] = new Array(TOTAL);
  for (let i = BASE; i < TOTAL; i++) {
    const [J, M] = displayCusp(hues[i], corners, p.limit);
    table[i] = [J, M * (1 + SMOOTH_M * SMOOTH_CUSPS), hues[i]];
  }
  table[0] = [table[TABLE][0], table[TABLE][1], hues[0]];
  table[BASE + TABLE] = [table[BASE][0], table[BASE][1], hues[BASE + TABLE]];
  return table;
}

// Reach-gamut (AP1) colourfulness at limit J max for each whole-degree hue.
function buildReachTable(p: ODTParams) {
  const table = new Float64Array(TOTAL);
  const outside = (M: number, hue: number) =>
    jmhToRgb([p.limitJMax, M, hue], p.reach).some((v) => v < 0);
  for (let i = 0; i < TABLE; i++) {
    const hue = (i * 360) / TABLE;
    let low = 0,
      high = 50;
    while (!outside(high, hue) && high < 1300) {
      low = high;
      high += 50;
    }
    while (high - low > 1e-2) {
      const M = (high + low) / 2;
      if (outside(M, hue)) high = M;
      else low = M;
    }
    table[i + BASE] = high;
  }
  table[0] = table[TABLE];
  table[BASE + TABLE] = table[BASE];
  return table;
}

// Smallest upper-hull gamma whose approximate boundary lies outside the top
// of the limiting cube at five J positions between the cusp and J max.
function buildUpperHullGamma(p: ODTParams) {
  const table = new Float64Array(TOTAL);
  const positions = [0.01, 0.1, 0.5, 0.8, 0.99];
  const luminanceLimit = p.peak / REF_LUMINANCE;
  for (let i = BASE; i < BASE + TABLE; i++) {
    const [cuspJ, cuspM, hue] = p.cusps[i];
    const cusp: [number, number] = [cuspJ, cuspM];
    const threshold = lerp(cuspJ, p.limitJMax, FOCUS_GAIN_BLEND);
    const focusJ = focusJFor(cuspJ, p.midJ, p.limitJMax);
    const tests = positions.map((position) => {
      const J = lerp(cuspJ, p.limitJMax, position);
      const gain = focusGain(J, threshold, p.limitJMax, p.focusDist);
      const intersect = solveJIntersect(J, cuspM, focusJ, p.limitJMax, gain);
      return {
        intersect,
        slope: compressionVectorSlope(intersect, focusJ, p.limitJMax, gain),
        cusp: solveJIntersect(cuspJ, cuspM, focusJ, p.limitJMax, gain),
      };
    });
    const fits = (gammaTopInv: number) =>
      tests.every((test) => {
        const M = gamutBoundaryM(
          cusp,
          p.limitJMax,
          gammaTopInv,
          p.lowerHullGammaInv,
          test.intersect,
          test.slope,
          test.cusp,
        );
        const J = test.intersect + test.slope * M;
        return jmhToRgb([J, M, hue], p.limit).some((v) => v > luminanceLimit);
      });
    let low = 0,
      high = 0.4;
    while (!fits(1 / high) && high < 5) {
      low = high;
      high += 0.4;
    }
    while (high - low > 1e-5) {
      const gamma = (high + low) / 2;
      if (fits(1 / gamma)) high = gamma;
      else low = gamma;
    }
    table[i] = 1 / high;
  }
  table[0] = table[TABLE];
  table[BASE + TABLE] = table[BASE];
  return table;
}

function initODT(peak: number, limiting: Chromaticities): ODTParams {
  const input = initJMh(AP0);
  const ts = initTonescale(peak);
  const p = {
    peak,
    input,
    reach: initJMh(AP1),
    limit: initJMh(limiting),
    ts,
    limitJMax: yToJ(peak, input),
    sat: Math.max(
      0.2,
      CHROMA_EXPAND - CHROMA_EXPAND * CHROMA_EXPAND_FACT * ts.logPeak,
    ),
    satThr: CHROMA_EXPAND_THR / peak,
    compr:
      CHROMA_COMPRESS + CHROMA_COMPRESS * CHROMA_COMPRESS_FACT * ts.logPeak,
    chromaCompressScale: (0.03379 * peak) ** 0.30596 - 0.45135,
    midJ: yToJ(ts.c_t * REF_LUMINANCE, input),
    focusDist:
      FOCUS_DISTANCE + FOCUS_DISTANCE * FOCUS_DISTANCE_SCALING * ts.logPeak,
    lowerHullGammaInv: 1 / (1.14 + 0.07 * ts.logPeak),
  } as ODTParams;
  p.reachM = buildReachTable(p);
  p.hues = buildHueTable(
    sortedCubeHues(
      reachCorners(p),
      limitingCorners(p).map((c) => c.jmh),
    ),
  );
  p.cusps = buildCuspTable(p.hues, p);
  p.upperHullGammaInv = buildUpperHullGamma(p);
  return p;
}

// Linear Rec.709 (D65) → ACES2065-1 (AP0, ACES white), Bradford adaptation,
// as the ACES "Linear Rec.709 (sRGB)" colour space conversion.
const ACES_WHITE = xyToXYZ(AP0.white);
const D65_WHITE = xyToXYZ(REC709.white);
const XYZ_TO_AP0 = invert(
  primariesMatrix([AP0.red, AP0.green, AP0.blue], AP0.white),
);
const REC709_TO_XYZ = primariesMatrix(
  [REC709.red, REC709.green, REC709.blue],
  REC709.white,
);
const toAP0 = (rgb: Vec3) => {
  const xyz = REC709_TO_XYZ.map(
    (row) => row[0] * rgb[0] + row[1] * rgb[1] + row[2] * rgb[2],
  ) as Vec3;
  const adapted = bradford(xyz, D65_WHITE, ACES_WHITE);
  return XYZ_TO_AP0.map(
    (row) => row[0] * adapted[0] + row[1] * adapted[1] + row[2] * adapted[2],
  ) as Vec3;
};
const AP0_TO_AP1 = product(rgbToXyz(AP0), invert(rgbToXyz(AP1)));
const AP1_TO_AP0 = invert(AP0_TO_AP1);

let params: ODTParams | undefined;
const odt = () => (params ??= initODT(100, REC709));

/** ACES2065-1 → Rec.709 linear display light, 1 = 100 cd/m², unclamped. */
export function aces2OutputFromAP0(aces: Vec3): Vec3 {
  const p = odt();
  const ap1 = vm(aces, AP0_TO_AP1).map((v) =>
    Math.min(Math.max(v, 0), p.ts.forwardLimit),
  ) as Vec3;
  const JMh = rgbToJMh(vm(ap1, AP1_TO_AP0), p.input);
  return jmhToRgb(gamutCompressFwd(tonemapAndCompress(JMh, p), p), p.limit);
}

/** Linear Rec.709 scene → linear Rec.709 display (0–1, clamped). */
export function aces2(rgb: Vec3): Vec3 {
  return aces2OutputFromAP0(toAP0(rgb)).map((v) =>
    Math.min(Math.max(v, 0), 1),
  ) as Vec3;
}
