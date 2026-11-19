import type { LabState } from './model';

// Curated colour-volume figures. Each one is a workbench configuration plus
// what to look at; every other model is reachable from the 高级 drawer.
export interface VolumeFigure {
  /** Key into the stage catalogue in `src/shell.ts`, which holds the title. */
  id: string;
  highlight: string;
  state: Partial<LabState> & { target: string };
  view?: Pick<LabState, 'yaw' | 'pitch'> & { zoom?: number };
}
// Seen from below the Y′ axis, Cb points right and Cr points up, as on a vectorscope.
const VECTORSCOPE = { yaw: 0, pitch: -(Math.PI / 2 - 0.08) };
const ISO = { yaw: Math.PI / 4, pitch: 0.57, zoom: 1 };
const WIDE = { yaw: Math.PI / 4, pitch: 0.57, zoom: 0.72 };

export const volumeFigures: VolumeFigure[] = [
  {
    id: 'oklab',
    highlight:
      '调整霓虹、服装等饱和色时，相同的 RGB 通道上限并不意味着相同的感知明度。这里黄色角浮到高处，蓝色角沉到底部，显示 sRGB 各色相可达明度的差异；可据此理解提高饱和度时为何还要观察明度变化。',
    state: { target: 'oklab' },
    view: ISO,
  },
  {
    id: 'ycbcr',
    highlight:
      '从 Y′ 轴看向 Cb–Cr 平面，可理解矢量示波器的色度分布：灰阶居中，饱和色向外展开。旋转后观察编码亮度 Y′ 与色度的关系。这里展示均匀色样，未包含镜头像素的横向位置，因此侧视图不等同于实际画面的波形图。',
    state: { target: 'ycbcr709' },
    view: VECTORSCOPE,
  },
  {
    id: 'hsv-hexcone',
    highlight:
      '用 HSV 选取灯牌或服装颜色时，V 取决于最大 RGB 通道，不能直接当作镜头曝光或感知明度。六个纯色角都在顶面，黑色收在锥尖；这能解释为何相同 V 的蓝色和黄色看起来亮度不同。',
    state: { target: 'hsv-hexcone' },
    view: ISO,
  },
  {
    id: 'hsl-bicone',
    highlight:
      '调整局部色相或饱和度时，要分清 HSL 的 L 与画面的感知明度。所有纯色都在 L = 0.5 的腰线上，黄色和蓝色处于同一高度；黑白各占一尖。保持 HSL 的 L 不变，仍可能改变颜色看起来的明暗。',
    state: { target: 'hsl-bicone' },
    view: { yaw: Math.PI / 4, pitch: 0.25 },
  },
  {
    id: 'luv-lab',
    highlight:
      '做镜头色彩匹配时，同一颜色在不同分析空间中的方向和距离会变化。这里 CIELAB 与 CIELUV 共用 D65 参考白和明度轴，但 LUV 的红色角更外凸、蓝色角向内收；比较读数前应先统一空间与参考白。',
    state: { target: 'luv', compare: 'lab-d65' },
    view: ISO,
  },
  {
    id: 'lms',
    highlight:
      '监看白点与视觉适应涉及人眼的视锥响应。L、M 响应高度重叠，使这组颜色在 HPE LMS 中呈细长分布，蓝色方向则更明显地改变 S 分量。本图用于理解坐标关系，未模拟具体摄影机的白平衡处理。',
    state: { target: 'lms-hpe' },
    view: ISO,
  },
  {
    id: 'ipt',
    highlight:
      '蓝色灯光或服装的色相处理，对所选空间尤其敏感。Oklab 与 IPT 都通过视锥响应、非线性压缩和对立色坐标组织颜色，晶格差异集中在蓝色一角。可用这个对照理解相同数值操作为何可能给出不同色彩路径。',
    state: { target: 'ipt', compare: 'oklab' },
    view: ISO,
  },
  {
    id: 'jzazbz',
    highlight:
      '分析 HDR 高光时，要先确定 RGB 值对应的绝对亮度。本图把 sRGB 白设为 203 cd/m²，对应 Jz ≈ 0.222。竖轴标到 0.25，白点位于这段标尺约 89% 处。',
    state: { target: 'jzazbz' },
    view: { yaw: Math.PI / 4, pitch: 0.3 },
  },
  {
    id: 'zcam',
    highlight:
      '调色室与其他观看环境的差异，需要放在观看条件下讨论。ZCAM 将适应亮度等条件纳入色貌计算；此处固定白为 203 cd/m²、适应亮度为其 20%。观察这组条件下的 J 与色度分布，数值不能直接与 Lab 同名分量比较。',
    state: { target: 'zcam' },
    view: ISO,
  },
  {
    id: 'ap1',
    highlight:
      '在 VFX 中使用 ACEScg 时，可用这张图区分 AP1 工作坐标与物体反射色范围。线性 0–1 的 9³ 样本中，254 / 729 超出等能白 E、完美漫反射体 Y = 1 的最优反射色边界（Bradford 适配到 D65）。发光色与更高曝光另有范围，这个比例不是虚色或镜头裁剪比例。',
    state: {
      source: 'acescg',
      target: 'oklab',
      overlayOptimal: true,
      pointSize: 0.7,
      density: 9,
    },
    view: WIDE,
  },
  {
    id: 'dwg',
    highlight:
      '在 DaVinci Wide Gamut 中调色时，工作坐标的范围与最终显示范围需要分别看待。此处 9³ 样本中，428 / 729 超出等能白 E、Y = 1 的最优反射色范围（Bradford 适配到 D65）。边界外也可能包含真实发光色，不能把这些点直接算成镜头中不可显示的像素。',
    state: {
      source: 'dwg-linear',
      target: 'oklab',
      overlayOptimal: true,
      pointSize: 0.7,
      density: 9,
    },
    view: WIDE,
  },
  {
    id: 'awg4',
    highlight:
      '处理 ARRI LogC4 素材时，需要同时匹配 Log 编码与 AWG4 基色。这里仅展示 AWG4 的线性坐标：376 / 729 个样本超出等能白 E、Y = 1 的最优反射色范围（Bradford 适配到 D65）。它不是摄影机动态范围、实拍镜头或完整成像风格的测量。',
    state: {
      source: 'camera-arri4',
      target: 'oklab',
      overlayOptimal: true,
      pointSize: 0.7,
      density: 9,
    },
    view: WIDE,
  },
  {
    id: 'sgamut3',
    highlight:
      '将 Sony 素材送入后期时，应先确认记录的是 S-Gamut3 还是其他色域。本图的线性 S-Gamut3 样本中，374 / 729 超出等能白 E、Y = 1 的最优反射色范围（Bradford 适配到 D65），这不是虚色比例。「ACES Reference Gamut Compression」展示这些坐标进入 AP1 后的压缩。',
    state: {
      source: 'camera-sgamut3',
      target: 'oklab',
      overlayOptimal: true,
      pointSize: 0.7,
      density: 9,
    },
    view: WIDE,
  },
  {
    id: 'optimal',
    highlight:
      '服装、布景的反射色与灯牌、特效光源的发光色，不能共用一个反射色边界。白色线圈固定等能白 E 与完美漫反射体 Y = 1，取 L* 10–90 的最优反射色切片，再经 Bradford 适配到 D65。它只约束这一照明条件下的反射色范围。',
    state: { target: 'oklab', overlayOptimal: true, pointSize: 0.7 },
    view: ISO,
  },
  {
    id: 'pointer',
    highlight:
      '观察服装和美术道具的颜色时，可用实测物体色范围作参照。金色线圈来自 Pointer（1980）的 4089 个物体表面样本，在 CIELAB 中按明度分层；青绿区域有部分超出 sRGB。它不是当前镜头的取样，也不是所有材质的边界。',
    state: { target: 'lab-d65', overlayPointer: true, pointSize: 0.7 },
    view: ISO,
  },
];
