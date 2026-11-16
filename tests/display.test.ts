import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import {
  clipToDisplay,
  cssColor,
  fromDisplay,
  inDisplay,
  toDisplay,
} from '../src/display';
import type { Vec3 } from '../src/model';

const samples: Vec3[] = [
  [1, 0, 0],
  [0, 1, 0],
  [0.2, 0.5, 0.9],
  [0.5, 0.5, 0.5],
  [-0.2, 1.05, 0.3], // outside sRGB
  [1.09, -0.23, -0.15], // Display P3 red
];

describe('display conversion', () => {
  it('matches colorjs.io for sRGB → Display P3, including out-of-range values', () => {
    for (const rgb of samples) {
      const expected = new Color('srgb', rgb).to('p3').coords;
      toDisplay(rgb, 'p3').forEach((v, i) =>
        expect(v).toBeCloseTo(expected[i] ?? 0, 5),
      );
    }
  });
  it('round-trips and leaves sRGB untouched', () => {
    for (const rgb of samples) {
      fromDisplay(toDisplay(rgb, 'p3'), 'p3').forEach((v, i) =>
        expect(v).toBeCloseTo(rgb[i], 6),
      );
      expect(toDisplay(rgb, 'srgb')).toEqual(rgb);
    }
  });
  it('tells the two display gamuts apart', () => {
    const p3Red = new Color('p3', [1, 0, 0]).to('srgb').coords as Vec3;
    expect(inDisplay(p3Red, 'srgb')).toBe(false);
    expect(inDisplay(p3Red, 'p3')).toBe(true);
    const rec2020Green = new Color('rec2020', [0, 1, 0]).to('srgb')
      .coords as Vec3;
    expect(inDisplay(rec2020Green, 'p3')).toBe(false);
    // Clipping lands on the P3 boundary, not on the sRGB one.
    expect(inDisplay(clipToDisplay(rec2020Green, 'p3'), 'p3')).toBe(true);
    expect(inDisplay(clipToDisplay(rec2020Green, 'p3'), 'srgb')).toBe(false);
  });
  it('formats CSS colours in the display space', () => {
    expect(cssColor([1, 0.5, 0], 'srgb')).toBe('rgb(255,128,0)');
    expect(cssColor([1.2, 0.5, -0.1], 'srgb')).toBe('rgb(255,128,0)');
    const p3Red = new Color('p3', [1, 0, 0]).to('srgb').coords as Vec3;
    expect(cssColor(p3Red, 'p3')).toBe('color(display-p3 1 0 0)');
    expect(cssColor([1, 1, 1], 'p3')).toBe('color(display-p3 1 1 1)');
  });
});
