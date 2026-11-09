import Color from 'colorjs.io';
import tm30 from '../data/tm30.json' with { type: 'json' };
import { el } from '../dom';
import type { Vec3 } from '../model';
import {
  bradford,
  D65,
  invert,
  multiply,
  type Mat3,
  xyzToXy,
} from '../science/linear';
import {
  A_SPD,
  blackbodySpd,
  CAMERAS,
  CMF,
  D65_SPD,
  emissionToXYZ,
  metamericPair,
  reflectanceToXYZ,
  RGB_CMF,
  spectralLocus,
  WAVELENGTHS,
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
  select,
  SERIES,
  ticks,
  type Frame,
} from './plot';

const LAMBDA: [number, number] = [380, 780];
const series = (values: number[], start = 380, step = 5) =>
  values.map((v, i) => [start + i * step, v] as [number, number]);
const at = (values: number[], lambda: number) => {
  const p = (lambda - 380) / 5;
  const i = Math.min(Math.floor(p), values.length - 2);
  return values[i] + (values[i + 1] - values[i]) * (p - i);
};
const spectralColors = WAVELENGTHS.map((_, i) =>
  css(chromaticityColor([CMF.x[i], CMF.y[i], CMF.z[i]])),
);
function spectrumBand(ctx: CanvasRenderingContext2D, f: Frame) {
  const y = f.top + f.height + 22,
    h = 5;
  WAVELENGTHS.forEach((w, i) => {
    const brightness = Math.min(CMF.y[i] * 3, 1);
    ctx.globalAlpha = 0.25 + 0.75 * brightness;
    ctx.fillStyle = spectralColors[i];
    ctx.fillRect(f.sx(w - 2.5), y, f.sx(w + 2.5) - f.sx(w - 2.5) + 0.5, h);
  });
  ctx.globalAlpha = 1;
}
const spectralPad = { left: 56, right: 20, top: 24, bottom: 54 };
function cursor(ctx: CanvasRenderingContext2D, f: Frame, lambda: number) {
  ctx.save();
  ctx.strokeStyle = INK.bright;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(f.sx(lambda), f.top);
  ctx.lineTo(f.sx(lambda), f.top + f.height);
  ctx.stroke();
  ctx.restore();
}
function dot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
) {
  ctx.fillStyle = color;
  ctx.strokeStyle = INK.canvas;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, 4.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fill();
}
function swatch(label: string, rgb: Vec3, note = '') {
  return el(
    'div',
    { class: 'readout-swatch' },
    el('i', { style: `background:${css(rgb)}` }),
    el('span', {}, label, note ? el('small', {}, note) : null),
  );
}

// ------------------------------------------------------------ CMF figures
function cmfFigure(kind: 'xyz' | 'rgb') {
  return ({ host, controls, readout }: FigureContext) => {
    const curves =
      kind === 'xyz'
        ? [
            { name: 'x̄', values: CMF.x, color: SERIES[0] },
            { name: 'ȳ', values: CMF.y, color: SERIES[1] },
            { name: 'z̄', values: CMF.z, color: SERIES[2] },
          ]
        : [
            { name: 'r̄', values: RGB_CMF.r, color: SERIES[0] },
            { name: 'ḡ', values: RGB_CMF.g, color: SERIES[1] },
            { name: 'b̄', values: RGB_CMF.b, color: SERIES[2] },
          ];
    const all = curves.flatMap((c) => c.values);
    const range: [number, number] = [
      Math.min(0, ...all) * 1.1,
      Math.max(...all) * 1.08,
    ];
    let lambda = 520;
    const info = el('div', { class: 'readout-list' });
    readout.append(info);
    const plot = createCanvas(
      host,
      (ctx, width, height) => {
        const f = frame(width, height, LAMBDA, range, spectralPad);
        if (range[0] < 0) {
          ctx.fillStyle = '#e0797a14';
          ctx.fillRect(f.left, f.sy(0), f.width, f.top + f.height - f.sy(0));
          label(
            ctx,
            '负值区域：需要把这个原色加到待匹配的光上',
            f.left + 8,
            f.sy(0) + 12,
            '#e0797a',
            'left',
            10,
          );
        }
        axes(ctx, f, {
          xTicks: ticks(400, 780, 50),
          yTicks: ticks(range[0], range[1], kind === 'xyz' ? 0.5 : 0.1),
          xLabel: '波长 nm',
          yLabel: kind === 'xyz' ? '三刺激值' : '三刺激值（原色单位）',
          yFormat: (v) => v.toFixed(1),
        });
        spectrumBand(ctx, f);
        if (range[0] < 0)
          polyline(
            ctx,
            f,
            [
              [380, 0],
              [780, 0],
            ],
            '#ffffff40',
            1,
          );
        cursor(ctx, f, lambda);
        curves.forEach((c) => {
          polyline(ctx, f, series(c.values), c.color, 2);
          dot(ctx, f.sx(lambda), f.sy(at(c.values, lambda)), c.color);
        });
        curves.forEach((c, i) =>
          label(
            ctx,
            c.name,
            f.left + f.width - 70 + i * 22,
            f.top + 14,
            c.color,
            'left',
            14,
          ),
        );
        if (kind === 'rgb')
          label(
            ctx,
            '原色 700 / 546.1 / 435.8 nm',
            f.left + 8,
            f.top + 14,
            INK.text,
            'left',
            10,
          );
        plot.canvas.dataset.lambda = lambda.toFixed(0);
      },
      kind === 'xyz' ? 'CIE 1931 配色函数' : 'CIE 1931 RGB 配色函数',
    );
    const update = () => {
      const values = curves.map((c) => at(c.values, lambda));
      const xyz: Vec3 = [
        at(CMF.x, lambda),
        at(CMF.y, lambda),
        at(CMF.z, lambda),
      ];
      const [x, y] = xyzToXy(xyz);
      info.replaceChildren(
        el('strong', {}, `${lambda.toFixed(0)} nm 单色光`),
        ...curves.map((c, i) =>
          el('span', {}, `${c.name}  ${values[i].toFixed(4)}`),
        ),
        el('span', {}, `x ${x.toFixed(4)}  y ${y.toFixed(4)}`),
        swatch(
          '最接近的可显示颜色',
          chromaticityColor(xyz),
          '单色光都在 sRGB 之外，已裁剪',
        ),
      );
      plot.redraw();
    };
    const play = playback({
      id: 'lambda',
      label: '波长游标',
      min: 380,
      max: 780,
      step: 1,
      value: lambda,
      speed: 45,
      format: (v) => `${v.toFixed(0)} nm`,
      onChange: (v) => {
        lambda = v;
        update();
      },
    });
    controls.append(play.element);
    update();
    return () => {
      play.destroy();
      plot.destroy();
    };
  };
}

// ------------------------------------------------------------ blackbody
const locus = spectralLocus();
function blackbody({ host, controls, readout }: FigureContext) {
  let temperature = 3000;
  const reference = [2000, 3000, 4000, 5500, 6500, 10000];
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const planck = Array.from({ length: 80 }, (_, i) =>
    xyzToXy(emissionToXYZ(blackbodySpd(1500 * (12000 / 1500) ** (i / 79)))),
  );
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const f = frame(width, height, LAMBDA, [0, 3.6], spectralPad);
      axes(ctx, f, {
        xTicks: ticks(400, 780, 50),
        yTicks: ticks(0, 3.5, 0.5),
        yFormat: (v) => v.toFixed(1),
        xLabel: '波长 nm',
        yLabel: '相对辐射（560 nm = 1）',
      });
      spectrumBand(ctx, f);
      for (const t of reference)
        polyline(ctx, f, series(blackbodySpd(t)), '#ffffff1c', 1);
      const xyz = emissionToXYZ(blackbodySpd(temperature));
      const color = css(chromaticityColor(xyz));
      polyline(ctx, f, series(blackbodySpd(temperature)), color, 2.6);
      label(
        ctx,
        `${Math.round(temperature)} K`,
        f.left + 10,
        f.top + 14,
        INK.bright,
        'left',
        14,
      );
      // Inset: position on the Planckian locus.
      const size = Math.min(170, f.width * 0.32);
      const g = frame(
        size,
        size,
        [0, 0.8],
        [0, 0.9],
        { left: 0, right: 0, top: 0, bottom: 0 },
        true,
      );
      ctx.save();
      ctx.translate(f.left + 16, f.top + 34);
      ctx.fillStyle = '#141619e0';
      ctx.fillRect(-6, -6, size + 12, size + 12);
      polyline(ctx, g, [...locus, locus[0]], '#ffffff70', 1);
      polyline(ctx, g, planck, '#ffffffa0', 1.2);
      const [x, y] = xyzToXy(xyz);
      dot(ctx, g.sx(x), g.sy(y), color);
      ctx.restore();
      plot.canvas.dataset.temperature = temperature.toFixed(0);
    },
    '黑体辐射光谱',
  );
  const update = () => {
    const xyz = emissionToXYZ(blackbodySpd(temperature));
    const [x, y] = xyzToXy(xyz);
    info.replaceChildren(
      el('strong', {}, `${Math.round(temperature)} K 黑体`),
      el('span', {}, `x ${x.toFixed(4)}  y ${y.toFixed(4)}`),
      swatch('白点颜色（亮度归一）', chromaticityColor(xyz)),
      el(
        'span',
        { class: 'muted' },
        '色温越低越偏橙红，越高越偏蓝；6500 K 附近接近 D65 白。',
      ),
    );
    plot.redraw();
  };
  const play = playback({
    id: 'temperature',
    label: '色温',
    min: 2000,
    max: 10000,
    step: 10,
    value: temperature,
    speed: 1600,
    bounce: true,
    format: (v) => `${Math.round(v)} K`,
    onChange: (v) => {
      temperature = v;
      update();
    },
  });
  controls.append(play.element);
  update();
  return () => {
    play.destroy();
    plot.destroy();
  };
}

// ------------------------------------------------------------ metamerism
function metamerism({ host, controls, readout }: FigureContext) {
  const { first, second } = metamericPair();
  let illuminant: 'd65' | 'a' = 'd65';
  const spd = () => (illuminant === 'd65' ? D65_SPD : A_SPD);
  const appearance = (reflectance: number[]) => {
    const light = spd();
    const xyz = reflectanceToXYZ(reflectance, light);
    // Display with the observer adapted to the light source (Bradford).
    const white = reflectanceToXYZ(
      WAVELENGTHS.map(() => 1),
      light,
    );
    return bradford(xyz, white, D65);
  };
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const f = frame(width, height, LAMBDA, [0, 1], spectralPad);
      const light = spd();
      const peak = Math.max(...light);
      ctx.fillStyle = '#ffffff0d';
      ctx.beginPath();
      ctx.moveTo(f.sx(380), f.sy(0));
      light.forEach((v, i) =>
        ctx.lineTo(f.sx(WAVELENGTHS[i]), f.sy((v / peak) * 0.95)),
      );
      ctx.lineTo(f.sx(780), f.sy(0));
      ctx.fill();
      axes(ctx, f, {
        xTicks: ticks(400, 780, 50),
        yTicks: ticks(0, 1, 0.2),
        xLabel: '波长 nm',
        yLabel: '反射率',
        yFormat: (v) => v.toFixed(1),
      });
      spectrumBand(ctx, f);
      polyline(ctx, f, series(first), SERIES[3], 2.2);
      polyline(ctx, f, series(second), SERIES[5], 2.2);
      label(ctx, '样本 1', f.left + 10, f.top + 14, SERIES[3], 'left', 12);
      label(ctx, '样本 2', f.left + 70, f.top + 14, SERIES[5], 'left', 12);
      label(
        ctx,
        `灰色底：${illuminant === 'd65' ? 'D65' : 'A'} 光源光谱`,
        f.left + 130,
        f.top + 14,
        INK.text,
        'left',
        10,
      );
      plot.canvas.dataset.illuminant = illuminant;
    },
    '同色异谱样本的反射光谱',
  );
  const update = () => {
    const [a, b] = [first, second].map(appearance);
    const delta = new Color('xyz-d65', a).deltaE2000(new Color('xyz-d65', b));
    info.replaceChildren(
      el(
        'strong',
        {},
        illuminant === 'd65' ? 'D65 日光下' : 'A 光源（白炽灯）下',
      ),
      swatch('样本 1', displayRgb(a).rgb),
      swatch('样本 2', displayRgb(b).rgb),
      el('span', {}, `ΔE2000 = ${delta.toFixed(delta < 0.01 ? 4 : 2)}`),
      el(
        'span',
        { class: 'muted' },
        illuminant === 'd65'
          ? '两条光谱完全不同，在 D65 下却是同一个颜色。'
          : '换到 A 光源，两个样本分开了：这就是同色异谱。',
      ),
    );
    plot.redraw();
  };
  controls.append(
    segmented(
      '光源',
      [
        { id: 'd65', name: 'D65 日光' },
        { id: 'a', name: 'A 白炽灯' },
      ] as const,
      illuminant,
      (v) => {
        illuminant = v;
        update();
      },
    ),
  );
  update();
  return () => plot.destroy();
}

// ------------------------------------------------------------ TM-30
function binColor(angle: number) {
  // Display tint only: CIELAB hue at moderate lightness and chroma.
  return css(
    new Color('lch', [62, 42, (angle * 180) / Math.PI])
      .to('srgb')
      .toGamut()
      .coords.map((v) => v ?? 0) as Vec3,
  );
}
function tm30Figure({ host, controls, readout }: FigureContext) {
  let source = tm30.sources[2];
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const size = Math.min(width, height);
      const f = frame(
        width,
        height,
        [-1.45, 1.45],
        [-1.45, 1.45],
        { left: 20, right: 20, top: 20, bottom: 20 },
        true,
      );
      const cx = f.sx(0),
        cy = f.sy(0),
        r = f.sx(1) - cx;
      for (let j = 0; j < 16; j++) {
        const a0 = (j / 16) * Math.PI * 2,
          a1 = ((j + 1) / 16) * Math.PI * 2;
        ctx.fillStyle = binColor((a0 + a1) / 2);
        ctx.globalAlpha = 0.28;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, r * 1.4, -a0, -a1, true);
        ctx.closePath();
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.strokeStyle = '#ffffff90';
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      const points = source.reference.map((ref, j) => {
        const test = source.test[j];
        const norm = Math.hypot(ref[0], ref[1]);
        const angle = Math.atan2(ref[1], ref[0]);
        const base: [number, number] = [Math.cos(angle), Math.sin(angle)];
        return {
          base,
          test: [
            base[0] + (test[0] - ref[0]) / norm,
            base[1] + (test[1] - ref[1]) / norm,
          ] as [number, number],
        };
      });
      ctx.lineWidth = 1.4;
      for (const p of points) {
        ctx.strokeStyle = '#ffffffb0';
        ctx.beginPath();
        ctx.moveTo(f.sx(p.base[0]), f.sy(p.base[1]));
        ctx.lineTo(f.sx(p.test[0]), f.sy(p.test[1]));
        ctx.stroke();
      }
      polyline(
        ctx,
        f,
        [...points.map((p) => p.test), points[0].test],
        '#f05a5a',
        2.4,
      );
      for (const p of points)
        dot(ctx, f.sx(p.test[0]), f.sy(p.test[1]), '#f05a5a');
      label(
        ctx,
        '虚线圆：参考光源    红线：被测光源',
        f.left + 4,
        f.top + 10,
        INK.text,
        'left',
        10,
      );
      void size;
      plot.canvas.dataset.source = source.id;
    },
    'TM-30 色矢量图',
  );
  const update = () => {
    info.replaceChildren(
      el('strong', {}, source.name),
      el('span', {}, `Rf ${source.rf.toFixed(0)}   Rg ${source.rg.toFixed(0)}`),
      el(
        'span',
        {},
        `CCT ${Math.round(source.cct)} K   Duv ${source.duv.toFixed(4)}`,
      ),
      el(
        'span',
        { class: 'muted' },
        source.rg > 101
          ? '红线整体在圆外：比参考光源更鲜艳（Rg > 100）。'
          : source.rg < 99
            ? '红线整体缩进圆内：颜色比参考光源更灰（Rg < 100）。'
            : '红线与圆几乎重合：颜色还原接近参考光源。',
      ),
    );
    plot.redraw();
  };
  controls.append(
    select(
      '光源',
      tm30.sources.map((s) => ({ id: s.id, name: s.name })),
      source.id,
      (id) => {
        source = tm30.sources.find((s) => s.id === id)!;
        update();
      },
    ),
  );
  update();
  return () => plot.destroy();
}

// ------------------------------------------------------------ camera vs CMF
function solveFit(camera: {
  start: number;
  r: number[];
  g: number[];
  b: number[];
}) {
  const offset = (camera.start - 380) / 5;
  const cc: Mat3 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    xc: Mat3 = [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
  camera.r.forEach((_, i) => {
    const c: Vec3 = [camera.r[i], camera.g[i], camera.b[i]];
    const k = i + offset;
    const x: Vec3 = [CMF.x[k], CMF.y[k], CMF.z[k]];
    for (let p = 0; p < 3; p++)
      for (let q = 0; q < 3; q++) {
        cc[p][q] += c[p] * c[q];
        xc[p][q] += x[p] * c[q];
      }
  });
  const inverse = invert(cc);
  const M = xc.map((row) =>
    [0, 1, 2].map(
      (q) =>
        row[0] * inverse[0][q] +
        row[1] * inverse[1][q] +
        row[2] * inverse[2][q],
    ),
  ) as Mat3;
  let error = 0,
    total = 0;
  const fitted = camera.r.map((_, i) => {
    const value = multiply(M, [camera.r[i], camera.g[i], camera.b[i]]);
    const k = i + offset;
    const target = [CMF.x[k], CMF.y[k], CMF.z[k]];
    value.forEach((v, axis) => {
      error += (v - target[axis]) ** 2;
      total += target[axis] ** 2;
    });
    return value;
  });
  return { M, fitted, offset, residual: Math.sqrt(error / total) };
}
function cameraFigure({ host, controls, readout }: FigureContext) {
  const names = Object.keys(CAMERAS);
  let name = names[0];
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const camera = CAMERAS[name];
      const fit = solveFit(camera);
      const half = (height - 10) / 2;
      const top = frame(width, half, LAMBDA, [0, 1.05], {
        ...spectralPad,
        bottom: 30,
      });
      const peak = Math.max(...camera.r, ...camera.g, ...camera.b);
      axes(ctx, top, {
        xTicks: ticks(400, 780, 50),
        yTicks: ticks(0, 1, 0.5),
        yLabel: '相机灵敏度（归一）',
        yFormat: (v) => v.toFixed(1),
      });
      (['r', 'g', 'b'] as const).forEach((c, i) =>
        polyline(
          ctx,
          top,
          series(
            camera[c].map((v) => v / peak),
            camera.start,
          ),
          SERIES[i],
          2,
        ),
      );
      label(ctx, name, top.left + 10, top.top + 14, INK.bright, 'left', 12);
      ctx.save();
      ctx.translate(0, half + 10);
      const all = [...CMF.x, ...CMF.y, ...CMF.z];
      const bottom = frame(
        width,
        half,
        LAMBDA,
        [Math.min(0, ...fit.fitted.flat()) - 0.05, Math.max(...all) * 1.08],
        spectralPad,
      );
      axes(ctx, bottom, {
        xTicks: ticks(400, 780, 50),
        yTicks: ticks(0, bottom.y[1], 0.5),
        xLabel: '波长 nm',
        yLabel: '配色函数',
        yFormat: (v) => v.toFixed(1),
      });
      spectrumBand(ctx, bottom);
      [CMF.x, CMF.y, CMF.z].forEach((values, i) => {
        polyline(ctx, bottom, series(values), SERIES[i] + '90', 1.6);
        polyline(
          ctx,
          bottom,
          fit.fitted.map(
            (v, k) => [camera.start + k * 5, v[i]] as [number, number],
          ),
          SERIES[i],
          2.2,
          [6, 4],
        );
      });
      label(
        ctx,
        '细实线：CIE x̄ȳz̄    虚线：相机灵敏度的最佳 3×3 线性组合',
        bottom.left + 10,
        bottom.top + 14,
        INK.text,
        'left',
        10,
      );
      ctx.restore();
      plot.canvas.dataset.camera = name;
    },
    '相机光谱灵敏度与人眼配色函数',
  );
  const update = () => {
    const camera = CAMERAS[name];
    const fit = solveFit(camera);
    info.replaceChildren(
      el('strong', {}, name),
      el(
        'span',
        {},
        `数据范围 ${camera.start}–${camera.start + (camera.r.length - 1) * 5} nm`,
      ),
      el('span', {}, `拟合残差 ${(fit.residual * 100).toFixed(1)}%`),
      el(
        'span',
        { class: 'muted' },
        '残差为 0 才满足 Luther 条件：那时相机与人眼看到的同色异谱完全一致，一个固定矩阵就能把相机 RGB 准确转成 XYZ。',
      ),
    );
    plot.redraw();
  };
  controls.append(
    segmented(
      '相机',
      names.map((n) => ({ id: n, name: n.replace(' (NPL)', '') })),
      name,
      (v) => {
        name = v;
        update();
      },
    ),
  );
  update();
  return () => plot.destroy();
}

const figures: FigureDef[] = [
  {
    id: 'cmf',
    number: 25,
    title: 'CIE 配色函数',
    caption: '波长游标扫过 x̄ȳz̄',
    highlight:
      '三条曲线描述任意光谱如何折算成 X、Y、Z。游标扫过时，右侧显示该波长单色光的三刺激值和颜色：ȳ 就是明视觉亮度曲线，在 555 nm 附近最高，两端的光几乎看不见。',
    note: 'CIE 1931 2° 标准观察者，5 nm 间隔。单色光都在 sRGB 色域之外，色样已归一并裁剪。',
    mount: cmfFigure('xyz'),
  },
  {
    id: 'rgb-cmf',
    number: 26,
    title: 'RGB 配色函数',
    caption: '带负值的原始实验数据',
    highlight:
      '用 700、546.1、435.8 nm 三个单色原色去匹配每个波长时，蓝绿一段怎么混都不够饱和，只能把红光加到待匹配的那一侧——于是 r̄ 出现负值。CIE 正是为了消除负值才定义了 XYZ。',
    note: 'Wright & Guild 1931 2° RGB 配色函数（Colour Science 数据集）。',
    mount: cmfFigure('rgb'),
  },
  {
    id: 'blackbody',
    number: 27,
    title: '黑体辐射',
    caption: '2000 K 到 10000 K 的光谱与白点',
    highlight:
      '色温升高时，光谱的峰值从红外一侧移进可见光并向蓝端倾斜，白点沿普朗克轨迹从橙红走向蓝白（右上角小图）。',
    note: '普朗克定律，c₂ = 1.4388×10⁻² m·K（CIE 15），每条曲线在 560 nm 处归一。',
    mount: blackbody,
  },
  {
    id: 'metamerism',
    number: 28,
    title: '同色异谱',
    caption: 'D65 下相同，A 光源下不同',
    highlight:
      '两条反射光谱形状完全不同，在 D65 下的 XYZ 却完全相等（ΔE ≈ 0）。切换到白炽灯 A 光源，人眼适应新白点之后，两个样本立刻分开。',
    note: '样本 2 = 样本 1 + 一条「同色异谱黑」：对 D65 加权配色函数正交的扰动，因此在 D65 下不改变 XYZ。光谱为构造示例，不是实测材料。A 光源下的颜色经 Bradford 适配到 D65 显示。',
    mount: metamerism,
  },
  {
    id: 'tm30',
    number: 29,
    title: 'TM-30 色矢量图',
    caption: '99 条样本光谱的色相偏移',
    highlight:
      '每个箭头从参考光源（虚线圆）指向被测光源下同一色相区间的平均颜色。箭头朝外表示更鲜艳，朝内表示更灰，沿圆周方向表示色相偏移。高压钠灯（HP1）被压成扁长的一条，大部分色相都明显变灰；三色 LED（LED-RGB1）则把红色和青绿推到圆外。',
    note: 'ANSI/IES TM-30-18，用 99 条 CES 样本光谱在 CAM02-UCS 中离线计算（Colour Science 0.4.4），网页只负责绘图。扇区底色仅为示意。',
    mount: tm30Figure,
  },
  {
    id: 'luther',
    number: 30,
    title: '相机灵敏度与 Luther 条件',
    caption: '相机 RGB 能否线性变成 XYZ',
    highlight:
      '上图是真实相机的 RGB 光谱灵敏度，下图把它们的最佳线性组合（虚线）叠在人眼配色函数上。两者对不齐的地方，就是相机与人眼「看法不同」的地方：无论用什么 3×3 矩阵，都会有颜色被转错。',
    note: '相机数据为 NPL 测量（Colour Science 数据集）；Sigma SD Merrill 只有 400–680 nm，拟合仅在测量范围内进行。',
    mount: cameraFigure,
  },
];
export const groups: FigureGroup[] = [{ name: '光谱', figures }];
