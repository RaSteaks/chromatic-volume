import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import type { Vec3 } from '../src/model';
import { createLattice } from '../src/figures/lattice';
import { transformLattices } from '../src/figures/transform';
import reference from './reference/figures.json' with { type: 'json' };

describe('linear RGB CVD lattices', () => {
  it.each(['protan', 'deutan', 'tritan'] as const)(
    '%s plots linear matrix outputs and encodes only display colours',
    (type) => {
      const spec = transformLattices[type];
      const samples: Vec3[] = [
        [0.5, 0.5, 0.5],
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      const lattice = createLattice(spec.keyframes, samples);
      expect(lattice(0).positions).toEqual(samples);
      expect(lattice(0).colors[0][0]).toBeCloseTo(0.7353569830524495, 12);
      const output = lattice(1);
      // Independent Colour Science reference columns are the primary outputs.
      for (let primary = 0; primary < 3; primary++) {
        output.positions[primary + 1].forEach((v, axis) =>
          expect(v).toBeCloseTo(reference.machado[type][axis][primary], 12),
        );
      }
      for (const t of [0, 0.5, 1]) {
        const current = lattice(t);
        expect(current.axes).toEqual(['R lin', 'G lin', 'B lin']);
        current.positions.forEach((position) => {
          const display = new Color('srgb-linear', position).to('srgb').coords;
          spec.display!(position, t)!.forEach((v, axis) =>
            expect(v).toBeCloseTo(
              Math.min(Math.max(display[axis] ?? 0, 0), 1),
              12,
            ),
          );
        });
      }
    },
  );
});

describe('geometric morph labels and current-frame readouts', () => {
  it('labels only endpoints as tone-map results and distinguishes coordinate domains', () => {
    const spec = transformLattices.aces;
    const lattice = createLattice(spec.keyframes, [[0.5, 0.5, 0.5]]);
    expect(lattice(0).label).toBe(spec.keyframes[0].name);
    expect(lattice(0).axes).toEqual(['R EV', 'G EV', 'B EV']);
    for (const t of [0.01, 0.5, 0.6, 0.99]) {
      expect(lattice(t).label).toMatch(/^过渡示意：/);
      expect(lattice(t).axes).toEqual(['R（过渡）', 'G（过渡）', 'B（过渡）']);
    }
    expect(lattice(0.6).positions[0][0]).toBeCloseTo(0.408280389184398, 12);
    expect(lattice(1).positions[0][0]).toBeCloseTo(0.3584573907166636, 12);
    expect(lattice(1).label).toBe(spec.keyframes[1].name);
    expect(lattice(1).axes).toEqual(['R′', 'G′', 'B′']);
  });

  it('counts the plotted AP1 nodes throughout the second RGC segment', () => {
    const samples: Vec3[] = [];
    for (let r = 0; r <= 8; r++)
      for (let g = 0; g <= 8; g++)
        for (let b = 0; b <= 8; b++) samples.push([r / 8, g / 8, b / 8]);
    const spec = transformLattices.rgc;
    const lattice = createLattice(spec.keyframes, samples);
    for (const t of [0, 0.5, 0.99])
      expect(spec.readout!(t, lattice(t).positions)).toBe('');
    for (const [t, expected] of [
      [1, 206],
      [1.6, 117],
      [2, 0],
    ]) {
      const current = lattice(t);
      const outside = current.positions.filter((p) =>
        p.some((v) => v < -1e-9),
      ).length;
      expect(outside).toBe(expected);
      expect(spec.readout!(t, current.positions)).toBe(
        `当前 AP1 晶格：${outside} / 729 个节点在 AP1 之外（含负通道）`,
      );
      expect(current.axes).toEqual(['R AP1', 'G AP1', 'B AP1']);
    }
    expect(lattice(1).label).toBe(spec.keyframes[1].name);
    expect(lattice(1.6).label).toMatch(/^过渡示意：/);
    expect(lattice(2).label).toBe(spec.keyframes[2].name);
    // AP1 gamut membership has no upper bound of 1; this is not cube clipping.
    expect(lattice(2).positions.some((p) => p.some((v) => v > 1))).toBe(true);
    const current = lattice(1.6);
    const position = current.positions.find((p) => p.some((v) => v < 0))!;
    const display = new Color('acescg', position).to('srgb').coords;
    expect(spec.display!(position, 1.6)).toEqual(
      display.map((v) => Math.min(Math.max(v ?? 0, 0), 1)),
    );
  });
});
