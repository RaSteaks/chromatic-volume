import Color from 'colorjs.io';
import tm30 from '../data/tm30.json' with { type: 'json' };
import { el, toggle } from '../dom';
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
  cctDuv,
  CMF,
  CMF_10,
  D65_SPD,
  emissionToXYZ,
  metamericPair,
  reflectanceToXYZ,
  RGB_CMF,
  spectralLocus,
  WAVELENGTHS,
  xyToUvPrime,
} from '../science/spectral';
import { mixing } from './mixing';
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
  probe,
  readoutTable,
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
    const ten = [CMF_10.x, CMF_10.y, CMF_10.z];
    // Reserve space for both observers so toggling the overlay keeps the
    // same scale and the taller 10° z̄ peak remains fully visible.
    const all = [
      ...curves.flatMap((c) => c.values),
      ...(kind === 'xyz' ? ten.flat() : []),
    ];
    const range: [number, number] = [
      Math.min(0, ...all) * 1.1,
      Math.max(...all) * 1.08,
    ];
    let lambda = 520;
    let showTen = false;
    let lastFrame: Frame | null = null;
    const info = el('div', { class: 'readout-list' });
    readout.append(info);
    const plot = createCanvas(
      host,
      (ctx, width, height) => {
        const f = frame(width, height, LAMBDA, range, spectralPad);
        lastFrame = f;
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
        if (showTen)
          curves.forEach((c, i) =>
            polyline(ctx, f, series(ten[i]), c.color + 'a0', 1.4, [5, 3]),
          );
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
      const uv = xyToUvPrime([x, y]);
      const tenValues = ten.map((values) => at(values, lambda)) as Vec3;
      const [x10, y10] = xyzToXy(tenValues);
      info.replaceChildren(
        el('strong', {}, `λ = ${lambda.toFixed(0)} nm`),
        readoutTable(
          kind === 'xyz' && showTen ? ['', '2°', '10°'] : ['', '值'],
          curves.map((c, i) =>
            kind === 'xyz' && showTen
              ? [c.name, values[i].toFixed(5), tenValues[i].toFixed(5)]
              : [c.name, values[i].toFixed(5)],
          ),
        ),
        el('span', {}, `x ${x.toFixed(4)}  y ${y.toFixed(4)}`),
        el('span', {}, `u′ ${uv[0].toFixed(4)}  v′ ${uv[1].toFixed(4)}`),
        ...(showTen && kind === 'xyz'
          ? [el('span', {}, `10°：x ${x10.toFixed(4)}  y ${y10.toFixed(4)}`)]
          : []),
        swatch('色样', chromaticityColor(xyz), '归一亮度，sRGB 外已裁剪'),
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
    if (kind === 'xyz')
      controls.append(
        toggle('cmf-10', '叠加 CIE 1964 10°', false, (on) => {
          showTen = on;
          update();
        }),
      );
    const stopProbe = probe(plot.canvas, (p) => {
      if (!p || !lastFrame) return;
      play.pause();
      const value = Math.round(Math.min(Math.max(lastFrame.ix(p.x), 380), 780));
      play.set(value);
    });
    update();
    return () => {
      stopProbe();
      play.destroy();
      plot.destroy();
    };
  };
}

// ------------------------------------------------------------ blackbody
/** Wien displacement constant, nm·K (CODATA 2018). */
const WIEN = 2.897771955e6;
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
    const peak = WIEN / temperature;
    const result = cctDuv([x, y]);
    const uv = xyToUvPrime([x, y]);
    info.replaceChildren(
      el('strong', {}, `T = ${Math.round(temperature)} K`),
      el('span', {}, `${(1e6 / temperature).toFixed(1)} mired`),
      el(
        'span',
        {},
        `λmax ${peak.toFixed(0)} nm${peak > 780 || peak < 380 ? '（可见范围外）' : ''}`,
      ),
      el('span', {}, `x ${x.toFixed(4)}  y ${y.toFixed(4)}`),
      el('span', {}, `u′ ${uv[0].toFixed(4)}  v′ ${uv[1].toFixed(4)}`),
      el(
        'span',
        {},
        result
          ? `CCT 反算 ${Math.round(result.cct)} K  Duv ${result.duv.toFixed(5)}`
          : 'CCT 超出计算范围（1000–100000 K）',
      ),
      swatch('色度（归一亮度）', chromaticityColor(xyz)),
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
        {},
        `样本 1 xy ${xyzToXy(a)
          .map((v) => v.toFixed(4))
          .join(', ')}`,
      ),
      el(
        'span',
        {},
        `样本 2 xy ${xyzToXy(b)
          .map((v) => v.toFixed(4))
          .join(', ')}`,
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
    const rcs = source.rcs;
    const worst = rcs.reduce(
      (best, v, i) => (Math.abs(v) > Math.abs(rcs[best]) ? i : best),
      0,
    );
    const pct = (v: number) =>
      `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(1)}%`;
    info.replaceChildren(
      el('strong', {}, source.name),
      readoutTable(
        ['', '值'],
        [
          ['Rf', source.rf.toFixed(0)],
          ['Rg', source.rg.toFixed(0)],
          ['CCT', `${Math.round(source.cct)} K`],
          ['Duv', source.duv.toFixed(4)],
          ['Rcs,h1', pct(rcs[0])],
          [`Rcs,h${worst + 1}（|最大|）`, pct(rcs[worst])],
        ],
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
  const channelError = [0, 0, 0],
    channelTotal = [0, 0, 0];
  const fitted = camera.r.map((_, i) => {
    const value = multiply(M, [camera.r[i], camera.g[i], camera.b[i]]);
    const k = i + offset;
    const target = [CMF.x[k], CMF.y[k], CMF.z[k]];
    value.forEach((v, axis) => {
      error += (v - target[axis]) ** 2;
      total += target[axis] ** 2;
      channelError[axis] += (v - target[axis]) ** 2;
      channelTotal[axis] += target[axis] ** 2;
    });
    return value;
  });
  return {
    M,
    fitted,
    offset,
    residual: Math.sqrt(error / total),
    channels: channelError.map((e, i) => Math.sqrt(e / channelTotal[i])),
  };
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
      readoutTable(
        ['', '相对 RMS 残差'],
        [
          ['x̄', `${(fit.channels[0] * 100).toFixed(1)}%`],
          ['ȳ', `${(fit.channels[1] * 100).toFixed(1)}%`],
          ['z̄', `${(fit.channels[2] * 100).toFixed(1)}%`],
          ['合计', `${(fit.residual * 100).toFixed(1)}%`],
        ],
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
    conditions: 'CIE 1931 2° · 可叠加 CIE 1964 10° · 380–780 nm / 5 nm',
    grade: 'reference',
    highlight:
      'x̄ 在 440 nm 附近的次峰让短波端色度几乎不动：380–420 nm 的光谱轨迹在 xy 中挤在 (0.17, 0.005) 附近。ȳ 即 V(λ)；叠加的 10° 函数中 ȳ₁₀ 不是光度函数。',
    provenance: {
      data: 'CIE 1931 2° 与 CIE 1964 10° 标准观察者（Colour Science 0.4.4）',
      domain: '线性插值读取 5 nm 网格之间的波长',
      approximation: '单色光都在 sRGB 外，色样按最大通道归一后裁剪',
      reference: 'CIE 015:2018',
    },
    mount: cmfFigure('xyz'),
  },
  {
    id: 'rgb-cmf',
    number: 26,
    title: 'RGB 配色函数',
    conditions: 'Wright & Guild 1931 · 2° · 原色 700 / 546.1 / 435.8 nm',
    grade: 'reference',
    highlight:
      'r̄ 在 440–545 nm 为负（极值约 515 nm），ḡ 在 400–435 nm、b̄ 在 550–625 nm 也有小幅负值：任何三个真实原色都无法匹配全部光谱色。XYZ 是对这组函数的线性变换，选择条件是全部非负且 ȳ = V(λ)。',
    provenance: {
      data: 'Wright & Guild 1931 2° RGB CMFs（Colour Science 0.4.4）',
      domain: '原色单位按 CIE 1931 约定（等能白下三刺激值相等）',
      reference: 'CIE 1931；Wright 1928–29；Guild 1931',
    },
    mount: cmfFigure('rgb'),
  },
  {
    id: 'blackbody',
    number: 27,
    title: '黑体辐射',
    conditions: 'Planck · c₂ = 1.4388×10⁻² m·K · 560 nm 归一 · 2000–10000 K',
    grade: 'reference',
    highlight:
      'Wien 峰 λmax = b/T：约 3715 K 以下峰值在 780 nm 外，约 7625 K 以上移出 380 nm，可见区内只看到峰的一侧。色温轴按 mired（10⁶/T）近似感知均匀，高色温端相同的开尔文差对应的色度变化越来越小。',
    provenance: {
      data: '普朗克公式直接计算',
      domain:
        'CIE 1931 2°；色度由 380–780 nm / 5 nm 积分；CCT 反算用 CIE 1960 uv 最近点',
      reference: 'CIE 015:2018（c₂ 取 ITS-90 值）',
    },
    mount: blackbody,
  },
  {
    id: 'metamerism',
    number: 28,
    title: '同色异谱',
    conditions: 'D65 ↔ A · Bradford 适配到 D65 · ΔE2000',
    grade: 'illustrative',
    highlight:
      '样本 2 = 样本 1 + metameric black（与 D65 加权配色函数正交的光谱分量），因此只在 D65 下不可见；换成 A，这个分量产生非零三刺激值，适配后的 ΔE00 即这对样本的照明同色异谱程度。',
    provenance: {
      data: '构造光谱，不是实测材料',
      domain: 'CIE 1931 2°；A 光源下的颜色经 Bradford 适配到 D65 显示',
      reference: 'Wyszecki & Stiles, Color Science, 2nd ed.（metameric black）',
    },
    mount: metamerism,
  },
  {
    id: 'tm30',
    number: 29,
    title: 'TM-30 色矢量图',
    conditions: 'ANSI/IES TM-30-18 · 99 CES · CAM02-UCS · 16 色相区间',
    grade: 'reference',
    highlight:
      '箭头是每个色相区间内被测光源相对参考光源的平均 a′b′ 偏移，按参考半径归一。Rg 是两个多边形的面积比，Rf 来自 99 个样本的平均 ΔE′；HP1 与 LED-RGB1 的 Rg 分居两端，但 Rf 都偏低。',
    provenance: {
      data: '99 条 CES 光谱与各光源 SPD，Colour Science 0.4.4 离线计算',
      domain:
        'CIE 1964 10° · CAM02-UCS · 参考光源按 CCT 取黑体或 CIE D 系列（4000–5000 K 混合）',
      approximation: '扇区底色仅示意',
      reference: 'ANSI/IES TM-30-18',
    },
    mount: tm30Figure,
  },
  {
    id: 'luther',
    number: 30,
    title: '相机灵敏度与 Luther 条件',
    conditions: 'NPL 实测灵敏度 · 对 x̄ȳz̄ 的最小二乘 3×3 拟合',
    grade: 'reference',
    highlight:
      '残差不为零即不满足 Luther–Ives 条件：不存在把相机 RGB 精确变到 XYZ 的固定矩阵，某些对人眼同色异谱的光谱在相机中不同，反之亦然。右侧按通道列出残差。',
    provenance: {
      data: 'NPL 相机光谱灵敏度（Colour Science 0.4.4）',
      domain: '逐波长、等权最小二乘；目标为 CIE 1931 2°',
      approximation:
        '光谱拟合不等于实际相机矩阵（后者按训练色样与光源优化）；Sigma SD Merrill 仅 400–680 nm，在测量范围内拟合',
      reference: 'Luther 1927；Ives 1915',
    },
    mount: cameraFigure,
  },
  {
    id: 'mixing',
    number: 31,
    title: '加色混合与减色混合',
    conditions: '高斯光谱 · 单常数 Kubelka–Munk · D65 · CIE 1931 2°',
    grade: 'illustrative',
    highlight:
      '光谱相加时，混合色的色度严格落在两光色度的连线上（重心规则）。颜料混合的是 K/S，反射率非线性变化，混合色偏离连线且 Y 低于两者的线性插值。',
    provenance: {
      data: '理想化高斯光源与平滑反射率曲线，不对应真实颜料',
      domain: '颜料在 D65 下积分；偏离距离在 xy 中计算',
      approximation: '单常数 Kubelka–Munk，忽略表面反射（Saunderson 修正）',
      reference: 'Kubelka & Munk 1931；Grassmann 1853',
    },
    mount: mixing,
  },
];
export const groups: FigureGroup[] = [{ name: '光谱', figures }];
