import './color-management';
import './spaces';
import Color from 'colorjs.io';
import { createSamples, type Vec3 } from './model';

export interface ColorTarget {
  id: string;
  name: string;
  group: string;
  channels: [string, string, string];
  axes: [string, string, string];
  white: string;
  description: string;
  route: string;
  layout: string;
  kind:
    | 'rgb'
    | 'lab'
    | 'oklab'
    | 'lch'
    | 'oklch'
    | 'luv'
    | 'lchuv'
    | 'xyz'
    | 'hsl'
    | 'hsv'
    | 'log'
    | 'ycbcr'
    | 'hexcone'
    | 'lms'
    | 'ipt'
    | 'jzazbz'
    | 'zcam';
  /** What to look at in the figure: the visual takeaway, not the conversion. */
  highlight?: string;
}
const rgb = (
  id: string,
  name: string,
  white: string,
  description: string,
): ColorTarget => ({
  id,
  name,
  white,
  description,
  group: 'RGB / 工作空间',
  channels: ['R', 'G', 'B'],
  axes: ['R', 'G', 'B'],
  route: 'sRGB → 线性光 → XYZ → 目标 RGB',
  layout: 'R、G、B 各轴使用 0–1 标尺；不裁剪坐标。',
  kind: 'rgb',
});
export const colorTargets: ColorTarget[] = [
  {
    id: 'oklab',
    name: 'Oklab',
    group: '感知空间',
    channels: ['L', 'a', 'b'],
    axes: ['a', 'L', 'b'],
    white: 'D65',
    description:
      'L 表示感知明度；a 为绿—红，b 为蓝—黄。显示同一批 sRGB 颜色在感知空间中的分布。',
    route: 'sRGB → 线性光 → LMS → 立方根 → Oklab',
    layout: '竖轴 L 为 0–1；水平 a、b 等比例放大 1.5 倍以便观察。',
    kind: 'oklab',
  },
  {
    id: 'oklch',
    name: 'OKLCH',
    group: '感知空间',
    channels: ['L', 'C', 'h°'],
    axes: ['C cos h', 'L', 'C sin h'],
    white: 'D65',
    description:
      'Oklab 的圆柱表示：C 为色度，h 为色相角。圆柱绘图与 Oklab 具有相同形状，但读数使用 L、C、h。',
    route: 'sRGB → Oklab → L、C、h',
    layout: 'C、h 还原成水平平面坐标；无色彩时色相显示为未定义。',
    kind: 'oklch',
  },
  {
    id: 'lab',
    name: 'CIELAB · D50',
    group: '感知空间',
    channels: ['L*', 'a*', 'b*'],
    axes: ['a*', 'L*', 'b*'],
    white: 'D50（Bradford 适配）',
    description:
      'CIE 1976 L*a*b*。先将 sRGB 的 D65 白点适配到 D50，再计算 Lab；与 CSS lab() 的白点约定一致。',
    route: 'sRGB → XYZ D65 → Bradford D50 → Lab',
    layout: '竖轴 L* 为 0–100；水平 a*、b* 坐标各除以 200。',
    kind: 'lab',
  },
  {
    id: 'lab-d65',
    name: 'CIELAB · D65',
    group: '感知空间',
    channels: ['L*', 'a*', 'b*'],
    axes: ['a*', 'L*', 'b*'],
    white: 'D65',
    description:
      '以 D65 为参考白的 CIELAB。与 D50 版本的参考白不同，不能直接混用两种 Lab 数值。',
    route: 'sRGB → 线性光 → XYZ D65 → Lab D65',
    layout: '竖轴 L* 为 0–100；水平 a*、b* 坐标各除以 200。',
    kind: 'lab',
  },
  {
    id: 'lch',
    name: 'CIELCh · D50',
    group: '感知空间',
    channels: ['L*', 'C*', 'h°'],
    axes: ['C cos h', 'L*', 'C sin h'],
    white: 'D50（Bradford 适配）',
    description:
      'CIELAB D50 的圆柱表示，用色度和色相描述 a*、b*。与 Lab D50 形状一致，坐标读法不同。',
    route: 'sRGB → Lab D50 → L*、C*、h',
    layout: '色度与色相还原成水平平面；与 Lab D50 使用相同绘图比例。',
    kind: 'lch',
  },
  {
    id: 'luv',
    name: 'CIELUV',
    group: '感知空间',
    channels: ['L*', 'u*', 'v*'],
    axes: ['u*', 'L*', 'v*'],
    white: 'D65',
    description:
      'CIE 1976 L*u*v*，以明度与两条色度轴表示颜色。这里使用 D65 参考白。',
    route: 'sRGB → XYZ D65 → CIELUV',
    layout: '竖轴 L* 为 0–100；水平 u*、v* 坐标各除以 280。',
    kind: 'luv',
  },
  {
    id: 'lchuv',
    name: 'LChuv',
    group: '感知空间',
    channels: ['L*', 'C*', 'h°'],
    axes: ['C cos h', 'L*', 'C sin h'],
    white: 'D65',
    description: 'CIELUV 的圆柱表示。保持 LUV 的几何关系，使用色度与色相读数。',
    route: 'sRGB → CIELUV → L*、C*、h',
    layout: '与 CIELUV 使用相同绘图比例；色相沿水平面旋转。',
    kind: 'lchuv',
  },
  {
    id: 'xyz-d65',
    name: 'CIE XYZ · D65',
    group: '三刺激值',
    channels: ['X', 'Y', 'Z'],
    axes: ['X', 'Y', 'Z'],
    white: 'D65',
    description:
      'CIE XYZ 三刺激值。Y 对应相对亮度；参考白 Y = 1。这里的体积是 sRGB 色域在 XYZ 中的分布。',
    route: 'sRGB → 去除传递函数 → 线性矩阵 → XYZ D65',
    layout: 'X、Y、Z 使用相同单位和比例；不做逐轴归一化。',
    kind: 'xyz',
  },
  {
    id: 'xyz-d50',
    name: 'CIE XYZ · D50',
    group: '三刺激值',
    channels: ['X', 'Y', 'Z'],
    axes: ['X', 'Y', 'Z'],
    white: 'D50（Bradford 适配）',
    description:
      '将 sRGB 对应的 XYZ 从 D65 适配到 D50。白点适配用于保持不同参考白下的相对颜色关系。',
    route: 'sRGB → XYZ D65 → Bradford D50',
    layout: 'X、Y、Z 使用相同单位和比例；参考白 Y = 1。',
    kind: 'xyz',
  },
  rgb(
    'srgb',
    'sRGB',
    'D65',
    '原始、带传递函数编码的 sRGB 通道值。选择此目标时，两边为相同的 RGB 立方体。',
  ),
  rgb(
    'srgb-linear',
    '线性 sRGB',
    'D65',
    '去掉 sRGB 传递函数后得到的线性光通道值。均匀编码采样在暗部会变得更密集。',
  ),
  rgb(
    'p3',
    'Display P3',
    'D65',
    '将同一批 sRGB 颜色表示为 Display P3 坐标。这不是生成 P3 全色域，也不会凭空增加饱和度。',
  ),
  rgb(
    'rec2020',
    'Rec.2020',
    'D65',
    '使用 BT.2020 基色与显示端 Gamma 2.4 表示同一批颜色。这里只转换色域坐标，不进行 HDR 显示映射。',
  ),
  rgb(
    'a98rgb',
    'Adobe RGB (1998)',
    'D65',
    '使用 Adobe RGB (1998) 兼容基色及编码表示源颜色，适合比较不同 RGB 工作空间。',
  ),
  rgb(
    'prophoto',
    'ProPhoto RGB',
    'D50（Bradford 适配）',
    '宽色域 RGB 工作空间。先适配至 D50，再进行坐标与传递函数转换。',
  ),
  rgb(
    'acescg',
    'ACEScg · AP1',
    'ACES D60',
    '转换为 AP1 基色、线性光编码与 ACES 白点。输入仍是 0–1 的 sRGB 样本，不包含额外场景动态范围。',
  ),
  {
    ...rgb(
      'acescc',
      'ACEScc',
      'ACES D60',
      'AP1 基色的对数编码。黑色使用 ACEScc 的有限编码值；本功能不包含相机 IDT 或输出显示变换。',
    ),
    kind: 'log',
    layout: '三个通道共用 −0.36 至 0.56 的可视标尺，覆盖本次 sRGB 采样。',
  },
  {
    id: 'hsl',
    name: 'HSL',
    group: '圆柱模型',
    channels: ['H°', 'S%', 'L%'],
    axes: ['S cos H', 'L', 'S sin H'],
    white: 'D65 / sRGB',
    description:
      'sRGB 的色相、饱和度与明度表示。HSL 明度不是感知明度，不能用于跨色相比较亮度。',
    route: 'sRGB → H、S、L',
    layout: 'H 绕竖轴旋转，S 为半径，L 为高度；显示为圆柱坐标。',
    kind: 'hsl',
  },
  {
    id: 'hsv',
    name: 'HSV',
    group: '圆柱模型',
    channels: ['H°', 'S%', 'V%'],
    axes: ['S cos H', 'V', 'S sin H'],
    white: 'D65 / sRGB',
    description:
      'sRGB 的色相、饱和度与最大通道值表示。V 为 RGB 最大值，不是测量亮度。',
    route: 'sRGB → H、S、V',
    layout: 'H 为角度，S 为半径，V 为高度；灰阶的色相未定义。',
    kind: 'hsv',
  },
];
colorTargets.push(
  rgb(
    'rec709',
    'Rec.709 · OETF',
    'D65',
    'BT.709 基色及分段 OETF 编码，解码采用 OETF 反函数；不是 BT.1886 显示响应。',
  ),
  rgb(
    'rec1886',
    'Rec.709 · BT.1886',
    'D65',
    'Rec.709 基色与 BT.1886 显示 EOTF；本预设黑位 0、白位 100 cd/m²，等价于 Gamma 2.4。LUT 配置可调整黑白位。',
  ),
);
const wide = (id: string, name: string, description: string) => ({
  ...rgb(id, name, 'D65', description),
  group: '宽色域 / 摄影机',
  route: '源 → XYZ → 目标基色（线性光）',
  layout: 'R、G、B 为线性光 0–1；不裁剪坐标。',
});
colorTargets.push(
  wide(
    'dwg-linear',
    'DaVinci Wide Gamut',
    'DaVinci Resolve 的工作色域，基色远超可见光谱轨迹，用于在调色中容纳所有摄影机色域。这里使用线性光坐标。',
  ),
  wide(
    'camera-arri4',
    'ARRI Wide Gamut 4',
    'ARRI ALEXA 35 的摄影机色域（线性）。与 LogC4 搭配用于记录。',
  ),
  wide(
    'camera-sgamut3',
    'S-Gamut3',
    'Sony 摄影机色域（线性），比 Rec.2020 更宽；常与 S-Log3 搭配。',
  ),
  {
    id: 'ycbcr709',
    name: 'Y′CbCr · BT.709',
    group: '视频信号',
    channels: ['Y′', 'Cb', 'Cr'],
    axes: ['Cb', 'Y′', 'Cr'],
    white: 'D65',
    description:
      '视频信号把 R′G′B′ 拆成亮度 Y′ 与两个色差 Cb、Cr。这里用 BT.709 系数作用于 sRGB 编码值，全范围。',
    route: 'sRGB 编码 R′G′B′ → BT.709 线性组合 → Y′、Cb、Cr',
    layout: 'Y′ 为 0–1 竖轴，Cb、Cr 为 ±0.5 水平轴，三轴同单位。',
    kind: 'ycbcr',
    highlight:
      '从 Y′ 轴正下方看就是矢量示波器（选图例「Y′CbCr：矢量图与波形」）：六个角依次是 R、Mg、B、Cy、G、Yl。「俯视」从上方看，得到的是左右镜像的版本；点「正视」，竖轴就是波形示波器上的亮度。',
  },
  {
    id: 'hsv-hexcone',
    name: 'HSV 六棱锥',
    group: '圆柱模型',
    channels: ['H°', 'C', 'V'],
    axes: ['红 C', 'V', '绿 C'],
    white: 'D65 / sRGB',
    description:
      'HSV 的原始几何：色相沿六边形走一圈，半径是色度 C = max − min，高度是 V = max。黑色收成锥尖。',
    route: 'sRGB → max、min → H、C、V',
    layout: '水平面为六边形投影，C = 1 时到达顶点；V 为高度。参数示意图。',
    kind: 'hexcone',
    highlight:
      '同一个 RGB 立方体，从白点方向看下去就是六棱锥：纯色在顶面六个角，黑色在锥尖。',
  },
  {
    id: 'hsl-bicone',
    name: 'HSL 双六棱锥',
    group: '圆柱模型',
    channels: ['H°', 'C', 'L'],
    axes: ['红 C', 'L', '绿 C'],
    white: 'D65 / sRGB',
    description:
      'HSL 的原始几何：半径为色度 C，高度为 L = (max + min) / 2。纯色都落在 L = 0.5 的腰线上。',
    route: 'sRGB → max、min → H、C、L',
    layout: '水平面为六边形投影，L 为高度。参数示意图。',
    kind: 'hexcone',
    highlight:
      '黑、白各占一个锥尖，所有纯色挤在中间的六边形腰线上——这就是 HSL「明度」与感知亮度对不上的原因。',
  },
  {
    id: 'lms-hpe',
    name: 'LMS 视锥响应',
    group: '视觉与 HDR',
    channels: ['L', 'M', 'S'],
    axes: ['L', 'M', 'S'],
    white: 'D65（归一化）',
    description:
      '长、中、短波视锥的响应。使用 Hunt–Pointer–Estévez 矩阵并归一化到 D65，与 IPT 所用矩阵相同。',
    route: 'XYZ D65 → HPE 矩阵 → L、M、S',
    layout: 'L、M、S 三轴同单位，白点为 (1, 1, 1)。',
    kind: 'lms',
    highlight:
      'L 与 M 视锥的响应高度重叠，整个体积被压成一条贴着对角线的细长形状。',
  },
  {
    id: 'ipt',
    name: 'IPT',
    group: '视觉与 HDR',
    channels: ['I', 'P', 'T'],
    axes: ['P', 'I', 'T'],
    white: 'D65',
    description:
      'Ebner & Fairchild（1998）为色相均匀设计的对立色空间：LMS 经 0.43 次幂压缩后线性组合。Oklab 和 ICtCp 都沿用了这一结构。',
    route: 'XYZ D65 → HPE LMS → 幂 0.43 → I、P、T',
    layout: '三轴统一缩放 0.8，I 为竖轴。',
    kind: 'ipt',
    highlight:
      '与 Oklab 并排看：骨架几乎一样，差别在蓝色一角——IPT 当初就是为了修正 CIELAB 的蓝色色相弯曲。',
  },
  {
    id: 'jzazbz',
    name: 'Jzazbz',
    group: '视觉与 HDR',
    channels: ['Jz', 'az', 'bz'],
    axes: ['az', 'Jz', 'bz'],
    white: 'D65 · 203 cd/m²',
    description:
      'Safdar 等（2017）面向 HDR 的均匀色彩空间，用 PQ 曲线压缩视锥响应，可以覆盖到 10000 cd/m²。这里把参考白放在 203 cd/m²。',
    route: 'XYZ → 绝对亮度 203 cd/m² → LMS → PQ → Jz、az、bz',
    layout: '三轴统一放大 4 倍；SDR 白点 Jz ≈ 0.22。',
    kind: 'jzazbz',
    highlight:
      'SDR 白只到 Jz ≈ 0.22，体积压在底部；上方大片空间留给 HDR 高光。',
  },
  {
    id: 'zcam',
    name: 'ZCAM',
    group: '视觉与 HDR',
    channels: ['J', 'C', 'h°'],
    axes: ['C cos h', 'J', 'C sin h'],
    white: 'D65 · 203 cd/m²',
    description:
      'Safdar 等（2021）基于 Jzazbz 的 HDR 色貌模型。观看条件：白 203 cd/m²，适应亮度与背景为白的 20%，普通环境。常数已与 Colour Science 0.4.4 逐项核对。',
    route: 'XYZ → CAT02 适应 → Iz、az、bz → 明度 J、色度 C、色相 h',
    layout: 'J 为 0–100 竖轴；C 与 J 同单位（除以 100）。',
    kind: 'zcam',
    highlight:
      '色貌模型考虑了观看条件：同一批颜色的色度 C 比 Lab 小得多，体积显得瘦高。',
  },
);
const highlights: Record<string, string> = {
  oklab:
    '立方体被扭成斜置的块：黄色角浮到高处，蓝色角沉到底部。每个色相的最亮点高度都不一样。',
  oklch: '与 Oklab 同一形状，只是读数换成明度、色度、色相角。',
  lab: '对立色坐标的经典版本。和 Oklab 对比，注意蓝紫一角的伸展方向。',
  'lab-d65': '与 D50 版本形状几乎相同，参考白不同导致整体轻微偏移。',
  lch: 'CIELAB 的圆柱读法，形状与 Lab D50 一致。',
  luv: 'u*v* 平面比 Lab 更宽更扁，红色一角明显外凸。可在「对照」里选 CIELAB 并排比较。',
  lchuv: 'CIELUV 的圆柱读法，形状不变。',
  'xyz-d65':
    '线性三刺激值中，RGB 立方体变成一个斜切的平行六面体：每条棱都是一个原色的强度。',
  'xyz-d50': '同一个平行六面体，经 Bradford 适配后整体向 D50 白点偏转。',
  srgb: '两侧是同一个立方体：恒等映射，用来校准眼睛。',
  'srgb-linear':
    '去掉传递函数后，均匀编码的样本向暗部聚拢——编码把更多码值留给了暗部。',
  p3: 'sRGB 立方体在 P3 坐标里缩进内部：P3 能表示的颜色比 sRGB 多一圈。',
  rec2020: 'sRGB 在 Rec.2020 里缩得更小，留出的外圈就是宽色域。',
  a98rgb: '绿色方向比 sRGB 宽，sRGB 立方体在其中主要向绿—青方向收缩。',
  prophoto: '基色超出可见光谱，sRGB 只占其中一小块。',
  acescg: 'ACES AP1：比 Rec.2020 略宽，是 ACES 管线中的渲染工作空间。',
  acescc: '对数编码把暗部大幅展开，立方体的底部被拉长。',
  hsl: '圆柱参数图：纯色停在中间高度，黑白收向两端。另见「HSL 双六棱锥」。',
  hsv: '圆柱参数图：色相绕轴，饱和度为半径。另见「HSV 六棱锥」。',
  rec709: 'BT.709 OETF 与 sRGB 曲线略有不同，暗部的点距随之改变。',
  rec1886: 'BT.1886 是显示端曲线；黑位为 0 时与 Gamma 2.4 相同。',
};
for (const target of colorTargets)
  target.highlight ??= highlights[target.id] ?? target.description;
export type TargetId = string;
export function getTarget(id: string): ColorTarget | undefined {
  return colorTargets.find((target) => target.id === id);
}
export const colorSources = colorTargets.filter(
  (target) => target.kind === 'rgb' || target.kind === 'log',
);

// RGB spaces have an explicit finite unit gamut. ACEScc uses the encoded
// endpoints for linear 0–1; this samples a bounded slice, not the entire HDR domain.
export function createSourceSamples(density: number, source: string): Vec3[] {
  const points = createSamples(density);
  if (source !== 'acescc') return points;
  const low = (-16 + 9.72) / 17.52;
  const high = 9.72 / 17.52;
  return points.map(
    (point) => point.map((value) => low + value * (high - low)) as Vec3,
  );
}

export function convertColor(
  rgb: Vec3,
  target: ColorTarget,
  source = 'srgb',
): Vec3 {
  // Color.js owns matrices/adaptation; color-management registers the shared curves.
  // Keep powerless hue as NaN in numeric results; only the drawing substitutes an angle.
  const color = new Color(source, rgb);
  const coords = color
    .to(target.id)
    .coords.map((value) => (value === null ? Number.NaN : value)) as Vec3;
  // Matrix/adaptation roundoff can make a neutral RGB have tiny nonzero saturation.
  // HSL uses the CSS powerless-hue threshold (S in percent); HSV shares that convention.
  if (['hsl', 'hsv', 'hexcone'].includes(target.kind)) {
    const encoded = color.to('srgb').coords.map((value) => value ?? 0);
    // Equal channels in an RGB source are that space's white direction by
    // definition; rounded vendor matrices must not invent a hue for them.
    const neutralSource =
      ['rgb', 'log'].includes(getTarget(source)?.kind ?? '') &&
      Math.max(...rgb) - Math.min(...rgb) <= 1e-12;
    // At white, HSL's saturation denominator approaches zero and amplifies
    // channel roundoff. Check RGB neutrality as well as the saturation threshold.
    if (
      neutralSource ||
      Math.max(...encoded) - Math.min(...encoded) <= 1e-12 ||
      Math.abs(coords[1]) <= (target.kind === 'hexcone' ? 1e-5 : 0.001)
    ) {
      coords[0] = Number.NaN;
      coords[1] = 0;
    }
  }
  return coords;
}
export function targetPosition(
  coords: Vec3,
  target: ColorTarget,
  equalAxes = true,
): Vec3 {
  const [p, q, r] = coords;
  const polar = (
    lightness: number,
    chroma: number,
    hue: number,
    scale: number,
  ): Vec3 => {
    const angle = ((Number.isFinite(hue) ? hue : 0) * Math.PI) / 180;
    return [
      chroma * Math.cos(angle) * scale,
      lightness - 0.5,
      chroma * Math.sin(angle) * scale,
    ];
  };
  switch (target.kind) {
    case 'oklab':
      return equalAxes ? [q, p - 0.5, r] : [q * 1.5, p - 0.5, r * 1.5];
    case 'oklch':
      return polar(p, q, r, equalAxes ? 1 : 1.5);
    case 'lab':
      return [q / 200, equalAxes ? (p - 50) / 200 : p / 100 - 0.5, r / 200];
    case 'lch':
      return polar(equalAxes ? 0.5 + (p - 50) / 200 : p / 100, q, r, 1 / 200);
    case 'luv':
      return [q / 280, equalAxes ? (p - 50) / 280 : p / 100 - 0.5, r / 280];
    case 'lchuv':
      return polar(equalAxes ? 0.5 + (p - 50) / 280 : p / 100, q, r, 1 / 280);
    case 'hsl':
    case 'hsv':
      return polar(r / 100, q, p, 1 / 200);
    case 'log':
      return coords.map((value) => (value + 0.36) / 0.92 - 0.5) as Vec3;
    case 'ycbcr':
      return [q, p - 0.5, r];
    case 'hexcone': {
      const [x, z] = hexagonPoint(p, q);
      return [x * 0.5, r - 0.5, z * 0.5];
    }
    case 'ipt':
      return [q * 0.8, (p - 0.5) * 0.8, r * 0.8];
    case 'jzazbz':
      return [q * 4, p * 4 - 0.5, r * 4];
    case 'zcam':
      return polar(p / 100, q, r, equalAxes ? 1 / 100 : 1 / 50);
    default:
      return coords.map((value) => value - 0.5) as Vec3;
  }
}
/** Point on the unit hexagon (vertices at 0°, 60°, …) scaled by chroma. */
export function hexagonPoint(hue: number, chroma: number): [number, number] {
  const h = ((((Number.isFinite(hue) ? hue : 0) % 360) + 360) % 360) / 60;
  const k = Math.floor(h) % 6,
    f = h - Math.floor(h);
  const vertex = (n: number) => [
    Math.cos((n * Math.PI) / 3),
    Math.sin((n * Math.PI) / 3),
  ];
  const [a, b] = [vertex(k), vertex(k + 1)];
  return [
    ((1 - f) * a[0] + f * b[0]) * chroma,
    ((1 - f) * a[1] + f * b[1]) * chroma,
  ];
}
export function sourcePosition(rgb: Vec3): Vec3 {
  return rgb.map((value) => value - 0.5) as Vec3;
}

// Fixed world-unit anchors; no per-view bounds fitting. Endpoint labels supply
// numerical axis values so geometry can be related back to the selected model.
export function plotGuides(target: ColorTarget, equalAxes: boolean) {
  let origin: Vec3 = [0, 0, 0];
  let ends: Vec3[];
  let values: Vec3;
  switch (target.kind) {
    case 'oklab':
    case 'lab':
    case 'luv':
    case 'oklch':
    case 'lch':
    case 'lchuv': {
      const [lightness, chroma] = {
        oklab: [1, 0.4],
        oklch: [1, 0.4],
        lab: [100, 100],
        lch: [100, 100],
        luv: [100, 140],
        lchuv: [100, 140],
      }[target.kind];
      const cylindrical = ['oklch', 'lch', 'lchuv'].includes(target.kind);
      // Polar endpoints describe the Cartesian axes, not an axis measured in degrees.
      ends = [
        [0, chroma, 0],
        [lightness, 0, 0],
        cylindrical ? [0, chroma, 90] : [0, 0, chroma],
      ];
      values = [chroma, lightness, chroma];
      break;
    }
    case 'hsl':
    case 'hsv':
      ends = [
        [0, 100, 0],
        [0, 0, 100],
        [90, 100, 0],
      ];
      values = [100, 100, 100];
      break;
    case 'ycbcr':
      ends = [
        [0, 0.5, 0],
        [1, 0, 0],
        [0, 0, 0.5],
      ];
      values = [0.5, 1, 0.5];
      break;
    case 'hexcone':
      ends = [
        [0, 1, 0],
        [0, 0, 1],
        [120, 1, 0],
      ];
      values = [1, 1, 1];
      break;
    case 'ipt':
      ends = [
        [0, 0.5, 0],
        [1, 0, 0],
        [0, 0, 0.5],
      ];
      values = [0.5, 1, 0.5];
      break;
    case 'jzazbz':
      ends = [
        [0, 0.1, 0],
        [0.25, 0, 0],
        [0, 0, 0.1],
      ];
      values = [0.1, 0.25, 0.1];
      break;
    case 'zcam':
      ends = [
        [0, 30, 0],
        [100, 0, 0],
        [0, 30, 90],
      ];
      values = [30, 100, 30];
      break;
    case 'log':
      origin = [-0.36, -0.36, -0.36];
      ends = [
        [0.56, -0.36, -0.36],
        [-0.36, 0.56, -0.36],
        [-0.36, -0.36, 0.56],
      ];
      values = [0.56, 0.56, 0.56];
      break;
    default:
      ends = [
        [1, 0, 0],
        [0, 1, 0],
        [0, 0, 1],
      ];
      values = [1, 1, 1];
  }
  return {
    origin: targetPosition(origin, target, equalAxes),
    originLabel: target.kind === 'log' ? '−0.36' : '0',
    ends: ends.map((coords) => targetPosition(coords, target, equalAxes)),
    labels: target.axes.map((axis, i) => `${axis} ${values[i]}`),
  };
}
