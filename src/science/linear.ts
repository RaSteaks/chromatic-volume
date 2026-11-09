import type { Vec3 } from '../model';

export type Mat3 = [Vec3, Vec3, Vec3];

export function multiply(m: Mat3, [a, b, c]: Vec3): Vec3 {
  return [
    m[0][0] * a + m[0][1] * b + m[0][2] * c,
    m[1][0] * a + m[1][1] * b + m[1][2] * c,
    m[2][0] * a + m[2][1] * b + m[2][2] * c,
  ];
}
export function product(a: Mat3, b: Mat3): Mat3 {
  return [0, 1, 2].map((row) =>
    [0, 1, 2].map(
      (column) =>
        a[row][0] * b[0][column] +
        a[row][1] * b[1][column] +
        a[row][2] * b[2][column],
    ),
  ) as Mat3;
}
export function invert(m: Mat3): Mat3 {
  const [[a, b, c], [d, e, f], [g, h, i]] = m;
  const A = e * i - f * h,
    B = -(d * i - f * g),
    C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  if (Math.abs(determinant) < 1e-15) throw new Error('矩阵不可逆。');
  return [
    [A, -(b * i - c * h), b * f - c * e],
    [B, a * i - c * g, -(a * f - c * d)],
    [C, -(a * h - b * g), a * e - b * d],
  ].map((row) => row.map((value) => value / determinant)) as Mat3;
}
export const xyToXYZ = ([x, y]: [number, number], Y = 1): Vec3 => [
  (x * Y) / y,
  Y,
  ((1 - x - y) * Y) / y,
];
export function xyzToXy([X, Y, Z]: Vec3): [number, number] {
  const sum = X + Y + Z;
  return sum === 0 ? [Number.NaN, Number.NaN] : [X / sum, Y / sum];
}
/** RGB → XYZ matrix from primaries and white chromaticities (SMPTE RP 177). */
export function primariesMatrix(
  primaries: [[number, number], [number, number], [number, number]],
  white: [number, number],
): Mat3 {
  const columns = primaries.map((xy) => xyToXYZ(xy)) as Mat3;
  const P: Mat3 = [0, 1, 2].map((row) =>
    columns.map((column) => column[row]),
  ) as Mat3;
  const scale = multiply(invert(P), xyToXYZ(white));
  return P.map((row) => row.map((value, i) => value * scale[i])) as Mat3;
}
export const D65_XY: [number, number] = [0.3127, 0.329];
export const D65: Vec3 = xyToXYZ(D65_XY);
const BRADFORD: Mat3 = [
  [0.8951, 0.2664, -0.1614],
  [-0.7502, 1.7135, 0.0367],
  [0.0389, -0.0685, 1.0296],
];
const BRADFORD_INVERSE = invert(BRADFORD);
/** von Kries adaptation in the Bradford cone space. */
export function bradford(xyz: Vec3, from: Vec3, to: Vec3): Vec3 {
  const source = multiply(BRADFORD, from),
    target = multiply(BRADFORD, to);
  const cone = multiply(BRADFORD, xyz).map(
    (value, i) => (value * target[i]) / source[i],
  ) as Vec3;
  return multiply(BRADFORD_INVERSE, cone);
}
