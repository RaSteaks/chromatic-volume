import { cameraPresets } from './camera-transfers';
import {
  encodingReady,
  gamuts,
  transfers,
  managedLut,
  type LutEncoding,
} from './color-management';
import { button, el, icon, slider, toggle } from './dom';
import {
  clamp,
  createStages,
  defaultState,
  moveStage,
  stageDefinition,
  transform,
  type StageId,
  type Vec3,
} from './model';
import { decodeState, stateUrl } from './state';
import {
  colorTargets,
  colorSources,
  createSourceSamples,
  convertColor,
  getTarget,
  targetPosition,
  plotGuides,
  type ColorTarget,
} from './targets';
import { parseCube, type CubeLut } from './lut';
import { VolumeView, type VolumeData } from './volume';

const root = document.querySelector<HTMLDivElement>('#app')!;
const search = new URLSearchParams(location.search);
const shared = search.get('state');
const restored = shared ? decodeState(shared) : null;
const state = restored ?? defaultState();
function plotPosition(coords: Vec3, target: ColorTarget) {
  return targetPosition(coords, target, state.equalAxes);
}
let samples = createSourceSamples(state.density, state.source);
let sourcePositions = samples.map((point) =>
  plotPosition(point, getTarget(state.source)!),
);
let sourceColors = samples.map((point) =>
  convertColor(point, getTarget('srgb')!, state.source),
);
let targetCoordinates: Vec3[] = [];
let targetPositions: Vec3[] = [];
let outputColors: Vec3[] = [];
let conversionLoss: boolean[] = [];
let selectedPoint = (state.density - 1) * state.density ** 2;
let selectedStage: StageId = 'saturation';
let lut: CubeLut | null = null;
let lutInputs: Vec3[] = [];
let clippedInputs = 0;
let lutError = '';
let views: VolumeView[] = [];
let animationFrame = 0;
let autoRotate = false;
let lastTime = 0;
let toastTimer = 0;
let exportUrl = '';
const exportFeedback = el('div', {
  class: 'export-feedback',
  role: 'status',
  hidden: true,
});
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const toast = el('div', {
  class: 'toast',
  role: 'status',
  'aria-live': 'polite',
});
const targetList = el('div', {
  class: 'target-list',
  'aria-label': '目标色彩模型',
});
const inspector = el('aside', {
  class: 'inspector',
  'aria-label': '目标与参数',
});
const sampleReadout = el('div', { class: 'sample-readout' });
const count = el('span', { class: 'mono' });
const modelStatus = el('span', { class: 'mono' });
const leftCaption = el('span');
const rightTitle = el('strong');
const rightCaption = el('span');
const rightMode = el('span', { class: 'volume-caption' });
const sourceTitle = el('strong', {}, '源：sRGB');
const viewStatus = el('span', { class: 'volume-caption' }, 'D65 · 编码 RGB');
const mixingTitle = el('strong');
const mixingDescription = el('p');
const displayControls = el('div', { class: 'display-controls' });
const leftCanvas = el(
  'canvas',
  {
    tabindex: 0,
    role: 'img',
    'aria-label': '源 sRGB 三维色体积；方向键旋转，加减号缩放，Home 重置',
  },
  'sRGB 颜色采样的三维点阵。',
);
const rightCanvas = el(
  'canvas',
  {
    tabindex: 0,
    role: 'img',
    'aria-label': '目标模型三维色体积；方向键旋转，加减号缩放，Home 重置',
  },
  '所选目标模型中的三维点阵。',
);
const emptyTarget = el(
  'div',
  { class: 'empty-target' },
  icon('code'),
  el('strong', {}, '导入一个明确的 Look'),
  el('p', {}, '选择三维 .cube LUT，查看每个 RGB 采样的目标颜色。'),
);
const strength = slider(
  'strength',
  '映射进度',
  state.strength,
  0,
  1,
  0.01,
  (value) => {
    state.strength = value;
    if (isLook()) updateModel();
    else {
      updateLabels();
      draw();
    }
  },
  (n) => `${Math.round(n * 100)}%`,
);
const zoom = slider(
  'zoom',
  '缩放',
  state.zoom,
  0.55,
  1.65,
  0.01,
  (value) => {
    state.zoom = value;
    draw();
  },
  (n) => `${Math.round(n * 100)}%`,
);
const rotationButton = button(
  '自动旋转',
  () => {
    autoRotate = !autoRotate;
    rotationButton.setAttribute('aria-pressed', String(autoRotate));
    rotationButton.replaceChildren(
      icon(autoRotate ? 'pause' : 'play'),
      autoRotate ? '暂停旋转' : '自动旋转',
    );
    lastTime = 0;
    draw();
  },
  { icon: 'play', class: 'button subtle' },
);
rotationButton.setAttribute('aria-pressed', 'false');
function notify(message: string) {
  toast.textContent = message;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast.classList.remove('visible'), 3500);
}
function lutReady() {
  return (
    lut !== null &&
    encodingReady(state.lutInput) &&
    encodingReady(state.lutOutput)
  );
}
function isLook() {
  return state.target === 'stages' || state.target === 'lut';
}
function stopRotation() {
  autoRotate = false;
  rotationButton.setAttribute('aria-pressed', 'false');
  rotationButton.replaceChildren(icon('play'), '自动旋转');
}
function draw() {
  if (animationFrame) return;
  animationFrame = requestAnimationFrame((time) => {
    animationFrame = 0;
    if (document.hidden) return;
    if (autoRotate) {
      if (lastTime)
        state.yaw =
          (state.yaw + Math.min(time - lastTime, 50) * 0.0002) % (Math.PI * 2);
      lastTime = time;
    }
    const plotTarget =
      state.plot === 'native' ? undefined : getTarget(state.plot);
    const sourceModel = plotTarget ?? getTarget(state.source)!;
    const source: VolumeData = {
      guides: plotGuides(sourceModel, state.equalAxes),
      positions: sourcePositions,
      colors: sourceColors,
      axes: sourceModel.axes,
      cube: ['rgb', 'log', 'xyz'].includes(sourceModel.kind),
    };
    const target = getTarget(state.target);
    const destinationModel = plotTarget ?? target ?? sourceModel;
    const positions = isLook()
      ? targetPositions
      : targetPositions.map(
          (point, index) =>
            point.map(
              (channel, axis) =>
                sourcePositions[index][axis] +
                (channel - sourcePositions[index][axis]) * state.strength,
            ) as Vec3,
        );
    // Morphing interpolates plotting positions only. Numeric readouts always show the actual target coordinates.
    const destination: VolumeData = {
      guides: plotGuides(destinationModel, state.equalAxes),
      positions,
      colors: isLook() && state.preserve ? sourceColors : outputColors,
      axes: destinationModel.axes,
      cube: ['rgb', 'log', 'xyz'].includes(destinationModel.kind),
      origins: sourcePositions,
    };
    views[0]?.draw(source, selectedPoint);
    if (state.target !== 'lut' || lutReady()) {
      views[1]?.draw(destination, selectedPoint);
      rightCanvas.dataset.model = state.target;
      rightCanvas.setAttribute(
        'aria-label',
        `目标 ${target?.name ?? (state.target === 'lut' ? '3D LUT' : '自定义 Look')} 三维色体积；方向键旋转，加减号缩放，Home 重置`,
      );
    }
    leftCanvas.dataset.plot = state.plot;
    rightCanvas.dataset.plot = state.plot;
    zoom.set(state.zoom);
    if (autoRotate) draw();
  });
}
function updateModel() {
  const target = getTarget(state.target);
  conversionLoss = [];
  if (target) {
    targetCoordinates = samples.map((point) =>
      convertColor(point, target, state.source),
    );
    targetPositions = targetCoordinates.map((point) =>
      plotPosition(point, target),
    );
    // A valid target encoding need not preserve the input color (e.g. negative
    // channels in BT.1886 or ACEScc). Decode the result rather than assuming identity.
    outputColors = targetCoordinates.map((point) =>
      convertColor(point, getTarget('srgb')!, target.id),
    );
    conversionLoss = targetCoordinates.map((point, index) => {
      const before = convertColor(
        samples[index],
        getTarget('xyz-d65')!,
        state.source,
      );
      const after = convertColor(point, getTarget('xyz-d65')!, target.id);
      // Numerical round-trip tolerance in relative XYZ, not a perceptual ΔE threshold.
      return before.some((value, axis) => Math.abs(value - after[axis]) > 1e-7);
    });
  } else if (state.target === 'stages') {
    targetCoordinates = sourceColors.map((point) =>
      transform(point, state.stages, state.strength),
    );
    outputColors = targetCoordinates;
    // Like LUTs, teaching stages always use a common plot space on both sides.
    targetPositions = [];
  } else if (lutReady()) {
    clippedInputs = 0;
    const results = samples.map((point) =>
      managedLut(
        convertColor(point, getTarget('xyz-d65')!, state.source),
        lut!,
        state.lutInput,
        state.lutOutput,
        state.strength,
        state.interpolation,
      ),
    );
    lutInputs = results.map((result) => result.input);
    targetCoordinates = results.map((result) => result.output);
    outputColors = results.map((result) =>
      convertColor(result.xyz, getTarget('srgb')!, 'xyz-d65'),
    );
    targetPositions = results.map((result) =>
      plotPosition(
        convertColor(result.xyz, getTarget(state.plot)!, 'xyz-d65'),
        getTarget(state.plot)!,
      ),
    );
    clippedInputs = results.filter((result) => result.clipped).length;
  } else {
    targetCoordinates = [];
    targetPositions = [];
    outputColors = [];
  }
  const plotTarget =
    state.plot === 'native' ? undefined : getTarget(state.plot);
  sourcePositions = samples.map((point) =>
    plotTarget
      ? plotPosition(convertColor(point, plotTarget, state.source), plotTarget)
      : plotPosition(point, getTarget(state.source)!),
  );
  if (plotTarget && state.target !== 'lut') {
    targetPositions = targetCoordinates.map((point) =>
      plotPosition(
        convertColor(point, plotTarget, target?.id ?? 'srgb'),
        plotTarget,
      ),
    );
  }
  emptyTarget.hidden = state.target !== 'lut' || lutReady();
  emptyTarget.querySelector('strong')!.textContent = lut
    ? '指定 LUT 的输入与输出解释'
    : '导入一个明确的 Look';
  emptyTarget.querySelector('p')!.textContent = lut
    ? '请选择两端的色域和 Gamma；不会根据文件名猜测。'
    : '选择三维 .cube LUT，并指定输入输出编码。';
  rightCanvas.style.visibility = emptyTarget.hidden ? 'visible' : 'hidden';
  count.textContent = `${samples.length.toLocaleString('zh-CN')} 个采样点`;
  updateLabels();
  updateSample();
  draw();
}
function updateLabels() {
  const source = getTarget(state.source)!;
  sourceTitle.textContent = `源：${source.name}`;
  viewStatus.textContent = source.white;
  leftCanvas.setAttribute(
    'aria-label',
    `源 ${source.name} 三维色体积；方向键旋转，加减号缩放，Home 重置`,
  );
  leftCanvas.dataset.source = state.source;
  const target = getTarget(state.target);
  rightTitle.textContent = `目标：${target?.name ?? (state.target === 'lut' ? '3D LUT' : '自定义 Look')}`;
  rightMode.textContent =
    state.plot !== 'native'
      ? `统一 ${getTarget(state.plot)!.name}`
      : target
        ? '标准坐标转换'
        : 'RGB 颜色响应';
  leftCaption.textContent = `R / G / B · ${state.density} × ${state.density} × ${state.density}`;
  rightCaption.textContent = target
    ? `${target.channels.join(' / ')}${state.strength < 1 ? ' · 图形插值 ' + Math.round(state.strength * 100) + '%' : ''}`
    : state.target === 'lut'
      ? (lut?.name ?? '等待导入 LUT')
      : '十种教学近似阶段';
  mixingTitle.textContent = isLook()
    ? '混合原始与目标颜色'
    : '从源体积移动到目标体积';
  mixingDescription.textContent = isLook()
    ? '0% 为输入，100% 为目标 Look。'
    : '插值仅用于演示；两种坐标的距离不可直接比较。';
  if (state.plot !== 'native') {
    leftCaption.textContent = `绘图：${getTarget(state.plot)!.name} · ${state.equalAxes ? '等单位轴比例' : '示意轴比例'}`;
    rightCaption.textContent = leftCaption.textContent;
    viewStatus.textContent = `统一 ${getTarget(state.plot)!.name}`;
    mixingDescription.textContent = isLook()
      ? state.target === 'lut'
        ? '在共同 XYZ 线性光空间混合；坐标比例固定。'
        : '教学阶段在编码 sRGB 混合后转入共同坐标。'
      : '按目标坐标解码后绘图；无损转换重合，颜色损失会改变点位。';
  }
  strength.input.setAttribute('aria-label', isLook() ? '处理强度' : '映射进度');
  strength.element.querySelector('label')!.textContent = isLook()
    ? '处理强度'
    : '映射进度';
  modelStatus.textContent = target
    ? `${outputColors.filter((point) => point.some((v) => v < -1e-7 || v > 1 + 1e-7)).length} 个目标点超出 sRGB 显示范围 · ${conversionLoss.filter(Boolean).length} 点在目标转换中损失颜色`
    : state.target === 'lut'
      ? lut
        ? lutReady()
          ? `${clippedInputs} 点进入 LUT 前被 DOMAIN 钳制 · 统一 ${getTarget(state.plot)!.name}`
          : '等待指定 LUT 输入 / 输出色域与 Gamma'
        : '尚未加载 LUT'
      : '教学近似 · 非 Chromogen 原生算法';
}
function format(value: number) {
  return Number.isFinite(value)
    ? (Math.abs(value) < 0.00005 ? 0 : value).toFixed(4)
    : '未定义';
}
function updateSample() {
  const note = document.querySelector('#plot-scale-note');
  const plotModel = getTarget(
    state.plot === 'native' ? state.target : state.plot,
  );
  if (note && plotModel)
    note.textContent = ['hsl', 'hsv'].includes(plotModel.kind)
      ? 'HSL / HSV 为圆柱参数示意图；S 为半径，L / V 为高度，距离不表示感知色差。'
      : state.equalAxes
        ? `等单位轴比例：${plotModel.kind === 'lab' || plotModel.kind === 'lch' ? 'L*、a*、b* 均除以 200' : plotModel.kind === 'oklab' || plotModel.kind === 'oklch' ? 'L、a、b 均使用原始单位' : '笛卡尔坐标统一缩放'}。极坐标按圆柱展开；屏幕投影距离不是色差读数。`
        : plotModel.layout;

  const input = samples[selectedPoint];
  const output = targetCoordinates[selectedPoint];
  const target = getTarget(state.target);
  const warning = document.querySelector<HTMLElement>('#conversion-warning');
  if (warning) {
    warning.hidden = !conversionLoss[selectedPoint];
    warning.textContent =
      '目标转换存在颜色损失：解码后不能还原输入色。点位和输出色样显示实际结果。';
  }
  const labels = target?.channels ?? ['R', 'G', 'B'];
  const swatch = el('span', {
    class: 'swatch',
    style: `background:rgb(${sourceColors[selectedPoint].map((v) => Math.round(clamp(v) * 255)).join(',')})`,
  });
  sampleReadout.replaceChildren(
    swatch,
    el(
      'span',
      { class: 'sample-value' },
      getTarget(state.source)!.name,
      el('code', {}, input.map(format).join('  ')),
    ),
    icon('arrow'),
    el(
      'span',
      { class: 'sample-value' },
      target
        ? `${target.name} 目标坐标`
        : state.target === 'lut'
          ? 'LUT 原始输出 RGB（100%）'
          : '输出 sRGB',
      el(
        'code',
        {},
        output
          ? output.map((value, i) => `${labels[i]} ${format(value)}`).join('  ')
          : '等待导入 LUT',
      ),
    ),
  );
  document
    .querySelector<HTMLOutputElement>('#sample-number')
    ?.replaceChildren(`#${selectedPoint + 1}`);
  const index = document.querySelector<HTMLInputElement>('#sample-index');
  if (index) index.value = String(selectedPoint + 1);
  const inputValues = document.querySelector('#input-values');
  if (inputValues) inputValues.textContent = input.map(format).join(' / ');
  const lutReadout = document.querySelector('#lut-input-values');
  if (lutReadout)
    lutReadout.textContent = lutReady()
      ? (lutInputs[selectedPoint]?.map(format).join(' / ') ?? '—')
      : '待配置';
  const swatches = document.querySelector('#sample-swatches');
  if (swatches)
    swatches.replaceChildren(
      ...[
        { label: '输入色样', rgb: sourceColors[selectedPoint] },
        {
          label: target ? '目标解码色样' : '输出色样（当前强度）',
          rgb: outputColors[selectedPoint],
        },
      ].map(({ label, rgb }) =>
        el(
          'div',
          {},
          el('span', {}, label),
          el('div', {
            class: 'flat-swatch',
            style: rgb
              ? `background:rgb(${rgb.map((v) => Math.round(clamp(v) * 255)).join(',')})`
              : '',
          }),
          el(
            'small',
            {},
            !rgb
              ? '待配置'
              : rgb.some((v) => v < -1e-7 || v > 1 + 1e-7)
                ? '超出 sRGB 显示范围 · 已裁剪'
                : 'sRGB 显示范围内',
          ),
        ),
      ),
    );
  const coordinateGrid = document.querySelector('#coordinate-values');
  if (coordinateGrid)
    coordinateGrid.replaceChildren(
      ...labels.map((label, index) =>
        el(
          'div',
          {},
          el('dt', {}, label),
          el('dd', {}, output ? format(output[index]) : '—'),
        ),
      ),
    );
}
function pick(index: number) {
  selectedPoint = index;
  updateSample();
  draw();
}
function chooseTarget(id: string) {
  state.target = id;
  if (isLook() && state.plot === 'native') state.plot = 'oklab';
  plotSelect.value = state.plot;
  plotSelect.options[0].disabled = isLook();
  mobileTarget.value = id;
  state.strength = 1;
  strength.set(1);
  renderTargets();
  renderInspector();
  renderDisplayControls();
  updateModel();
}
function renderTargets() {
  const groups = [...new Set(colorTargets.map((target) => target.group))];
  targetList.replaceChildren(
    ...groups.map((group) =>
      el(
        'div',
        { class: 'target-group' },
        el('h3', {}, group),
        ...colorTargets
          .filter((target) => target.group === group)
          .map((target) => {
            const control = button(target.name, () => chooseTarget(target.id), {
              class: 'target-button',
            });
            control.setAttribute(
              'aria-pressed',
              String(state.target === target.id),
            );
            control.dataset.target = target.id;
            control.append(icon('chevron'));
            return control;
          }),
      ),
    ),
    el(
      'div',
      { class: 'target-group' },
      el('h3', {}, '改变颜色响应'),
      ...[
        { id: 'lut', name: '导入 .cube LUT' },
        { id: 'stages', name: '自定义处理阶段' },
      ].map((item) => {
        const control = button(item.name, () => chooseTarget(item.id), {
          class: 'target-button',
        });
        control.setAttribute('aria-pressed', String(state.target === item.id));
        control.dataset.target = item.id;
        control.append(icon('chevron'));
        return control;
      }),
    ),
  );
}
function sampleInspector() {
  const input = el('input', {
    type: 'number',
    id: 'sample-index',
    min: 1,
    max: samples.length,
    step: 1,
    value: selectedPoint + 1,
  });
  input.addEventListener('change', () => {
    const value = Number(input.value);
    pick(
      clamp(
        Number.isFinite(value) ? Math.round(value) - 1 : 0,
        0,
        samples.length - 1,
      ),
    );
  });
  return el(
    'section',
    { class: 'coordinate-inspector' },
    el(
      'div',
      { class: 'sample-selector' },
      el('label', { for: 'sample-index' }, '采样点'),
      input,
      el(
        'output',
        { id: 'sample-number', for: 'sample-index', class: 'mono' },
        `#${selectedPoint + 1}`,
      ),
    ),
    el('p', { class: 'inspector-hint' }, '点击点阵选择，也可输入编号。'),
    el('span', { class: 'eyebrow' }, `源 · ${getTarget(state.source)!.name}`),
    el('code', { id: 'input-values' }),
    state.target === 'lut'
      ? el(
          'div',
          {},
          el('span', { class: 'eyebrow' }, 'LUT 输入（DOMAIN 钳制前）'),
          el('code', { id: 'lut-input-values' }),
        )
      : null,
    el(
      'span',
      { class: 'eyebrow' },
      state.target === 'lut' ? 'LUT 原始输出（100%）' : '目标坐标',
    ),
    el('dl', { id: 'coordinate-values' }),
    getTarget(state.target)
      ? el('p', {
          id: 'conversion-warning',
          class: 'inspector-hint',
          role: 'status',
          hidden: true,
        })
      : null,
    el('div', { id: 'sample-swatches', class: 'sample-swatches' }),
  );
}
function interpolationControls() {
  const input = el(
    'select',
    { 'aria-label': 'LUT 插值方式' },
    el('option', { value: 'tetrahedral' }, '四面体插值'),
    el('option', { value: 'trilinear' }, '三线性插值'),
  );
  input.value = state.interpolation;
  input.addEventListener('change', () => {
    state.interpolation = input.value as typeof state.interpolation;
    updateModel();
  });
  return el('label', { class: 'interpolation-control' }, 'LUT 插值方式', input);
}
function encodingControls(key: 'lutInput' | 'lutOutput', label: string) {
  const encoding = state[key];
  const camera = el(
    'select',
    { 'aria-label': `${label}摄影机预设` },
    el('option', { value: '' }, '自定义 / 选择摄影机预设'),
    ...cameraPresets.map((preset, index) =>
      el('option', { value: index }, preset.name),
    ),
  );
  const matched = cameraPresets.findIndex(
    (preset) =>
      preset.gamut === encoding.gamut && preset.gamma === encoding.gamma,
  );
  camera.value = matched < 0 ? '' : String(matched);
  camera.addEventListener('change', () => {
    if (camera.value === '') return;
    const preset = cameraPresets[Number(camera.value)];
    encoding.gamut = preset.gamut;
    encoding.gamma = preset.gamma;
    renderInspector();
    updateModel();
  });

  const gamut = el(
    'select',
    { 'aria-label': `${label}色域` },
    el('option', { value: '' }, '选择色域…'),
    ...gamuts.map((item) => el('option', { value: item.id }, item.name)),
  );
  const gamma = el(
    'select',
    { 'aria-label': `${label} Gamma` },
    el('option', { value: '' }, '选择 Gamma…'),
    ...transfers.map((item) => el('option', { value: item.id }, item.name)),
  );
  gamut.value = encoding.gamut;
  gamma.value = encoding.gamma;
  gamut.addEventListener('change', () => {
    encoding.gamut = gamut.value;
    updateModel();
  });
  gamma.addEventListener('change', () => {
    encoding.gamma = gamma.value as LutEncoding['gamma'];
    renderInspector();
    updateModel();
    inspector
      .querySelector<HTMLSelectElement>(`[aria-label="${label} Gamma"]`)
      ?.focus();
  });
  const black = slider(
    `${key}-black`,
    `${label}黑位 cd/m²`,
    encoding.black,
    0,
    10,
    0.01,
    (value) => {
      encoding.black = value;
      updateModel();
    },
  );
  const white = slider(
    `${key}-white`,
    `${label}白位 cd/m²`,
    encoding.white,
    20,
    1000,
    1,
    (value) => {
      encoding.white = value;
      updateModel();
    },
    (n) => String(n),
  );
  return el(
    'fieldset',
    { class: 'encoding-controls' },
    el('legend', {}, label),
    camera,
    gamut,
    gamma,
    encoding.gamma === 'bt1886'
      ? el(
          'div',
          {},
          black.element,
          white.element,
          el(
            'p',
            { class: 'inspector-hint' },
            'BT.1886 显示响应；黑位为 0 时等价于 Gamma 2.4。',
          ),
        )
      : null,
  );
}
function renderInspector() {
  const target = getTarget(state.target);
  const content = el('div', { class: 'inspector-content model-inspector' });
  inspector.replaceChildren(
    el(
      'div',
      { class: 'panel-heading' },
      el('h2', {}, '目标与参数'),
      el('span', { class: 'mono muted' }, `${getTarget(state.source)!.name} →`),
    ),
    content,
  );
  if (target) {
    content.append(
      el('div', { class: 'stage-category' }, icon('cube'), 'COLOR SPACE'),
      el('h3', {}, target.name),
      el('p', { class: 'english-title' }, `参考白：${target.white}`),
      el(
        'p',
        { class: 'stage-description' },
        state.source === 'srgb'
          ? target.description
          : `将 ${getTarget(state.source)!.name} 色域采样转换为 ${target.name} 的 ${target.channels.join('、')} 坐标。目标解码后的实际颜色统一转为 sRGB 显示；无法还原输入色的样本会标记。`,
      ),
      el(
        'div',
        { class: 'geometry-note' },
        el('span', { class: 'eyebrow' }, '转换路径'),
        el(
          'p',
          {},
          state.source === 'srgb'
            ? target.route
            : `${getTarget(state.source)!.name} → 传递函数 / 矩阵 / 必要白点适配 → ${target.name}`,
        ),
      ),
      sampleInspector(),
      el('p', { class: 'inspector-hint', id: 'plot-scale-note' }),
      el(
        'p',
        { class: 'inspector-hint' },
        `源：${getTarget(state.source)!.name}，参考白 ${getTarget(state.source)!.white}。${state.source === 'acescc' ? '采样 ACEScc 中对应线性 0–1 的编码范围。' : '各通道在 0–1 范围重新等距采样。'} 保留目标坐标；编码自身的负值或上限限制可能造成颜色损失，与最终 sRGB 着色裁剪分别报告。`,
      ),
    );
  } else if (state.target === 'lut') {
    const file = el('input', { type: 'file', accept: '.cube', id: 'lut-file' });
    const feedback = el(
      'p',
      { class: 'lut-feedback', role: 'status' },
      lutError,
    );
    file.addEventListener('change', async () => {
      const selected = file.files?.[0];
      if (!selected) return;
      file.disabled = true;
      feedback.textContent = '正在读取 LUT…';
      try {
        if (selected.size > 32 * 1024 * 1024)
          throw new Error('LUT 文件不能超过 32 MB。');
        const parsed = parseCube(await selected.text(), selected.name);
        lut = parsed;
        lutError = '';
        state.strength = 1;
        strength.set(1);
        if (state.target === 'lut') {
          renderInspector();
          updateModel();
        }
        notify(`已加载 ${selected.name} · ${parsed.size}³ LUT`);
      } catch (error) {
        lutError =
          error instanceof Error ? error.message : 'LUT 读取失败，请重试。';
        feedback.textContent = lutError;
      } finally {
        file.disabled = false;
        file.value = '';
      }
    });
    content.append(
      el('div', { class: 'stage-category' }, icon('code'), 'TARGET LOOK'),
      el('h3', {}, '三维 LUT'),
      el(
        'p',
        { class: 'stage-description' },
        '导入已定义的 RGB → RGB 颜色响应。文件只在本机读取，不会上传。',
      ),
      encodingControls('lutInput', 'LUT 输入'),
      el(
        'p',
        { class: 'inspector-hint' },
        '摄影机预设采用场景曝光 / 反射率约定和厂商归一化码值；LogC3 固定 EI 800。DJI D-Log 不等于 D-Log M。源采样默认仍为有限范围，不代表摄影机完整动态范围。',
      ),
      encodingControls('lutOutput', 'LUT 输出'),
      interpolationControls(),
      el(
        'label',
        { class: 'file-label', for: 'lut-file' },
        '选择 .cube 文件',
        file,
      ),
      feedback,
      lut
        ? el(
            'div',
            { class: 'geometry-note' },
            el('span', { class: 'eyebrow' }, '当前目标'),
            el('p', {}, lut.name),
            el(
              'code',
              {},
              `${lut.size}³ · ${lut.data.length.toLocaleString()} LUT 节点`,
            ),
          )
        : el('span', { hidden: true }),
      sampleInspector(),
      el(
        'p',
        { class: 'inspector-hint' },
        '支持 33 点（33³）和 65 点（65³）LUT，也兼容其他 2–65³ 尺寸；完整保留查找表节点。画面采样密度不改变 LUT 精度。支持 DOMAIN_MIN / MAX，三线性和四面体插值可切换。仅支持三维 LUT，不支持一维 shaper。输入按 DOMAIN 边界钳制，输出坐标不裁剪。',
      ),
      el(
        'p',
        { class: 'inspector-hint' },
        '处理链：源 → 指定输入编码 → DOMAIN 钳制 → LUT → 指定输出解码 → 共同绘图空间。归一化全范围 RGB；不自动缩放视频合法范围，不推断文件的色彩空间。BT.1886 按各端白位归一化 Y=1。',
      ),
    );
  } else {
    const stage = state.stages.find((item) => item.id === selectedStage)!;
    const definition = stageDefinition(stage.id);
    const index = state.stages.indexOf(stage);
    const stages = el(
      'ol',
      { class: 'compact-stage-list', 'aria-label': '处理阶段顺序' },
      ...state.stages.map((item, i) => {
        const definition = stageDefinition(item.id);
        const choice = button(
          `${String(i + 1).padStart(2, '0')} ${definition.name}`,
          () => {
            selectedStage = item.id;
            renderInspector();
            updateSample();
          },
          { class: 'compact-stage' },
        );
        choice.setAttribute('aria-pressed', String(selectedStage === item.id));
        const enabled = el('input', {
          type: 'checkbox',
          checked: item.enabled,
          'aria-label': `启用${definition.name}`,
        });
        enabled.addEventListener('change', () => {
          item.enabled = enabled.checked;
          renderInspector();
          updateModel();
        });
        return el('li', { 'data-stage': item.id }, choice, enabled);
      }),
    );
    const parameters = definition.parameters.map(
      (parameter) =>
        slider(
          `param-${parameter.key}`,
          parameter.label,
          stage.values[parameter.key],
          parameter.min,
          parameter.max,
          parameter.step,
          (value) => {
            stage.values[parameter.key] = value;
            updateModel();
          },
          (value) =>
            parameter.unit
              ? `${value.toFixed(0)}${parameter.unit}`
              : value.toFixed(parameter.step < 0.01 ? 3 : 2),
        ).element,
    );
    const order = (direction: -1 | 1) => {
      const control = button(
        direction === -1 ? '提前' : '后移',
        () => {
          state.stages = moveStage(state.stages, index, direction);
          renderInspector();
          updateModel();
          inspector
            .querySelector<HTMLButtonElement>(`[data-order="${direction}"]`)
            ?.focus();
        },
        { icon: direction === -1 ? 'up' : 'down', class: 'button subtle' },
      );
      control.dataset.order = String(direction);
      control.disabled = direction === -1 ? index === 0 : index === 9;
      return control;
    };
    content.append(
      stages,
      el('h3', {}, definition.name),
      el('p', { class: 'stage-description' }, definition.description),
      el(
        'fieldset',
        { disabled: !stage.enabled, class: 'parameter-fields' },
        ...parameters,
      ),
      el(
        'div',
        { class: 'order-controls' },
        order(-1),
        order(1),
        button(
          '重置阶段',
          () => {
            stage.values = {
              ...createStages().find((item) => item.id === stage.id)!.values,
            };
            renderInspector();
            updateModel();
          },
          { icon: 'reset', iconOnly: true, class: 'icon-button' },
        ),
      ),
      el(
        'p',
        { class: 'inspector-hint' },
        '源采样先转换为编码 sRGB 后处理。教学近似变换，使用线性对立色坐标；不是 FilmLight Eab，也不是生产级胶片拟合。',
      ),
    );
  }
  updateSample();
}
function renderDisplayControls() {
  displayControls.replaceChildren(
    isLook()
      ? toggle('preserve', '保留输入色', state.preserve, (value) => {
          state.preserve = value;
          draw();
        })
      : el('span', { class: 'color-preserved' }, icon('check'), '目标实际颜色'),
    toggle('equal-axes', '严格等比例', state.equalAxes, (value) => {
      state.equalAxes = value;
      updateModel();
    }),
    toggle('flat-colors', '无光照点色', state.flatColors, (value) => {
      state.flatColors = value;
      draw();
    }),
    toggle(
      'vectors',
      isLook() ? '位移连线' : '映射轨迹',
      state.vectors,
      (value) => {
        state.vectors = value;
        draw();
      },
    ),
    toggle('axes', '坐标参考', state.axes, (value) => {
      state.axes = value;
      draw();
    }),
    el(
      'div',
      { class: 'point-size' },
      slider(
        'point-size',
        '点大小',
        state.pointSize,
        0.5,
        1.6,
        0.05,
        (value) => {
          state.pointSize = value;
          draw();
        },
        (n) => `${n.toFixed(2)}×`,
      ).element,
    ),
  );
}
const densitySelect = el(
  'select',
  { id: 'density', 'aria-label': '采样密度' },
  ...[5, 9, 13].map((n) =>
    el('option', { value: n }, `${n}³ · ${(n ** 3).toLocaleString()} 点`),
  ),
);
densitySelect.value = String(state.density);
densitySelect.addEventListener('change', () => {
  state.density = Number(densitySelect.value);
  samples = createSourceSamples(state.density, state.source);
  sourcePositions = samples.map((point) =>
    plotPosition(point, getTarget(state.source)!),
  );
  sourceColors = samples.map((point) =>
    convertColor(point, getTarget('srgb')!, state.source),
  );
  selectedPoint = clamp(selectedPoint, 0, samples.length - 1);
  updateModel();
  renderInspector();
});
const reset = button(
  '全部重置',
  () => {
    Object.assign(state, defaultState());
    samples = createSourceSamples(state.density, state.source);
    sourcePositions = samples.map((point) =>
      plotPosition(point, getTarget(state.source)!),
    );
    sourceColors = samples.map((point) =>
      convertColor(point, getTarget('srgb')!, state.source),
    );
    selectedPoint = (state.density - 1) * state.density ** 2;
    selectedStage = 'saturation';
    densitySelect.value = String(state.density);
    sourceSelect.value = state.source;
    plotSelect.value = state.plot;
    plotSelect.options[0].disabled = false;
    mobileTarget.value = state.target;
    strength.set(1);
    stopRotation();
    renderTargets();
    renderInspector();
    renderDisplayControls();
    updateModel();
    notify('已恢复 sRGB → Oklab 与默认视角');
  },
  { icon: 'reset', iconOnly: true, class: 'icon-button' },
);
const mobileTarget = el(
  'select',
  { 'aria-label': '目标模型', class: 'mobile-target' },
  ...colorTargets.map((target) =>
    el('option', { value: target.id }, target.name),
  ),
  el('option', { value: 'lut' }, '导入 .cube LUT'),
  el('option', { value: 'stages' }, '自定义处理阶段'),
);
mobileTarget.value = state.target;
mobileTarget.addEventListener('change', () => chooseTarget(mobileTarget.value));
const sourceSelect = el(
  'select',
  { id: 'source', 'aria-label': '源色彩空间' },
  ...colorSources.map((source) =>
    el('option', { value: source.id }, source.name),
  ),
);
sourceSelect.value = state.source;
sourceSelect.addEventListener('change', () => {
  state.source = sourceSelect.value;
  samples = createSourceSamples(state.density, state.source);
  sourcePositions = samples.map((point) =>
    plotPosition(point, getTarget(state.source)!),
  );
  sourceColors = samples.map((point) =>
    convertColor(point, getTarget('srgb')!, state.source),
  );
  updateModel();
  renderInspector();
});
const plotSelect = el(
  'select',
  { id: 'plot', 'aria-label': '绘图空间' },
  el('option', { value: 'native' }, '原生坐标（分别绘图）'),
  ...['oklab', 'xyz-d65', 'lab', 'srgb-linear'].map((id) =>
    el('option', { value: id }, `统一 ${getTarget(id)!.name}`),
  ),
);
plotSelect.value = state.plot;
plotSelect.options[0].disabled = isLook();
plotSelect.addEventListener('change', () => {
  state.plot = plotSelect.value;
  updateModel();
});
const toolbar = el(
  'div',
  { class: 'lab-toolbar' },
  el(
    'div',
    { class: 'toolbar-title' },
    icon('cube'),
    el('h1', {}, '色体积工作台'),
    el('span', { class: 'live-tag' }, '实时'),
  ),
  el(
    'div',
    { class: 'toolbar-selects' },
    el('label', { for: 'source' }, '源'),
    sourceSelect,
    mobileTarget,
    el('label', { for: 'plot' }, '绘图'),
    plotSelect,
    el('label', { for: 'density' }, '采样'),
    densitySelect,
    reset,
    button('导出对比图', exportImage, {
      icon: 'download',
      iconOnly: true,
      class: 'icon-button',
    }),
  ),
);
const viewPresets = [
  { name: '等轴视角', yaw: Math.PI / 4, pitch: 0.57 },
  { name: '正视', yaw: 0, pitch: 0 },
  { name: '俯视', yaw: 0, pitch: Math.PI / 2 - 0.08 },
];
const cameraControls = el(
  'div',
  { class: 'camera-controls' },
  el(
    'div',
    { class: 'button-group' },
    ...viewPresets.map((item) =>
      button(
        item.name,
        () => {
          stopRotation();
          state.yaw = item.yaw;
          state.pitch = item.pitch;
          draw();
        },
        { class: 'button subtle' },
      ),
    ),
  ),
  rotationButton,
  zoom.element,
  button(
    '重置视角',
    () => {
      stopRotation();
      Object.assign(state, { yaw: Math.PI / 4, pitch: 0.57, zoom: 1 });
      draw();
    },
    { icon: 'reset', iconOnly: true, class: 'icon-button' },
  ),
);
const lab = el(
  'section',
  { id: 'lab', class: 'lab', 'aria-label': '色体积交互工作台' },
  toolbar,
  el(
    'div',
    { class: 'workspace' },
    el(
      'aside',
      { class: 'pipeline target-sidebar', 'aria-label': '目标选择' },
      el(
        'div',
        { class: 'panel-heading' },
        el('h2', {}, '目标模型'),
        el('span', { class: 'mono muted' }, `${colorTargets.length} + 2`),
      ),
      targetList,
    ),
    el(
      'div',
      { class: 'visualization' },
      el(
        'div',
        { class: 'volume-pair' },
        el(
          'section',
          { class: 'volume-panel', 'aria-label': '源色体积' },
          el(
            'div',
            { class: 'volume-heading' },
            el(
              'div',
              {},
              el('span', { class: 'status-dot' }),
              sourceTitle,
              el('span', { class: 'mono' }, 'SOURCE'),
            ),
            viewStatus,
          ),
          leftCanvas,
          el('div', { class: 'canvas-caption' }, leftCaption),
        ),
        el(
          'section',
          { class: 'volume-panel', 'aria-label': '目标色体积' },
          el(
            'div',
            { class: 'volume-heading' },
            el(
              'div',
              {},
              el('span', { class: 'status-dot violet' }),
              rightTitle,
            ),
            rightMode,
          ),
          rightCanvas,
          emptyTarget,
          el('div', { class: 'canvas-caption' }, rightCaption),
        ),
      ),
      el(
        'div',
        { class: 'interaction-hint' },
        icon('rotate'),
        el('span', {}, '拖动旋转 · 聚焦后滚轮缩放 · 方向键旋转'),
        el('span', { class: 'sync-label' }, icon('link'), '视角同步'),
      ),
      cameraControls,
      displayControls,
      el(
        'div',
        { class: 'mix-control' },
        el('div', {}, mixingTitle, mixingDescription),
        strength.element,
      ),
      sampleReadout,
    ),
    inspector,
  ),
  el(
    'div',
    { class: 'lab-status' },
    el('span', {}, el('span', { class: 'status-dot' }), count),
    modelStatus,
  ),
);
function exportImage() {
  if (state.target === 'lut' && !lutReady()) {
    notify('请先导入 LUT 并指定输入输出色域和 Gamma。');
    return;
  }
  const canvas = document.createElement('canvas');
  canvas.width = 1600;
  canvas.height = 900;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#141619';
  ctx.fillRect(0, 0, 1600, 900);
  ctx.fillStyle = '#eeeff4';
  ctx.font = '24px sans-serif';
  ctx.fillText(`SOURCE: ${getTarget(state.source)!.name}`, 40, 55);
  ctx.fillText(
    `TARGET: ${getTarget(state.target)?.name ?? (state.target === 'lut' ? lut!.name : 'Custom Look')}`,
    840,
    55,
  );
  const sourcePlot = state.plot === 'native' ? state.source : state.plot;
  const targetPlot = state.plot === 'native' ? state.target : state.plot;
  ctx.font = '13px sans-serif';
  ctx.fillText(`PLOT: ${getTarget(sourcePlot)!.name}`, 40, 82, 760);
  ctx.fillText(`PLOT: ${getTarget(targetPlot)!.name}`, 840, 82, 720);
  [leftCanvas, rightCanvas].forEach((source, index) => {
    const ratio = Math.min(760 / source.width, 690 / source.height);
    ctx.drawImage(
      source,
      40 + index * 800 + (760 - source.width * ratio) / 2,
      90 + (690 - source.height * ratio) / 2,
      source.width * ratio,
      source.height * ratio,
    );
  });
  if (state.target === 'lut') {
    ctx.font = '13px sans-serif';
    ctx.fillText(
      `LUT IN: ${state.lutInput.gamut} / ${state.lutInput.gamma} / black ${state.lutInput.black}, white ${state.lutInput.white}`,
      40,
      810,
    );
    ctx.fillText(
      `LUT OUT: ${state.lutOutput.gamut} / ${state.lutOutput.gamma} / black ${state.lutOutput.black}, white ${state.lutOutput.white}`,
      840,
      810,
    );
  }
  ctx.font = '13px sans-serif';
  const plotKind = getTarget(targetPlot)!.kind;
  const axisMode = ['hsl', 'hsv'].includes(plotKind)
    ? 'Cylindrical parameter diagram'
    : state.equalAxes
      ? 'Equal-unit axes'
      : 'Illustrative axes';
  const colorMode =
    isLook() && state.preserve ? 'Input tracking' : 'Actual output';
  ctx.fillText(
    `AXES: ${axisMode} | DOTS: ${state.flatColors ? 'Flat' : 'Shaded'} | COLORS: ${colorMode} | ${state.target === 'lut' ? `${state.interpolation} | DOMAIN clamped: ${clippedInputs}` : `Color loss: ${conversionLoss.filter(Boolean).length}`}`,
    40,
    835,
    1520,
  );
  ctx.fillStyle = '#a0a3ae';
  ctx.font = '16px sans-serif';
  ctx.fillText(
    `${samples.length} ${getTarget(state.source)!.name} samples | ${isLook() ? 'Look strength' : 'Plot morph'}: ${Math.round(state.strength * 100)}% | ${getTarget(state.target)?.white ?? 'RGB response'}`,
    40,
    865,
  );
  canvas.toBlob((blob) => {
    if (!blob) {
      notify('图像导出失败，请重试。');
      return;
    }
    if (exportUrl) URL.revokeObjectURL(exportUrl);
    exportUrl = URL.createObjectURL(blob);
    const download = el(
      'a',
      {
        href: exportUrl,
        download: 'chromatic-volume.png',
        class: 'button',
      },
      '下载 PNG',
    );
    const standalone = el(
      'a',
      {
        href: stateUrl(state, location.origin),
        target: '_blank',
        rel: 'noopener',
        class: 'button',
      },
      '独立打开后导出',
    );
    exportFeedback.hidden = false;
    exportFeedback.replaceChildren(
      el(
        'p',
        {},
        '对比图已生成。如果下载未开始，可重试下载或独立打开后导出。导入的 LUT 文件需要重新选择。',
      ),
      download,
      standalone,
    );
    // A sandbox can silently block downloads. Keep recovery actions and the blob alive until the next export.
    download.click();
    notify('对比图已生成');
  });
}
export function mountLab() {
  document.title = '色体积工作台 · Chromatic Volume';
  lab.append(exportFeedback);
  root.replaceChildren(el('main', { class: 'workbench-page' }, lab), toast);
  renderTargets();
  renderInspector();
  renderDisplayControls();
  updateModel();
  try {
    views = [leftCanvas, rightCanvas].map(
      (canvas) => new VolumeView(canvas, state, draw, pick),
    );
  } catch (error) {
    lab.prepend(
      el(
        'p',
        { class: 'error-banner', role: 'alert' },
        error instanceof Error ? error.message : '画布初始化失败，请刷新重试。',
      ),
    );
  }
  draw();
  if (shared && !restored) notify('分享参数无效，已恢复默认目标 Oklab。');
  reducedMotion.addEventListener('change', () => {
    if (reducedMotion.matches) stopRotation();
  });
  document.addEventListener('visibilitychange', () => {
    lastTime = 0;
    if (!document.hidden) draw();
  });
  window.addEventListener('pagehide', () => {
    views.forEach((view) => view.destroy());
    cancelAnimationFrame(animationFrame);
    if (exportUrl) URL.revokeObjectURL(exportUrl);
  });
}
