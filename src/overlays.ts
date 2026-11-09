import Color from 'colorjs.io';
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

export const gradientPairs = [
  { id: 'blue-yellow', name: '蓝 → 黄', from: [0, 0, 1], to: [1, 1, 0] },
  { id: 'red-green', name: '红 → 绿', from: [1, 0, 0], to: [0, 1, 0] },
  { id: 'blue-white', name: '蓝 → 白', from: [0, 0, 1], to: [1, 1, 1] },
  { id: 'black-white', name: '黑 → 白', from: [0, 0, 0], to: [1, 1, 1] },
] as const satisfies readonly {
  id: string;
  name: string;
  from: Vec3;
  to: Vec3;
}[];
export const gradientModes = [
  { id: 'srgb', name: 'sRGB 编码值插值', color: '#f0a35e' },
  { id: 'srgb-linear', name: '线性 RGB 插值', color: '#7fc8a9' },
  { id: 'oklab', name: 'Oklab 插值', color: '#b6a0f4' },
] as const;

/** Interpolate a pair in the given space; returns D65 XYZ and sRGB display colours. */
export function gradientPath(pairId: string, mode: string, steps = 24) {
  const pair = gradientPairs.find((item) => item.id === pairId)!;
  const from = new Color('srgb', [...pair.from]).to(mode);
  const to = new Color('srgb', [...pair.to]).to(mode);
  const xyz: Vec3[] = [],
    srgb: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const coords = from.coords.map(
      (v, axis) => (v ?? 0) + ((to.coords[axis] ?? 0) - (v ?? 0)) * t,
    ) as Vec3;
    const color = new Color(mode, coords);
    xyz.push(color.to('xyz-d65').coords.map((v) => v ?? 0) as Vec3);
    srgb.push(color.to('srgb').coords.map((v) => v ?? 0) as Vec3);
  }
  return { xyz, srgb };
}
const gradientCache = new Map<string, Overlay[]>();
export function gradientOverlays(pairId: string): Overlay[] {
  const cached = gradientCache.get(pairId);
  if (cached) return cached;
  const overlays: Overlay[] = gradientModes.map((mode) => {
    const path = gradientPath(pairId, mode.id);
    return {
      name: mode.name,
      lines: [path.xyz],
      closed: false,
      color: mode.color,
      width: 2,
      dots: [path.srgb],
    };
  });
  gradientCache.set(pairId, overlays);
  return overlays;
}
