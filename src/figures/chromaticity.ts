import Color from 'colorjs.io';
import gamutData from '../data/gamuts.json' with { type: 'json' };
import { el } from '../dom';
import type { Vec3 } from '../model';
import { xyToXYZ, xyzToXy } from '../science/linear';
import {
  blackbodyXy,
  daylightXy,
  isotherm,
  spectralLocus,
  WAVELENGTHS,
  xyToUvPrime,
} from '../science/spectral';
import '../targets';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import {
  axes,
  chromaticityColor,
  createCanvas,
  css,
  displayRgb,
  frame,
  INK,
  label,
  playback,
  polyline,
  segmented,
  ticks,
  type Frame,
} from './plot';

type XY = [number, number];
const locus = spectralLocus();

// --------------------------------------------------------------- horseshoe fill
const XYZ_TO_LINEAR: number[][] = [
  [3.2409699419045226, -1.537383177570094, -0.4986107602930034],
  [-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
  [0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const encode = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
function inside(polygon: XY[], [x, y]: XY) {
  let hit = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const [xi, yi] = polygon[i],
      [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi)
      hit = !hit;
  }
  return hit;
}
const fillCache = new Map<string, HTMLCanvasElement>();
/** Raster of displayable chromaticities inside a polygon given in plot units. */
function horseshoeFill(
  f: Frame,
  polygon: XY[],
  toXy: (p: XY) => XY,
  key: string,
  opacity = 1,
) {
  const scale = 0.5;
  const w = Math.max(1, Math.round(f.width * scale)),
    h = Math.max(1, Math.round(f.height * scale));
  const cacheKey = `${key}|${w}|${h}|${f.x}|${f.y}|${opacity}`;
  let image = fillCache.get(cacheKey);
  if (!image) {
    image = document.createElement('canvas');
    image.width = w;
    image.height = h;
    const ctx = image.getContext('2d')!;
    const data = ctx.createImageData(w, h);
    for (let py = 0; py < h; py++)
      for (let px = 0; px < w; px++) {
        const p: XY = [
          f.x[0] + ((px + 0.5) / w) * (f.x[1] - f.x[0]),
          f.y[1] - ((py + 0.5) / h) * (f.y[1] - f.y[0]),
        ];
        if (!inside(polygon, p)) continue;
        const [x, y] = toXy(p);
        const XYZ = [x / y, 1, (1 - x - y) / y];
        const linear = XYZ_TO_LINEAR.map((row) =>
          Math.max(row[0] * XYZ[0] + row[1] * XYZ[1] + row[2] * XYZ[2], 0),
        );
        const peak = Math.max(...linear) || 1;
        const o = (py * w + px) * 4;
        linear.forEach((v, c) => {
          data.data[o + c] = Math.round(
            encode(v / peak) * 255 * opacity + 20 * (1 - opacity),
          );
        });
        data.data[o + 3] = 255;
      }
    ctx.putImageData(data, 0, 0);
    if (fillCache.size > 12) fillCache.clear();
    fillCache.set(cacheKey, image);
  }
  return image;
}
function drawFill(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  polygon: XY[],
  toXy: (p: XY) => XY,
  key: string,
  opacity = 1,
) {
  ctx.save();
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(
    horseshoeFill(f, polygon, toXy, key, opacity),
    f.left,
    f.top,
    f.width,
    f.height,
  );
  ctx.restore();
}
function wavelengthTicks(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  points: XY[],
  marks = [460, 480, 490, 500, 510, 520, 540, 560, 580, 600, 620, 700],
) {
  ctx.save();
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = INK.text;
  ctx.strokeStyle = INK.text;
  const center: XY = [0.33, 0.33];
  for (const w of marks) {
    const i = WAVELENGTHS.indexOf(w);
    if (i < 0) continue;
    const [x, y] = points[i];
    const dx = x - center[0],
      dy = y - center[1];
    const length = Math.hypot(dx, dy);
    const nx = dx / length,
      ny = dy / length;
    const sx = f.sx(x),
      sy = f.sy(y);
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(sx + nx * 6, sy - ny * 6);
    ctx.stroke();
    ctx.textAlign = nx > 0.2 ? 'left' : nx < -0.2 ? 'right' : 'center';
    ctx.textBaseline = ny > 0.2 ? 'bottom' : ny < -0.2 ? 'top' : 'middle';
    ctx.fillText(String(w), sx + nx * 9, sy - ny * 9);
  }
  ctx.restore();
}

// ------------------------------------------------------------------ gamuts
const gamuts = [
  { id: 'srgb-linear', name: 'sRGB / Rec.709' },
  { id: 'p3-linear', name: 'Display P3' },
  { id: 'a98rgb-linear', name: 'Adobe RGB (1998)' },
  { id: 'rec2020-linear', name: 'Rec.2020' },
  { id: 'prophoto-linear', name: 'ProPhoto RGB' },
  { id: 'acescg', name: 'ACES AP1' },
  { id: 'camera-sgamut3', name: 'S-Gamut3' },
  { id: 'camera-arri4', name: 'ARRI Wide Gamut 4' },
  { id: 'dwg-linear', name: 'DaVinci Wide Gamut' },
];
/** Native primaries (no white-point adaptation) from each space's own matrix. */
function primaries(id: string): XY[] {
  const M = (Color.Space.get(id) as unknown as { M: { toXYZ: number[][] } }).M
    .toXYZ;
  return [0, 1, 2].map((c) => xyzToXy([M[0][c], M[1][c], M[2][c]]));
}
const gamutPrimaries = gamuts.map((g) => ({ ...g, xy: primaries(g.id) }));

let planckian: XY[] | null = null;
const planckianLocus = () =>
  (planckian ??= Array.from({ length: 120 }, (_, i) =>
    blackbodyXy(1000 * 25 ** (i / 119)),
  ));
const daylight = Array.from({ length: 60 }, (_, i) =>
  daylightXy(4000 + (21000 * i) / 59),
);

function horseshoe({ host, controls, readout }: FigureContext) {
  let gamutIndex = 0;
  let zoomed = false;
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const f = zoomed
        ? frame(width, height, [0.24, 0.56], [0.24, 0.46], undefined, true)
        : frame(width, height, [0, 0.8], [0, 0.9], undefined, true);
      drawFill(ctx, f, locus, (p) => p, 'xy', zoomed ? 0.55 : 0.85);
      axes(ctx, f, {
        xTicks: ticks(f.x[0], f.x[1], zoomed ? 0.04 : 0.1),
        yTicks: ticks(f.y[0], f.y[1], zoomed ? 0.04 : 0.1),
        xLabel: 'x',
        yLabel: 'y',
        xFormat: (v) => v.toFixed(zoomed ? 2 : 1),
        yFormat: (v) => v.toFixed(zoomed ? 2 : 1),
      });
      polyline(ctx, f, [...locus, locus[0]], '#ffffffb0', 1.2);
      if (!zoomed) wavelengthTicks(ctx, f, locus);
      polyline(ctx, f, planckianLocus(), '#141619', 2.2);
      polyline(ctx, f, planckianLocus(), '#f6f1e8', 1.2);
      polyline(ctx, f, daylight, '#7ea6e8', 1.4, [4, 3]);
      for (const t of [2000, 2500, 3000, 4000, 5000, 6500, 10000]) {
        const line = isotherm(t, 0.02);
        polyline(ctx, f, line, '#f6f1e8a0', 1);
        if (zoomed || t === 2000 || t === 10000) {
          const [x, y] = line[1];
          label(
            ctx,
            `${t} K`,
            f.sx(x) + 3,
            f.sy(y) - 6,
            INK.bright,
            'left',
            10,
          );
        }
      }
      const gamut = gamutPrimaries[gamutIndex];
      polyline(ctx, f, [...gamut.xy, gamut.xy[0]], '#141619', 3.2);
      polyline(ctx, f, [...gamut.xy, gamut.xy[0]], INK.bright, 1.6);
      const centroid = gamut.xy.reduce(
        (sum, p) => [sum[0] + p[0] / 3, sum[1] + p[1] / 3] as XY,
        [0, 0] as XY,
      );
      label(
        ctx,
        gamut.name,
        f.left + f.width - 10,
        f.top + 14,
        INK.bright,
        'right',
        13,
      );
      void centroid;
      label(
        ctx,
        '— 普朗克轨迹  ┄ 日光轨迹  | 等色温线（±0.02 Δuv）',
        f.left + f.width - 8,
        f.top + f.height - 12,
        INK.text,
        'right',
        10,
      );
      plot.canvas.dataset.gamut = gamut.id;
    },
    'CIE 1931 xy 色度图',
  );
  const update = () => {
    const g = gamutPrimaries[gamutIndex];
    info.replaceChildren(
      el('strong', {}, g.name),
      ...['R', 'G', 'B'].map((c, i) =>
        el(
          'span',
          {},
          `${c}  x ${g.xy[i][0].toFixed(4)}  y ${g.xy[i][1].toFixed(4)}`,
        ),
      ),
      el(
        'span',
        { class: 'muted' },
        g.xy.some((p) => !inside(locus, p))
          ? '有基色落在光谱轨迹之外：它们不是真实存在的颜色。'
          : '三个基色都在光谱轨迹之内。',
      ),
    );
    plot.redraw();
  };
  const cycle = playback({
    id: 'gamut-cycle',
    label: '色域轮播',
    min: 0,
    max: gamuts.length - 0.001,
    step: 0.001,
    value: 0,
    speed: 0.4,
    format: (v) => gamuts[Math.floor(v)].name,
    onChange: (v) => {
      const next = Math.floor(v);
      if (next !== gamutIndex) {
        gamutIndex = next;
        update();
      }
    },
  });
  controls.append(
    cycle.element,
    segmented(
      '视野',
      [
        { id: 'full', name: '全图' },
        { id: 'zoom', name: '放大白点附近' },
      ] as const,
      'full',
      (v) => {
        zoomed = v === 'zoom';
        plot.redraw();
      },
    ),
  );
  update();
  return () => {
    cycle.destroy();
    plot.destroy();
  };
}

// ---------------------------------------------------------------- MacAdam
function ellipsePoints([x, y, a, b, theta]: number[], steps = 48): XY[] {
  const t = (theta * Math.PI) / 180;
  return Array.from({ length: steps + 1 }, (_, i) => {
    const s = (i / steps) * Math.PI * 2;
    return [
      x + a * Math.cos(s) * Math.cos(t) - b * Math.sin(s) * Math.sin(t),
      y + a * Math.cos(s) * Math.sin(t) + b * Math.sin(s) * Math.cos(t),
    ];
  });
}
const area = (points: XY[]) =>
  Math.abs(
    points.reduce((sum, p, i) => {
      const q = points[(i + 1) % points.length];
      return sum + p[0] * q[1] - q[0] * p[1];
    }, 0) / 2,
  );
function macAdam({ host, controls, readout }: FigureContext) {
  let t = 0;
  const ellipses = gamutData.macadam.ellipses.map((e) => {
    const xy = ellipsePoints(e);
    const uv = xy.map(xyToUvPrime);
    const centerXy: XY = [e[0], e[1]];
    const centerUv = xyToUvPrime(centerXy);
    const enlarge = (points: XY[], c: XY) =>
      points.map(
        ([px, py]) => [c[0] + 10 * (px - c[0]), c[1] + 10 * (py - c[1])] as XY,
      );
    return {
      color: css(chromaticityColor(xyToXYZ(centerXy))),
      xy: enlarge(xy, centerXy),
      uv: enlarge(uv, centerUv),
      areaXy: area(xy),
      areaUv: area(uv),
    };
  });
  const ratio = (key: 'areaXy' | 'areaUv') => {
    const values = ellipses.map((e) => e[key]);
    return Math.max(...values) / Math.min(...values);
  };
  readout.append(
    el(
      'div',
      { class: 'readout-list' },
      el('strong', {}, '最大 / 最小椭圆面积比'),
      el('span', {}, `xy：${ratio('areaXy').toFixed(1)} 倍`),
      el('span', {}, `u′v′：${ratio('areaUv').toFixed(1)} 倍`),
      el('span', { class: 'muted' }, '比值越接近 1，空间在色度上越均匀。'),
    ),
  );
  const locusUv = locus.map(xyToUvPrime);
  const mix = (a: XY, b: XY): XY => [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
  ];
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const f = frame(width, height, [0, 0.8], [0, 0.9], undefined, true);
      const shape = locus.map((p, i) => mix(p, locusUv[i]));
      const name = t < 0.5 ? ['x', 'y'] : ['u′', 'v′'];
      axes(ctx, f, {
        xTicks: ticks(0, 0.8, 0.1),
        yTicks: ticks(0, 0.9, 0.1),
        xLabel: name[0],
        yLabel: name[1],
        xFormat: (v) => v.toFixed(1),
        yFormat: (v) => v.toFixed(1),
      });
      polyline(ctx, f, [...shape, shape[0]], '#ffffff90', 1.2);
      for (const e of ellipses) {
        const points = e.xy.map((p, i) => mix(p, e.uv[i]));
        polyline(ctx, f, points, '#141619', 3);
        polyline(ctx, f, points, e.color, 1.6);
      }
      label(
        ctx,
        '椭圆放大 10 倍',
        f.left + 8,
        f.top + 12,
        INK.text,
        'left',
        10,
      );
      plot.canvas.dataset.progress = t.toFixed(2);
    },
    '麦克亚当椭圆在 xy 与 u′v′ 之间变换',
  );
  const play = playback({
    id: 'macadam',
    label: 'xy → u′v′',
    min: 0,
    max: 1,
    step: 0.01,
    value: 0,
    speed: 0.3,
    bounce: true,
    format: (v) => `${Math.round(v * 100)}%`,
    onChange: (v) => {
      t = v;
      plot.redraw();
    },
  });
  controls.append(play.element);
  return () => {
    play.destroy();
    plot.destroy();
  };
}

// ---------------------------------------------------------------- hue lines
const primariesRgb = [
  { id: 'red', name: '红', rgb: [1, 0, 0] },
  { id: 'yellow', name: '黄', rgb: [1, 1, 0] },
  { id: 'green', name: '绿', rgb: [0, 1, 0] },
  { id: 'cyan', name: '青', rgb: [0, 1, 1] },
  { id: 'blue', name: '蓝', rgb: [0, 0, 1] },
  { id: 'magenta', name: '品红', rgb: [1, 0, 1] },
] as const;
/** Constant L and hue, chroma 0 → the primary's chroma, in the given Lab-like space. */
function hueLine(space: string, rgb: readonly number[], steps = 40) {
  const [L, a, b] = new Color('srgb', [...rgb] as Vec3)
    .to(space)
    .coords.map((v) => v ?? 0);
  const xyz: Vec3[] = [];
  for (let i = 0; i <= steps; i++) {
    const s = i / steps;
    xyz.push(
      new Color(space, [L, a * s, b * s])
        .to('xyz-d65')
        .coords.map((v) => v ?? 0) as Vec3,
    );
  }
  return xyz;
}
function hueLines({ host, controls, readout }: FigureContext) {
  let focus = 'blue';
  const lines = primariesRgb.map((p) => ({
    ...p,
    lab: hueLine('lab-d65', p.rgb),
    oklab: hueLine('oklab', p.rgb),
  }));
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const strip = 30;
      const f = frame(
        width,
        height - strip * 2 - 24,
        [0.1, 0.72],
        [0.02, 0.66],
        undefined,
        true,
      );
      drawFill(ctx, f, locus, (p) => p, 'hue', 0.32);
      axes(ctx, f, {
        xTicks: ticks(0.1, 0.72, 0.1),
        yTicks: ticks(0, 0.66, 0.1),
        xLabel: 'x',
        yLabel: 'y',
        xFormat: (v) => v.toFixed(1),
        yFormat: (v) => v.toFixed(1),
      });
      polyline(ctx, f, [...locus, locus[0]], '#ffffff70', 1);
      for (const line of lines) {
        const strong = line.id === focus;
        const color = css(line.rgb as unknown as Vec3);
        const lab = line.lab.map(xyzToXy),
          ok = line.oklab.map(xyzToXy);
        polyline(ctx, f, lab, '#141619', strong ? 4.5 : 3);
        polyline(ctx, f, lab, color, strong ? 2.4 : 1.2, [5, 4]);
        polyline(ctx, f, ok, '#141619', strong ? 4.5 : 3);
        polyline(ctx, f, ok, color, strong ? 2.4 : 1.2);
      }
      label(
        ctx,
        '┄ CIELAB 等色相线    — Oklab 等色相线（明度固定，色度 0 → 原色）',
        f.left + 8,
        f.top + 12,
        INK.text,
        'left',
        10,
      );
      // Ramps: grey → primary at constant hue and lightness.
      const focusLine = lines.find((l) => l.id === focus)!;
      const top = f.top + f.height + 44;
      (
        [
          ['CIELAB', focusLine.lab],
          ['Oklab', focusLine.oklab],
        ] as const
      ).forEach(([name, ramp], row) => {
        const y = top + row * (strip + 6);
        label(ctx, name, f.left, y + strip / 2, INK.text, 'left', 11);
        const x0 = f.left + 60,
          w = f.width - 60;
        ramp.forEach((xyz, i) => {
          ctx.fillStyle = css(displayRgb(xyz).rgb);
          ctx.fillRect(
            x0 + (i / ramp.length) * w,
            y,
            w / ramp.length + 1,
            strip,
          );
        });
      });
      plot.canvas.dataset.focus = focus;
    },
    'CIELAB 与 Oklab 的等色相线',
  );
  controls.append(
    segmented(
      '色带色相',
      primariesRgb.map((p) => ({ id: p.id, name: p.name })),
      'blue',
      (v) => {
        focus = v;
        plot.redraw();
      },
    ),
  );
  readout.append(
    el(
      'div',
      { class: 'readout-list' },
      el('strong', {}, '下方色带'),
      el('span', {}, '同一明度、同一色相角，色度从 0 增加到原色。'),
      el(
        'span',
        { class: 'muted' },
        '选「蓝」：CIELAB 色带的中段明显偏紫，Oklab 色带保持蓝色。',
      ),
    ),
  );
  return () => plot.destroy();
}

const figures: FigureDef[] = [
  {
    id: 'cie1931',
    number: 22,
    title: 'CIE 1931 马蹄图',
    caption: '光谱轨迹、普朗克与日光轨迹、色域三角形',
    highlight:
      '马蹄形边缘是单色光（数字为波长 nm），底边是不存在单色光的紫红线。中间的白线是黑体（普朗克）轨迹，蓝色虚线是日光轨迹，短横线是等色温线。三角形在各个色域之间轮播：越往外越宽，ProPhoto、AP1 与摄影机色域的部分基色已经落在马蹄形之外。',
    note: '光谱轨迹使用 CIE 1931 2° 标准观察者（380–780 nm，5 nm）。马蹄内的底色只是示意：每个色度以 sRGB 能显示的最大亮度绘制，超出 sRGB 的区域已被裁剪。',
    mount: horseshoe,
  },
  {
    id: 'macadam',
    number: 23,
    title: '麦克亚当椭圆',
    caption: '在 xy 与 u′v′ 之间来回变换',
    highlight:
      '每个椭圆圈出人眼刚好分辨不出差别的颜色范围（放大 10 倍）。在 xy 中，绿色区域的椭圆又大又长，蓝色区域的很小；变换到 CIE 1976 u′v′ 后，大小与形状明显更一致，但仍不是完美的圆。',
    note: 'MacAdam（1942）观察者 PGN 的 25 个椭圆，取 Wyszecki & Stiles 表 2(5.4.1) 的计算值；u′v′ 中的椭圆由 xy 椭圆逐点变换得到。',
    mount: macAdam,
  },
  {
    id: 'hue-lines',
    number: 24,
    title: '等色相线',
    caption: 'CIELAB 的蓝色为什么偏紫',
    highlight:
      '在 xy 上画出 CIELAB（虚线）与 Oklab（实线）从灰到各个 sRGB 原色的等色相线。大多数色相两者接近；蓝色差别最大：CIELAB 的等色相线在中段弯向紫色，所以沿着 Lab 色相不变地降低蓝色的饱和度，会得到紫色。',
    note: '每条线保持原色的明度不变，色度从 0 线性增加到原色本身。CIELAB 使用 D65 参考白，与 Oklab 一致。',
    mount: hueLines,
  },
];
export const groups: FigureGroup[] = [{ name: '色度图', figures }];
