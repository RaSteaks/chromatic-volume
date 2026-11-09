import type { LabState } from './model';

// Curated colour-volume figures. Each one is a workbench configuration plus
// what to look at; the full model list remains available below them.
export interface VolumeFigure {
  id: string;
  title: string;
  caption: string;
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
    title: 'sRGB 在 Oklab 中',
    caption: '立方体在感知空间里的真实形状',
    highlight:
      '立方体被扭成斜置的块：黄色角浮到高处，蓝色角沉到底部。每个色相能达到的最亮点高度都不一样。',
    state: { target: 'oklab' },
    view: ISO,
  },
  {
    id: 'ycbcr',
    title: 'Y′CbCr：矢量图与波形',
    caption: '俯视是矢量示波器，侧视是波形',
    highlight:
      '现在从 Y′ 轴正下方看，Cb 向右、Cr 向上，正是矢量示波器：六个角依次是 R、Mg、B、Cy、G、Yl，灰阶全部落在中心。点「正视」把它翻到侧面，竖轴 Y′ 就是波形示波器上的亮度刻度。',
    state: { target: 'ycbcr709' },
    view: VECTORSCOPE,
  },
  {
    id: 'hsv-hexcone',
    title: 'HSV 六棱锥',
    caption: '纯色在顶面六角，黑色在锥尖',
    highlight:
      '把 RGB 立方体沿灰轴立起来，从白点方向看下去就是六棱锥：顶面是六边形，所有纯色在六个角上，黑色收成锥尖。',
    state: { target: 'hsv-hexcone' },
    view: ISO,
  },
  {
    id: 'hsl-bicone',
    title: 'HSL 双六棱锥',
    caption: '纯色挤在腰线，黑白各占一尖',
    highlight:
      '黑、白各占一个锥尖，所有纯色挤在 L = 0.5 的六边形腰线上。黄色和蓝色在同一高度，这就是 HSL「明度」与感知亮度对不上的原因。',
    state: { target: 'hsl-bicone' },
    view: { yaw: Math.PI / 4, pitch: 0.25 },
  },
  {
    id: 'luv-lab',
    title: 'CIELUV 对照 CIELAB',
    caption: '同一批颜色，两种 1976 均匀空间',
    highlight:
      '左边 CIELAB，右边 CIELUV，参考白都是 D65。LUV 的红色角明显外凸、蓝色角向内收，整体更扁更宽；两者的明度轴完全相同。',
    state: { target: 'luv', compare: 'lab-d65' },
    view: ISO,
  },
  {
    id: 'lms',
    title: 'LMS 视锥响应',
    caption: '三种视锥看到的同一个立方体',
    highlight:
      'L 与 M 视锥的光谱响应高度重叠，整个体积被压成一条贴着灰轴的细长形状；只有 S 视锥能把蓝色明显拉开。',
    state: { target: 'lms-hpe' },
    view: ISO,
  },
  {
    id: 'ipt',
    title: 'IPT 对照 Oklab',
    caption: 'Oklab 与 ICtCp 的前身',
    highlight:
      '左边 Oklab，右边 IPT：骨架几乎相同，都是「锥细胞响应 → 非线性压缩 → 对立色」。差别集中在蓝色一角，IPT 当初正是为修正 CIELAB 蓝色色相弯曲而设计的。',
    state: { target: 'ipt', compare: 'oklab' },
    view: ISO,
  },
  {
    id: 'jzazbz',
    title: 'Jzazbz：HDR 均匀空间',
    caption: 'SDR 白只占底部一小段',
    highlight:
      '参考白放在 203 cd/m²，SDR 白点只到 Jz ≈ 0.22，整个 sRGB 体积都压在底部。上方的空间留给可以亮到 10000 cd/m² 的 HDR 高光。',
    state: { target: 'jzazbz' },
    view: { yaw: Math.PI / 4, pitch: 0.3 },
  },
  {
    id: 'zcam',
    title: 'ZCAM：HDR 色貌模型',
    caption: '考虑观看条件的明度与色度',
    highlight:
      '色貌模型把观看条件算进去（白 203 cd/m²、适应亮度为白的 20%）：同一批颜色在这里的色度 C 远小于 Lab，体积瘦高；明度 J 随色相的起伏也更小。',
    state: { target: 'zcam' },
    view: ISO,
  },
  {
    id: 'ap1',
    title: '宽色域 · ACES AP1',
    caption: 'ACEScg 立方体与最优反射色边界',
    highlight:
      'ACES AP1（ACEScg）线性 0–1 立方体，叠加等能白 E 下的最优反射色边界（完美漫反射体 Y = 1，经 Bradford 适配到 D65）。9³ 采样中约 35%（255 / 729）落在这一反射色范围之外，主要在绿、青和高亮度一侧；这不等于它们都是物理上不可实现的光刺激。',
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
    title: '宽色域 · DaVinci Wide Gamut',
    caption: '工作色域与最优反射色范围',
    highlight:
      'DaVinci Wide Gamut 的基色落在光谱轨迹之外，但最优反射色边界以外的采样点不能一概称为虚色。9³ 采样中约 59%（429 / 729）超出等能白 E、完美漫反射体 Y = 1 的反射色范围（经 Bradford 适配到 D65）；其中也可能有真实的发光色。',
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
    title: '宽色域 · ARRI Wide Gamut 4',
    caption: 'ALEXA 35 的记录色域',
    highlight:
      'ARRI Wide Gamut 4 线性立方体与最优反射色边界对比：约 52%（377 / 729）的采样点超出等能白 E、完美漫反射体 Y = 1 的反射色范围（经 Bradford 适配到 D65）。这个比例不代表虚色比例，也不限制摄影机记录发光色和高光。',
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
    title: '宽色域 · S-Gamut3',
    caption: 'Sony 摄影机色域',
    highlight:
      'S-Gamut3 比 Rec.2020 还宽，约 51%（374 / 729）的采样点超出等能白 E、完美漫反射体 Y = 1 的最优反射色范围（经 Bradford 适配到 D65）。这不是虚色比例；「色彩变换」页另行演示 ACES 对 AP1 通道的色域压缩。',
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
    title: '最优色边界',
    caption: '等能白 E 下的反射色极限',
    highlight:
      '白色线圈是 Rösch–MacAdam 最优反射色的切片：在一段波长或其补集上全反射，其余波长全吸收。这里固定等能白 E、完美漫反射体 Y = 1，取 E 下 L* 10–90 的切片并经 Bradford 适配到 D65。它约束这一照明条件下的反射色，不是所有发光色或其他光源下物体色的边界。',
    state: { target: 'oklab', overlayOptimal: true, pointSize: 0.7 },
    view: ISO,
  },
  {
    id: 'pointer',
    title: 'Pointer 色域',
    caption: '真实物体颜色的实测范围',
    highlight:
      '金色线圈是 Pointer（1980）测量 4089 个真实物体表面得到的色域，在 CIELAB 中按明度分层。它在青绿方向明显超出 sRGB，这正是宽色域显示要覆盖的部分。',
    state: { target: 'lab-d65', overlayPointer: true, pointSize: 0.7 },
    view: ISO,
  },
  {
    id: 'gradient',
    title: '渐变路径',
    caption: '同一对颜色，三种插值',
    highlight:
      '蓝到黄的三条渐变：橙线在 sRGB 编码值中插值，绿线在线性 RGB 中插值，紫线在 Oklab 中插值。左边 RGB 立方体里橙线是直的，右边 Oklab 里紫线是直的；sRGB 插值的中点明显发灰发暗。',
    state: { target: 'oklab', gradient: 'blue-yellow', pointSize: 0.55 },
    view: ISO,
  },
];
