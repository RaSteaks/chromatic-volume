import type { Vec3 } from '../model';

// ACES 1.3 Reference Gamut Compression (RGC), applied in ACEScg / AP1.
// Per channel: [cyan → R, magenta → G, yellow → B].
export const RGC = {
  threshold: [0.815, 0.803, 0.88] as Vec3,
  limit: [1.147, 1.264, 1.312] as Vec3,
  power: 1.2,
};
function compress(distance: number, threshold: number, limit: number) {
  if (distance < threshold) return distance;
  const p = RGC.power;
  const scale =
    (limit - threshold) /
    (((1 - threshold) / (limit - threshold)) ** -p - 1) ** (1 / p);
  const normalized = (distance - threshold) / scale;
  return threshold + scale * (normalized / (1 + normalized ** p) ** (1 / p));
}
export function gamutCompress(rgb: Vec3): Vec3 {
  const achromatic = Math.max(...rgb);
  // ACES RGC equations 3 and 5: A = 0 sets distance to zero and reconstructs
  // zero, even when other channels are negative (e.g. [-1, 0, 0]).
  if (achromatic === 0) return [0, 0, 0];
  return rgb.map((value, i) => {
    const distance = (achromatic - value) / Math.abs(achromatic);
    return (
      achromatic -
      compress(distance, RGC.threshold[i], RGC.limit[i]) * Math.abs(achromatic)
    );
  }) as Vec3;
}
