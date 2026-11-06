import { describe, expect, test } from 'vitest';
import {
  decodeTransfer,
  encodeTransfer,
  gamuts,
} from '../src/color-management';
import {
  cameraPresets,
  decodeCamera,
  encodeCamera,
} from '../src/camera-transfers';
import { defaultState, type Vec3 } from '../src/model';
import { getTarget, targetPosition } from '../src/targets';
import { applyLut, parseCube } from '../src/lut';
import { decodeState, encodeState } from '../src/state';

test('native curves retain their dark segment, exponent and limits', () => {
  expect(decodeTransfer(0.02, 'prophoto')).toBe(0.00125);
  expect(decodeTransfer(0.02, 'prophoto')).not.toBe(
    decodeTransfer(0.02, 'gamma18'),
  );
  expect(decodeTransfer(0.5, 'a98')).not.toBe(decodeTransfer(0.5, 'gamma22'));
  expect(decodeTransfer(0.04045, 'srgb')).toBeCloseTo(
    0.0031308049535603713,
    15,
  );
  expect(decodeTransfer(0.081, 'rec709')).toBeCloseTo(0.018, 15);
  expect(decodeTransfer(1.5, 'acescc')).toBe(65504);
  expect(encodeTransfer(0.01, 'prophoto')).toBeGreaterThan(0);
});
test.each(['oklab', 'lab', 'luv'])(
  '%s equal axes preserve 3D distance up to one uniform scale',
  (id) => {
    const model = getTarget(id)!;
    const origin = targetPosition([0, 0, 0], model, true);
    const axes: Vec3[] = [
      [1, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
    ];
    const distances = axes.map((axis) =>
      Math.hypot(
        ...targetPosition(axis, model, true).map((v, i) => v - origin[i]),
      ),
    );
    expect(distances[0]).toBeCloseTo(distances[1], 12);
    expect(distances[1]).toBeCloseTo(distances[2], 12);
  },
);
const nonlinear = parseCube(
  'LUT_3D_SIZE 2\n0 0 0\n0 0 0\n0 0 0\n1 0 0\n0 0 0\n0 0 1\n0 1 0\n1 1 1',
);
describe('tetrahedral interpolation', () => {
  test.each([
    [0.8, 0.5, 0.2],
    [0.8, 0.2, 0.5],
    [0.5, 0.8, 0.2],
    [0.2, 0.8, 0.5],
    [0.5, 0.2, 0.8],
    [0.2, 0.5, 0.8],
  ] as Vec3[])('all tetrahedra for %s', (r, g, b) => {
    const result = applyLut([r, g, b], nonlinear, 'tetrahedral');
    [Math.min(r, g), Math.min(g, b), Math.min(b, r)].forEach((v, i) =>
      expect(result[i]).toBeCloseTo(v, 12),
    );
  });
  test('differs from trilinear on nonlinear cross-channel data and agrees on endpoints', () => {
    expect(applyLut([0.8, 0.5, 0.2], nonlinear, 'tetrahedral')).not.toEqual(
      applyLut([0.8, 0.5, 0.2], nonlinear, 'trilinear'),
    );
    expect(applyLut([1, 1, 1], nonlinear, 'tetrahedral')).toEqual([1, 1, 1]);
    const tied = applyLut([0.5, 0.5, 0.5], nonlinear, 'tetrahedral');
    const neighbor = applyLut([0.5 + 1e-9, 0.5, 0.5], nonlinear, 'tetrahedral');
    neighbor.forEach((v, i) => expect(v).toBeCloseTo(tied[i], 8));
  });
});
test('scientific settings and camera profiles persist, with explicit legacy defaults', () => {
  const state = defaultState();
  state.lutInput = {
    gamut: 'camera-arri4',
    gamma: 'logc4',
    black: 0,
    white: 100,
  };
  expect(decodeState(encodeState(state))).toEqual(state);
  const legacy = JSON.parse(encodeState(state));
  delete legacy.equalAxes;
  delete legacy.flatColors;
  delete legacy.interpolation;
  expect(decodeState(JSON.stringify(legacy))).toMatchObject({
    equalAxes: false,
    flatColors: false,
    interpolation: 'trilinear',
  });
});
test.each(cameraPresets)(
  '$name has a registered gamut and finite gray response',
  ({ gamut, gamma }) => {
    expect(gamuts.some((item) => item.id === gamut)).toBe(true);
    const encoded = encodeCamera(0.18, gamma);
    expect(encoded).toBeGreaterThan(0);
    expect(encoded).toBeLessThan(1);
    // Vendor rounded curves (notably DJI) need not be exact algebraic inverses.
    expect(decodeCamera(encoded, gamma)).toBeCloseTo(0.18, 4);
  },
);
