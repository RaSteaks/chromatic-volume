import type { Vec3 } from '../model';
import { multiply, type Mat3 } from './linear';

// Machado, Oliveira & Fernandes (2009), severity 1.0 (dichromacy),
// applied to linear Rec.709 / sRGB values.
export const MACHADO_2009: Record<'protan' | 'deutan' | 'tritan', Mat3> = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
};
export function simulateCvd(
  linear: Vec3,
  type: keyof typeof MACHADO_2009,
): Vec3 {
  return multiply(MACHADO_2009[type], linear);
}
