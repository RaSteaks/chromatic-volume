import { decodeTransfer, encodeTransfer } from '../color-management';
import type { Vec3 } from '../model';

/** RGGB: each sensor site measures one linear-light channel. */
export const bayerChannel = (x: number, y: number) =>
  y % 2 === 0 ? (x % 2 === 0 ? 0 : 1) : x % 2 === 0 ? 1 : 2;

/** Simulate a linear CFA from an sRGB chart; return sRGB display images. */
export function simulateBayer(source: Vec3[][]) {
  const raw = source.map((row, y) =>
    row.map((rgb, x) => decodeTransfer(rgb[bayerChannel(x, y)], 'srgb')),
  );
  const mosaic = raw.map((row, y) =>
    row.map((v, x) => {
      const rgb: Vec3 = [0, 0, 0];
      rgb[bayerChannel(x, y)] = encodeTransfer(v, 'srgb');
      return rgb;
    }),
  );
  const rebuilt = demosaic(raw).map((row) =>
    row.map((rgb) => rgb.map((v) => encodeTransfer(v, 'srgb')) as Vec3),
  );
  // Compare in the displayed sRGB code domain, consistently for error and PSNR.
  // This is separate from the linear-light domain used for CFA interpolation.
  const error = rebuilt.map((row, y) =>
    row.map(
      (rgb, x) =>
        rgb.map((v, c) =>
          Math.min(Math.abs(v - source[y][x][c]) * 4, 1),
        ) as Vec3,
    ),
  );
  let mse = 0;
  rebuilt.forEach((row, y) =>
    row.forEach((rgb, x) =>
      rgb.forEach((v, c) => (mse += (v - source[y][x][c]) ** 2)),
    ),
  );
  mse /= source.length * source[0].length * 3;
  return { mosaic, rebuilt, error, psnr: 10 * Math.log10(1 / mse) };
}

/** Bilinear interpolation in linear light, retaining measured channels. */
function demosaic(raw: number[][]): Vec3[][] {
  const H = raw.length,
    W = raw[0].length;
  return raw.map((row, y) =>
    row.map((_, x) => {
      const rgb: Vec3 = [0, 0, 0];
      for (let c = 0; c < 3; c++) {
        if (bayerChannel(x, y) === c) {
          rgb[c] = raw[y][x];
          continue;
        }
        let sum = 0,
          n = 0;
        for (let j = -1; j <= 1; j++)
          for (let i = -1; i <= 1; i++) {
            const xx = x + i,
              yy = y + j;
            if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue;
            if (bayerChannel(xx, yy) !== c) continue;
            // Only matching CFA neighbours contribute; borders use those present.
            sum += raw[yy][xx];
            n++;
          }
        rgb[c] = n ? sum / n : 0;
      }
      return rgb;
    }),
  );
}
