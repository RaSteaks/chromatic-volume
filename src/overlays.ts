import gamutData from './data/gamuts.json' with { type: 'json' };
import type { Vec3 } from './model';
import { optimalColourRings } from './science/spectral';

// Volume overlays are produced as XYZ (D65, white Y = 1) polylines so each
// panel can project them into its own plotting model.

export interface Overlay {
  name: string;
  /** Gamut shells are hidden on RGB-coordinate panels, where they only add clutter. */
  shell?: boolean;
  /** Each line is a list of D65 XYZ points. */
  lines: Vec3[][];
  closed: boolean;
  color: string;
  width: number;
  /** Optional per-point sRGB display colours (dots drawn along the path). */
  dots?: Vec3[][];
}

let optimal: Overlay | null = null;
export function optimalOverlay(): Overlay {
  optimal ??= {
    name: '最优色边界',
    shell: true,
    lines: optimalColourRings(),
    closed: true,
    color: '#f2f3f8',
    width: 0.9,
  };
  return optimal;
}

let pointer: Overlay | null = null;
export function pointerOverlay(): Overlay {
  if (pointer) return pointer;
  const points = gamutData.pointer.xyzD65 as Vec3[];
  // 16 lightness levels (L* 15–90) × 36 hues (10° steps).
  const rings: Vec3[][] = [];
  for (let level = 0; level < 16; level++)
    rings.push(points.slice(level * 36, level * 36 + 36));
  pointer = {
    name: 'Pointer 色域',
    shell: true,
    lines: rings,
    closed: true,
    color: '#f2c46d',
    width: 1.1,
  };
  return pointer;
}
