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
  createCanvas,
  css,
  frame,
  INK,
  label,
  playback,
  polyline,
  SERIES,
  ticks,
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
}) {
  return ({ host, controls, readout }: FigureContext) => {
    const visible = new Set(options.curves.map((c) => c.id));
    let exposure = options.initial;
    const table = el('div', { class: 'curve-table' });
    readout.append(table);
    const sample = (c: Curve, stops: number) => c.value(options.linear(stops));
    const plot = createCanvas(
      host,
      (ctx, width, height) => {
        const shown = options.curves.filter((c) => visible.has(c.id));
        const stripHeight = options.strips ? 14 : 0;
        const stripBlock = options.strips
          ? shown.length * (stripHeight + 4) + 10
          : 0;
        const f = frame(width, height - stripBlock, options.x, [0, 1.05], {
          left: 56,
          right: 20,
          top: 24,
          bottom: 46,
        });
        axes(ctx, f, {
          xTicks: ticks(options.x[0], options.x[1], 1),
          yTicks: ticks(0, 1, 0.1),
          xLabel: options.xLabel,
          yLabel: options.yLabel,
          xFormat: (v) => (v > 0 ? `+${v}` : String(v)),
          yFormat: (v) => v.toFixed(1),
        });
        for (const [x, text] of options.markers) marker(ctx, f, x, text);
        const xs = Array.from(
          { length: 400 },
          (_, i) => options.x[0] + ((options.x[1] - options.x[0]) * i) / 399,
        );
        for (const c of shown) {
          polyline(
            ctx,
            f,
            xs.map((x) => [x, sample(c, x)]),
            c.color,
            2,
            c.dash ?? [],
          );
          const y = sample(c, exposure);
          ctx.fillStyle = c.color;
          ctx.beginPath();
          ctx.arc(f.sx(exposure), f.sy(y), 3.5, 0, Math.PI * 2);
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
      },
      options.yLabel,
    );
    const update = () => {
      table.replaceChildren(
        el(
          'strong',
          {},
          `${exposure >= 0 ? '+' : ''}${exposure.toFixed(2)} 档`,
        ),
        ...options.curves
          .filter((c) => visible.has(c.id))
          .map((c) =>
            el(
              'span',
              {},
              el('i', { style: `background:${c.color}` }),
              c.name,
              el('code', {}, sample(c, exposure).toFixed(3)),
            ),
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
    controls.append(
      play.element,
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
      play.destroy();
      plot.destroy();
    };
  };
}

const transferCurves: Curve[] = [
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
const toneCurves: Curve[] = [
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
    number: 31,
    title: '传递函数',
    caption: '同一横轴：以漫反射白为 0 档',
    highlight:
      '横轴统一成「相对漫反射白的曝光档位」，于是能直接比较：sRGB、Rec.709、Gamma 2.4 在 0 档就到顶；HLG 把漫反射白放在 75%，还能再高约 2 档；PQ 把 203 cd/m² 白放在 58% 左右，上面留到 10000 cd/m²；三条摄影机 Log 曲线把白放在中段，上下各留出大量档位。',
    note: 'PQ 按 BT.2408 把漫反射白设为 203 cd/m²；HLG 把参考白放在 75% 信号；LogC4、S-Log3、DaVinci Intermediate 以 0.18 为中灰的场景线性值输入。显示类曲线在白以上直接裁剪为 1。',
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
    }),
  },
  {
    id: 'tonemap',
    number: 32,
    title: '色调映射曲线',
    caption: 'Reinhard、Hable、ACES 拟合、AgX',
    highlight:
      '同样的场景亮度，四种曲线给出不同的显示值：直接裁剪在中灰 +2.5 档就丢掉了所有高光；Reinhard 永远到不了白；Hable、ACES 拟合、AgX 都有趾部和肩部，但肩部开始的位置和中灰的落点不同。下方灰阶条可以直接看出差别。',
    note: '横轴以 0.18 中灰为 0 档。ACES 为 Stephen Hill 的拟合（不是 ACES 2.0），AgX 为多项式近似，Hable 使用公开的默认参数（白点 11.2，曝光偏移 ×2）。纵轴均为 sRGB 编码后的显示值。',
    mount: curveFigure({
      curves: toneCurves,
      x: [-8, 8],
      linear: (stops) => 0.18 * 2 ** stops,
      xLabel: '相对 18% 中灰的场景曝光（档）',
      yLabel: '显示值（sRGB 编码）',
      markers: [[0, '中灰 0.18']],
      strips: true,
      initial: 0,
    }),
  },
  {
    id: 'hd',
    number: 33,
    title: '胶片特性曲线（H&D）',
    caption: '趾部、直线部、肩部',
    highlight:
      '负片密度随 log 曝光量变化：趾部压缩暗部，直线部的斜率 γ 决定反差，肩部缓慢地压住高光。拖动 γ：斜率越大，直线部覆盖的档位越少，宽容度越窄。',
    note: '这是逻辑斯谛函数构成的示意曲线，不对应任何具体胶片型号。染料密度（分色）曲线没有可靠数据，因此不做。',
    mount: hdCurve,
  },
];
export const groups: FigureGroup[] = [{ name: '曲线', figures }];
