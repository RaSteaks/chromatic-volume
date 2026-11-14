import Color from 'colorjs.io';
import { describe, expect, it } from 'vitest';
import '../src/targets';
import reference from './reference/figures.json' with { type: 'json' };
import type { Vec3 } from '../src/model';
import { simulateBayer } from '../src/science/bayer';
import { MACHADO_2009 } from '../src/science/cvd';
import { gamutCompress, RGC } from '../src/science/gamut-compress';
import { xyzToXy } from '../src/science/linear';
import { codeValue } from '../src/figures/plot';
import {
  blackbodyXy,
  cctDuv,
  daylightXy,
  D65_SPD,
  A_SPD,
  emissionToXYZ,
  isotherm,
  kubelkaMunkMix,
  metamericPair,
  optimalColourRings,
  pulseXYZ,
  reflectanceToXYZ,
  WAVELENGTHS,
  xyToUv,
} from '../src/science/spectral';
import { acesFitted, agx, hable, reinhard } from '../src/science/tonemap';
import {
  davinciDecode,
  davinciEncode,
  hlgEncode,
  HLG_REFERENCE_WHITE,
  pqEncode,
} from '../src/science/transfer';
import { xyzToZcam, zcamToXyz } from '../src/science/zcam';
import { DWG_TO_XYZ } from '../src/spaces';
import { encodeCamera } from '../src/camera-transfers';

const xyz = reference.xyz as Vec3[];
function close(actual: number, expected: number, tolerance: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(tolerance);
}

describe('ZCAM against Colour Science 0.4.4', () => {
  it('matches J, C and h for 33 sRGB colours at a 203 cd/m² white', () => {
    xyz.forEach((value, i) => {
      const [J, C, h] = xyzToZcam(value);
      close(J, reference.zcam.J[i], 1e-6);
      close(C, reference.zcam.C[i], 1e-6);
      if (reference.zcam.C[i] > 1e-4) {
        const difference = Math.abs(h - reference.zcam.h[i]) % 360;
        expect(Math.min(difference, 360 - difference)).toBeLessThan(1e-6);
      }
    });
  });
  it('inverts back to XYZ', () => {
    xyz.forEach((value) => {
      const back = zcamToXyz(xyzToZcam(value));
      back.forEach((v, axis) => close(v, value[axis], 1e-7));
    });
  });
});

describe('perceptual and cone spaces', () => {
  it('IPT and HPE LMS match Colour Science', () => {
    xyz.forEach((value, i) => {
      new Color('xyz-d65', value)
        .to('ipt')
        .coords.forEach((v, axis) =>
          close(v ?? 0, reference.ipt[i][axis], 1e-12),
        );
      new Color('xyz-d65', value)
        .to('lms-hpe')
        .coords.forEach((v, axis) =>
          close(v ?? 0, reference.lms[i][axis], 1e-12),
        );
    });
  });
  it('Color.js Jzazbz agrees with Colour Science at a 203 cd/m² white', () => {
    xyz.forEach((value, i) => {
      new Color('xyz-d65', value)
        .to('jzazbz')
        .coords.forEach((v, axis) =>
          close(v ?? 0, reference.jzazbz[i][axis], 1e-6),
        );
    });
  });
  it('Y′CbCr, hexcone and bicone round-trip and place primaries on vertices', () => {
    for (const id of ['ycbcr709', 'hsv-hexcone', 'hsl-bicone']) {
      for (const rgb of reference.srgb as Vec3[]) {
        const there = new Color('srgb', rgb).to(id);
        const back = there.to('srgb').coords;
        back.forEach((v, axis) => close(v ?? 0, rgb[axis], 1e-12));
      }
    }
    const red = new Color('srgb', [1, 0, 0]).to('ycbcr709').coords;
    expect(red[0]).toBeCloseTo(0.2126, 12);
    expect(red[2]).toBeCloseTo(0.5, 12);
    expect(new Color('srgb', [1, 1, 0]).to('hsv-hexcone').coords).toEqual([
      60, 1, 1,
    ]);
    expect(new Color('srgb', [0, 0, 1]).to('hsl-bicone').coords).toEqual([
      240, 1, 0.5,
    ]);
  });
});

describe('gamuts and transfer functions', () => {
  it('DaVinci Wide Gamut matrix and Intermediate curve', () => {
    DWG_TO_XYZ.forEach((row, r) =>
      row.forEach((v, c) => close(v, reference.dwg.toXYZ[r][c], 1e-12)),
    );
    reference.dwg.linear.forEach((v, i) =>
      close(davinciEncode(v), reference.dwg.diEncode[i], 1e-12),
    );
    reference.dwg.signal.forEach((v, i) =>
      close(davinciDecode(v), reference.dwg.diDecode[i], 1e-10),
    );
  });
  it('PQ, HLG, LogC4 and S-Log3', () => {
    reference.pq.nits.forEach((v, i) =>
      close(pqEncode(v), reference.pq.signal[i], 1e-12),
    );
    reference.hlg.linear.forEach((v, i) =>
      close(hlgEncode(v), reference.hlg.signal[i], 1e-12),
    );
    expect(hlgEncode(HLG_REFERENCE_WHITE)).toBeCloseTo(0.75, 12);
    reference.dwg.linear.forEach((v, i) => {
      close(encodeCamera(v, 'logc4'), reference.logc4[i], 1e-9);
      close(encodeCamera(v, 'slog3'), reference.slog3[i], 1e-9);
    });
  });
});

describe('spectral colorimetry', () => {
  it('D65 SPD integrates to the D65 chromaticity', () => {
    const xy = xyzToXy(emissionToXYZ(D65_SPD));
    close(xy[0], reference.d65xy[0], 1e-9);
    close(xy[1], reference.d65xy[1], 1e-9);
  });
  it('Planckian and daylight loci', () => {
    reference.blackbody.temperatures.forEach((t, i) => {
      const [x, y] = blackbodyXy(t);
      close(x, reference.blackbody.xy[i][0], 1e-9);
      close(y, reference.blackbody.xy[i][1], 1e-9);
    });
    reference.daylight.temperatures.forEach((t, i) => {
      const [x, y] = daylightXy(t);
      close(x, reference.daylight.xy[i][0], 1e-9);
      close(y, reference.daylight.xy[i][1], 1e-9);
    });
  });
  it('isotherms are perpendicular to the Planckian locus in uv', () => {
    const [a, b] = isotherm(4000, 0.02).map(xyToUv);
    const [p, q] = [3990, 4010].map((t) => xyToUv(blackbodyXy(t)));
    const dot = (b[0] - a[0]) * (q[0] - p[0]) + (b[1] - a[1]) * (q[1] - p[1]);
    expect(Math.abs(dot)).toBeLessThan(1e-6);
  });
  it('optimal colours match Colour Science pulse waves under E', () => {
    for (const pulse of reference.optimal) {
      pulseXYZ(pulse.start, pulse.end).forEach((v, axis) =>
        close(v, pulse.xyz[axis], 1e-9),
      );
    }
    const rings = optimalColourRings();
    expect(rings).toHaveLength(9);
    expect(rings[0]).toHaveLength(WAVELENGTHS.length);
    // Each MacAdam limit lies near its CIELAB lightness slice (Bradford E → D65
    // changes Y only slightly).
    rings.forEach((ring, k) => {
      const Y = ((10 * (k + 1) + 16) / 116) ** 3;
      for (const point of ring)
        expect(Math.abs(point[1] - Y)).toBeLessThan(0.03);
    });
    // Every ring point is a physically realisable reflectance: 0 ≤ Y ≤ 1.
    for (const ring of rings)
      for (const point of ring) {
        expect(point[1]).toBeGreaterThanOrEqual(-1e-12);
        expect(point[1]).toBeLessThanOrEqual(1 + 1e-12);
      }
  });
  it('the metameric pair matches under D65 but not under illuminant A', () => {
    const { first, second } = metamericPair();
    for (const spectrum of [first, second])
      for (const value of spectrum) {
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThanOrEqual(1);
      }
    const d65 = [first, second].map((s) => reflectanceToXYZ(s, D65_SPD));
    d65[0].forEach((v, axis) => close(v, d65[1][axis], 1e-12));
    const a = [first, second].map((s) => reflectanceToXYZ(s, A_SPD));
    expect(
      Math.max(...a[0].map((v, axis) => Math.abs(v - a[1][axis]))),
    ).toBeGreaterThan(0.005);
  });
  it('Kubelka–Munk mixing keeps single pigments and darkens mixtures', () => {
    const yellow = WAVELENGTHS.map((w) => (w > 500 ? 0.85 : 0.08));
    const blue = WAVELENGTHS.map((w) => (w < 520 ? 0.8 : 0.06));
    kubelkaMunkMix([yellow, blue], [1, 0]).forEach((v, i) =>
      close(v, yellow[i], 1e-12),
    );
    const mix = kubelkaMunkMix([yellow, blue], [1, 1]);
    mix.forEach((v, i) =>
      expect(v).toBeLessThanOrEqual(Math.max(yellow[i], blue[i]) + 1e-12),
    );
  });
});

describe('transforms', () => {
  it.each<Vec3>([
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [1, 1, 0],
    [0, 1, 1],
    [1, 0, 1],
  ])(
    'Hill ACES converges to display white for increasing [%s, %s, %s] exposure',
    (r, g, b) => {
      expect(acesFitted([r * 10000, g * 10000, b * 10000])).toEqual([1, 1, 1]);
    },
  );
  it.each([
    [0.001, 0.00010572854037691071],
    [0.01, 0.0059946587915415215],
    [0.18, 0.21446743070720625],
  ])(
    'AgX returns linear display light for scene grey %s',
    (scene, expected) => {
      // Fixed regression values for the minimal fit, including its 2.2 EOTF.
      // These are not reference values for Blender's full AgX implementation.
      // The published approximate inset does not preserve exact RGB neutrality;
      // these fixtures record R rather than assuming all channels are identical.
      close(agx([scene, scene, scene])[0], expected, 1e-12);
    },
  );
  it('AgX dark grey can be encoded by the standard sRGB display path', () => {
    const display = new Color('srgb-linear', agx([0.01, 0.01, 0.01])).to(
      'srgb',
    );
    close(display.coords[0] ?? 0, 0.07011834416470161, 1e-12);
    expect(agx([0, 0, 0])).toEqual([0, 0, 0]);
  });
  it('Machado 2009 matrices match Colour Science', () => {
    for (const type of ['protan', 'deutan', 'tritan'] as const)
      MACHADO_2009[type].forEach((row, r) =>
        row.forEach((v, c) => close(v, reference.machado[type][r][c], 1e-12)),
      );
  });
  it('RGC preserves the zone of trust and maps the limit to the gamut boundary', () => {
    expect(gamutCompress([0.5, 0.4, 0.3])).toEqual([0.5, 0.4, 0.3]);
    const r = 1 - RGC.limit[0];
    const compressed = gamutCompress([r, 1, 1]);
    close(compressed[0], 0, 1e-12);
    expect(gamutCompress([-0.3, 0.6, 0.9])[0]).toBeGreaterThan(-0.3);
  });
  it.each<Vec3>([
    [0, 0, 0],
    [-1, 0, 0],
    [0, -1, -2],
    [-2, -1, 0],
  ])('RGC reconstructs zero when max(%s, %s, %s) is zero', (r, g, b) => {
    expect(gamutCompress([r, g, b])).toEqual([0, 0, 0]);
  });
  it('RGC keeps near-zero positive and negative maxima continuous at zero', () => {
    for (const a of [-1e-9, 1e-9]) {
      for (const value of gamutCompress([a, -1, -2])) {
        expect(Number.isFinite(value)).toBe(true);
        // For negative A, reconstruction includes both A and -distance·|A|.
        close(value, 0, 3e-9);
      }
    }
    expect(gamutCompress([-1, -1, -1])).toEqual([-1, -1, -1]);
  });
  it('tone curves are monotonic and bounded', () => {
    let last = -1;
    for (let ev = -10; ev <= 8; ev += 0.25) {
      const x = 0.18 * 2 ** ev;
      const values = [
        reinhard(x),
        hable(x),
        acesFitted([x, x, x])[0],
        agx([x, x, x])[0],
      ];
      for (const v of values) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(values[2]).toBeGreaterThanOrEqual(last - 1e-12);
      last = values[2];
    }
    close(hable(11.2 / 2), 1, 1e-12);
  });
});

describe('Bayer sampling and reconstruction', () => {
  it('interpolates a black/white edge in linear light before sRGB display', () => {
    const source: Vec3[][] = Array.from({ length: 3 }, () => [
      [0, 0, 0],
      [0, 0, 0],
      [1, 1, 1],
    ]);
    const result = simulateBayer(source);
    // At the centre B site: two of four R neighbours and one of four G
    // neighbours are white. Linear 1/2 and 1/4 have these sRGB code values.
    close(result.rebuilt[1][1][0], 0.7353569830524495, 1e-12);
    close(result.rebuilt[1][1][1], 0.5370987304831942, 1e-12);
    expect(result.rebuilt[1][1][2]).toBe(0);
    expect(result.error[1][1]).toEqual([1, 1, 0]);
  });
  it('preserves measured channels and reconstructs flat colour at borders', () => {
    const source: Vec3[][] = Array.from({ length: 2 }, () => [
      [0.2, 0.4, 0.8],
      [0.2, 0.4, 0.8],
    ]);
    const result = simulateBayer(source);
    for (const row of result.rebuilt)
      for (const rgb of row)
        rgb.forEach((value, axis) => close(value, source[0][0][axis], 1e-12));
    const expectedMosaic = [
      [
        [0.2, 0, 0],
        [0, 0.4, 0],
      ],
      [
        [0, 0.4, 0],
        [0, 0, 0.8],
      ],
    ];
    result.mosaic.forEach((row, y) =>
      row.forEach((rgb, x) =>
        rgb.forEach((v, c) => close(v, expectedMosaic[y][x][c], 1e-12)),
      ),
    );
    expect(result.psnr).toBeGreaterThan(280);
  });
});

describe('figure captions quote generated numbers', () => {
  it('wide-gamut captions match the optimal-solid check', async () => {
    const { volumeFigures } = await import('../src/volume-figures');
    const pairs = {
      ap1: 'acescg',
      dwg: 'dwg-linear',
      awg4: 'camera-arri4',
      sgamut3: 'camera-sgamut3',
    } as const;
    for (const [figure, key] of Object.entries(pairs)) {
      const text = volumeFigures.find((f) => f.id === figure)!.highlight;
      expect(text).toContain(`${reference.outsideOptimal[key]} / 729`);
    }
  });
});

describe('CCT and Duv against Colour Science 0.4.4 (Ohno 2013)', () => {
  it('matches the reference within the 5 nm / 380–780 nm observer tolerance', () => {
    reference.cct.xy.forEach((xy, i) => {
      const result = cctDuv(xy as [number, number]);
      expect(result).not.toBeNull();
      const { cct, duv } = result!;
      expect(
        Math.abs(cct - reference.cct.cct[i]) / reference.cct.cct[i],
      ).toBeLessThan(2e-3);
      close(duv, reference.cct.duv[i], 2e-4);
    });
  });
  it('returns the input temperature for points on the Planckian locus', () => {
    for (const t of [1000, 1000.1, 2000, 3200, 5600, 9000, 99999, 100000]) {
      const result = cctDuv(blackbodyXy(t));
      expect(result).not.toBeNull();
      const { cct, duv } = result!;
      close(cct, t, t * 1e-4);
      close(duv, 0, 1e-6);
    }
  });
  it('rejects temperatures beyond either search boundary instead of reporting the endpoint', () => {
    for (const t of [800, 999.9, 100001, 200000, 1000000]) {
      expect(cctDuv(blackbodyXy(t))).toBeNull();
    }
  });
});

describe('code values', () => {
  it('maps full and legal (narrow) ranges', () => {
    expect(codeValue(0, 10, 'full')).toBe(0);
    expect(codeValue(1, 10, 'full')).toBe(1023);
    expect(codeValue(0, 10, 'legal')).toBe(64);
    expect(codeValue(1, 10, 'legal')).toBe(940);
    expect(codeValue(0, 8, 'legal')).toBe(16);
    expect(codeValue(1, 8, 'legal')).toBe(235);
    expect(codeValue(0.5, 8, 'full')).toBe(128);
    expect(codeValue(1.2, 10, 'legal')).toBe(1023);
  });
});
