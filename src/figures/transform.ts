import Color from 'colorjs.io';
import { el } from '../dom';
import { defaultState, type Vec3 } from '../model';
import { simulateCvd } from '../science/cvd';
import { gamutCompress } from '../science/gamut-compress';
import { acesFitted, agx } from '../science/tonemap';
import '../targets';
import { VolumeView, type VolumeData } from '../volume';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import { css, playback } from './plot';

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
const eotf = (v: number) =>
  Math.sign(v) *
  (Math.abs(v) <= 0.04045
    ? Math.abs(v) / 12.92
    : ((Math.abs(v) + 0.055) / 1.055) ** 2.4);
const encode = (rgb: Vec3) => rgb.map(oetf) as Vec3;
const decode = (rgb: Vec3) => rgb.map(eotf) as Vec3;

interface Keyframe {
  name: string;
  position: (u: Vec3) => Vec3;
  color: (u: Vec3) => Vec3;
}
interface LatticeSpec {
  keyframes: Keyframe[];
  axes: [string, string, string];
  zoom?: number;
  swatches?: { label: string; u: Vec3 }[];
  readout?: (t: number) => string;
}

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
      'aria-label': '变换晶格；拖动旋转，方向键旋转，加减号缩放',
    });
    host.append(canvas);
    const frames = spec.keyframes.map((frame) => ({
      positions: nodes.map(
        (u) => frame.position(u).map((v) => v - 0.5) as Vec3,
      ),
      colors: nodes.map((u) => frame.color(u)),
    }));
    let t = 0;
    const view = new VolumeView(
      canvas,
      camera,
      () => draw(),
      () => {},
    );
    const status = el('p', { class: 'figure-stage-label' });
    function interpolate() {
      const k = Math.min(Math.floor(t), frames.length - 2);
      const local = t - k;
      const s = local * local * (3 - 2 * local);
      const a = frames[k],
        b = frames[k + 1];
      return {
        positions: a.positions.map(
          (p, i) =>
            p.map((v, axis) => v + (b.positions[i][axis] - v) * s) as Vec3,
        ),
        colors: a.colors.map(
          (c, i) => c.map((v, axis) => v + (b.colors[i][axis] - v) * s) as Vec3,
        ),
        stage: s < 0.5 ? k : k + 1,
      };
    }
    function draw() {
      const { positions, colors, stage } = interpolate();
      const data: VolumeData = {
        positions,
        colors,
        axes: spec.axes,
        cube: true,
        radius: 2.3,
        linesBehind: true,
        lines: polylines.map((line) => ({
          points: line.map((i) => positions[i]),
          color: '#ffffff20',
          width: 0.8,
          segmentColors: line
            .slice(1)
            .map((i, k) => {
              const a = colors[line[k]],
                b = colors[i];
              return `${css(a.map((v, axis) => (v + b[axis]) / 2) as Vec3)}`;
            })
            .map((c) => c.replace('rgb(', 'rgba(').replace(')', ',0.55)')),
        })),
      };
      view.draw(data, null);
      status.textContent = `${spec.keyframes[stage].name}${spec.readout ? ` · ${spec.readout(t)}` : ''}`;
      canvas.dataset.progress = t.toFixed(3);
      canvas.dataset.painted = String(Number(canvas.dataset.painted ?? 0) + 1);
    }
    const play = playback({
      id: 'morph',
      label: spec.keyframes.length > 2 ? '变形进度（两步）' : '变形进度',
      min: 0,
      max: frames.length - 1,
      step: 0.01,
      value: 0,
      speed: 0.35,
      bounce: true,
      format: (v) =>
        frames.length > 2
          ? `${v.toFixed(2)} / ${frames.length - 1}`
          : `${Math.round(v * 100)}%`,
      onChange: (value) => {
        t = value;
        draw();
      },
    });
    controls.append(
      play.element,
      el('span', { class: 'figure-hint' }, '拖动画布旋转 · 聚焦后方向键旋转'),
    );
    readout.append(status);
    if (spec.swatches) {
      const first = spec.keyframes[0],
        last = spec.keyframes[spec.keyframes.length - 1];
      readout.append(
        el(
          'div',
          { class: 'swatch-table' },
          el('span', {}, ''),
          el('span', {}, '变换前'),
          el('span', {}, '变换后'),
          ...spec.swatches.flatMap(({ label, u }) => [
            el('span', {}, label),
            el('i', { style: `background:${css(first.color(u))}` }),
            el('i', { style: `background:${css(last.color(u))}` }),
          ]),
        ),
      );
    }
    draw();
    return () => {
      play.destroy();
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
    axes: ['R', 'G', 'B'],
    keyframes: [
      {
        name: '输入：每通道 log₂ 曝光（−6.5 至 +6.5 EV）',
        position: (u) => u,
        color: (u) => encode(sceneLinear(u).map(clip) as Vec3),
      },
      {
        name: `输出：${name} 后的显示 R′G′B′`,
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
function cvdFigure(type: 'protan' | 'deutan' | 'tritan'): LatticeSpec {
  const simulated = (u: Vec3) => encode(simulateCvd(decode(u), type));
  return {
    axes: ['R', 'G', 'B'],
    keyframes: [
      { name: 'sRGB 立方体', position: (u) => u, color: (u) => u },
      {
        name: '二色视者看到的颜色（sRGB 编码坐标）',
        position: simulated,
        color: (u) => simulated(u).map(clip) as Vec3,
      },
    ],
    swatches: primaries,
  };
}

// ACES RGC: S-Gamut3 linear lattice → AP1 coordinates → compressed.
const toAp1 = (u: Vec3) =>
  new Color('camera-sgamut3', u).to('acescg').coords.map((v) => v ?? 0) as Vec3;
const ap1Display = (ap1: Vec3) =>
  new Color('acescg', ap1).to('srgb').coords.map((v) => clip(v ?? 0)) as Vec3;
const outside = (rgb: Vec3) => rgb.some((v) => v < -1e-9);
const ap1Nodes = nodes.map(toAp1);
const compressedNodes = ap1Nodes.map(gamutCompress);
const rgcSpec: LatticeSpec = {
  axes: ['R', 'G', 'B'],
  zoom: 0.78,
  keyframes: [
    {
      name: 'S-Gamut3 线性立方体（自身坐标）',
      position: (u) => u,
      color: (u) => ap1Display(toAp1(u)),
    },
    {
      name: '同一批颜色放进 ACES AP1 坐标：部分通道变成负值',
      position: toAp1,
      color: (u) => ap1Display(toAp1(u)),
    },
    {
      name: 'ACES 参考色域压缩（RGC）后',
      position: (u) => gamutCompress(toAp1(u)),
      color: (u) => ap1Display(gamutCompress(toAp1(u))),
    },
  ],
  readout: (t) =>
    t < 1.5
      ? `${ap1Nodes.filter(outside).length} / ${nodes.length} 个节点在 AP1 之外`
      : `压缩后 ${compressedNodes.filter(outside).length} / ${nodes.length} 个节点仍在 AP1 之外`,
};

const figures: FigureDef[] = [
  {
    id: 'aces',
    number: 16,
    title: 'ACES 色调映射（拟合）',
    caption: '场景曝光晶格被压进显示范围',
    highlight:
      '输入立方体的每条轴是 13 档曝光。映射后两端都被压缩：深暗部收向黑，高光沿 S 形被压进 0–1，靠近白点的一角被挤成尖——过曝的颜色趋向白色，饱和度随之丢失。',
    note: 'Stephen Hill 对 ACES 1.x RRT + sRGB ODT 的拟合（BakingLab），只是近似，不是 ACES 2.0，也不是完整的 ACES 输出变换。',
    mount: latticeFigure(toneFigure('ACES 拟合', acesFitted)),
  },
  {
    id: 'agx',
    number: 17,
    title: 'AgX',
    caption: '另一种过曝处理：向白色渐变',
    highlight:
      '和 ACES 拟合对比：AgX 先把原色往内收（inset）再做 log 与 S 曲线，高光处的晶格更均匀地汇向白点，极亮的纯色不会停在饱和的原色上。',
    note: '使用 AgX 默认对比度的 6 次多项式近似（Benjamin Wrensch 的最简实现），与 Blender 中的完整 AgX 存在细微差别。',
    mount: latticeFigure(toneFigure('AgX', agx)),
  },
  {
    id: 'protan',
    number: 18,
    title: '红色盲模拟',
    caption: 'Protanopia · Machado 2009',
    highlight:
      '立方体被压成一张薄片：缺少 L 视锥后只剩两个维度能区分颜色。红与绿被折到同一侧，红色同时明显变暗。',
    note: 'Machado、Oliveira、Fernandes（2009）模型，严重程度 1.0，在线性 sRGB 中计算。',
    mount: latticeFigure(cvdFigure('protan')),
  },
  {
    id: 'deutan',
    number: 19,
    title: '绿色盲模拟',
    caption: 'Deuteranopia · Machado 2009',
    highlight:
      '同样塌成一张薄片，但和红色盲相比，红色的亮度保留得更多；红绿依旧无法区分。',
    note: 'Machado 2009，严重程度 1.0，线性 sRGB。',
    mount: latticeFigure(cvdFigure('deutan')),
  },
  {
    id: 'tritan',
    number: 20,
    title: '蓝色盲模拟',
    caption: 'Tritanopia · Machado 2009',
    highlight:
      '薄片转到了另一个方向：缺少 S 视锥后，蓝与绿、黄与粉红难以区分，而红绿差异基本保留。',
    note: 'Machado 2009，严重程度 1.0，线性 sRGB。',
    mount: latticeFigure(cvdFigure('tritan')),
  },
  {
    id: 'rgc',
    number: 21,
    title: 'ACES 色域压缩',
    caption: 'S-Gamut3 先放进 AP1，再被吸回',
    highlight:
      '第一步：S-Gamut3 的立方体在 AP1 坐标中伸出单位立方体（虚线框），部分通道为负。第二步：参考色域压缩把超出阈值的点沿着到灰轴的距离平滑地拉回，框内靠近灰轴的颜色保持不动。',
    note: 'ACES 1.3 参考色域压缩（RGC）参数：阈值 0.815 / 0.803 / 0.880，极限 1.147 / 1.264 / 1.312，幂 1.2。超出极限的点仍会留在框外。',
    mount: latticeFigure(rgcSpec),
  },
];
export const groups: FigureGroup[] = [{ name: '色彩变换', figures }];
