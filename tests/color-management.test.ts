import { describe, expect, test } from 'vitest';
import {
  decodeTransfer,
  encodeTransfer,
  decodeRgb,
  encodeRgb,
  managedLut,
  type LutEncoding,
} from '../src/color-management';
import { parseCube } from '../src/lut';
import { convertColor, getTarget } from '../src/targets';
import { defaultState } from '../src/model';
import { decodeState, encodeState } from '../src/state';
const identity = parseCube(
  'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1',
);
const settings: LutEncoding = {
  gamut: 'srgb-linear',
  gamma: 'gamma24',
  black: 0,
  white: 100,
};
describe('defined transfer functions', () => {
  test('BT.709 reference points use OETF rather than display gamma', () => {
    expect(encodeTransfer(0.018, 'rec709')).toBeCloseTo(0.081247944, 8);
    expect(encodeTransfer(0.01, 'rec709')).toBeCloseTo(0.045, 12);
    expect(decodeTransfer(0.5, 'rec709')).toBeCloseTo(0.2595894, 6);
    expect(decodeTransfer(0.5, 'bt1886')).toBeCloseTo(0.18946457, 7);
  });
  test('BT.1886 honors finite display black/white endpoints', () => {
    expect(decodeTransfer(0, 'bt1886', 0.1, 100)).toBeCloseTo(0.001, 12);
    expect(decodeTransfer(1, 'bt1886', 0.1, 100)).toBeCloseTo(1, 12);
    for (const v of [0, 0.1, 0.5, 0.9, 1])
      expect(
        encodeTransfer(
          decodeTransfer(v, 'bt1886', 0.1, 100),
          'bt1886',
          0.1,
          100,
        ),
      ).toBeCloseTo(v, 12);
    expect(decodeTransfer(0.5, 'bt1886', 0.1, 100)).toBeGreaterThan(
      decodeTransfer(0.5, 'gamma24'),
    );
  });
  test('sRGB differs from gamma 2.4, encoding conversions preserve unclipped values', () => {
    expect(decodeTransfer(0.5, 'srgb')).toBeCloseTo(0.21404114, 7);
    const xyz = decodeRgb([0.2, 0.5, 0.8], settings);
    encodeRgb(xyz, settings).forEach((v, i) =>
      expect(v).toBeCloseTo([0.2, 0.5, 0.8][i], 10),
    );
    expect(
      encodeRgb(
        convertColor([1, 0, 0], getTarget('xyz-d65')!, 'p3'),
        settings,
      )[0],
    ).toBeGreaterThan(1);
  });
});
describe('managed LUT', () => {
  test('identity LUT preserves XYZ with matching contracts', () => {
    const xyz = decodeRgb([0.2, 0.4, 0.7], settings);
    const result = managedLut(xyz, identity, settings, settings, 1);
    result.xyz.forEach((v, i) => expect(v).toBeCloseTo(xyz[i], 10));
    expect(result.clipped).toBe(false);
  });
  test('different output gamma changes actual color, not just labels', () => {
    const xyz = decodeRgb([0.5, 0.5, 0.5], { ...settings, gamma: 'srgb' });
    const result = managedLut(
      xyz,
      identity,
      { ...settings, gamma: 'srgb' },
      settings,
      1,
    );
    expect(result.xyz[1]).toBeCloseTo(0.5 ** 2.4, 10);
  });
  test('reports input clipping and zero strength preserves original XYZ', () => {
    const xyz = convertColor([1, 0, 0], getTarget('xyz-d65')!, 'p3');
    const result = managedLut(xyz, identity, settings, settings, 0);
    expect(result.clipped).toBe(true);
    expect(result.xyz).toEqual(xyz);
  });
  test('restores independent contracts; rejects malformed black/white settings', () => {
    const state = defaultState();
    state.target = 'lut';
    state.plot = 'xyz-d65';
    state.lutInput = { ...settings, gamma: 'rec709' };
    state.lutOutput = { ...settings, gamma: 'bt1886', black: 0.1 };
    expect(decodeState(encodeState(state))).toEqual(state);
    state.lutOutput.white = 0.05;
    expect(decodeState(encodeState(state))).toBeNull();
  });
});
