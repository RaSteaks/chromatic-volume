import Color from 'colorjs.io';
import { RGBColorSpace } from 'colorjs.io/fn';
import type { Vec3 } from './model';
import {
  D65_XY,
  invert,
  multiply,
  primariesMatrix,
  type Mat3,
} from './science/linear';
import { xyzToZcam, zcamToXyz } from './science/zcam';

// Additional named spaces for the colour-volume figures. Each one is registered
// with Color.js so the existing conversion, decoding and loss checks apply.

type Coords = [number | null, number | null, number | null];
const plain = (coords: Coords) => coords.map((v) => v ?? 0) as Vec3;
const space = (options: {
  id: string;
  name: string;
  base: string;
  coords: Record<string, object>;
  fromBase: (coords: Vec3) => Coords;
  toBase: (coords: Vec3) => Vec3;
}) =>
  Color.Space.register(
    new Color.Space({
      ...options,
      base: Color.Space.get(options.base),
      fromBase: (coords: Coords) => options.fromBase(plain(coords)),
      toBase: (coords: Coords) => options.toBase(plain(coords)),
    } as never),
  );

// BT.709 luma / colour-difference coefficients on sRGB-encoded R′G′B′
// (sRGB shares the BT.709 primaries). Full range: Y′ 0–1, Cb/Cr ±0.5.
const KR = 0.2126,
  KB = 0.0722,
  KG = 1 - KR - KB;
space({
  id: 'ycbcr709',
  name: 'Y′CbCr · BT.709',
  base: 'srgb',
  coords: {
    y: { range: [0, 1] },
    cb: { range: [-0.5, 0.5] },
    cr: { range: [-0.5, 0.5] },
  },
  fromBase: ([r, g, b]) => {
    const y = KR * r + KG * g + KB * b;
    return [y, (b - y) / (2 * (1 - KB)), (r - y) / (2 * (1 - KR))];
  },
  toBase: ([y, cb, cr]) => {
    const r = y + 2 * (1 - KR) * cr;
    const b = y + 2 * (1 - KB) * cb;
    return [r, (y - KR * r - KB * b) / KG, b];
  },
});

// Hexagonal projections of HSV / HSL (Smith 1978; Joblove & Greenberg 1978):
// coordinates are hue, chroma = max − min and value / lightness.
function hexHue([r, g, b]: Vec3, max: number, chroma: number): number | null {
  if (chroma <= 1e-12) return null;
  const h =
    max === r
      ? ((g - b) / chroma + 6) % 6
      : max === g
        ? (b - r) / chroma + 2
        : (r - g) / chroma + 4;
  return h * 60;
}
function hexToRgb(hue: number, chroma: number, offset: number): Vec3 {
  const h = ((((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360) / 60;
  const x = chroma * (1 - Math.abs((h % 2) - 1));
  const sector = Math.floor(h) % 6;
  const rgb: Vec3 = [
    [chroma, x, 0],
    [x, chroma, 0],
    [0, chroma, x],
    [0, x, chroma],
    [x, 0, chroma],
    [chroma, 0, x],
  ][sector] as Vec3;
  return rgb.map((v) => v + offset) as Vec3;
}
const hueCoord = { refRange: [0, 360], type: 'angle' };
space({
  id: 'hsv-hexcone',
  name: 'HSV 六棱锥',
  base: 'srgb',
  coords: { h: hueCoord, c: { range: [0, 1] }, v: { range: [0, 1] } },
  fromBase: (rgb) => {
    const max = Math.max(...rgb),
      chroma = max - Math.min(...rgb);
    return [hexHue(rgb, max, chroma), chroma, max];
  },
  toBase: ([h, c, v]) => hexToRgb(h, c, v - c),
});
space({
  id: 'hsl-bicone',
  name: 'HSL 双六棱锥',
  base: 'srgb',
  coords: { h: hueCoord, c: { range: [0, 1] }, l: { range: [0, 1] } },
  fromBase: (rgb) => {
    const max = Math.max(...rgb),
      min = Math.min(...rgb);
    return [hexHue(rgb, max, max - min), max - min, (max + min) / 2];
  },
  toBase: ([h, c, l]) => hexToRgb(h, c, l - c / 2),
});

// Hunt–Pointer–Estévez cone space, normalized to D65 (the IPT matrix).
const HPE: Mat3 = [
  [0.4002, 0.7075, -0.0807],
  [-0.228, 1.15, 0.0612],
  [0, 0, 0.9184],
];
const HPE_INVERSE = invert(HPE);
space({
  id: 'lms-hpe',
  name: 'LMS · HPE',
  base: 'xyz-d65',
  coords: { l: { range: [0, 1] }, m: { range: [0, 1] }, s: { range: [0, 1] } },
  fromBase: (xyz) => multiply(HPE, xyz),
  toBase: (lms) => multiply(HPE_INVERSE, lms),
});
// IPT (Ebner & Fairchild 1998).
const IPT: Mat3 = [
  [0.4, 0.4, 0.2],
  [4.455, -4.851, 0.396],
  [0.8056, 0.3572, -1.1628],
];
const IPT_INVERSE = invert(IPT);
const signedPow = (v: number, p: number) => Math.sign(v) * Math.abs(v) ** p;
space({
  id: 'ipt',
  name: 'IPT',
  base: 'xyz-d65',
  coords: {
    i: { range: [0, 1] },
    p: { range: [-1, 1] },
    t: { range: [-1, 1] },
  },
  fromBase: (xyz) =>
    multiply(IPT, multiply(HPE, xyz).map((v) => signedPow(v, 0.43)) as Vec3),
  toBase: (ipt) =>
    multiply(
      HPE_INVERSE,
      multiply(IPT_INVERSE, ipt).map((v) => signedPow(v, 1 / 0.43)) as Vec3,
    ),
});
space({
  id: 'zcam',
  name: 'ZCAM',
  base: 'xyz-d65',
  coords: { j: { range: [0, 100] }, c: { range: [0, 60] }, h: hueCoord },
  fromBase: (xyz) => {
    const [J, C, h] = xyzToZcam(xyz);
    return [J, C, C < 1e-6 ? null : h];
  },
  toBase: (jch) => zcamToXyz(jch),
});

// DaVinci Wide Gamut (Blackmagic Design, DaVinci Resolve 17), linear.
export const DWG_TO_XYZ = primariesMatrix(
  [
    [0.8, 0.313],
    [0.1682, 0.9877],
    [0.079, -0.1155],
  ],
  D65_XY,
);
Color.Space.register(
  new RGBColorSpace({
    id: 'dwg-linear',
    name: 'DaVinci Wide Gamut',
    white: 'D65',
    referred: 'scene',
    M: { toXYZ: DWG_TO_XYZ, fromXYZ: invert(DWG_TO_XYZ) },
  } as never),
);
