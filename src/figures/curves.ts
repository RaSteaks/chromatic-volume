import { encodeCamera } from '../camera-transfers';
import { encodeTransfer } from '../color-management';
import { el, slider, toggle } from '../dom';
import { acesFitted, agx, hable, reinhard } from '../science/tonemap';
import {
  davinciEncode,
  hlgEncode,
  HLG_REFERENCE_WHITE,
  pqEncode,
} from '../science/transfer';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import {
  axes,
  codeRanges,
  codeSpan,
  codeValue,
  createCanvas,
  css,
  frame,
  INK,
  label,
  playback,
  polyline,
  probe,
  rangeLabel,
  readoutTable,
  segmented,
  SERIES,
  ticks,
  type CodeRange,
  type Frame,
} from './plot';

const clip1 = (v: number) => Math.min(v, 1);
interface Curve {
  id: string;
  name: string;
  color: string;
  dash?: number[];
  value: (x: number) => number;
}
function marker(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  x: number,
  text: string,
) {
  ctx.save();
  ctx.strokeStyle = '#ffffff50';
  ctx.setLineDash([3, 4]);
  ctx.beginPath();
  ctx.moveTo(f.sx(x), f.top);
  ctx.lineTo(f.sx(x), f.top + f.height);
  ctx.stroke();
  ctx.restore();
  label(ctx, text, f.sx(x) + 4, f.top + 12, INK.text, 'left', 10);
}
interface Summary {
  title: string;
  head: string[];
  row: (curve: Curve, code: (signal: number) => number) => string[];
}
const BITS = 10;
/** Signal change per stop, central difference. */
const slopeAt = (value: (stops: number) => number, stops: number) =>
  (value(stops + 0.01) - value(stops - 0.01)) / 0.02;

function curveFigure(options: {
  curves: Curve[];
  x: [number, number];
  /** Exposure in stops → linear value fed to each curve. */
  linear: (stops: number) => number;
  xLabel: string;
  yLabel: string;
  markers: [number, string][];
  strips?: boolean;
  initial: number;
  summary: Summary;
  /** Extra per-curve readout at the cursor, e.g. absolute luminance. */
  extra?: (curve: Curve, stops: number) => string | null;
}) {
  return ({ host, controls, readout }: FigureContext) => {
    const visible = new Set(options.curves.map((c) => c.id));
    let exposure = options.initial;
    let range: CodeRange = 'full';
    let view: 'signal' | 'slope' = 'signal';
    let lastFrame: Frame | null = null;
    const table = el('div', { class: 'curve-table' });
    const summary = el('div', { class: 'readout-list' });
    readout.append(table, summary);
    const sample = (c: Curve, stops: number) => c.value(options.linear(stops));
    const slope = (c: Curve, stops: number) =>
      slopeAt((x) => sample(c, x), stops);
    const xs = Array.from(
      { length: 400 },
      (_, i) => options.x[0] + ((options.x[1] - options.x[0]) * i) / 399,
    );
    const plot = createCanvas(
      host,
      (ctx, width, height) => {
        const shown = options.curves.filter((c) => visible.has(c.id));
        const stripHeight = options.strips ? 14 : 0;
        const stripBlock = options.strips
          ? shown.length * (stripHeight + 4) + 10
          : 0;
        const y = (c: Curve, x: number) =>
          view === 'signal' ? sample(c, x) : slope(c, x);
        const top =
          view === 'signal'
            ? 1.05
            : Math.max(
                0.1,
                ...shown.flatMap((c) =>
                  xs.map((x) => Math.min(slope(c, x), 1)),
                ),
              ) * 1.1;
        const f = frame(width, height - stripBlock, options.x, [0, top], {
          left: 56,
          right: 20,
          top: 24,
          bottom: 46,
        });
        lastFrame = f;
        const yStep = view === 'signal' ? 0.1 : top > 0.5 ? 0.1 : 0.05;
        axes(ctx, f, {
          xTicks: ticks(options.x[0], options.x[1], 1),
          yTicks: ticks(0, top, yStep),
          xLabel: options.xLabel,
          yLabel: view === 'signal' ? options.yLabel : '斜率（信号 / 档）',
          xFormat: (v) => (v > 0 ? `+${v}` : String(v)),
          yFormat: (v) => v.toFixed(view === 'signal' ? 1 : 2),
        });
        for (const [x, text] of options.markers) marker(ctx, f, x, text);
        for (const c of shown) {
          polyline(
            ctx,
            f,
            xs.map((x) => [x, y(c, x)]),
            c.color,
            2,
            c.dash ?? [],
          );
          ctx.fillStyle = c.color;
          ctx.beginPath();
          ctx.arc(f.sx(exposure), f.sy(y(c, exposure)), 3.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.strokeStyle = INK.bright;
        ctx.beginPath();
        ctx.moveTo(f.sx(exposure), f.top);
        ctx.lineTo(f.sx(exposure), f.top + f.height);
        ctx.stroke();
        if (options.strips) {
          let y = f.top + f.height + 46;
          for (const c of shown) {
            const n = 160;
            for (let i = 0; i < n; i++) {
              const x = options.x[0] + ((options.x[1] - options.x[0]) * i) / n;
              const v = Math.min(Math.max(sample(c, x), 0), 1);
              ctx.fillStyle = css([v, v, v]);
              ctx.fillRect(f.sx(x), y, f.width / n + 1, stripHeight);
            }
            label(
              ctx,
              c.name,
              f.left - 6,
              y + stripHeight / 2,
              c.color,
              'right',
              10,
            );
            y += stripHeight + 4;
          }
        }
        plot.canvas.dataset.curves = String(shown.length);
        plot.canvas.dataset.view = view;
      },
      `${options.yLabel}；指针或方向键移动曝光游标`,
    );
    const code = (signal: number) => codeValue(signal, BITS, range);
    const update = () => {
      const span = codeSpan(BITS, range);
      table.replaceChildren(
        el(
          'strong',
          {},
          `${exposure >= 0 ? '+' : ''}${exposure.toFixed(2)} 档 · 线性 ${options.linear(exposure).toPrecision(4)}`,
        ),
        el('span', { class: 'curve-head' }, `码值 ${rangeLabel(BITS, range)}`),
        ...options.curves
          .filter((c) => visible.has(c.id))
          .map((c) => {
            const v = sample(c, exposure);
            const extra = options.extra?.(c, exposure);
            return el(
              'span',
              {},
              el('i', { style: `background:${c.color}` }),
              c.name,
              el('code', {}, v.toFixed(4)),
              el(
                'small',
                {},
                `码值 ${code(v)} · ${(slope(c, exposure) * span).toFixed(1)} 码值/档${extra ? ` · ${extra}` : ''}`,
              ),
            );
          }),
      );
      summary.replaceChildren(
        el('strong', {}, options.summary.title),
        readoutTable(
          ['', ...options.summary.head],
          options.curves
            .filter((c) => visible.has(c.id))
            .map((c) => [c.name, ...options.summary.row(c, code)]),
        ),
      );
      plot.redraw();
    };
    const play = playback({
      id: 'exposure',
      label: '曝光游标',
      min: options.x[0],
      max: options.x[1],
      step: 0.05,
      value: exposure,
      speed: 2.2,
      bounce: true,
      autoplay: false,
      format: (v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
      onChange: (v) => {
        exposure = v;
        update();
      },
    });
    const stopProbe = probe(plot.canvas, (p) => {
      if (!p || !lastFrame) return;
      play.pause();
      const stops = Math.min(
        Math.max(lastFrame.ix(p.x), options.x[0]),
        options.x[1],
      );
      play.set(Math.round(stops * 20) / 20);
    });
    controls.append(
      play.element,
      segmented(
        '纵轴',
        [
          { id: 'signal', name: '信号' },
          { id: 'slope', name: '斜率' },
        ] as const,
        view,
        (v) => {
          view = v;
          plot.redraw();
        },
      ),
      segmented('码值范围', codeRanges, range, (v) => {
        range = v;
        update();
      }),
      el(
        'div',
        { class: 'curve-toggles' },
        ...options.curves.map((c) => {
          const item = toggle(`curve-${c.id}`, c.name, true, (on) => {
            if (on) visible.add(c.id);
            else visible.delete(c.id);
            update();
          });
          item.lastElementChild?.prepend(
            el('i', { class: 'curve-chip', style: `background:${c.color}` }),
          );
          return item;
        }),
      ),
    );
    update();
    return () => {
      stopProbe();
      play.destroy();
      plot.destroy();
    };
  };
}

/** Stops above the 0-stop reference where a curve first reaches `level` (full signal by default). */
function headroom(
  value: (stops: number) => number,
  level = 1 - 1e-6,
  limit = 40,
) {
  if (value(0) >= level) return 0;
  if (value(limit) < level) return Infinity;
  let lo = 0,
    hi = limit;
  for (let i = 0; i < 50; i++) {
    const mid = (lo + hi) / 2;
    if (value(mid) >= level) hi = mid;
    else lo = mid;
  }
  return hi;
}
/** Stop of the steepest point in a range (maximum local contrast). */
function steepest(value: (stops: number) => number, from: number, to: number) {
  let best = from,
    slope = -Infinity;
  for (let x = from; x <= to; x += 0.01) {
    const s = slopeAt(value, x);
    if (s > slope) {
      slope = s;
      best = x;
    }
  }
  return { stops: best, slope };
}
const stopsText = (v: number) =>
  Number.isFinite(v) ? `${v >= 0 ? '+' : ''}${v.toFixed(2)}` : '> 40';

export const transferCurves: Curve[] = [
  {
    id: 'srgb',
    name: 'sRGB',
    color: SERIES[0],
    value: (x) => encodeTransfer(clip1(x), 'srgb'),
  },
  {
    id: 'rec709',
    name: 'Rec.709',
    color: SERIES[3],
    value: (x) => encodeTransfer(clip1(x), 'rec709'),
  },
  {
    id: 'gamma24',
    name: 'Gamma 2.4',
    color: '#d9d2c3',
    dash: [5, 4],
    value: (x) => encodeTransfer(clip1(x), 'gamma24'),
  },
  { id: 'pq', name: 'PQ', color: SERIES[4], value: (x) => pqEncode(x * 203) },
  {
    id: 'hlg',
    name: 'HLG',
    color: SERIES[5],
    value: (x) => hlgEncode(Math.min(x * HLG_REFERENCE_WHITE, 1)),
  },
  {
    id: 'logc4',
    name: 'LogC4',
    color: SERIES[1],
    value: (x) => encodeCamera(x, 'logc4'),
  },
  {
    id: 'slog3',
    name: 'S-Log3',
    color: SERIES[2],
    value: (x) => encodeCamera(x, 'slog3'),
  },
  {
    id: 'di',
    name: 'DaVinci Intermediate',
    color: SERIES[6],
    value: (x) => davinciEncode(x),
  },
];
const encode = (v: number) =>
  encodeTransfer(Math.min(Math.max(v, 0), 1), 'srgb');
export const toneCurves: Curve[] = [
  {
    id: 'clip',
    name: '直接裁剪',
    color: '#8a8d97',
    dash: [4, 4],
    value: (x) => encode(x),
  },
  {
    id: 'reinhard',
    name: 'Reinhard',
    color: SERIES[3],
    value: (x) => encode(reinhard(x)),
  },
  {
    id: 'hable',
    name: 'Hable',
    color: SERIES[0],
    value: (x) => encode(hable(x)),
  },
  {
    id: 'aces',
    name: 'ACES 拟合',
    color: SERIES[4],
    value: (x) => encode(acesFitted([x, x, x])[0]),
  },
  {
    id: 'agx',
    name: 'AgX',
    color: SERIES[1],
    value: (x) => encode(agx([x, x, x])[0]),
  },
];

function hdCurve({ host, controls, readout }: FigureContext) {
  let gamma = 0.65,
    dmax = 2.6;
  const dmin = 0.15;
  const density = (logH: number) => {
    const k = (4 * gamma) / (dmax - dmin);
    return dmin + (dmax - dmin) / (1 + Math.exp(-k * (logH + 1)));
  };
  const info = el('div', { class: 'readout-list' });
  readout.append(info);
  const plot = createCanvas(
    host,
    (ctx, width, height) => {
      const f = frame(width, height, [-4, 2], [0, 3.2], {
        left: 56,
        right: 20,
        top: 24,
        bottom: 46,
      });
      const k = (4 * gamma) / (dmax - dmin);
      // Regions: curvature extremes of the logistic at k·(x − m) = ±1.317.
      const toeEnd = -1 - 1.317 / k,
        shoulderStart = -1 + 1.317 / k;
      const band = (from: number, to: number, color: string, text: string) => {
        const a = Math.max(from, -4),
          b = Math.min(to, 2);
        if (b <= a) return;
        ctx.fillStyle = color;
        ctx.fillRect(f.sx(a), f.top, f.sx(b) - f.sx(a), f.height);
        label(
          ctx,
          text,
          (f.sx(a) + f.sx(b)) / 2,
          f.top + 14,
          INK.text,
          'center',
          11,
        );
      };
      band(-4, toeEnd, '#7ea6e810', '趾部');
      band(toeEnd, shoulderStart, '#b6a0f410', '直线部');
      band(shoulderStart, 2, '#f0b35e10', '肩部');
      axes(ctx, f, {
        xTicks: ticks(-4, 2, 1),
        yTicks: ticks(0, 3, 0.5),
        xLabel: 'log₁₀ 相对曝光量 H',
        yLabel: '密度 D',
        yFormat: (v) => v.toFixed(1),
      });
      polyline(
        ctx,
        f,
        [
          [-4, dmin],
          [2, dmin],
        ],
        '#ffffff40',
        1,
        [3, 4],
      );
      label(
        ctx,
        '片基 + 灰雾',
        f.left + 8,
        f.sy(dmin) - 9,
        INK.text,
        'left',
        10,
      );
      polyline(
        ctx,
        f,
        [
          [-4, dmax],
          [2, dmax],
        ],
        '#ffffff40',
        1,
        [3, 4],
      );
      label(ctx, '最大密度', f.left + 8, f.sy(dmax) - 9, INK.text, 'left', 10);
      const tangent = (x: number) => density(-1) + gamma * (x + 1);
      polyline(
        ctx,
        f,
        [
          [-2.4, tangent(-2.4)],
          [0.4, tangent(0.4)],
        ],
        '#ffffff60',
        1,
        [6, 4],
      );
      label(
        ctx,
        `γ = tan θ = ${gamma.toFixed(2)}`,
        f.sx(0.45),
        f.sy(tangent(0.45)),
        INK.bright,
        'left',
        11,
      );
      polyline(
        ctx,
        f,
        Array.from({ length: 300 }, (_, i) => {
          const x = -4 + (6 * i) / 299;
          return [x, density(x)];
        }),
        SERIES[4],
        2.6,
      );
      plot.canvas.dataset.gamma = gamma.toFixed(2);
    },
    '胶片特性曲线示意',
  );
  const update = () => {
    info.replaceChildren(
      el('strong', {}, '示意参数'),
      el('span', {}, `反差系数 γ ${gamma.toFixed(2)}`),
      el('span', {}, `密度范围 ${dmin.toFixed(2)} – ${dmax.toFixed(2)}`),
      el(
        'span',
        {},
        `宽容度约 ${((2 * 1.317) / ((4 * gamma) / (dmax - dmin)) / Math.log10(2)).toFixed(1)} 档（直线部）`,
      ),
    );
    plot.redraw();
  };
  const g = slider('hd-gamma', '反差系数 γ', gamma, 0.4, 2, 0.01, (v) => {
    gamma = v;
    update();
  });
  const d = slider('hd-dmax', '最大密度', dmax, 1.4, 3.1, 0.01, (v) => {
    dmax = v;
    update();
  });
  controls.append(g.element, d.element);
  update();
  return () => plot.destroy();
}

const figures: FigureDef[] = [
  {
    id: 'transfer',
    number: 32,
    title: '传递函数',
    conditions:
      '横轴 log₂(L / 漫反射白) · PQ 白 = 203 cd/m² · HLG 白 = 75% · Log 以 0.18 为中灰',
    grade: 'reference',
    highlight:
      '同一横轴下比较漫反射白的码值和白以上的余量。Log 曲线在中灰以上近似直线，斜率视图中的平台高度就是每档分到的码值数；PQ 在高亮度段也趋于这种对数行为，暗部每档码值逐渐减少，这是按 Barten 对比敏感度分配码字的结果。',
    provenance: {
      data: '各标准公式；LogC4、S-Log3、DaVinci Intermediate 已对照 Colour Science 0.4.4 验证',
      domain:
        '显示类曲线输入 0–1 相对亮度，白以上裁剪；PQ 输入 203·2^档 cd/m²；HLG 输入相对场景亮度，参考白在 75% 信号',
      approximation: 'HLG 只画 OETF，未含系统 gamma 与 OOTF',
      reference:
        'IEC 61966-2-1；ITU-R BT.709、BT.1886、BT.2100、BT.2408；ARRI LogC4 规范；Sony S-Log3 技术摘要；Blackmagic DaVinci Wide Gamut 白皮书',
    },
    mount: curveFigure({
      curves: transferCurves,
      x: [-10, 7],
      linear: (stops) => 2 ** stops,
      xLabel: '相对漫反射白的曝光（档，0 = 白 1.0）',
      yLabel: '编码信号',
      markers: [
        [0, '漫反射白'],
        [Math.log2(0.18), '18% 灰'],
      ],
      initial: 0,
      summary: {
        title: '码值与余量',
        head: ['白', '中灰', '白以上 档'],
        row: (c, code) => [
          String(code(c.value(1))),
          String(code(c.value(0.18))),
          stopsText(headroom((x) => c.value(2 ** x))),
        ],
      },
      extra: (c, stops) =>
        c.id === 'pq'
          ? `${Math.min(203 * 2 ** stops, 10000).toPrecision(4)} cd/m²`
          : null,
    }),
  },
  {
    id: 'tonemap',
    number: 33,
    title: '色调映射曲线',
    conditions:
      '横轴 log₂(L / 0.18) · Reinhard、Hable、ACES 拟合、AgX · 输出 sRGB 编码',
    grade: 'approximate',
    highlight:
      '中灰落点决定整体亮度，斜率峰的位置决定对比集中在哪一段。AgX 的斜率峰几乎正好在中灰，ACES 拟合与 Hable 依次向高光移动约 1 档；Reinhard 的肩部最长，接近白要再上去近 8 档。直接裁剪的斜率在裁剪点前持续上升，之后归零。',
    provenance: {
      data: '各算子公开公式',
      domain: '单通道中性输入（R = G = B），输出为线性显示值后统一做 sRGB 编码',
      approximation:
        'ACES 为 Stephen Hill 对 ACES 1.x RRT + sRGB ODT 的拟合，不是 ACES 2.0；AgX 为 Wrensch 的 6 次多项式近似；Hable 用默认参数（白点 11.2，曝光偏移 ×2）',
      reference:
        'Reinhard et al., SIGGRAPH 2002；Hable, GDC 2010；Hill, BakingLab；Sobotka, AgX',
    },
    mount: curveFigure({
      curves: toneCurves,
      x: [-8, 8],
      linear: (stops) => 0.18 * 2 ** stops,
      xLabel: '相对 18% 中灰的场景曝光（档）',
      yLabel: '显示值（sRGB 编码）',
      markers: [[0, '中灰 0.18']],
      strips: true,
      initial: 0,
      summary: {
        title: '中灰码值与对比位置',
        head: ['中灰', '斜率峰 档', '0.99 处 档'],
        row: (c, code) => {
          const value = (x: number) => c.value(0.18 * 2 ** x);
          return [
            String(code(value(0))),
            stopsText(steepest(value, -8, 8).stops),
            stopsText(headroom(value, 0.99)),
          ];
        },
      },
    }),
  },
  {
    id: 'hd',
    number: 34,
    title: '胶片特性曲线（H&D）',
    conditions: '密度 D 对 log₁₀ H · 逻辑斯谛示意 · 片基灰雾 0.15',
    grade: 'illustrative',
    highlight:
      '直线部斜率即 γ；宽容度 = 直线部跨度 / log₁₀2。γ 增大时直线部在 log H 上收窄，同一密度范围对应更少的档位。趾部与肩部的边界取曲率极值点。',
    provenance: {
      domain: '密度对 log₁₀ 相对曝光量',
      approximation:
        '逻辑斯谛函数构造，不对应任何具体胶片；趾、肩边界取 k·(x − m) = ±1.317；无分色染料密度曲线',
      reference: 'Hurter & Driffield 1890',
    },
    mount: hdCurve,
  },
];
export const groups: FigureGroup[] = [{ name: '曲线', figures }];
