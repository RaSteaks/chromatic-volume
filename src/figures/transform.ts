import Color from 'colorjs.io';
import { el } from '../dom';
import { defaultState, type Vec3 } from '../model';
import { MACHADO_2009, simulateCvd } from '../science/cvd';
import { invert, multiply, type Mat3 } from '../science/linear';
import { gamutCompress } from '../science/gamut-compress';
import { acesFitted, agx } from '../science/tonemap';
import '../targets';
import { VolumeView, type VolumeData } from '../volume';
import type { FigureContext, FigureDef, FigureGroup } from './page';
import { css, playback, readoutTable } from './plot';
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

interface LatticeSpec {
  keyframes: LatticeKeyframe[];
  zoom?: number;
  swatches?: { label: string; u: Vec3 }[];
  readout?: (t: number, positions: Vec3[]) => string;
  /** Re-encode current positions when both endpoints share a physical RGB space. */
  display?: (position: Vec3, t: number) => Vec3 | undefined;
  /** Static numeric details shown under the swatches. */
  details?: () => HTMLElement;
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
    const interpolate = createLattice(spec.keyframes, nodes);
    let t = 0;
    const view = new VolumeView(
      canvas,
      camera,
      () => draw(),
      () => {},
    );
    const status = el('p', { class: 'figure-stage-label' });
    function draw() {
      const current = interpolate(t);
      const positions = current.positions.map(
        (p) => p.map((v) => v - 0.5) as Vec3,
      );
      const colors = current.positions.map(
        (p, i) => spec.display?.(p, t) ?? current.colors[i],
      );
      const data: VolumeData = {
        positions,
        colors,
        axes: current.axes,
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
      const values = spec.readout?.(t, current.positions);
      status.textContent = `${current.label}${values ? ` · ${values}` : ''}`;
      canvas.setAttribute(
        'aria-description',
        `${current.label}；坐标轴：${current.axes.join('、')}`,
      );
      canvas.dataset.progress = t.toFixed(3);
      canvas.dataset.painted = String(Number(canvas.dataset.painted ?? 0) + 1);
    }
    const play = playback({
      id: 'morph',
      label: spec.keyframes.length > 2 ? '变形进度（两步）' : '变形进度',
      min: 0,
      max: spec.keyframes.length - 1,
      step: 0.01,
      value: 0,
      speed: 0.35,
      bounce: true,
      format: (v) =>
        spec.keyframes.length > 2
          ? `${v.toFixed(2)} / ${spec.keyframes.length - 1}`
          : `${Math.round(v * 100)}%`,
      onChange: (value) => {
        t = value;
        draw();
      },
    });
    controls.append(
      play.element,
      el(
        'span',
        { class: 'figure-hint' },
        '中间帧仅为几何过渡，不代表变换强度；拖动或方向键旋转',
      ),
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
          el('span', {}, '输入色样'),
          el('span', {}, '最终输出色样'),
          ...spec.swatches.flatMap(({ label, u }) => [
            el('span', {}, label),
            el('i', { style: `background:${css(first.color(u))}` }),
            el('i', { style: `background:${css(last.color(u))}` }),
          ]),
        ),
      );
    }
    if (spec.details) readout.append(spec.details());
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
    keyframes: [
      {
        name: '输入：每通道 log₂ 曝光（−6.5 至 +6.5 EV）',
        axes: ['R EV', 'G EV', 'B EV'],
        position: (u) => u,
        color: (u) => encode(sceneLinear(u).map(clip) as Vec3),
      },
      {
        name: `输出：${name} 后的显示 R′G′B′`,
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
const LUMA: Vec3 = [0.2126, 0.7152, 0.0722];
const det3 = (m: number[][]) =>
  m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
  m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
  m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
/** Right singular vector of the smallest singular value (inverse iteration on MᵀM), largest component = 1. */
function collapsedDirection(m: Mat3) {
  const mtm = [0, 1, 2].map((i) =>
    [0, 1, 2].map(
      (j) => m[0][i] * m[0][j] + m[1][i] * m[1][j] + m[2][i] * m[2][j],
    ),
  ) as Mat3;
  // Regularize so a singular MᵀM can still be inverted; the eigenvectors do not change.
  const inverse = invert(
    mtm.map((row, i) => row.map((v, j) => v + (i === j ? 1e-9 : 0))) as Mat3,
  );
  let v: Vec3 = [1, 1, 1];
  for (let k = 0; k < 60; k++) {
    v = multiply(inverse, v);
    const norm = Math.hypot(...v);
    v = v.map((x) => x / norm) as Vec3;
  }
  const peak = v.reduce((a, b) => (Math.abs(b) > Math.abs(a) ? b : a));
  return v.map((x) => x / peak);
}
function cvdDetails(type: 'protan' | 'deutan' | 'tritan') {
  const m = MACHADO_2009[type];
  const det = det3(m);
  // Published six-decimal coefficients are nearly, rather than exactly, rank 2.
  const nearSingular = Math.abs(det) < 1e-3;
  const y = (rgb: Vec3) =>
    multiply(m, rgb).reduce((sum, v, i) => sum + v * LUMA[i], 0);
  const signed = (v: number) =>
    `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`;
  return el(
    'div',
    { class: 'readout-list' },
    el('strong', {}, '最终模拟矩阵 · 严重度 1.0'),
    el(
      'span',
      {},
      `det ${det.toExponential(3)}${nearSingular ? '（近似秩 2）' : ''}`,
    ),
    el(
      'span',
      {},
      `最小奇异方向（线性 RGB）${collapsedDirection(m).map(signed).join(' ')}`,
    ),
    readoutTable(
      ['原色相对亮度 Y', '输入', '最终模拟'],
      (
        [
          ['R', [1, 0, 0]],
          ['G', [0, 1, 0]],
          ['B', [0, 0, 1]],
        ] as [string, Vec3][]
      ).map(([name, rgb], i) => [name, LUMA[i].toFixed(4), y(rgb).toFixed(4)]),
    ),
  );
}
function cvdFigure(type: 'protan' | 'deutan' | 'tritan'): LatticeSpec {
  const simulated = (u: Vec3) => simulateCvd(u, type);
  return {
    // Leave room for out-of-range vertices and linear-axis labels on narrow canvases.
    zoom: 0.72,
    details: () => cvdDetails(type),
    display: (position) => encode(position).map(clip) as Vec3,
    keyframes: [
      {
        name: '输入：线性 sRGB 立方体',
        axes: ['R lin', 'G lin', 'B lin'],
        position: (u) => u,
        color: encode,
      },
      {
        name: '输出：Machado 模拟（线性 sRGB 坐标）',
        axes: ['R lin', 'G lin', 'B lin'],
        position: simulated,
        color: (u) => encode(simulated(u)).map(clip) as Vec3,
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
const rgcSpec: LatticeSpec = {
  zoom: 0.78,
  display: (position, t) => (t >= 1 ? ap1Display(position) : undefined),
  keyframes: [
    {
      name: 'S-Gamut3 线性立方体（自身坐标）',
      axes: ['R S-Gamut3', 'G S-Gamut3', 'B S-Gamut3'],
      position: (u) => u,
      color: (u) => ap1Display(toAp1(u)),
    },
    {
      name: '同一批颜色放进 ACES AP1 坐标：部分通道变成负值',
      axes: ['R AP1', 'G AP1', 'B AP1'],
      position: toAp1,
      color: (u) => ap1Display(toAp1(u)),
    },
    {
      name: 'ACES 参考色域压缩（RGC）后',
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
  aces: toneFigure('ACES 拟合', acesFitted),
  agx: toneFigure('AgX', agx),
  protan: cvdFigure('protan'),
  deutan: cvdFigure('deutan'),
  tritan: cvdFigure('tritan'),
  rgc: rgcSpec,
};

const figures: FigureDef[] = [
  {
    id: 'aces',
    number: 16,
    title: 'ACES 1.x 色调映射（Hill 拟合）',
    conditions:
      '每通道 0.18·2^[−6.5, +6.5] · AP1 近似矩阵 + 有理函数 · 输出 sRGB 编码',
    grade: 'approximate',
    highlight:
      '前后矩阵与逐通道有理函数共同改变通道比例，有限曝光范围内会出现偏色和通道裁剪。固定非零的非负 RGB 比例提高曝光时，前置矩阵使三个通道都进入肩部，最终趋向显示白；图中有限采样的边界不等于无限曝光的极限。',
    provenance: {
      data: 'Stephen Hill，BakingLab ACES.hlsl',
      domain:
        '线性 Rec.709 场景值 → 线性 Rec.709 显示值，裁剪到 0–1 后做 sRGB 编码',
      approximation:
        '对 ACES 1.x RRT + sRGB ODT 的拟合，不是 ACES 2.0，也不是完整的输出变换',
      reference: 'AMPAS ACES 1.x；Hill, BakingLab, 2016',
    },
    mount: latticeFigure(transformLattices.aces),
  },
  {
    id: 'agx',
    number: 17,
    title: 'AgX',
    conditions:
      'inset → log₂ [−12.47, +4.03] EV → 6 次多项式 → outset · sRGB 编码',
    grade: 'approximate',
    highlight:
      'inset 矩阵混合通道，log₂ 对比度曲线压缩高光，再经 outset 和显示编码形成输出。固定非零的非负 RGB 比例提高曝光时，高光趋向近白色；与 Hill 拟合的差异在去饱和路径和裁剪行为，可对照有限曝光下的晶格形状。',
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
    id: 'protan',
    number: 18,
    title: 'Protanopia',
    conditions:
      'Machado 2009 · 严重度 1.0 · 线性 sRGB 坐标与均匀采样 · 点色经 sRGB 编码',
    grade: 'reference',
    highlight:
      '公布矩阵近似秩 2：线性 RGB 立方体被压到近似经过灰轴的平面，最小奇异方向主要沿 R 轴。矩阵系数的舍入使厚度不严格为零；模拟后红原色的相对亮度几乎减半。',
    provenance: {
      data: 'Machado, Oliveira, Fernandes 2009 严重度 1.0 矩阵，已对照 Colour Science 0.4.4',
      domain:
        '线性 sRGB 中均匀采样并做矩阵相乘；位置保留线性值，点色与色样经 sRGB 编码后裁剪显示',
      reference: 'Machado et al., IEEE TVCG 15(6), 2009',
    },
    mount: latticeFigure(transformLattices.protan),
  },
  {
    id: 'deutan',
    number: 19,
    title: 'Deuteranopia',
    conditions:
      'Machado 2009 · 严重度 1.0 · 线性 sRGB 坐标与均匀采样 · 点色经 sRGB 编码',
    grade: 'reference',
    highlight:
      '同样近似秩 2，线性晶格接近平面，但最小奇异方向含更多 G 分量。与 protan 对照，红原色的模拟相对亮度升高；右侧列出输入与最终模拟的亮度，便于区分几何压缩与亮度变化。',
    provenance: {
      data: 'Machado 2009 严重度 1.0 矩阵，已对照 Colour Science 0.4.4',
      domain:
        '线性 sRGB 中均匀采样并做矩阵相乘；位置保留线性值，点色与色样经 sRGB 编码后裁剪显示',
      reference: 'Machado et al., IEEE TVCG 15(6), 2009',
    },
    mount: latticeFigure(transformLattices.deutan),
  },
  {
    id: 'tritan',
    number: 20,
    title: 'Tritanopia',
    conditions:
      'Machado 2009 · 严重度 1.0 · 线性 sRGB 坐标与均匀采样 · 点色经 sRGB 编码',
    grade: 'reference',
    highlight:
      '这个矩阵并不奇异（det ≠ 0）：线性 RGB 立方体被压缩但仍有三维体积，最小奇异方向以 B 为主。它不是严格的二色视平面投影。',
    provenance: {
      data: 'Machado 2009 严重度 1.0 矩阵，已对照 Colour Science 0.4.4',
      domain:
        '线性 sRGB 中均匀采样并做矩阵相乘；位置保留线性值，点色与色样经 sRGB 编码后裁剪显示',
      approximation: 'Machado 模型的 tritan 结果不是严格的二色视投影',
      reference: 'Machado et al., IEEE TVCG 15(6), 2009',
    },
    mount: latticeFigure(transformLattices.tritan),
  },
  {
    id: 'rgc',
    number: 21,
    title: 'ACES Reference Gamut Compression',
    conditions:
      'S-Gamut3 → AP1 · 阈值 0.815 / 0.803 / 0.880 · 极限 1.147 / 1.264 / 1.312 · 幂 1.2',
    grade: 'reference',
    highlight:
      '令 A = max(R,G,B)，按距离 d = (A − c) / |A| 压缩；A = 0 时输出零。阈值内恒等，极限映射到 AP1 边界 d = 1，超过极限仍可能含负通道。AP1 色域不限制通道上限，超过参考立方体的 1 不代表越界。',
    provenance: {
      data: 'ACES 1.3 RGC 参数',
      domain: 'S-Gamut3 线性值经矩阵进入 AP1（ACEScg）坐标后压缩',
      reference: 'AMPAS, ACES Reference Gamut Compression, ACES 1.3, 2021',
    },
    mount: latticeFigure(transformLattices.rgc),
  },
];
export const groups: FigureGroup[] = [{ name: 'RGB 变换', figures }];
