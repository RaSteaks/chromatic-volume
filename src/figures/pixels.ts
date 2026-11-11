import { el } from '../dom';
import type { Vec3 } from '../model';
import { bayerChannel, simulateBayer } from '../science/bayer';
import '../targets';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import {
  axes,
  codeLimits,
  codeRanges,
  codeSpan,
  createCanvas,
  css,
  frame,
  INK,
  label,
  polyline,
  readoutTable,
  segmented,
  SERIES,
  ticks,
  type CodeRange,
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
const decode = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
/** Relative luminance of an sRGB-encoded pixel. */
const linearY = ([r, g, b]: Vec3) =>
  KR * decode(r) + KG * decode(g) + KB * decode(b);
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
  const reconstruct = () => {
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
    const rebuilt = ycc.map((row, y) =>
      row.map(([l], x) => fromYcc([l, ...chroma[y][x]])),
    );
    return { chroma, rebuilt };
  };
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const [bw, bh] = scheme.block;
      const { chroma, rebuilt } = reconstruct();
      const luma = ycc.map((row) => row.map(([y]) => [y, y, y] as Vec3));
      const chromaOnly = chroma.map((row) =>
        row.map(([cb, cr]) => fromYcc([0.6, cb, cr])),
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
    // Non-constant luminance: Y′ is kept, but linear Y of the rebuilt pixels changes.
    const { rebuilt } = reconstruct();
    let worst = 0,
      total = 0,
      count = 0;
    source.forEach((row, y) =>
      row.forEach((rgb, x) => {
        const error = Math.abs(linearY(rebuilt[y][x]) - linearY(rgb));
        worst = Math.max(worst, error);
        total += error;
        if (error > 0.01) count++;
      }),
    );
    info.replaceChildren(
      el('strong', {}, scheme.name),
      el(
        'span',
        {},
        `${scheme.rate} 样本/像素，数据量为 4:4:4 的 ${Math.round((scheme.rate / 3) * 100)}%`,
      ),
      readoutTable(
        ['线性亮度 Y 误差', ''],
        [
          ['最大', `${(worst * 100).toFixed(1)}%`],
          ['平均', `${((total / (W * H)) * 100).toFixed(2)}%`],
          ['> 1% 的像素', `${count} / ${W * H}`],
        ],
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
  let codeRange: CodeRange = 'full';
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  /** Quantize a normalized signal to n-bit codes in the chosen range and back. */
  const quantize = (v: number, bits: number) => {
    const [black, white] = codeLimits(bits, codeRange);
    return (Math.round(black + v * (white - black)) - black) / (white - black);
  };
  const codes = (v: number, bits: number) => {
    const [black, white] = codeLimits(bits, codeRange);
    return Math.round(black + v * (white - black));
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
    const row = (bits: number) => {
      const [lo, hi] = [codes(range[0], bits), codes(range[1], bits)];
      return [
        `${bits}-bit`,
        `${lo}–${hi}`,
        String(hi - lo + 1),
        `${(100 / codeSpan(bits, codeRange)).toFixed(3)}%`,
      ];
    };
    info.replaceChildren(
      el(
        'strong',
        {},
        `信号 ${range[0].toFixed(2)}–${range[1].toFixed(2)} · ${codeRange === 'full' ? 'Full' : 'Legal'} range`,
      ),
      readoutTable(['', '码值', '级数', '每级'], [row(8), row(10)]),
      el(
        'span',
        { class: 'muted' },
        stretch
          ? '显示前把该区间拉伸到全黑—全白，台阶按比例放大。'
          : '未拉伸：屏幕输出通常为 8-bit，10-bit 行会被再次量化。',
      ),
    );
    plot.redraw();
  };
  controls.append(
    segmented('码值范围', codeRanges, codeRange, (v) => {
      codeRange = v;
      update();
    }),
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
      el('strong', {}, 'RGGB · 采样率 G 1/2，R、B 各 1/4'),
      el(
        'span',
        {},
        `去马赛克 PSNR（sRGB 编码域）${simulation.psnr.toFixed(1)} dB`,
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

const figures: FigureDef[] = [
  {
    id: 'subsampling',
    number: 35,
    title: '色度抽样',
    conditions: 'BT.709 Y′CbCr（非恒定亮度）· 块平均 · 最近邻重建',
    grade: 'illustrative',
    highlight:
      'Y′ 一个像素都没改，重建后的线性亮度 Y 却变了：Y′ 由非线性 R′G′B′ 算出，部分亮度信息留在 Cb/Cr 中，色度被平均后这部分随之丢失。误差集中在饱和色的边缘，这就是非恒定亮度编码的固有缺陷，BT.2020 的 YcCbcCrc 正为此而设。',
    provenance: {
      data: '程序生成的测试图',
      domain:
        'BT.709 系数作用于 sRGB 编码值；亮度误差在解码后的线性 sRGB 中计算',
      approximation:
        '下采样为块平均，上采样为最近邻；实际编码器的滤波器使块感更轻，但亮度误差机制相同',
      reference:
        'ITU-R BT.709、BT.2020；Poynton, Digital Video and HD, 2nd ed.',
    },
    mount: subsampling,
  },
  {
    id: 'bit-depth',
    number: 36,
    title: '位深与色带',
    conditions: '均匀量化 · 8 / 10-bit · Full / Legal range',
    grade: 'illustrative',
    highlight:
      '同一段信号，10-bit 的级数是 8-bit 的 4 倍；Legal range 只用 219/255 的码字，同一区间的级数少约 14%，台阶相应变宽。拉伸显示时台阶宽度与每级的信号步长成正比。',
    provenance: {
      domain:
        '对归一化信号直接量化；Legal range 取 BT.709 / BT.2100 窄范围 16–235（8-bit）、64–940（10-bit）',
      approximation:
        '屏幕通常只输出 8-bit，因此先量化再拉伸局部范围模拟差别；未加抖动',
      reference: 'ITU-R BT.709、BT.2100',
    },
    mount: bitDepth,
  },
  {
    id: 'bayer',
    number: 37,
    title: 'Bayer 阵列与去马赛克',
    conditions: 'RGGB · 线性光采样 · 双线性插值 · PSNR 在 sRGB 编码域',
    grade: 'illustrative',
    highlight:
      '双线性插值在平坦区近乎无损，误差集中在高对比边缘和接近 Nyquist 的细条纹：R、B 的采样率只有 G 的一半，插值后三通道的边缘位置不一致，形成伪色与拉链纹。',
    provenance: {
      data: '程序生成的 sRGB 测试图',
      domain:
        '先解码为线性光，再做 RGGB 采样与插值，显示时编码回 sRGB；误差 ×4 与 PSNR 在 sRGB 编码域计算',
      approximation:
        '真实相机与 RAW 软件使用梯度或频域自适应算法，并含抗混叠滤镜',
      reference: 'Bayer, US Patent 3,971,065, 1976',
    },
    mount: bayer,
  },
];
export const groups: FigureGroup[] = [{ name: '采样与量化', figures }];
