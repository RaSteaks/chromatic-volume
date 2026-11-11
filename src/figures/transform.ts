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
  const singular = Math.abs(det) < 1e-3;
  const y = (rgb: Vec3) =>
    multiply(m, rgb).reduce((sum, v, i) => sum + v * LUMA[i], 0);
  const signed = (v: number) =>
    `${v >= 0 ? '+' : '−'}${Math.abs(v).toFixed(3)}`;
  return el(
    'div',
    { class: 'readout-list' },
    el('strong', {}, `Machado 矩阵 · 严重度 1.0`),
    el('span', {}, `det ${singular ? '0.0000（秩 2）' : det.toFixed(4)}`),
    el(
      'span',
      {},
      `${singular ? '零空间' : '最小奇异方向'}（线性 RGB）${collapsedDirection(m).map(signed).join(' ')}`,
    ),
    readoutTable(
      ['原色相对亮度 Y', '原始', '模拟'],
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
  const simulated = (u: Vec3) => encode(simulateCvd(decode(u), type));
  return {
    details: () => cvdDetails(type),
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
    title: 'ACES 1.x 色调映射（Hill 拟合）',
    conditions:
      '每通道 0.18·2^[−6.5, +6.5] · AP1 近似矩阵 + 有理函数 · 输出 sRGB 编码',
    grade: 'approximate',
    highlight:
      '曲线逐通道作用，改写了通道比例：高饱和高光不向白点收敛，而是沿立方体的棱滑向 R、G、B、C、M、Y 六个方向（"notorious six"）。曲线前后各有一个矩阵（含 RRT 的饱和度调整），中性轴以外的形变不全是曲线造成的。',
    provenance: {
      data: 'Stephen Hill，BakingLab ACES.hlsl',
      domain:
        '线性 Rec.709 场景值 → 线性 Rec.709 显示值，裁剪到 0–1 后做 sRGB 编码',
      approximation:
        '对 ACES 1.x RRT + sRGB ODT 的拟合，不是 ACES 2.0，也不是完整的输出变换',
      reference: 'AMPAS ACES 1.x；Hill, BakingLab, 2016',
    },
    mount: latticeFigure(toneFigure('ACES 拟合', acesFitted)),
  },
  {
    id: 'agx',
    number: 17,
    title: 'AgX',
    conditions:
      'inset → log₂ [−12.47, +4.03] EV → 6 次多项式 → outset · sRGB 编码',
    grade: 'approximate',
    highlight:
      'inset 矩阵先把原色向消色轴收拢，高饱和输入的三个通道因此更早一起进入肩部，高光沿接近直线的路径去饱和并汇向白点。与 ACES 拟合对照看棱上的颜色：这里不再停留在原色或二次色上。',
    provenance: {
      data: 'Benjamin Wrensch，Minimal AgX implementation, 2023',
      domain:
        '线性 Rec.709 输入；多项式输出按 gamma 2.2 解码为线性显示值，再统一 sRGB 编码',
      approximation:
        '默认对比度的多项式近似，与 Blender 中完整的 AgX（含 look 与 LUT）有细微差别',
      reference: 'Troy Sobotka, AgX',
    },
    mount: latticeFigure(toneFigure('AgX', agx)),
  },
  {
    id: 'protan',
    number: 18,
    title: 'Protanopia',
    conditions: 'Machado 2009 · 严重度 1.0 · 线性 sRGB · 显示为 sRGB 编码坐标',
    grade: 'reference',
    highlight:
      '矩阵秩为 2：立方体被压成过灰轴的一张平面，零空间方向（右侧）就是混淆方向，主要沿 R 轴。与 deutan 的区别在亮度：缺 L 视锥后红原色的相对亮度几乎减半。',
    provenance: {
      data: 'Machado, Oliveira, Fernandes 2009 严重度 1.0 矩阵，已对照 Colour Science 0.4.4',
      domain: '线性 sRGB 中矩阵相乘；晶格坐标与色样为 sRGB 编码值',
      reference: 'Machado et al., IEEE TVCG 15(6), 2009',
    },
    mount: latticeFigure(cvdFigure('protan')),
  },
  {
    id: 'deutan',
    number: 19,
    title: 'Deuteranopia',
    conditions: 'Machado 2009 · 严重度 1.0 · 线性 sRGB · 显示为 sRGB 编码坐标',
    grade: 'reference',
    highlight:
      '同样秩为 2、塌成一张平面，但混淆方向含更多 G 分量；红原色的相对亮度不降反升，红绿混淆表现为近似同明度的混淆，这是 deutan 比 protan 更难靠明暗区分红绿的原因。',
    provenance: {
      data: 'Machado 2009 严重度 1.0 矩阵，已对照 Colour Science 0.4.4',
      domain: '线性 sRGB 中矩阵相乘；晶格坐标与色样为 sRGB 编码值',
      reference: 'Machado et al., IEEE TVCG 15(6), 2009',
    },
    mount: latticeFigure(cvdFigure('deutan')),
  },
  {
    id: 'tritan',
    number: 20,
    title: 'Tritanopia',
    conditions: 'Machado 2009 · 严重度 1.0 · 线性 sRGB · 显示为 sRGB 编码坐标',
    grade: 'reference',
    highlight:
      '与另外两个不同，这个矩阵并不奇异（det ≠ 0）：立方体被压成一块很薄的板而不是平面，压缩方向以 B 为主。红绿差异基本保留。',
    provenance: {
      data: 'Machado 2009 严重度 1.0 矩阵，已对照 Colour Science 0.4.4',
      domain: '线性 sRGB 中矩阵相乘；晶格坐标与色样为 sRGB 编码值',
      approximation: 'Machado 模型的 tritan 结果不是严格的二色视投影',
      reference: 'Machado et al., IEEE TVCG 15(6), 2009',
    },
    mount: latticeFigure(cvdFigure('tritan')),
  },
  {
    id: 'rgc',
    number: 21,
    title: 'ACES Reference Gamut Compression',
    conditions:
      'S-Gamut3 → AP1 · 阈值 0.815 / 0.803 / 0.880 · 极限 1.147 / 1.264 / 1.312 · 幂 1.2',
    grade: 'reference',
    highlight:
      '每个通道按到消色轴的距离 d = (max − c) / max 压缩：阈值内恒等，阈值到极限之间用幂曲线把极限映射到色域边界 d = 1。三个通道各自压缩，色相只是近似保持；极限以外的点仍在框外。',
    provenance: {
      data: 'ACES 1.3 RGC 参数',
      domain: 'S-Gamut3 线性值经矩阵进入 AP1（ACEScg）坐标后压缩',
      reference: 'AMPAS, ACES Reference Gamut Compression, ACES 1.3, 2021',
    },
    mount: latticeFigure(rgcSpec),
  },
];
export const groups: FigureGroup[] = [{ name: 'RGB 变换', figures }];
