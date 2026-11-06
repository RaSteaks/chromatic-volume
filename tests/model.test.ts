import { describe, expect, test } from 'vitest';
import {
  applyStage,
  createSamples,
  createStages,
  defaultState,
  definitions,
  moveStage,
  toOpponent,
  toRgb,
  transform,
  type Vec3,
} from '../src/model';
import {
  colorTargets,
  colorSources,
  createSourceSamples,
  convertColor,
  getTarget,
  targetPosition,
} from '../src/targets';
import { decodeState, encodeState } from '../src/state';
import { applyLut, parseCube } from '../src/lut';

function close(actual: Vec3, expected: Vec3, precision = 5) {
  actual.forEach((value, i) =>
    expect(value).toBeCloseTo(expected[i], precision),
  );
}
describe('standard color conversion', () => {
  test('sRGB primaries have independently known Oklab values', () => {
    const target = getTarget('oklab')!;
    close(convertColor([1, 0, 0], target), [0.627955, 0.224863, 0.125846]);
    close(convertColor([0, 1, 0], target), [0.86644, -0.233888, 0.179498]);
    close(convertColor([0, 0, 1], target), [0.452014, -0.032457, -0.311528]);
    close(convertColor([1, 1, 1], target), [1, 0, 0]);
    close(convertColor([0, 0, 0], target), [0, 0, 0]);
  });
  test('linear light decoding and XYZ reference white', () => {
    close(
      convertColor([0.5, 0.5, 0.5], getTarget('srgb-linear')!),
      [0.21404114, 0.21404114, 0.21404114],
    );
    close(
      convertColor([1, 1, 1], getTarget('xyz-d65')!),
      [0.950455927, 1, 1.089057751],
    );
    close(convertColor([1, 1, 1], getTarget('lab')!), [100, 0, 0]);
    close(
      convertColor([1, 0, 0], getTarget('lab-d65')!),
      [53.2371156, 80.0901135, 67.2032635],
      4,
    );
  });
  test('cylindrical hue handles grayscale and RGB primary coordinates', () => {
    close(convertColor([1, 0, 0], getTarget('hsv')!), [0, 100, 100]);
    close(convertColor([0, 1, 0], getTarget('hsl')!), [120, 100, 50]);
    close(convertColor([0, 0, 1], getTarget('hsv')!), [240, 100, 100]);
  });
  test.each(colorTargets.map((target) => [target.name, target] as const))(
    '%s projects every lattice sample to finite positions',
    (_name, target) => {
      for (const point of createSamples(9))
        expect(
          targetPosition(convertColor(point, target), target).every(
            Number.isFinite,
          ),
        ).toBe(true);
    },
  );
});
describe('teaching stages', () => {
  test('sampling includes black and white exactly once', () => {
    const points = createSamples(9);
    expect(points).toHaveLength(729);
    expect(points[0]).toEqual([0, 0, 0]);
    expect(points.at(-1)).toEqual([1, 1, 1]);
    expect(new Set(points.map(String)).size).toBe(729);
  });
  test('opponent coordinates round-trip; neutral controls leave colors unchanged', () => {
    for (const input of createSamples(5)) {
      close(toRgb(toOpponent(input)), input, 12);
      close(transform(input, createStages(), 1), input, 12);
    }
  });
  test.each(
    definitions.map((definition) => [definition.id, definition] as const),
  )(
    '%s changes color at a non-neutral setting and bypass restores input',
    (_id, definition) => {
      const stage = createStages().find((item) => item.id === definition.id)!;
      const parameter =
        definition.id === 'bleach'
          ? definition.parameters[0]
          : definition.parameters.at(-1)!;
      stage.values[parameter.key] = parameter.max;
      expect(
        createSamples(5).some((point) =>
          applyStage(point, stage).some(
            (v, i) => Math.abs(v - point[i]) > 1e-4,
          ),
        ),
      ).toBe(true);
      stage.enabled = false;
      expect(applyStage([0.7, 0.2, 0.4], stage)).toEqual([0.7, 0.2, 0.4]);
    },
  );
  test('strength zero is exactly input; order affects output', () => {
    const stages = createStages();
    stages[2].values.amount = 0.8;
    stages[3].values.amount = 0.7;
    expect(transform([1, 0.8, 0.1], stages, 0)).toEqual([1, 0.8, 0.1]);
    expect(transform([1, 0.8, 0.1], stages, 1)).not.toEqual(
      transform([1, 0.8, 0.1], moveStage(stages, 3, -1), 1),
    );
    expect(moveStage(stages, 0, -1)).toEqual(stages);
  });
});
describe('URL boundary', () => {
  test('restores target, camera, stage order and options', () => {
    const state = defaultState();
    state.target = 'lab';
    state.stages = moveStage(state.stages, 3, -1);
    state.yaw = -2;
    state.vectors = true;
    expect(decodeState(encodeState(state))).toEqual(state);
  });
  test('rejects malformed state and unknown targets', () => {
    expect(decodeState('{oops')).toBeNull();
    expect(decodeState('{}')).toBeNull();
    const state = defaultState();
    state.target = '<script>';
    expect(decodeState(encodeState(state))).toBeNull();
    state.target = 'oklab';
    state.stages[0] = state.stages[1];
    expect(decodeState(encodeState(state))).toBeNull();
  });
});
const identity =
  'TITLE "Identity"\nLUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1';
describe('cube LUT import', () => {
  test('identity and trilinear interpolation use red-fastest order', () => {
    const lut = parseCube(identity);
    close(applyLut([0.2, 0.4, 0.7], lut), [0.2, 0.4, 0.7]);
    close(applyLut([1, 0, 0], lut), [1, 0, 0]);
    close(applyLut([1, 1, 1], lut), [1, 1, 1]);
  });
  test('respects declared domains and clamps outside input', () => {
    const lut = parseCube(
      identity.replace(
        'LUT_3D_SIZE 2',
        'LUT_3D_SIZE 2\nDOMAIN_MIN -1 -1 -1\nDOMAIN_MAX 1 1 1',
      ),
    );
    close(applyLut([0, 0, 0], lut), [0.5, 0.5, 0.5]);
    close(applyLut([2, -2, 1], lut), [1, 0, 1]);
  });
  test.each([
    'LUT_1D_SIZE 2\n0 0 0',
    'LUT_3D_SIZE 66',
    identity + '\n0 0 0',
    identity.replace('1 1 1', 'NaN 1 1'),
    identity.replace('LUT_3D_SIZE 2', 'LUT_3D_SIZE 2\nDOMAIN_MAX 0 1 1'),
  ])('rejects unsupported or malformed LUTs: %s', (text) =>
    expect(() => parseCube(text)).toThrow(),
  );
});

describe('selectable source gamut', () => {
  test('P3 red maps to its own XYZ and is outside the sRGB display gamut', () => {
    close(
      convertColor([1, 0, 0], getTarget('xyz-d65')!, 'p3'),
      [0.486570949, 0.228974564, 0],
    );
    const display = convertColor([1, 0, 0], getTarget('srgb')!, 'p3');
    expect(display[0]).toBeGreaterThan(1);
    expect(display[1]).toBeLessThan(0);
    expect(convertColor([1, 0, 0], getTarget('oklab')!, 'p3')).not.toEqual(
      convertColor([1, 0, 0], getTarget('oklab')!),
    );
  });
  test('ACEScc resamples the bounded linear 0–1 slice in log encoding', () => {
    const points = createSourceSamples(5, 'acescc');
    expect(points).toHaveLength(125);
    close(convertColor(points[0], getTarget('acescg')!, 'acescc'), [0, 0, 0]);
    close(
      convertColor(points.at(-1)!, getTarget('acescg')!, 'acescc'),
      [1, 1, 1],
    );
    expect(points[0][0]).toBeLessThan(0);
  });
  test.each(colorSources.map((source) => [source.id]))(
    '%s can convert its samples to every target',
    (source) => {
      const points = createSourceSamples(5, source);
      for (const target of colorTargets)
        for (const point of points)
          expect(
            targetPosition(convertColor(point, target, source), target).every(
              Number.isFinite,
            ),
          ).toBe(true);
      for (const point of points)
        close(convertColor(point, getTarget(source)!, source), point);
    },
  );
  test('source is restored, validated, and legacy links default to sRGB', () => {
    const state = defaultState();
    state.source = 'prophoto';
    expect(decodeState(encodeState(state))?.source).toBe('prophoto');
    state.source = 'oklab';
    expect(decodeState(encodeState(state))).toBeNull();
    const legacy = JSON.parse(encodeState(defaultState()));
    delete legacy.source;
    expect(decodeState(JSON.stringify(legacy))?.source).toBe('srgb');
  });
});
