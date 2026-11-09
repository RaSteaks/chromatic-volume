import { el, slider } from '../dom';
import type { Vec3 } from '../model';
import { bayerChannel, simulateBayer } from '../science/bayer';
import {
  D65_SPD,
  emissionToXYZ,
  kubelkaMunkMix,
  reflectanceToXYZ,
  WAVELENGTHS,
  type Spectrum,
} from '../science/spectral';
import '../targets';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import {
  axes,
  createCanvas,
  css,
  displayRgb,
  frame,
  INK,
  label,
  polyline,
  segmented,
  SERIES,
  ticks,
} from './plot';

type Image = Vec3[][];
const clip = (v: number) => Math.min(Math.max(v, 0), 1);

/** Procedural test chart (sRGB-encoded): saturated edges, a thin line pattern and a soft ramp. */
function testImage(width: number, height: number): Image {
  return Array.from({ length: height }, (_, y) =>
    Array.from({ length: width }, (_, x) => {
      const u = x / (width - 1),
        v = y / (height - 1);
      let rgb: Vec3 = [0.12 + 0.25 * u, 0.16 + 0.1 * v, 0.55 - 0.2 * u];
      const dx = x - width * 0.3,
        dy = y - height * 0.45;
      if (dx * dx + dy * dy < (height * 0.3) ** 2) rgb = [0.92, 0.12, 0.1];
      if (
        x > width * 0.55 &&
        x < width * 0.8 &&
        y > height * 0.12 &&
        y < height * 0.52
      )
        rgb = [0.12, 0.75, 0.25];
      if (Math.abs(y - (height * 0.75 - (x - width * 0.5) * 0.35)) < 0.8)
        rgb = [0.98, 0.9, 0.15];
      if (x > width * 0.6 && y > height * 0.62)
        rgb = x % 2 === 0 ? [0.95, 0.95, 0.95] : [0.08, 0.08, 0.1];
      return rgb;
    }),
  );
}
function drawImage(
  ctx: CanvasRenderingContext2D,
  image: Image,
  x0: number,
  y0: number,
  size: number,
  grid = true,
) {
  image.forEach((row, y) =>
    row.forEach((rgb, x) => {
      ctx.fillStyle = css(rgb);
      ctx.fillRect(x0 + x * size, y0 + y * size, size + 0.5, size + 0.5);
    }),
  );
  if (grid && size >= 6) {
    ctx.strokeStyle = '#00000038';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let x = 0; x <= image[0].length; x++) {
      ctx.moveTo(Math.round(x0 + x * size) + 0.5, y0);
      ctx.lineTo(Math.round(x0 + x * size) + 0.5, y0 + image.length * size);
    }
    for (let y = 0; y <= image.length; y++) {
      ctx.moveTo(x0, Math.round(y0 + y * size) + 0.5);
      ctx.lineTo(x0 + image[0].length * size, Math.round(y0 + y * size) + 0.5);
    }
    ctx.stroke();
  }
}
/** Fit `cols × rows` panels of `w × h` pixels into the canvas. */
function layout(
  width: number,
  height: number,
  w: number,
  h: number,
  cols: number,
  rows: number,
) {
  const gap = 18,
    titleSpace = 22;
  const size = Math.max(
    1,
    Math.floor(
      Math.min(
        (width - gap * (cols + 1)) / (cols * w),
        (height - gap * (rows + 1) - titleSpace * rows) / (rows * h),
      ),
    ),
  );
  const totalW = cols * w * size + (cols - 1) * gap,
    totalH = rows * (h * size + titleSpace) + (rows - 1) * gap;
  const left = (width - totalW) / 2,
    top = (height - totalH) / 2;
  return {
    size,
    at: (col: number, row: number) => ({
      x: left + col * (w * size + gap),
      y: top + row * (h * size + titleSpace + gap) + titleSpace,
    }),
  };
}

// ---------------------------------------------------------------- 34 chroma
const KR = 0.2126,
  KB = 0.0722,
  KG = 1 - KR - KB;
const toYcc = ([r, g, b]: Vec3): Vec3 => {
  const y = KR * r + KG * g + KB * b;
  return [y, (b - y) / 1.8556, (r - y) / 1.5748];
};
const fromYcc = ([y, cb, cr]: Vec3): Vec3 => {
  const r = y + 1.5748 * cr,
    b = y + 1.8556 * cb;
  return [r, (y - KR * r - KB * b) / KG, b].map(clip) as Vec3;
};
const schemes = [
  { id: '444', name: '4:4:4', block: [1, 1], rate: 3 },
  { id: '422', name: '4:2:2', block: [2, 1], rate: 2 },
  { id: '420', name: '4:2:0', block: [2, 2], rate: 1.5 },
] as const;
function subsampling({ host, controls, readout }: FigureContext) {
  const W = 24,
    H = 16;
  const source = testImage(W, H);
  const ycc = source.map((row) => row.map(toYcc));
  let scheme: (typeof schemes)[number] = schemes[2];
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const [bw, bh] = scheme.block;
      const chroma = ycc.map((row, y) =>
        row.map((_, x) => {
          const x0 = x - (x % bw),
            y0 = y - (y % bh);
          let cb = 0,
            cr = 0,
            n = 0;
          for (let j = y0; j < Math.min(y0 + bh, H); j++)
            for (let i = x0; i < Math.min(x0 + bw, W); i++) {
              cb += ycc[j][i][1];
              cr += ycc[j][i][2];
              n++;
            }
          return [cb / n, cr / n] as [number, number];
        }),
      );
      const luma = ycc.map((row) => row.map(([y]) => [y, y, y] as Vec3));
      const chromaOnly = chroma.map((row) =>
        row.map(([cb, cr]) => fromYcc([0.6, cb, cr])),
      );
      const rebuilt = ycc.map((row, y) =>
        row.map(([l], x) => fromYcc([l, ...chroma[y][x]])),
      );
      const L = layout(width, height, W, H, 2, 2);
      const panels: [string, Image, number, number][] = [
        ['原图', source, 0, 0],
        [`重建（${scheme.name}）`, rebuilt, 1, 0],
        ['亮度 Y′：每个像素都保留', luma, 0, 1],
        [`色度 Cb/Cr：每 ${bw}×${bh} 像素共用一个`, chromaOnly, 1, 1],
      ];
      for (const [title, image, col, row] of panels) {
        const { x, y } = L.at(col, row);
        label(ctx, title, x, y - 11, INK.bright, 'left', 11);
        drawImage(ctx, image, x, y, L.size);
        if (col === 1 && row === 1 && scheme.id !== '444') {
          ctx.strokeStyle = '#ffffffa0';
          ctx.lineWidth = 1.2;
          for (let j = 0; j < H; j += bh)
            for (let i = 0; i < W; i += bw) {
              ctx.strokeRect(
                x + i * L.size + 0.5,
                y + j * L.size + 0.5,
                bw * L.size - 1,
                bh * L.size - 1,
              );
              ctx.fillStyle = '#ffffff';
              ctx.beginPath();
              ctx.arc(
                x + (i + bw / 2) * L.size,
                y + (j + bh / 2) * L.size,
                Math.max(1.5, L.size * 0.12),
                0,
                Math.PI * 2,
              );
              ctx.fill();
            }
        }
      }
      plot.canvas.dataset.scheme = scheme.id;
    },
    '色度抽样网格',
  );
  const update = () => {
    info.replaceChildren(
      el('strong', {}, scheme.name),
      el(
        'span',
        {},
        `每像素 ${scheme.rate} 个样本，数据量为 4:4:4 的 ${Math.round((scheme.rate / 3) * 100)}%`,
      ),
      el(
        'span',
        { class: 'muted' },
        '看红色圆盘和绿色方块的边缘：亮度依旧锐利，颜色却糊成一格一格。',
      ),
    );
    plot.redraw();
  };
  controls.append(
    segmented(
      '抽样方式',
      schemes.map((s) => ({ id: s.id, name: s.name })),
      scheme.id,
      (v) => {
        scheme = schemes.find((s) => s.id === v)!;
        update();
      },
    ),
  );
  update();
  return () => plot.destroy();
}

// ---------------------------------------------------------------- 35 bit depth
function bitDepth({ host, controls, readout }: FigureContext) {
  let range: [number, number] = [0.2, 0.3];
  let stretch = true;
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const quantize = (v: number, bits: number) => {
    const levels = 2 ** bits - 1;
    return Math.round(v * levels) / levels;
  };
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const left = 70,
        right = 24,
        w = width - left - right;
      const rowH = Math.min(70, (height - 230) / 2);
      const rows: [string, number][] = [
        ['8-bit', 8],
        ['10-bit', 10],
      ];
      const n = Math.max(2, Math.floor(w));
      rows.forEach(([name, bits], r) => {
        const y = 30 + r * (rowH + 24);
        for (let i = 0; i < n; i++) {
          const v = range[0] + ((range[1] - range[0]) * i) / (n - 1);
          let q = quantize(v, bits);
          if (stretch) q = (q - range[0]) / (range[1] - range[0]);
          ctx.fillStyle = css([q, q, q].map(clip) as Vec3);
          ctx.fillRect(left + i, y, 1.5, rowH);
        }
        label(ctx, name, left - 10, y + rowH / 2, INK.bright, 'right', 12);
      });
      // Staircase of code values over a short stretch of the ramp.
      const top = 30 + 2 * (rowH + 24) + 10;
      const f = frame(width, height - top, [0, 1], [0, 1], {
        left,
        right,
        top: 10,
        bottom: 40,
      });
      ctx.save();
      ctx.translate(0, top);
      axes(ctx, f, {
        xTicks: ticks(0, 1, 0.25),
        yTicks: ticks(0, 1, 0.25),
        xLabel: '渐变位置（局部放大）',
        yLabel: '编码值',
        xFormat: (v) => `${Math.round(v * 100)}%`,
        yFormat: () => '',
      });
      const window: [number, number] = [
        range[0],
        range[0] + (range[1] - range[0]) * 0.08,
      ];
      const norm = (v: number) => (v - window[0]) / (window[1] - window[0]);
      [8, 10].forEach((bits, k) => {
        const points: [number, number][] = [];
        for (let i = 0; i <= 400; i++) {
          const v = window[0] + ((window[1] - window[0]) * i) / 400;
          points.push([i / 400, norm(quantize(v, bits))]);
        }
        polyline(ctx, f, points, k ? SERIES[1] : SERIES[3], 2);
      });
      polyline(
        ctx,
        f,
        [
          [0, 0],
          [1, 1],
        ],
        '#ffffff40',
        1,
        [3, 4],
      );
      label(ctx, '8-bit', f.left + 10, f.top + 12, SERIES[3], 'left', 11);
      label(ctx, '10-bit', f.left + 60, f.top + 12, SERIES[1], 'left', 11);
      ctx.restore();
      plot.canvas.dataset.stretch = String(stretch);
    },
    '8-bit 与 10-bit 渐变',
  );
  const update = () => {
    const steps = (bits: number) =>
      Math.round((range[1] - range[0]) * (2 ** bits - 1)) + 1;
    info.replaceChildren(
      el(
        'strong',
        {},
        `编码值 ${range[0].toFixed(2)} → ${range[1].toFixed(2)}`,
      ),
      el('span', {}, `8-bit：${steps(8)} 级`),
      el('span', {}, `10-bit：${steps(10)} 级`),
      el(
        'span',
        { class: 'muted' },
        stretch
          ? '已把这段范围放大到全黑—全白，台阶宽度按比例放大，便于在 8-bit 屏幕上看清。'
          : '未放大时，屏幕本身也是 8-bit 输出，10-bit 渐变会被再次量化，两行看起来几乎一样。',
      ),
    );
    plot.redraw();
  };
  controls.append(
    segmented(
      '范围',
      [
        { id: 'narrow', name: '暗部窄范围 0.20–0.30' },
        { id: 'full', name: '全范围 0–1' },
      ] as const,
      'narrow',
      (v) => {
        range = v === 'narrow' ? [0.2, 0.3] : [0, 1];
        update();
      },
    ),
    segmented(
      '显示',
      [
        { id: 'stretch', name: '放大对比' },
        { id: 'plain', name: '原样显示' },
      ] as const,
      'stretch',
      (v) => {
        stretch = v === 'stretch';
        update();
      },
    ),
  );
  update();
  return () => plot.destroy();
}

// ---------------------------------------------------------------- 36 Bayer
const stages = [
  { id: 'source', name: '原图' },
  { id: 'mosaic', name: '拜耳马赛克' },
  { id: 'demosaic', name: '双线性去马赛克' },
  { id: 'error', name: '误差 ×4' },
] as const;
function bayer({ host, controls, readout }: FigureContext) {
  const W = 28,
    H = 18;
  const source = testImage(W, H);
  const simulation = simulateBayer(source);
  let stage: (typeof stages)[number]['id'] = 'mosaic';
  const images = {
    source,
    mosaic: simulation.mosaic,
    demosaic: simulation.rebuilt,
    error: simulation.error,
  };
  readout.append(
    el(
      'div',
      { class: 'readout-list' },
      el('strong', {}, 'RGGB 排列'),
      el('span', {}, '每个感光点只记录一种颜色：一半是绿，红、蓝各四分之一。'),
      el(
        'span',
        {},
        `去马赛克 PSNR（sRGB 编码域）${simulation.psnr.toFixed(1)} dB`,
      ),
      el(
        'span',
        { class: 'muted' },
        '误差集中在边缘和右下角的细条纹：插值把相邻像素的颜色混了进来，出现伪色和拉链状纹理。',
      ),
    ),
  );
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const L = layout(width, height, W, H, 1, 1);
      const { x, y } = L.at(0, 0);
      label(
        ctx,
        stages.find((s) => s.id === stage)!.name,
        x,
        y - 11,
        INK.bright,
        'left',
        12,
      );
      drawImage(ctx, images[stage], x, y, L.size);
      if (stage === 'mosaic' && L.size >= 14) {
        ctx.font = `${Math.round(L.size * 0.38)}px ui-monospace, monospace`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffffa0';
        simulation.mosaic.forEach((row, j) =>
          row.forEach((_, i) => {
            if (i < 4 && j < 4)
              ctx.fillText(
                'RGB'[bayerChannel(i, j)],
                x + (i + 0.5) * L.size,
                y + (j + 0.5) * L.size,
              );
          }),
        );
      }
      plot.canvas.dataset.stage = stage;
    },
    '拜耳阵列与去马赛克',
  );
  controls.append(
    segmented('阶段', stages, stage, (v) => {
      stage = v;
      plot.redraw();
    }),
  );
  return () => plot.destroy();
}

// ---------------------------------------------------------------- 37 mixing
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
function mixing({ host, controls, readout }: FigureContext) {
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
    const names = pair.lights.map((k) => lights[k].name).join(' + ');
    const pigmentNames = pair.pigments.map((k) => pigments[k].name).join(' + ');
    info.replaceChildren(
      el(
        'strong',
        {},
        `比例 ${Math.round((1 - ratio) * 100)} : ${Math.round(ratio * 100)}`,
      ),
      el('span', {}, `光：${names}，光谱相加，越混越亮。`),
      el(
        'span',
        {},
        `颜料：${pigmentNames}，各自吸收一部分光谱，只剩两者都反射的波段，越混越暗。`,
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

const figures: FigureDef[] = [
  {
    id: 'subsampling',
    number: 34,
    title: '色度抽样',
    caption: '4:4:4、4:2:2、4:2:0',
    highlight:
      '视频把亮度 Y′ 和色度 Cb/Cr 分开存。人眼对颜色细节不敏感，所以 4:2:2 让每两个像素共用一份色度，4:2:0 让每 2×2 个像素共用一份：数据量降到一半，而边缘的亮度轮廓几乎不变，只有颜色变成了块。',
    note: 'BT.709 系数作用于 sRGB 编码值；色度取块内平均，重建时按最近邻放大。真实编码器会使用更好的滤波，块感比这里轻。测试图为程序生成。',
    mount: subsampling,
  },
  {
    id: 'bit-depth',
    number: 35,
    title: '位深与色带',
    caption: '8-bit 与 10-bit 渐变',
    highlight:
      '同一段暗部渐变，8-bit 只有约 26 级，10-bit 有约 103 级。放大对比后，8-bit 的台阶宽度是 10-bit 的 4 倍——这就是天空、暗场里出现色带的原因。',
    note: '大多数屏幕本身只输出 8-bit，因此这里先量化、再把局部范围拉伸到全黑—全白来模拟差别；「原样显示」时两行几乎相同属于正常现象。',
    mount: bitDepth,
  },
  {
    id: 'bayer',
    number: 36,
    title: '拜耳阵列与去马赛克',
    caption: '每个感光点只记录一种颜色',
    highlight:
      '传感器上每个像素只透过一种颜色的滤镜（RGGB）。切到「拜耳马赛克」看原始数据，再切到「去马赛克」：缺失的两个通道由邻居插值补回。平坦区域几乎完美，锐利边缘和细条纹处会出现伪色。',
    note: '程序生成的 sRGB 测试图先解码为线性光，再进行 RGGB 采样与双线性去马赛克，显示时编码回 sRGB。误差 ×4 与 PSNR 均在 sRGB 编码域计算。真实相机与 RAW 软件还会使用更复杂的自适应算法。',
    mount: bayer,
  },
  {
    id: 'mixing',
    number: 37,
    title: '光的混合与颜料混合',
    caption: '加色与减色',
    highlight:
      '左边是两束光叠加：光谱相加，红光加绿光得到黄色，越混越亮。右边是两种颜料调和：每种颜料吸收掉一部分波长，混合后只剩两者都反射的部分，黄加青得到绿色，而且越混越暗。',
    note: '示意：光源为理想化的高斯光谱，颜料为理想化的平滑反射率曲线，按单常数 Kubelka–Munk 模型混合，不对应真实颜料。',
    mount: mixing,
  },
];
export const groups: FigureGroup[] = [{ name: '像素', figures }];
