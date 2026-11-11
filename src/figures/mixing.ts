import { el, slider } from '../dom';
import type { Vec3 } from '../model';
import {
  D65_SPD,
  emissionToXYZ,
  kubelkaMunkMix,
  reflectanceToXYZ,
  WAVELENGTHS,
  type Spectrum,
} from '../science/spectral';
import { xyzToXy } from '../science/linear';
import '../targets';
import type { FigureContext } from './page';
import {
  axes,
  createCanvas,
  css,
  displayRgb,
  frame,
  INK,
  label,
  polyline,
  readoutTable,
  segmented,
  ticks,
} from './plot';

// Additive light mixing vs. subtractive (Kubelka–Munk) pigment mixing.
const sigmoid = (v: number) => 1 / (1 + Math.exp(-v));
const gaussian = (centre: number, width: number): Spectrum =>
  WAVELENGTHS.map((w) => Math.exp(-(((w - centre) / width) ** 2)));
const lights = {
  red: { name: '红光', spd: gaussian(615, 22) },
  green: { name: '绿光', spd: gaussian(535, 22) },
  blue: { name: '蓝光', spd: gaussian(455, 18) },
};
const pigments = {
  yellow: {
    name: '黄颜料',
    r: WAVELENGTHS.map((w) => 0.04 + 0.86 * sigmoid((w - 505) / 11)),
  },
  cyan: {
    name: '青颜料',
    r: WAVELENGTHS.map((w) => 0.04 + 0.82 * (1 - sigmoid((w - 580) / 13))),
  },
  magenta: {
    name: '品红颜料',
    r: WAVELENGTHS.map(
      (w) =>
        0.04 + 0.86 * (1 - sigmoid((w - 485) / 10) * sigmoid((585 - w) / 10)),
    ),
  },
};
const pairs = [
  { id: 'a', lights: ['red', 'green'], pigments: ['yellow', 'cyan'] },
  { id: 'b', lights: ['red', 'blue'], pigments: ['yellow', 'magenta'] },
  { id: 'c', lights: ['green', 'blue'], pigments: ['cyan', 'magenta'] },
] as const;
export function mixing({ host, controls, readout }: FigureContext) {
  let pair: (typeof pairs)[number] = pairs[0];
  let ratio = 0.5;
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const compute = () => {
    const [la, lb] = pair.lights.map((k) => lights[k].spd);
    // Each light alone at unit power; the mix adds both beams (2 × the ratio weights).
    const lightMix = la.map((v, i) => 2 * ((1 - ratio) * v + ratio * lb[i]));
    const lightXyz = [la, lb, lightMix].map((s) => emissionToXYZ(s));
    const scale =
      1 / Math.max(...lightXyz.map((xyz) => Math.max(...displayLinear(xyz))));
    const [pa, pb] = pair.pigments.map((k) => pigments[k].r);
    const pigmentMix = kubelkaMunkMix([pa, pb], [1 - ratio, ratio]);
    return {
      light: {
        spectra: [la, lb, lightMix],
        colors: lightXyz.map(
          (xyz) => displayRgb(xyz.map((v) => v * scale) as Vec3).rgb,
        ),
      },
      pigment: {
        spectra: [pa, pb, pigmentMix],
        colors: [pa, pb, pigmentMix].map(
          (r) => displayRgb(reflectanceToXYZ(r, D65_SPD)).rgb,
        ),
      },
    };
  };
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const result = compute();
      const half = (width - 10) / 2;
      (
        [
          [
            '光：加色混合',
            result.light,
            pair.lights.map((k) => lights[k].name),
            '相对辐射',
          ],
          [
            '颜料：减色混合（Kubelka–Munk）',
            result.pigment,
            pair.pigments.map((k) => pigments[k].name),
            '反射率',
          ],
        ] as const
      ).forEach(([title, data, names, yLabel], k) => {
        ctx.save();
        ctx.translate(k * (half + 10), 0);
        const swatchH = 70;
        const f = frame(half, height - swatchH - 20, [380, 780], [0, 1.05], {
          left: 50,
          right: 12,
          top: 34,
          bottom: 40,
        });
        label(ctx, title, f.left, 14, INK.bright, 'left', 12);
        axes(ctx, f, {
          xTicks: ticks(400, 780, 100),
          yTicks: ticks(0, 1, 0.5),
          xLabel: '波长 nm',
          yLabel,
          yFormat: (v) => v.toFixed(1),
        });
        const peak = k === 0 ? Math.max(...data.spectra.flat()) : 1;
        data.spectra.forEach((s, i) =>
          polyline(
            ctx,
            f,
            s.map((v, j) => [WAVELENGTHS[j], v / peak]),
            i === 2 ? INK.bright : css(data.colors[i]),
            i === 2 ? 2.6 : 1.6,
            i === 2 ? [] : [5, 4],
          ),
        );
        const y = height - swatchH - 6;
        const w = (half - 60) / 3;
        [names[0], names[1], '混合'].forEach((name, i) => {
          const x = 50 + i * w;
          ctx.fillStyle = css(data.colors[i]);
          ctx.fillRect(x + 4, y, w - 8, swatchH - 24);
          label(ctx, name, x + w / 2, y + swatchH - 12, INK.text, 'center', 11);
        });
        ctx.restore();
      });
      plot.canvas.dataset.pair = pair.id;
    },
    '光的混合与颜料混合',
  );
  const update = () => {
    const [la, lb] = pair.lights.map((k) => lights[k].spd);
    const lightMix = la.map((v, i) => (1 - ratio) * v + ratio * lb[i]);
    const [pa, pb] = pair.pigments.map((k) => pigments[k].r);
    const pigmentMix = kubelkaMunkMix([pa, pb], [1 - ratio, ratio]);
    // Distance of the mixture's chromaticity from the chord between its two components.
    const offChord = (xyz: Vec3[]) => {
      const [a, b, m] = xyz.map(xyzToXy);
      const dx = b[0] - a[0],
        dy = b[1] - a[1];
      return (
        Math.abs(dx * (m[1] - a[1]) - dy * (m[0] - a[0])) / Math.hypot(dx, dy)
      );
    };
    const lightXyz = [la, lb, lightMix].map((spd) => emissionToXYZ(spd));
    const pigmentXyz = [pa, pb, pigmentMix].map((r) =>
      reflectanceToXYZ(r, D65_SPD),
    );
    const xy = (xyz: Vec3) =>
      xyzToXy(xyz)
        .map((v) => v.toFixed(4))
        .join(', ');
    info.replaceChildren(
      el(
        'strong',
        {},
        `比例 ${Math.round((1 - ratio) * 100)} : ${Math.round(ratio * 100)}`,
      ),
      readoutTable(
        ['', '光 xy', '颜料 xy · Y'],
        [
          [
            'A',
            xy(lightXyz[0]),
            `${xy(pigmentXyz[0])} · ${pigmentXyz[0][1].toFixed(3)}`,
          ],
          [
            'B',
            xy(lightXyz[1]),
            `${xy(pigmentXyz[1])} · ${pigmentXyz[1][1].toFixed(3)}`,
          ],
          [
            '混合',
            xy(lightXyz[2]),
            `${xy(pigmentXyz[2])} · ${pigmentXyz[2][1].toFixed(3)}`,
          ],
        ],
      ),
      el(
        'span',
        {},
        `偏离 A–B 连线：光 ${offChord(lightXyz).toFixed(4)}，颜料 ${offChord(pigmentXyz).toFixed(4)}（xy 距离）`,
      ),
    );
    plot.redraw();
  };
  const r = slider(
    'mix-ratio',
    '混合比例',
    ratio,
    0,
    1,
    0.01,
    (v) => {
      ratio = v;
      update();
    },
    (v) => `${Math.round(v * 100)}%`,
  );
  controls.append(
    segmented(
      '组合',
      [
        { id: 'a', name: '红+绿 / 黄+青' },
        { id: 'b', name: '红+蓝 / 黄+品红' },
        { id: 'c', name: '绿+蓝 / 青+品红' },
      ] as const,
      'a',
      (v) => {
        pair = pairs.find((p) => p.id === v)!;
        update();
      },
    ),
    r.element,
  );
  update();
  return () => plot.destroy();
}
function displayLinear(xyz: Vec3): number[] {
  const m = [
    [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
    [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
    [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
  ];
  return m.map((row) => row[0] * xyz[0] + row[1] * xyz[1] + row[2] * xyz[2]);
}
