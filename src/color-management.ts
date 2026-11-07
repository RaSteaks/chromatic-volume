import { cameraGamuts } from './camera-gamuts';
import {
  cameraTransfers,
  decodeCamera,
  encodeCamera,
} from './camera-transfers';
import Color from 'colorjs.io';
import type { Vec3 } from './model';
import { applyLut, type CubeLut, type Interpolation } from './lut';

export const gamuts = [
  { id: 'srgb-linear', name: 'Rec.709 / sRGB · D65' },
  { id: 'p3-linear', name: 'Display P3 · D65' },
  { id: 'rec2020-linear', name: 'Rec.2020 · D65' },
  { id: 'a98rgb-linear', name: 'Adobe RGB · D65' },
  { id: 'prophoto-linear', name: 'ProPhoto RGB · D50' },
  { id: 'acescg', name: 'ACES AP1 · D60' },
  ...cameraGamuts,
];
export const transfers = [
  { id: 'linear', name: '线性' },
  { id: 'srgb', name: 'sRGB 分段曲线' },
  { id: 'rec709', name: 'BT.709 OETF / 反函数' },
  { id: 'prophoto', name: 'ProPhoto 原生（暗部线性段）' },
  { id: 'a98', name: 'Adobe RGB 原生（563/256）' },
  { id: 'rec2020', name: 'BT.2020 OETF（12-bit）' },
  { id: 'gamma18', name: 'Gamma 1.8' },
  { id: 'gamma22', name: 'Gamma 2.2' },
  { id: 'gamma24', name: 'Gamma 2.4' },
  { id: 'bt1886', name: 'BT.1886 EOTF（Rec.1886）' },
  { id: 'acescc', name: 'ACEScc Log' },
  ...cameraTransfers,
] as const;
export type Transfer = (typeof transfers)[number]['id'];
export interface LutEncoding {
  gamut: string;
  gamma: Transfer | '';
  black: number;
  white: number;
}
export const emptyEncoding = (): LutEncoding => ({
  gamut: '',
  gamma: '',
  black: 0,
  white: 100,
});
export function encodingReady(encoding: LutEncoding): boolean {
  return (
    gamuts.some((item) => item.id === encoding.gamut) &&
    transfers.some((item) => item.id === encoding.gamma) &&
    encoding.black >= 0 &&
    encoding.white > encoding.black
  );
}
const signedPower = (value: number, power: number) =>
  Math.sign(value) * Math.abs(value) ** power;
// BT.709 uses the published rounded OETF constants. Its tiny knee discontinuity
// is retained; it is not the BT.1886 display EOTF. Negative SDR values use odd extension.
export function decodeTransfer(
  value: number,
  gamma: Transfer,
  black = 0,
  white = 100,
): number {
  const absolute = Math.abs(value),
    sign = Math.sign(value);
  switch (gamma) {
    case 'linear':
      return value;
    case 'srgb':
      return (
        sign *
        (absolute <= 0.04045
          ? absolute / 12.92
          : ((absolute + 0.055) / 1.055) ** 2.4)
      );
    case 'rec709':
      return (
        sign *
        (absolute < 1.099 * 0.018 ** 0.45 - 0.099
          ? absolute / 4.5
          : ((absolute + 0.099) / 1.099) ** (1 / 0.45))
      );
    case 'prophoto':
      return absolute < 1 / 32 ? value / 16 : signedPower(value, 1.8);
    case 'a98':
      return signedPower(value, 563 / 256);
    case 'rec2020': {
      const alpha = 1.0993,
        beta = 0.0181;
      return (
        sign *
        (absolute < alpha * beta ** 0.45 - (alpha - 1)
          ? absolute / 4.5
          : ((absolute + alpha - 1) / alpha) ** (1 / 0.45))
      );
    }
    case 'gamma18':
      return signedPower(value, 1.8);
    case 'gamma22':
      return signedPower(value, 2.2);
    case 'gamma24':
      return signedPower(value, 2.4);
    case 'bt1886': {
      const base = black ** (1 / 2.4),
        span = white ** (1 / 2.4) - base;
      // ITU-R BT.1886 Annex 1, normalized to reference white Y=1.
      return Math.max(value * span + base, 0) ** 2.4 / white;
    }
    case 'acescc':
      if (value >= (Math.log2(65504) + 9.72) / 17.52) return 65504;
      return value < (-15 + 9.72) / 17.52
        ? (2 ** (value * 17.52 - 9.72) - 2 ** -16) * 2
        : 2 ** (value * 17.52 - 9.72);
    default:
      return decodeCamera(value, gamma);
  }
}
export function encodeTransfer(
  value: number,
  gamma: Transfer,
  black = 0,
  white = 100,
): number {
  const absolute = Math.abs(value),
    sign = Math.sign(value);
  switch (gamma) {
    case 'linear':
      return value;
    case 'srgb':
      return (
        sign *
        (absolute <= 0.0031308
          ? 12.92 * absolute
          : 1.055 * absolute ** (1 / 2.4) - 0.055)
      );
    case 'rec709':
      return (
        sign *
        (absolute < 0.018 ? 4.5 * absolute : 1.099 * absolute ** 0.45 - 0.099)
      );
    case 'prophoto':
      return absolute < 1 / 512 ? value * 16 : signedPower(value, 1 / 1.8);
    case 'a98':
      return signedPower(value, 256 / 563);
    case 'rec2020': {
      const alpha = 1.0993,
        beta = 0.0181;
      return (
        sign *
        (absolute < beta
          ? 4.5 * absolute
          : alpha * absolute ** 0.45 - (alpha - 1))
      );
    }
    case 'gamma18':
      return signedPower(value, 1 / 1.8);
    case 'gamma22':
      return signedPower(value, 1 / 2.2);
    case 'gamma24':
      return signedPower(value, 1 / 2.4);
    case 'bt1886':
      return (
        ((Math.max(value, 0) * white) ** (1 / 2.4) - black ** (1 / 2.4)) /
        (white ** (1 / 2.4) - black ** (1 / 2.4))
      );
    case 'acescc':
      return (
        (Math.log2(
          value <= 0
            ? 2 ** -16
            : value < 2 ** -15
              ? 2 ** -16 + value * 0.5
              : value,
        ) +
          9.72) /
        17.52
      );
    default:
      return encodeCamera(value, gamma);
  }
}
export function decodeRgb(rgb: Vec3, encoding: LutEncoding): Vec3 {
  if (!encoding.gamma) throw new Error('请指定 LUT Gamma。');
  const linear = rgb.map((value) =>
    decodeTransfer(
      value,
      encoding.gamma as Transfer,
      encoding.black,
      encoding.white,
    ),
  ) as Vec3;
  return new Color(encoding.gamut, linear).to('xyz-d65').coords as Vec3;
}
export function encodeRgb(xyz: Vec3, encoding: LutEncoding): Vec3 {
  if (!encoding.gamma) throw new Error('请指定 LUT Gamma。');
  const linear = new Color('xyz-d65', xyz).to(encoding.gamut).coords as Vec3;
  return linear.map((value) =>
    encodeTransfer(
      value,
      encoding.gamma as Transfer,
      encoding.black,
      encoding.white,
    ),
  ) as Vec3;
}
export function managedLut(
  xyz: Vec3,
  lut: CubeLut,
  input: LutEncoding,
  output: LutEncoding,
  strength: number,
  interpolation: Interpolation = 'trilinear',
) {
  const encodedInput = encodeRgb(xyz, input);
  const encodedOutput = applyLut(encodedInput, lut, interpolation);
  const outputXyz = decodeRgb(encodedOutput, output);
  // Mix in one common linear-light space, never between unrelated encoded triplets.
  const mixed = xyz.map(
    (value, index) => value + (outputXyz[index] - value) * strength,
  ) as Vec3;
  return {
    input: encodedInput,
    output: encodedOutput,
    xyz: mixed,
    clipped: encodedInput.some(
      (v, i) => v < lut.min[i] - 1e-7 || v > lut.max[i] + 1e-7,
    ),
  };
}
// Use the same normative ACEScc curve for named-space conversions and LUTs.
// Color.js 0.7.1 switches its encoder at 2^-16 instead of 2^-15, causing a
// downward jump in the shadows. Keep its AP1 matrices/white point, replace both curves.
const acescc = Color.Space.get('acescc');
acescc.fromBase = (coords) =>
  coords.map((value) => encodeTransfer(value ?? 0, 'acescc')) as Vec3;
acescc.toBase = (coords) =>
  coords.map((value) => decodeTransfer(value ?? 0, 'acescc')) as Vec3;

// Explicit source/target presets. BT.1886 is paired with Rec.709 primaries here;
// it is a transfer function, not an additional set of primaries.
for (const [id, gamma] of [
  ['rec709', 'rec709'],
  ['rec1886', 'bt1886'],
] as const) {
  Color.Space.register(
    new Color.Space({
      id,
      name: id,
      base: Color.Space.get('srgb-linear'),
      coords: {
        r: { range: [0, 1] },
        g: { range: [0, 1] },
        b: { range: [0, 1] },
      },
      toBase: (coords) => coords.map((v) => decodeTransfer(v ?? 0, gamma)),
      fromBase: (coords) => coords.map((v) => encodeTransfer(v ?? 0, gamma)),
    }),
  );
}
