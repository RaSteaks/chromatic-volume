import type { LutEncoding } from './color-management';
export type Vec3 = [number, number, number];
export type StageId =
  | 'saturation'
  | 'crosstalk'
  | 'bleach'
  | 'brilliance'
  | 'contrast'
  | 'tint'
  | 'brightness'
  | 'sectorSaturation'
  | 'skew'
  | 'squash';
export interface Parameter {
  key: string;
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  unit?: string;
}
export interface StageDefinition {
  id: StageId;
  name: string;
  english: string;
  description: string;
  geometry: string;
  formula: string;
  parameters: Parameter[];
}
export interface Stage {
  id: StageId;
  enabled: boolean;
  values: Record<string, number>;
}
export interface LabState {
  interpolation: 'trilinear' | 'tetrahedral';
  equalAxes: boolean;
  flatColors: boolean;
  source: string;
  plot: string;
  lutInput: LutEncoding;
  lutOutput: LutEncoding;
  stages: Stage[];
  strength: number;
  density: number;
  target: string;
  preserve: boolean;
  vectors: boolean;
  axes: boolean;
  pointSize: number;
  yaw: number;
  pitch: number;
  zoom: number;
  /** Optional comparison model drawn on the left instead of the source. */
  compare: string;
  overlayOptimal: boolean;
  overlayPointer: boolean;
  /** Gradient-path colour pair id, or '' when hidden. */
  gradient: string;
}
const amount = (label: string, initial = 0, max = 1): Parameter => ({
  key: 'amount',
  label,
  min: 0,
  max,
  step: 0.01,
  initial,
});
const sector: Parameter = {
  key: 'hue',
  label: '区域中心色相',
  min: 0,
  max: 360,
  step: 1,
  initial: 130,
  unit: '°',
};
export const definitions: StageDefinition[] = [
  {
    id: 'saturation',
    name: '色彩饱和度',
    english: 'Colour Saturation',
    description:
      '分别拉伸红绿与蓝黄方向。两条轴的比例不同时，色相也会随之改变。',
    geometry: '沿对立色轴伸展或收缩',
    formula: 'a′ = sₐ · a    b′ = sᵦ · b',
    parameters: [
      {
        key: 'redGreen',
        label: '红 — 绿轴',
        min: 0,
        max: 2,
        step: 0.01,
        initial: 1,
      },
      {
        key: 'blueYellow',
        label: '蓝 — 黄轴',
        min: 0,
        max: 2,
        step: 0.01,
        initial: 1,
      },
    ],
  },
  {
    id: 'crosstalk',
    name: '色彩串扰',
    english: 'Colour Crosstalk',
    description:
      '让两条对立色轴相互影响。观察黄色如何向橙色偏移，以及截面怎样产生剪切。',
    geometry: '剪切色体积的横截面',
    formula: 'a′ = a + k₁b    b′ = b + k₂a',
    parameters: [
      {
        key: 'ab',
        label: '蓝黄 → 红绿',
        min: -0.8,
        max: 0.8,
        step: 0.01,
        initial: 0,
      },
      {
        key: 'ba',
        label: '红绿 → 蓝黄',
        min: -0.8,
        max: 0.8,
        step: 0.01,
        initial: 0,
      },
    ],
  },
  {
    id: 'bleach',
    name: '高光褪色',
    english: 'Highlight Bleach',
    description:
      '越明亮的颜色，越靠近中性轴。改变起点，观察高光部分如何逐渐收拢。',
    geometry: '高亮区域向中性轴收口',
    formula: '(a′, b′) = (1 − w(E)) · (a, b)',
    parameters: [
      amount('褪色强度'),
      {
        key: 'pivot',
        label: '开始亮度',
        min: 0.1,
        max: 0.9,
        step: 0.01,
        initial: 0.45,
      },
    ],
  },
  {
    id: 'brilliance',
    name: '鲜亮度降低',
    english: 'Brilliance Reduction',
    description:
      '让明亮且饱和的颜色向下移动，呈现更深沉的颜色。与高光褪色交换顺序，观察结果差异。',
    geometry: '饱和颜色沿亮度方向下移',
    formula: 'E′ = E − d · C · max(E, 0)',
    parameters: [amount('降低强度', 0, 0.8)],
  },
  {
    id: 'contrast',
    name: '对比增强',
    english: 'Contrast Boost',
    description: '以中灰为中心展开亮度间距，并用平滑曲线收拢极端亮度。',
    geometry: '重新分配亮度轴上的间距',
    formula: 'E′ = ½ + ½ · tanh(k · (E − ½)) / tanh(k/2)',
    parameters: [amount('对比强度', 0, 2)],
  },
  {
    id: 'tint',
    name: '中性色偏',
    english: 'Neutral Tint',
    description: '为接近中性的颜色增加色偏。离中性轴越远，影响越小。',
    geometry: '中性轴向颜色方向弯曲',
    formula: '(a′, b′) = (a, b) + t · exp(−6C)',
    parameters: [
      {
        key: 'a',
        label: '绿 ↔ 红',
        min: -0.25,
        max: 0.25,
        step: 0.005,
        initial: 0,
      },
      {
        key: 'b',
        label: '蓝 ↔ 黄',
        min: -0.25,
        max: 0.25,
        step: 0.005,
        initial: 0,
      },
    ],
  },
  {
    id: 'brightness',
    name: '区域亮度',
    english: 'Sector Brightness',
    description: '在一个宽色相区域内调整亮度，中心变化最强，向两侧平滑衰减。',
    geometry: '选定色相区域上下移动',
    formula: 'E′ = E + w(h) · ΔE · C',
    parameters: [
      { ...sector },
      {
        key: 'amount',
        label: '亮度偏移',
        min: -0.5,
        max: 0.5,
        step: 0.01,
        initial: 0,
      },
    ],
  },
  {
    id: 'sectorSaturation',
    name: '区域饱和度',
    english: 'Sector Saturation',
    description: '只让所选色相区域沿径向伸缩，其他方向保留原有的颜色关系。',
    geometry: '局部向外展开或向内收缩',
    formula: 'C′ = C · (1 + w(h) · s)',
    parameters: [
      { ...sector },
      {
        key: 'amount',
        label: '饱和度变化',
        min: -1,
        max: 1,
        step: 0.01,
        initial: 0,
      },
    ],
  },
  {
    id: 'skew',
    name: '区域色相偏移',
    english: 'Sector Skew',
    description: '把一个宽色相区域朝另一方向旋转。观察点列如何形成连续的弯曲。',
    geometry: '局部绕中性轴旋转',
    formula: 'h′ = h + w(h) · θ',
    parameters: [
      { ...sector },
      {
        key: 'amount',
        label: '偏移角度',
        min: -90,
        max: 90,
        step: 1,
        initial: 0,
        unit: '°',
      },
    ],
  },
  {
    id: 'squash',
    name: '区域色相聚拢',
    english: 'Sector Squash',
    description:
      '缩小或扩大中心色附近的色相差异。聚拢改变颜色之间的间距，而不是整体旋转。',
    geometry: '相邻色相向中心聚拢',
    formula: 'h′ = h − w(h) · q · Δh',
    parameters: [
      { ...sector },
      {
        key: 'amount',
        label: '聚拢 / 扩散',
        min: -1,
        max: 1,
        step: 0.01,
        initial: 0,
      },
    ],
  },
];
export const stageDefinition = (id: StageId) =>
  definitions.find((definition) => definition.id === id)!;
export const clamp = (value: number, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
const ROOT2 = Math.sqrt(2);
const ROOT6 = Math.sqrt(6);

// An invertible, linear teaching space. E is mean RGB, NOT FilmLight Eab or scene exposure.
export function toOpponent([r, g, b]: Vec3): Vec3 {
  return [(r + g + b) / 3, (r - g) / ROOT2, (r + g - 2 * b) / ROOT6];
}
export function toRgb([e, a, b]: Vec3): Vec3 {
  return [
    e + a / ROOT2 + b / ROOT6,
    e - a / ROOT2 + b / ROOT6,
    e - (2 * b) / ROOT6,
  ];
}
export function createStages(): Stage[] {
  return definitions.map((definition) => ({
    id: definition.id,
    enabled: true,
    values: Object.fromEntries(
      definition.parameters.map((parameter) => [
        parameter.key,
        parameter.initial,
      ]),
    ),
  }));
}
export function defaultState(): LabState {
  return {
    interpolation: 'tetrahedral',
    equalAxes: true,
    flatColors: true,
    stages: createStages(),
    strength: 1,
    density: 9,
    source: 'srgb',
    plot: 'native',
    lutInput: { gamut: '', gamma: '', black: 0, white: 100 },
    lutOutput: { gamut: '', gamma: '', black: 0, white: 100 },
    target: 'oklab',
    preserve: true,
    vectors: false,
    axes: true,
    pointSize: 1,
    yaw: Math.PI / 4,
    pitch: 0.57,
    zoom: 1,
    compare: '',
    overlayOptimal: false,
    overlayPointer: false,
    gradient: '',
  };
}
export function createSamples(density: number): Vec3[] {
  return Array.from({ length: density ** 3 }, (_, index) => [
    Math.floor(index / (density * density)) / (density - 1),
    (Math.floor(index / density) % density) / (density - 1),
    (index % density) / (density - 1),
  ]);
}
export function applyStage(input: Vec3, stage: Stage): Vec3 {
  if (!stage.enabled) return [...input];
  let [e, a, b] = toOpponent(input);
  const v = stage.values;
  const c = Math.hypot(a, b);
  const h = Math.atan2(b, a);
  const delta = Math.atan2(
    Math.sin(h - ((v.hue ?? 0) * Math.PI) / 180),
    Math.cos(h - ((v.hue ?? 0) * Math.PI) / 180),
  );
  // Half-volume sectors blend smoothly to zero at ±90 degrees.
  const weight = Math.max(0, Math.cos(delta)) ** 2;
  switch (stage.id) {
    case 'saturation':
      a *= v.redGreen;
      b *= v.blueYellow;
      break;
    case 'crosstalk':
      [a, b] = [a + v.ab * b, b + v.ba * a];
      break;
    case 'bleach': {
      const t = clamp((e - v.pivot) / (1 - v.pivot));
      const scale = 1 - v.amount * t * t * (3 - 2 * t);
      a *= scale;
      b *= scale;
      break;
    }
    case 'brilliance':
      e -= v.amount * c * Math.max(0, e);
      break;
    case 'contrast': {
      const k = v.amount * 2;
      if (k > 0) e = 0.5 + (0.5 * Math.tanh(k * (e - 0.5))) / Math.tanh(k / 2);
      break;
    }
    case 'tint':
      a += v.a * Math.exp(-6 * c);
      b += v.b * Math.exp(-6 * c);
      break;
    case 'brightness':
      e += weight * v.amount * c;
      break;
    case 'sectorSaturation':
      a *= 1 + weight * v.amount;
      b *= 1 + weight * v.amount;
      break;
    case 'skew': {
      const angle = h + (weight * v.amount * Math.PI) / 180;
      a = c * Math.cos(angle);
      b = c * Math.sin(angle);
      break;
    }
    case 'squash': {
      const angle = h - weight * v.amount * delta;
      a = c * Math.cos(angle);
      b = c * Math.sin(angle);
      break;
    }
  }
  // Keep out-of-gamut coordinates intact; only the final display colors are clipped.
  return toRgb([e, a, b]);
}
export function transform(
  input: Vec3,
  stages: Stage[],
  strength: number,
): Vec3 {
  if (strength === 0) return [...input];
  const output = stages.reduce(applyStage, input);
  return input.map(
    (channel, index) => channel + (output[index] - channel) * strength,
  ) as Vec3;
}
export type PresetId = 'neutral' | 'film' | 'bleach' | 'teal';
export function presetStages(preset: PresetId): Stage[] {
  const stages = createStages();
  const set = (id: StageId, values: Record<string, number>) =>
    Object.assign(stages.find((stage) => stage.id === id)!.values, values);
  if (preset === 'film') {
    set('saturation', { redGreen: 1.18, blueYellow: 0.88 });
    set('crosstalk', { ab: 0.12, ba: -0.08 });
    set('bleach', { amount: 0.65, pivot: 0.35 });
    set('brilliance', { amount: 0.24 });
    set('contrast', { amount: 0.6 });
  } else if (preset === 'bleach') {
    set('saturation', { redGreen: 0.68, blueYellow: 0.72 });
    set('bleach', { amount: 0.85, pivot: 0.25 });
    set('contrast', { amount: 1.3 });
  } else if (preset === 'teal') {
    set('crosstalk', { ab: -0.2, ba: 0.15 });
    set('tint', { a: -0.035, b: -0.04 });
    set('skew', { hue: 130, amount: -25 });
    set('sectorSaturation', { hue: 30, amount: 0.3 });
    set('bleach', { amount: 0.4 });
  }
  return stages;
}
export function moveStage(
  stages: Stage[],
  index: number,
  direction: -1 | 1,
): Stage[] {
  const next = [...stages];
  const target = index + direction;
  if (target < 0 || target >= next.length) return next;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}
