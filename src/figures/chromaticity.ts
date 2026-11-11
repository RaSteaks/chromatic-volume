import Color from 'colorjs.io';
import gamutData from '../data/gamuts.json' with { type: 'json' };
import { el, toggle } from '../dom';
import type { Vec3 } from '../model';
import { xyToXYZ, xyzToXy } from '../science/linear';
import {
  blackbodyXy,
  cctDuv,
  CMF_10,
  daylightXy,
  isotherm,
  spectralLocus,
  uvPrimeToXy,
  WAVELENGTHS,
  xyToUvPrime,
} from '../science/spectral';
import '../targets';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import {
  axes,
  chromaticityColor,
  createCanvas,
  crosshair,
  css,
  displayRgb,
  frame,
  INK,
  label,
  playback,
  polyline,
  probe,
  readoutTable,
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
  center: XY = [0.33, 0.33],
  marks = [460, 480, 490, 500, 510, 520, 540, 560, 580, 600, 620, 700],
) {
  ctx.save();
  ctx.font = '10px ui-monospace, monospace';
  ctx.fillStyle = INK.text;
  ctx.strokeStyle = INK.text;
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

type Plane = 'xy' | 'uv';
const toPlane =
  (plane: Plane) =>
  (p: XY): XY =>
    plane === 'uv' ? xyToUvPrime(p) : p;
const fromPlane =
  (plane: Plane) =>
  (p: XY): XY =>
    plane === 'uv' ? uvPrimeToXy(p) : p;
const locus10 = spectralLocus(CMF_10);
const fmt = (v: number, digits = 4) => v.toFixed(digits);

function horseshoe({ host, controls, readout }: FigureContext) {
  let gamutIndex = 0;
  let zoomed = false;
  let plane: Plane = 'uv';
  let showTen = false;
  let point: XY | null = null;
  const gamutInfo = el('div', { class: 'readout-list' });
  const probeInfo = el('div', { class: 'readout-list' });
  readout.append(probeInfo, gamutInfo);
  const frameFor = (width: number, height: number) => {
    const ranges: Record<Plane, [[number, number], [number, number]][]> = {
      xy: [
        [
          [0, 0.8],
          [0, 0.9],
        ],
        [
          [0.24, 0.56],
          [0.24, 0.46],
        ],
      ],
      uv: [
        [
          [0, 0.65],
          [0, 0.62],
        ],
        [
          [0.16, 0.34],
          [0.4, 0.56],
        ],
      ],
    };
    const [x, y] = ranges[plane][zoomed ? 1 : 0];
    return frame(width, height, x, y, undefined, true);
  };
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const f = frameFor(width, height);
      const P = toPlane(plane);
      const names = plane === 'uv' ? ['u′', 'v′'] : ['x', 'y'];
      const shape = locus.map(P);
      drawFill(ctx, f, shape, fromPlane(plane), plane, zoomed ? 0.55 : 0.85);
      const step = zoomed ? 0.04 : 0.1;
      axes(ctx, f, {
        xTicks: ticks(f.x[0], f.x[1], step),
        yTicks: ticks(f.y[0], f.y[1], step),
        xLabel: names[0],
        yLabel: names[1],
        xFormat: (v) => v.toFixed(zoomed ? 2 : 1),
        yFormat: (v) => v.toFixed(zoomed ? 2 : 1),
      });
      polyline(ctx, f, [...shape, shape[0]], '#ffffffb0', 1.2);
      if (showTen) {
        const ten = locus10.map(P);
        polyline(ctx, f, [...ten, ten[0]], '#f0b35e', 1.2, [5, 3]);
      }
      if (!zoomed) wavelengthTicks(ctx, f, shape, P([0.3127, 0.329]) as XY);
      const planck = planckianLocus().map(P);
      polyline(ctx, f, planck, '#141619', 2.2);
      polyline(ctx, f, planck, '#f6f1e8', 1.2);
      polyline(ctx, f, daylight.map(P), '#7ea6e8', 1.4, [4, 3]);
      for (const t of [2000, 2500, 3000, 4000, 5000, 6500, 10000]) {
        const line = isotherm(t, 0.02).map(P);
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
      const triangle = gamut.xy.map(P);
      polyline(ctx, f, [...triangle, triangle[0]], '#141619', 3.2);
      polyline(ctx, f, [...triangle, triangle[0]], INK.bright, 1.6);
      label(
        ctx,
        gamut.name,
        f.left + f.width - 10,
        f.top + 14,
        INK.bright,
        'right',
        13,
      );
      label(
        ctx,
        `— 普朗克轨迹  ┄ CIE 日光轨迹  | 等色温线 ±0.02 Duv${showTen ? '  ┄ CIE 1964 10° 轨迹' : ''}`,
        f.left + f.width - 8,
        f.top + f.height - 12,
        INK.text,
        'right',
        10,
      );
      if (point) {
        const [px, py] = P(point);
        crosshair(ctx, f, f.sx(px), f.sy(py));
      }
      plot.canvas.dataset.gamut = gamut.id;
      plot.canvas.dataset.plane = plane;
    },
    'CIE 色度图：光谱轨迹、普朗克轨迹与色域三角形；指针或方向键读取坐标',
  );
  const updateProbe = () => {
    if (!point) {
      probeInfo.replaceChildren(
        el('strong', {}, '读数'),
        el('span', { class: 'muted' }, '指向图中任意位置'),
      );
      return;
    }
    const uv = xyToUvPrime(point);
    const physical = inside(locus, point);
    const gamut = gamutPrimaries[gamutIndex];
    const rows: (string | null)[] = [
      `x ${fmt(point[0])}  y ${fmt(point[1])}`,
      `u′ ${fmt(uv[0])}  v′ ${fmt(uv[1])}`,
    ];
    if (physical) {
      const result = cctDuv(point);
      if (!result) rows.push('CCT 超出计算范围（1000–100000 K）');
      else {
        const { cct, duv } = result;
        rows.push(
          Math.abs(duv) <= 0.05
            ? `CCT ${Math.round(cct)} K  Duv ${duv >= 0 ? '+' : ''}${duv.toFixed(4)}`
            : 'CCT 未定义（|Duv| > 0.05）',
        );
      }
      rows.push(
        `${inside(gamut.xy, point) ? '在' : '不在'} ${gamut.name} 色域内`,
      );
    } else rows.push('光谱轨迹外：非物理刺激');
    probeInfo.replaceChildren(
      el('strong', {}, '读数'),
      ...rows.map((text) => el('span', {}, text!)),
    );
  };
  const srgbArea = {
    xy: area(gamutPrimaries[0].xy),
    uv: area(gamutPrimaries[0].xy.map(xyToUvPrime)),
  };
  const update = () => {
    const g = gamutPrimaries[gamutIndex];
    const outside = g.xy.filter((p) => !inside(locus, p)).length;
    gamutInfo.replaceChildren(
      el('strong', {}, `${g.name} 基色`),
      readoutTable(
        ['', 'x', 'y', 'u′', 'v′'],
        g.xy.map((p, i) => {
          const uv = xyToUvPrime(p);
          return ['RGB'[i], fmt(p[0]), fmt(p[1]), fmt(uv[0]), fmt(uv[1])];
        }),
      ),
      el(
        'span',
        {},
        `面积 / sRGB：xy ${((area(g.xy) / srgbArea.xy) * 100).toFixed(0)}%，u′v′ ${((area(g.xy.map(xyToUvPrime)) / srgbArea.uv) * 100).toFixed(0)}%`,
      ),
      el(
        'span',
        {},
        outside ? `${outside} 个基色在光谱轨迹外` : '三个基色均在光谱轨迹内',
      ),
    );
    updateProbe();
    plot.redraw();
  };
  const stopProbe = probe(plot.canvas, (p) => {
    if (!p) point = null;
    else {
      // Use the current settings, not the last painted frame, so a probe
      // right after a view change maps through the new axes.
      const f = frameFor(plot.canvas.clientWidth, plot.canvas.clientHeight);
      if (
        p.x < f.left ||
        p.x > f.left + f.width ||
        p.y < f.top ||
        p.y > f.top + f.height
      )
        point = null;
      else point = fromPlane(plane)([f.ix(p.x), f.iy(p.y)]);
    }
    updateProbe();
    plot.redraw();
  });
  const cycle = playback({
    id: 'gamut-cycle',
    label: '色域',
    min: 0,
    max: gamuts.length - 0.001,
    step: 0.001,
    value: 0,
    speed: 0.4,
    autoplay: false,
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
      '坐标',
      [
        { id: 'uv', name: 'u′v′' },
        { id: 'xy', name: 'xy' },
      ] as const,
      plane,
      (v) => {
        plane = v;
        plot.redraw();
      },
    ),
    segmented(
      '视野',
      [
        { id: 'full', name: '全图' },
        { id: 'zoom', name: '白点附近' },
      ] as const,
      'full',
      (v) => {
        zoomed = v === 'zoom';
        plot.redraw();
      },
    ),
    toggle('locus-10', '叠加 10° 轨迹', false, (on) => {
      showTen = on;
      plot.redraw();
    }),
  );
  update();
  return () => {
    stopProbe();
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
/** Major/minor axis ratio of a closed, evenly sampled outline (from its covariance). */
function axisRatio(points: XY[]) {
  const n = points.length - 1;
  const ring = points.slice(0, n);
  const mx = ring.reduce((s, p) => s + p[0], 0) / n,
    my = ring.reduce((s, p) => s + p[1], 0) / n;
  let a = 0,
    b = 0,
    c = 0;
  for (const [x, y] of ring) {
    a += (x - mx) ** 2;
    b += (x - mx) * (y - my);
    c += (y - my) ** 2;
  }
  const mean = (a + c) / 2,
    spread = Math.hypot((a - c) / 2, b);
  return Math.sqrt((mean + spread) / (mean - spread));
}
function macAdam({ host, controls, readout }: FigureContext) {
  let t = 0;
  const ellipses = gamutData.macadam.ellipses.map((e) => {
    const xy = ellipsePoints(e, 240);
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
      axisXy: axisRatio(xy),
      axisUv: axisRatio(uv),
    };
  });
  const ratio = (key: 'areaXy' | 'areaUv') => {
    const values = ellipses.map((e) => e[key]);
    return Math.max(...values) / Math.min(...values);
  };
  const axisStats = (key: 'axisXy' | 'axisUv') => {
    const values = ellipses.map((e) => e[key]).sort((a, b) => a - b);
    return [
      values[0],
      values[Math.floor(values.length / 2)],
      values[values.length - 1],
    ];
  };
  const [xyAxis, uvAxis] = [axisStats('axisXy'), axisStats('axisUv')];
  readout.append(
    el(
      'div',
      { class: 'readout-list' },
      el('strong', {}, '25 个椭圆的离散度'),
      readoutTable(
        ['', 'xy', 'u′v′'],
        [
          [
            '面积 最大/最小',
            `${ratio('areaXy').toFixed(0)}×`,
            `${ratio('areaUv').toFixed(0)}×`,
          ],
          ['长短轴比 中位', xyAxis[1].toFixed(2), uvAxis[1].toFixed(2)],
          [
            '长短轴比 范围',
            `${xyAxis[0].toFixed(1)}–${xyAxis[2].toFixed(1)}`,
            `${uvAxis[0].toFixed(1)}–${uvAxis[2].toFixed(1)}`,
          ],
        ],
      ),
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
  // Hue drift of each space's constant-hue line, measured in the other space.
  const hueOf = (space: string, xyz: Vec3) => {
    const [, a, b] = new Color('xyz-d65', xyz)
      .to(space)
      .coords.map((v) => v ?? 0);
    return {
      chroma: Math.hypot(a, b),
      hue: (Math.atan2(b, a) * 180) / Math.PI,
    };
  };
  const drift = (line: Vec3[], space: string, minChroma: number) => {
    const end = hueOf(space, line[line.length - 1]).hue;
    let worst = 0;
    for (const xyz of line) {
      const { chroma, hue } = hueOf(space, xyz);
      if (chroma < minChroma) continue;
      const d = ((hue - end + 540) % 360) - 180;
      if (Math.abs(d) > Math.abs(worst)) worst = d;
    }
    return worst;
  };
  const signed = (v: number) =>
    `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}°`;
  readout.append(
    el(
      'div',
      { class: 'readout-list' },
      el('strong', {}, '最大色相漂移（相对端点）'),
      readoutTable(
        ['', 'Lab 线 → Oklab h', 'Oklab 线 → Lab h'],
        lines.map((line) => [
          line.name,
          signed(drift(line.lab, 'oklab', 0.02)),
          signed(drift(line.oklab, 'lab-d65', 5)),
        ]),
      ),
      el(
        'span',
        { class: 'muted' },
        '跳过 Oklab C < 0.02、CIELAB C*ab < 5 的近灰段。',
      ),
    ),
  );
  return () => plot.destroy();
}

const figures: FigureDef[] = [
  {
    id: 'cie1931',
    number: 22,
    title: 'CIE 色度图',
    conditions: 'CIE 1931 2° · u′v′ / xy · 原生白点，无适配',
    grade: 'reference',
    highlight:
      '图中显示 CIE 1976 u′v′，Duv 则按 CIE 1960 uv（u = u′，v = 2v′/3）中到普朗克轨迹的带符号距离计算；切到 xy 对照同一组色域三角形的面积变化。ProPhoto 与 AP1 的绿、蓝基色以及摄影机色域的部分基色落在光谱轨迹外，三角形覆盖的是坐标范围而非可实现的刺激。',
    provenance: {
      data: 'CIE 1931 2° 与 CIE 1964 10° 标准观察者（Colour Science 0.4.4）；色域基色取自各空间的 RGB→XYZ 矩阵',
      domain:
        '光谱轨迹 380–780 nm / 5 nm；CCT 与 Duv 在 CIE 1960 uv 中求普朗克轨迹最近点（与 Ohno 2013 同定义，直接求解）',
      approximation:
        '底色以 sRGB 可显示的最大亮度绘制，sRGB 外裁剪，仅示意；10° 轨迹只作叠加对照，基色与 CCT 均按 2° 计算',
      reference: 'CIE 15:2018；Ohno, LEUKOS 10(1), 2014',
    },
    mount: horseshoe,
  },
  {
    id: 'macadam',
    number: 23,
    title: 'MacAdam 椭圆',
    conditions: 'MacAdam 1942 · 观察者 PGN · 25 个椭圆 ×10 · xy ↔ u′v′',
    grade: 'reference',
    highlight:
      'u′v′ 把面积离散度压低约两个数量级，中位长短轴比也下降；但最扁的椭圆在 u′v′ 中反而更扁。1976 UCS 是射影变换，只能改善尺度，不能消除方向相关的各向异性。',
    provenance: {
      data: 'Wyszecki & Stiles 表 2(5.4.1) 计算值，经 Colour Science 0.4.4',
      domain: '椭圆在 xy 中按参数方程采样，u′v′ 中的形状由逐点射影变换得到',
      approximation: '长短轴比取采样轮廓协方差的特征值之比',
      reference: 'MacAdam, JOSA 32(5), 1942',
    },
    mount: macAdam,
  },
  {
    id: 'hue-lines',
    number: 24,
    title: '等色相线：CIELAB 与 Oklab',
    conditions: 'CIELAB (D65) vs Oklab · 等 L、等 h · C 从 0 到 sRGB 原色',
    grade: 'reference',
    highlight:
      '两个空间对蓝的等色相判断分歧最大，CIELAB 的等 h 线在 Oklab 中漂移数十度，色带中段呈紫色；其次是黄。这与 Hung–Berns 的等色相实验一致，CIELAB 在蓝区的色相非线性是已知缺陷；Oklab 的色相参照了 IPT（Ebner–Fairchild）数据。',
    provenance: {
      data: 'sRGB 六个原色与二次色',
      domain:
        '每条线保持端点的 L 与 h，色度线性增加；CIELAB 与 Oklab 均以 D65 为参考白',
      approximation: '漂移只说明两空间彼此不一致，哪条更接近视觉需对照实验数据',
      reference:
        'Hung & Berns, CR&A 20(5), 1995；Ebner & Fairchild, CIC 6, 1998；Ottosson, Oklab, 2020',
    },
    mount: hueLines,
  },
];
export const groups: FigureGroup[] = [{ name: '色度图', figures }];
