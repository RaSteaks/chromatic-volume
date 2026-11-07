import './color-management';
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
    | 'log';
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
    'ACEScg',
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
  if (target.kind === 'hsl' || target.kind === 'hsv') {
    const encoded = color.to('srgb').coords.map((value) => value ?? 0);
    // At white, HSL's saturation denominator approaches zero and amplifies
    // channel roundoff. Check RGB neutrality as well as the saturation threshold.
    if (
      Math.max(...encoded) - Math.min(...encoded) <= 1e-12 ||
      Math.abs(coords[1]) <= 0.001
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
    default:
      return coords.map((value) => value - 0.5) as Vec3;
  }
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
