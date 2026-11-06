import { readFileSync, writeFileSync } from 'node:fs';
import { test, expect } from 'vitest';
import {
  decodeTransfer,
  encodeTransfer,
  decodeRgb,
  encodeRgb,
  managedLut,
  type Transfer,
} from '../../src/color-management';
import { convertColor, getTarget } from '../../src/targets';
import { parseCube, applyLut, type Interpolation } from '../../src/lut';
import type { Vec3 } from '../../src/model';
interface Reference {
  engine: string;
  version: string;
  numpy: string;
  seed: number;
  definitionDifferences: unknown[];
  pipelines: {
    xyz: Vec3;
    gamut: string;
    gamma: Transfer;
    method: Interpolation;
    strength: number;
    input: Vec3;
    output: Vec3;
    expected: Vec3;
  }[];
  transfers: {
    gamma: Transfer;
    direction: 'encode' | 'decode';
    value: number;
    expected: number;
    black: number;
    white: number;
  }[];
  conversions: {
    kind: 'decodeRgb' | 'encodeRgb' | 'lab' | 'oklab';
    gamut: string;
    rgb: Vec3;
    expected: Vec3;
  }[];
  luts: {
    size: number;
    path: string;
    cases: { method: Interpolation; input: Vec3; expected: Vec3 }[];
  }[];
}
test('application calculations agree with independently generated Colour Science values', () => {
  const reference = JSON.parse(
    readFileSync('artifacts/color-reference.json', 'utf8'),
  ) as Reference;
  const groups: Record<
    string,
    {
      values: number;
      maxAbsoluteError: number;
      tolerance: number;
      failures: number;
      worst: unknown;
    }
  > = {};
  const check = (
    name: string,
    actual: number[],
    expected: number[],
    tolerance: number,
    input: unknown,
  ) => {
    const group = (groups[name] ??= {
      values: 0,
      maxAbsoluteError: 0,
      tolerance,
      failures: 0,
      worst: null,
    });
    actual.forEach((value, i) => {
      group.values++;
      const error = Math.abs(value - expected[i]);
      if (error > group.maxAbsoluteError) {
        group.maxAbsoluteError = error;
        group.worst = { input, actual, expected };
      }
      if (
        !Number.isFinite(value) ||
        error > tolerance + 1e-10 * Math.abs(expected[i])
      )
        group.failures++;
    });
  };
  for (const item of reference.transfers) {
    const fn = item.direction === 'decode' ? decodeTransfer : encodeTransfer;
    check(
      `transfer/${item.gamma}/${item.direction}`,
      [fn(item.value, item.gamma, item.black, item.white)],
      [item.expected],
      1e-9,
      item,
    );
  }
  for (const item of reference.conversions) {
    const settings = {
      gamut: item.gamut,
      gamma: 'linear' as const,
      black: 0,
      white: 100,
    };
    const actual =
      item.kind === 'decodeRgb'
        ? decodeRgb(item.rgb, settings)
        : item.kind === 'encodeRgb'
          ? encodeRgb(item.rgb, settings)
          : convertColor(item.rgb, getTarget(item.kind)!, 'xyz-d65');
    // Published primary/matrix precision differs between engines, especially DJI's
    // 4-decimal inverse and ProPhoto's primaries. Report actual error, never round outputs.
    const tolerance =
      item.kind === 'lab'
        ? 2e-4
        : item.kind === 'oklab'
          ? 1e-12
          : item.gamut === 'camera-dgamut'
            ? 2e-4
            : 2e-5;
    check(
      `${item.kind}/${item.gamut}`,
      actual,
      item.expected,
      tolerance,
      item.rgb,
    );
  }
  for (const item of reference.luts) {
    const lut = parseCube(readFileSync(`artifacts/${item.path}`, 'utf8'));
    for (const entry of item.cases)
      check(
        `lut/${item.size}/${entry.method}`,
        applyLut(entry.input, lut, entry.method),
        entry.expected,
        1e-10,
        entry.input,
      );
  }
  const pipelineLut = parseCube(
    readFileSync('artifacts/reference-nonlinear-33.cube', 'utf8'),
  );
  for (const entry of reference.pipelines) {
    const result = managedLut(
      entry.xyz,
      pipelineLut,
      { gamut: entry.gamut, gamma: entry.gamma, black: 0, white: 100 },
      { gamut: 'srgb-linear', gamma: 'bt1886', black: 0.1, white: 100 },
      entry.strength,
      entry.method,
    );
    check(
      `pipeline/${entry.gamma}/${entry.method}`,
      result.xyz,
      entry.expected,
      2e-6,
      entry,
    );
  }
  const failures = Object.entries(groups).filter(([, group]) => group.failures);
  writeFileSync(
    'artifacts/color-reference-report.json',
    JSON.stringify(
      {
        engine: reference.engine,
        version: reference.version,
        numpy: reference.numpy,
        seed: reference.seed,
        definitionDifferences: reference.definitionDifferences,
        passed: failures.length === 0,
        groups,
      },
      null,
      2,
    ) + '\n',
  );
  expect(failures.map(([name, result]) => ({ name, ...result }))).toEqual([]);
});
