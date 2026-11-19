import Color from 'colorjs.io';
import { el } from '../dom';
import { defaultState, type Vec3 } from '../model';
import { gamutCompress } from '../science/gamut-compress';
import { aces2 } from '../science/aces2';
import { agx } from '../science/tonemap';
import '../targets';
import { VolumeView, type VolumeData } from '../volume';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import { css, readoutTable, segmented, step, stepNote } from './plot';
import { createLattice, type LatticeKeyframe } from './lattice';

const N = 9;
const nodes: Vec3[] = [];
for (let b = 0; b < N; b++)
  for (let g = 0; g < N; g++)
    for (let r = 0; r < N; r++)
      nodes.push([r, g, b].map((v) => v / (N - 1)) as Vec3);
const index = (r: number, g: number, b: number) => r + g * N + b * N * N;
// Lattice edges as polylines along each axis.
const polylines: number[][] = [];
for (let a = 0; a < N; a++)
  for (let c = 0; c < N; c++) {
    polylines.push([...Array(N).keys()].map((i) => index(i, a, c)));
    polylines.push([...Array(N).keys()].map((i) => index(a, i, c)));
    polylines.push([...Array(N).keys()].map((i) => index(a, c, i)));
  }

const clip = (v: number) => Math.min(Math.max(v, 0), 1);
const oetf = (v: number) =>
  Math.sign(v) *
  (Math.abs(v) <= 0.0031308
    ? 12.92 * Math.abs(v)
    : 1.055 * Math.abs(v) ** (1 / 2.4) - 0.055);
const encode = (rgb: Vec3) => rgb.map(oetf) as Vec3;

interface Swatch {
  label: string;
  u: Vec3;
}
interface LatticeSpec {
  keyframes: LatticeKeyframe[];
  zoom?: number;
  /** Preset colours that can be followed through the transform. */
  swatches: Swatch[];
  readout?: (t: number, positions: Vec3[]) => string;
  /** Re-encode current positions when both endpoints share a physical RGB space. */
  display?: (position: Vec3, t: number) => Vec3 | undefined;
}
const fixed = (position: Vec3) => position.map((v) => v.toFixed(3));
const reducedMotion = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function latticeFigure(spec: LatticeSpec) {
  return ({ host, controls, readout }: FigureContext) => {
    const camera = Object.assign(defaultState(), {
      zoom: spec.zoom ?? 0.95,
      yaw: Math.PI / 4,
      pitch: 0.5,
      flatColors: true,
    });
    const canvas = el('canvas', {
      tabindex: 0,
      role: 'img',
      'aria-label': '变换晶格；点击节点跟踪，拖动旋转，方向键旋转，加减号缩放',
    });
    host.append(canvas);
    const last = spec.keyframes.length - 1;
    const interpolate = createLattice(spec.keyframes, nodes);
    // Open on the completed transform; intermediate frames are only a transition.
    let t = last;
    let tracked: Swatch = spec.swatches[0];
    let follow = createLattice(spec.keyframes, [tracked.u]);
    const view = new VolumeView(
      canvas,
      camera,
      () => draw(),
      (node) => {
        const [r, g, b] = nodes[node].map((v) => Math.round(v * (N - 1)));
        track({ label: `节点 ${r}·${g}·${b}`, u: nodes[node] });
      },
    );
    const status = el('p', { class: 'figure-stage-label' });
    const trackInfo = el('div', { class: 'readout-list' });
    const centre = (p: Vec3) => p.map((v) => v - 0.5) as Vec3;
    function draw() {
      const current = interpolate(t);
      const positions = current.positions.map(centre);
      const colors = current.positions.map(
        (p, i) => spec.display?.(p, t) ?? current.colors[i],
      );
      // The tracked colour: its position in every state, and where it is now.
      const path = spec.keyframes.map((frame) => frame.position(tracked.u));
      const here = follow(t);
      const hereColor = spec.display?.(here.positions[0], t) ?? here.colors[0];
      const data: VolumeData = {
        positions,
        colors,
        axes: current.axes,
        cube: true,
        radius: 2.3,
        linesBehind: true,
        lines: [
          ...polylines.map((line) => ({
            points: line.map((i) => positions[i]),
            color: '#ffffff20',
            width: 0.8,
            segmentColors: line.slice(1).map((i, k) => {
              const a = colors[line[k]],
                b = colors[i];
              return css(a.map((v, axis) => (v + b[axis]) / 2) as Vec3, 0.55);
            }),
          })),
          {
            points: path.map(centre),
            color: '#ffffffd0',
            width: 1.4,
            front: true,
            dots: spec.keyframes.map((frame) => frame.color(tracked.u)),
            dotRadius: 3.6,
          },
          {
            points: [here.positions[0], here.positions[0]].map(centre),
            color: '#ffffff',
            width: 1.6,
            front: true,
            dots: [hereColor, hereColor],
            dotRadius: 6.5,
          },
        ],
      };
      view.draw(data, null);
      const values = spec.readout?.(t, current.positions);
      status.textContent = `${current.label}${values ? ` · ${values}` : ''}`;
      canvas.setAttribute(
        'aria-description',
        `${current.label}；坐标轴：${current.axes.join('、')}`,
      );
      canvas.dataset.progress = t.toFixed(3);
      canvas.dataset.tracked = tracked.label;
      canvas.dataset.painted = String(Number(canvas.dataset.painted ?? 0) + 1);
    }

    // States: a click moves to a keyframe; the motion in between is only a transition.
    let frame = 0;
    function goTo(target: number) {
      cancelAnimationFrame(frame);
      const from = t;
      if (reducedMotion() || from === target) {
        t = target;
        draw();
        return;
      }
      const duration = 420 * Math.max(1, Math.abs(target - from));
      let start = 0;
      const tick = (time: number) => {
        start ||= time;
        const k = Math.min((time - start) / duration, 1);
        t = k === 1 ? target : from + (target - from) * k;
        draw();
        if (k < 1) frame = requestAnimationFrame(tick);
      };
      frame = requestAnimationFrame(tick);
    }
    const states = segmented(
      '状态',
      spec.keyframes.map((keyframe, i) => ({
        id: String(i),
        name: keyframe.short,
      })),
      String(last),
      (id) => goTo(Number(id)),
    );

    const picks = spec.swatches.map((swatch) => {
      const item = el(
        'button',
        { type: 'button', class: 'swatch-pick', 'aria-pressed': 'false' },
        el('i', {
          style: `background:${css(spec.keyframes[0].color(swatch.u))}`,
        }),
        el('i', {
          style: `background:${css(spec.keyframes[last].color(swatch.u))}`,
        }),
        swatch.label,
      );
      item.addEventListener('click', () => track(swatch));
      return item;
    });
    function track(next: Swatch) {
      tracked = next;
      follow = createLattice(spec.keyframes, [next.u]);
      picks.forEach((item, i) =>
        item.setAttribute('aria-pressed', String(spec.swatches[i] === next)),
      );
      trackInfo.replaceChildren(
        el('strong', {}, `跟踪：${next.label}`),
        readoutTable(
          ['', ...spec.keyframes.map((keyframe) => keyframe.short)],
          [
            ...[0, 1, 2].map((axis) => [
              'RGB'[axis],
              ...spec.keyframes.map(
                (keyframe) =>
                  (keyframe.format ?? fixed)(keyframe.position(next.u))[axis],
              ),
            ]),
            [
              '色样',
              ...spec.keyframes.map((keyframe) =>
                el('i', {
                  class: 'track-chip',
                  style: `background:${css(keyframe.color(next.u))}`,
                }),
              ),
            ],
          ],
        ),
      );
      draw();
    }

    controls.append(
      step('状态', states),
      step(
        '跟踪',
        el(
          'div',
          {
            class: 'swatch-table',
            role: 'group',
            'aria-label': '跟踪色样；左半为输入色，右半为最终输出色',
          },
          ...picks,
        ),
        stepNote('或点击画布上任一节点'),
      ),
      step('视角', stepNote('拖动旋转 · 方向键 · 加减号缩放')),
    );
    readout.append(status, trackInfo);
    track(tracked);
    return () => {
      cancelAnimationFrame(frame);
      view.destroy();
    };
  };
}

// Tone mapping: the input lattice spans ±6.5 stops around 18 % grey per channel.
const EV = 6.5;
const sceneLinear = (u: Vec3) =>
  u.map((v) => 0.18 * 2 ** (-EV + 2 * EV * v)) as Vec3;
const toneSwatches = [
  { label: '中灰 0.18', u: [0.5, 0.5, 0.5] as Vec3 },
  { label: '+3 EV 灰', u: [0.5 + 3 / 13, 0.5 + 3 / 13, 0.5 + 3 / 13] as Vec3 },
  { label: '高亮红', u: [0.9, 0.5, 0.5] as Vec3 },
  { label: '高亮蓝', u: [0.5, 0.5, 0.95] as Vec3 },
  { label: '极亮青', u: [0.6, 1, 1] as Vec3 },
];
function toneFigure(name: string, map: (linear: Vec3) => Vec3): LatticeSpec {
  const output = (u: Vec3) => encode(map(sceneLinear(u)));
  return {
    keyframes: [
      {
        name: '输入：每通道 log₂ 曝光（−6.5 至 +6.5 EV）',
        short: '输入',
        format: (u) =>
          u.map((v) => {
            const ev = -EV + 2 * EV * v;
            return `${ev >= 0 ? '+' : '−'}${Math.abs(ev).toFixed(1)} EV`;
          }),
        axes: ['R EV', 'G EV', 'B EV'],
        position: (u) => u,
        color: (u) => encode(sceneLinear(u).map(clip) as Vec3),
      },
      {
        name: `输出：${name} 后的显示 R′G′B′`,
        short: '输出',
        axes: ['R′', 'G′', 'B′'],
        position: output,
        color: (u) => output(u).map(clip) as Vec3,
      },
    ],
    swatches: toneSwatches,
  };
}
const primaries = [
  { label: '红', u: [1, 0, 0] as Vec3 },
  { label: '黄', u: [1, 1, 0] as Vec3 },
  { label: '绿', u: [0, 1, 0] as Vec3 },
  { label: '青', u: [0, 1, 1] as Vec3 },
  { label: '蓝', u: [0, 0, 1] as Vec3 },
  { label: '品红', u: [1, 0, 1] as Vec3 },
];

// ACES RGC: S-Gamut3 linear lattice → AP1 coordinates → compressed.
const toAp1 = (u: Vec3) =>
  new Color('camera-sgamut3', u).to('acescg').coords.map((v) => v ?? 0) as Vec3;
// Extended sRGB: the display layer clips, so Display P3 keeps what lies beyond sRGB.
const ap1Display = (ap1: Vec3) =>
  new Color('acescg', ap1).to('srgb').coords.map((v) => v ?? 0) as Vec3;
const outside = (rgb: Vec3) => rgb.some((v) => v < -1e-9);
const rgcSpec: LatticeSpec = {
  zoom: 0.78,
  swatches: primaries,
  display: (position, t) => (t >= 1 ? ap1Display(position) : undefined),
  keyframes: [
    {
      name: 'S-Gamut3 线性立方体（自身坐标）',
      short: 'S-Gamut3',
      axes: ['R S-Gamut3', 'G S-Gamut3', 'B S-Gamut3'],
      position: (u) => u,
      color: (u) => ap1Display(toAp1(u)),
    },
    {
      name: '同一批颜色放进 ACES AP1 坐标：部分通道变成负值',
      short: 'AP1',
      axes: ['R AP1', 'G AP1', 'B AP1'],
      position: toAp1,
      color: (u) => ap1Display(toAp1(u)),
    },
    {
      name: 'ACES 参考色域压缩（RGC）后',
      short: 'RGC 后',
      axes: ['R AP1', 'G AP1', 'B AP1'],
      position: (u) => gamutCompress(toAp1(u)),
      color: (u) => ap1Display(gamutCompress(toAp1(u))),
    },
  ],
  // Before t = 1 the morph mixes different coordinate systems; AP1 tests
  // are meaningful only once every plotted position is expressed in AP1.
  readout: (t, positions) =>
    t < 1
      ? ''
      : `当前 AP1 晶格：${positions.filter(outside).length} / ${positions.length} 个节点在 AP1 之外（含负通道）`,
};

export const transformLattices = {
  aces: toneFigure('ACES 2.0', aces2),
  agx: toneFigure('AgX', agx),
  rgc: rgcSpec,
};

const figures: FigureDef[] = [
  {
    id: 'aces',
    conditions:
      '每通道 0.18·2^[−6.5, +6.5] · JMh 色调映射 + 色度压缩 + 色域压缩 · Rec.709 D65 100 cd/m² · 输出 sRGB 编码',
    reading:
      '每个点是一个场景颜色，9×9×9 个，在每通道 ±6.5 EV 内均匀取样。输出状态把每个点画在它经 ACES 2.0 输出变换后的显示 R′G′B′ 坐标上，点色即输出颜色；虚线框是坐标 0–1 的范围。白色连线标出被跟踪颜色从输入到输出的位移。',
    grade: 'reference',
    highlight:
      '分析霓虹、车灯等高饱和高光时，观察通道比例如何随显示变换改变。ACES 2.0 的色调曲线只改 J，色度压缩随亮度收拢 M，色域压缩沿等 h 线进行；跟踪色向白收拢时 JMh 色相基本不变，残余偏差来自最终的 0–1 裁剪。以 Oklab 衡量，高亮蓝仍略偏紫，因为两种模型的等色相线不同。中性灰到场景值 128（中灰以上约 9.5 档）才达 100 cd/m²，本晶格内没有节点到达显示白。',
    provenance: {
      data: 'ACES 2.0 参考 CTL（aces-core：Lib.Academy.OutputTransform、Lib.Academy.Tonescale）',
      domain:
        '线性 Rec.709 场景值经 Bradford 适配转为 ACES2065-1；输出 Rec.709 D65 线性显示值（1 = 100 cd/m²），裁剪到 0–1 后做 sRGB 分段编码',
      approximation:
        '双精度移植，色相表 360 项；仅 Rec.709 D65、100 cd/m² 预设，不含 D60 白点模拟、其他峰值亮度与逆变换',
      reference:
        'AMPAS / ASWF, ACES 2.0 Output Transform；Hellwig 2022 CAM（ACES 简化版）',
    },
    mount: latticeFigure(transformLattices.aces),
  },
  {
    id: 'agx',
    conditions:
      'inset → log₂ [−12.47, +4.03] EV → 6 次多项式 → outset · sRGB 编码',
    reading:
      '每个点是一个场景颜色，9×9×9 个，在每通道 ±6.5 EV 内均匀取样。输出状态把每个点画在它经 AgX 后的显示 R′G′B′ 坐标上，点色即输出颜色；虚线框是坐标 0–1 的范围。白色连线标出被跟踪颜色从输入到输出的位移。',
    grade: 'approximate',
    highlight:
      '在 CG 与实拍合成的显示流程中，高光外观取决于所用显示变换。此处 Minimal AgX 通过 inset、log₂ 曲线和 outset 改变通道关系，高曝光趋向近白色。与「ACES 2.0 输出变换」对照去饱和路径和色相走向；这组测试色不能替代完整镜头的外观评估。',
    provenance: {
      data: 'Benjamin Wrensch，Minimal AgX implementation, 2023',
      domain:
        '线性 Rec.709 输入；多项式输出按 gamma 2.2 解码为线性显示值，再统一 sRGB 编码',
      approximation:
        '默认对比度的六次多项式近似，不含可选 look；未量化与 Blender 完整 AgX／OCIO 输出的差异',
      reference: 'Troy Sobotka, AgX',
    },
    mount: latticeFigure(transformLattices.agx),
  },
  {
    id: 'rgc',
    conditions:
      'S-Gamut3 → AP1 · 阈值 0.815 / 0.803 / 0.880 · 极限 1.147 / 1.264 / 1.312 · 幂 1.2',
    reading:
      '每个点是一个 S-Gamut3 线性颜色，9×9×9 个均匀取样。三个状态依次把同一批点画在 S-Gamut3 自身坐标、AP1 坐标、RGC 压缩后的 AP1 坐标上；虚线框是坐标 0–1 的范围，框外靠近原点一侧即负通道。白色连线标出被跟踪颜色经过的三个位置。',
    grade: 'reference',
    highlight:
      '高饱和灯光进入 ACES 工作空间时，可能产生负 AP1 通道。此图从 S-Gamut3 转到 AP1，再按 d = (A − c) / |A| 压缩，A = max(R,G,B)，A = 0 时输出零。观察当前负通道点数；RGC 不是最终显示色域映射，AP1 通道大于 1 也不代表越界。',
    provenance: {
      data: 'ACES 1.3 RGC 参数',
      domain: 'S-Gamut3 线性值经矩阵进入 AP1（ACEScg）坐标后压缩',
      reference: 'AMPAS, ACES Reference Gamut Compression, ACES 1.3, 2021',
    },
    mount: latticeFigure(transformLattices.rgc),
  },
];
export const groups: FigureGroup[] = [{ figures }];
