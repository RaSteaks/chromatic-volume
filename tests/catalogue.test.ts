import { describe, expect, it } from 'vitest';
import { catalogue, requestedFigure } from '../src/shell';
import { volumeFigures } from '../src/volume-figures';
import { groups as transform } from '../src/figures/transform';
import { groups as chromaticity } from '../src/figures/chromaticity';
import { groups as spectrum } from '../src/figures/spectrum';
import { groups as curves } from '../src/figures/curves';
import { groups as pixels } from '../src/figures/pixels';

const modules = { transform, chromaticity, spectrum, curves, pixels };

describe('stage catalogue', () => {
  it('lists every figure definition exactly once, under its own module', () => {
    const defined = [
      ...volumeFigures.map((figure) => `volume:${figure.id}`),
      ...Object.entries(modules).flatMap(([module, groups]) =>
        groups.flatMap((group) =>
          group.figures.map((figure) => `${module}:${figure.id}`),
        ),
      ),
    ].sort();
    const listed = catalogue
      .map((entry) => `${entry.module}:${entry.id}`)
      .sort();
    expect(listed).toEqual(defined);
    expect(new Set(catalogue.map((entry) => entry.id)).size).toBe(
      catalogue.length,
    );
  });

  it('resolves current, legacy and removed addresses', () => {
    const at = (query: string) => requestedFigure(new URLSearchParams(query));
    expect(at('fig=dwg')).toMatchObject({ module: 'volume', stage: 'grade' });
    expect(at('view=curves&fig=hd')).toMatchObject({ stage: 'capture' });
    expect(at('view=pixels').id).toBe('subsampling');
    // A removed figure falls back to its old tab's first figure, or the pipeline start.
    expect(at('view=transform&fig=protan').id).toBe('aces');
    expect(at('fig=mixing').id).toBe(catalogue[0].id);
    expect(at('').id).toBe(catalogue[0].id);
  });
});
