import { describe, expect, test } from 'vitest';
import { applyLut, parseCube } from '../src/lut';
import { fullSizeCube } from './fixtures/cube';

describe.each([33, 65] as const)('%i-point 3D LUT', (size) => {
  test('loads all nodes and interpolates the full cross-channel response', () => {
    const lut = parseCube(fullSizeCube(size), `fixture-${size}.cube`);
    expect(lut.size).toBe(size);
    expect(lut.data).toHaveLength(size === 33 ? 35937 : 274625);
    const black = applyLut([0, 0, 0], lut),
      white = applyLut([1, 1, 1], lut);
    black.forEach((v, i) => expect(v).toBeCloseTo([0.1, 0.2, 0.05][i], 12));
    white.forEach((v, i) => expect(v).toBeCloseTo([0.85, 0.7, 0.65][i], 12));
    applyLut([0.123, 0.456, 0.789], lut).forEach((v, i) =>
      expect(v).toBeCloseTo([0.442, 0.5945, 0.1238][i], 12),
    );
    applyLut([1, 0, 0], lut).forEach((v, i) =>
      expect(v).toBeCloseTo([0.1, 0.2, 0.65][i], 12),
    );
  });
  test('rejects a truncated table rather than silently reducing precision', () => {
    const text = fullSizeCube(size);
    expect(() => parseCube(text.slice(0, text.lastIndexOf('\n')))).toThrow(
      'LUT 采样数量不符',
    );
  });
});
