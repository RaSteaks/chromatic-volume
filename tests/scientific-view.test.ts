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
import {
  colorSources,
  convertColor,
  getTarget,
  plotGuides,
  targetPosition,
} from '../src/targets';
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
test.each([
  [2 ** -16, -0.3250592179953678],
  [0.00002, -0.3169437784379598],
  [2 ** -15, -0.3013698630136986],
])(
  'named ACEScc encodes AP1 %s using the normative shadow segment',
  (input, expected) => {
    const encoded = convertColor(
      [input, input, input],
      getTarget('acescc')!,
      'acescg',
    );
    encoded.forEach((value) => expect(value).toBeCloseTo(expected, 14));
    convertColor(encoded, getTarget('acescg')!, 'acescc').forEach((value) =>
      expect(value).toBeCloseTo(input, 14),
    );
  },
);
test('ACEScc stays monotonic across both shadow boundaries and fixes a real P3 lattice point', () => {
  for (const knee of [2 ** -16, 2 ** -15]) {
    const values = [knee - 1e-10, knee, knee + 1e-10].map(
      (value) =>
        convertColor([value, value, value], getTarget('acescc')!, 'acescg')[0],
    );
    expect(values[0]).toBeLessThan(values[1]);
    expect(values[1]).toBeLessThan(values[2]);
    expect(values[2] - values[0]).toBeLessThan(1e-6);
  }
  expect(
    convertColor([1 / 12, 0, 0], getTarget('acescc')!, 'p3')[2],
  ).toBeCloseTo(-0.3059946685432159, 12);
});
test.each(colorSources.map((source) => source.id))(
  '%s neutral grays have powerless HSL/HSV hue',
  (source) => {
    for (const target of ['hsl', 'hsv']) {
      for (const gray of [0, 0.5, 1]) {
        const coords = convertColor(
          [gray, gray, gray],
          getTarget(target)!,
          source,
        );
        expect(Number.isNaN(coords[0])).toBe(true);
        expect(coords[1]).toBe(0);
        expect(
          targetPosition(coords, getTarget(target)!).every(Number.isFinite),
        ).toBe(true);
      }
      const red = convertColor([1, 0, 0], getTarget(target)!, source);
      expect(Number.isFinite(red[0])).toBe(true);
      expect(red[1]).toBeGreaterThan(0.001);
    }
  },
);
test.each([true, false])(
  'model guides use the same coordinate transform (equal axes: %s)',
  (equalAxes) => {
    for (const [cartesian, polar, scale, chroma] of [
      ['oklab', 'oklch', 1, 0.4],
      ['lab', 'lch', 200, 100],
      ['luv', 'lchuv', 280, 140],
    ] as const) {
      const guides = plotGuides(getTarget(cartesian)!, equalAxes);
      const lightness = cartesian === 'oklab' ? 1 : 100;
      const bottom = equalAxes ? -lightness / (2 * scale) : -0.5;
      expect(guides.origin).toEqual([0, bottom, 0]);
      expect(guides.ends[1]).toEqual([0, -bottom, 0]);
      expect(guides.labels[0]).toContain(String(chroma));
      const cylindrical = plotGuides(getTarget(polar)!, equalAxes);
      cylindrical.ends.forEach((end, axis) =>
        end.forEach((v, channel) =>
          expect(v).toBeCloseTo(guides.ends[axis][channel], 12),
        ),
      );
    }
    for (const id of ['hsl', 'hsv']) {
      const guides = plotGuides(getTarget(id)!, equalAxes);
      expect(guides.origin).toEqual([0, -0.5, 0]);
      expect(guides.ends[1]).toEqual([0, 0.5, 0]);
      expect(guides.labels).toEqual([
        `S cos H 100`,
        `${id === 'hsl' ? 'L' : 'V'} 100`,
        'S sin H 100',
      ]);
    }
    const log = plotGuides(getTarget('acescc')!, equalAxes);
    expect(log.origin).toEqual([-0.5, -0.5, -0.5]);
    expect(log.originLabel).toBe('−0.36');
    expect(log.labels).toEqual(['R 0.56', 'G 0.56', 'B 0.56']);
    log.ends[0].forEach((v, i) =>
      expect(v).toBeCloseTo([0.5, -0.5, -0.5][i], 12),
    );
  },
);
test('legacy teaching-stage URLs migrate to a common plot space', () => {
  const state = defaultState();
  state.source = 'srgb-linear';
  state.target = 'stages';
  expect(decodeState(encodeState(state))?.plot).toBe('oklab');
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
