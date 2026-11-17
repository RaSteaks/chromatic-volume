import { el } from './dom';

/**
 * Where a figure's code lives: the colour-volume workbench (`volume`) or one
 * of the figure modules. Two figures of the same module share one page; a
 * figure of the other kind is a plain link.
 */
export type FigureModule =
  'volume' | 'transform' | 'chromaticity' | 'spectrum' | 'curves' | 'pixels';
export type PlotModule = Exclude<FigureModule, 'volume'>;
export interface FigureEntry {
  id: string;
  title: string;
  module: FigureModule;
}
export interface StageGroup {
  name: string;
  figures: FigureEntry[];
}
export interface Stage {
  id: 'capture' | 'grade' | 'deliver';
  name: string;
  groups: StageGroup[];
}
export type StageId = Stage['id'];

const f = (module: FigureModule, id: string, title: string): FigureEntry => ({
  id,
  title,
  module,
});

/**
 * The figure catalogue, in the order of a film pipeline. This is the only
 * place figure titles are written; figure definitions are keyed by id.
 */
export const stages: Stage[] = [
  {
    id: 'capture',
    name: '拍摄',
    groups: [
      {
        name: '光源',
        figures: [
          f('spectrum', 'blackbody', '黑体辐射'),
          f('spectrum', 'metamerism', '同色异谱'),
          f('spectrum', 'tm30', 'TM-30 色矢量图'),
        ],
      },
      {
        name: '被摄物',
        figures: [
          f('volume', 'optimal', '最优色边界'),
          f('volume', 'pointer', 'Pointer 色域'),
        ],
      },
      {
        name: '标准观察者',
        figures: [
          f('spectrum', 'cmf', 'CIE 配色函数'),
          f('spectrum', 'rgb-cmf', 'RGB 配色函数'),
        ],
      },
      {
        name: '摄影机',
        figures: [
          f('spectrum', 'luther', '相机灵敏度与 Luther 条件'),
          f('pixels', 'bayer', 'Bayer 阵列与去马赛克'),
          f('volume', 'awg4', 'ARRI Wide Gamut 4'),
          f('volume', 'sgamut3', 'S-Gamut3'),
          f('curves', 'hd', '胶片特性曲线（H&D）'),
        ],
      },
    ],
  },
  {
    id: 'grade',
    name: '调色',
    groups: [
      {
        name: '工作色域',
        figures: [
          f('chromaticity', 'cie1931', 'CIE 色度图'),
          f('volume', 'ap1', 'ACES AP1'),
          f('volume', 'dwg', 'DaVinci Wide Gamut'),
          f('transform', 'rgc', 'ACES Reference Gamut Compression'),
        ],
      },
      {
        name: '感知空间',
        figures: [
          f('volume', 'oklab', 'sRGB 在 Oklab 中'),
          f('chromaticity', 'hue-lines', '等色相线：CIELAB 与 Oklab'),
          f('volume', 'ipt', 'IPT 对照 Oklab'),
          f('volume', 'luv-lab', 'CIELUV 对照 CIELAB'),
          f('volume', 'lms', 'LMS 视锥响应'),
          f('chromaticity', 'macadam', 'MacAdam 椭圆'),
        ],
      },
      {
        name: '调色器参数',
        figures: [
          f('volume', 'hsl-bicone', 'HSL 双六棱锥'),
          f('volume', 'hsv-hexcone', 'HSV 六棱锥'),
        ],
      },
    ],
  },
  {
    id: 'deliver',
    name: '交付',
    groups: [
      {
        name: '显示变换',
        figures: [
          f('curves', 'tonemap', '色调映射曲线'),
          f('transform', 'aces', 'ACES 1.x 色调映射（Hill 拟合）'),
          f('transform', 'agx', 'AgX'),
        ],
      },
      {
        name: '编码与 HDR',
        figures: [
          f('curves', 'transfer', '传递函数'),
          f('volume', 'jzazbz', 'Jzazbz：HDR 均匀空间'),
          f('volume', 'zcam', 'ZCAM：HDR 色貌模型'),
        ],
      },
      {
        name: '视频信号',
        figures: [
          f('volume', 'ycbcr', 'Y′CbCr：亮度与色度分布'),
          f('pixels', 'subsampling', '色度抽样'),
          f('pixels', 'bit-depth', '位深与色带'),
        ],
      },
    ],
  },
];

export const catalogue = stages.flatMap((stage) =>
  stage.groups.flatMap((group) =>
    group.figures.map((figure) => ({ ...figure, stage: stage.id })),
  ),
);
export const findFigure = (id: string | null) =>
  catalogue.find((figure) => figure.id === id);
export const stageOf = (id: StageId) => stages.find((s) => s.id === id)!;
export const figureTitle = (id: string) => findFigure(id)?.title ?? id;
export const figureHref = (id: string) => `/?fig=${encodeURIComponent(id)}`;

/** Old `?view=<tab>` links without a figure open that tab's first figure. */
const legacyViews: Record<string, string> = {
  volume: 'oklab',
  transform: 'aces',
  chromaticity: 'cie1931',
  spectrum: 'cmf',
  curves: 'transfer',
  pixels: 'subsampling',
};
/** The figure an address asks for; unknown or removed figures fall back to the first. */
export function requestedFigure(params: URLSearchParams) {
  return (
    findFigure(params.get('fig')) ??
    findFigure(legacyViews[params.get('view') ?? '']) ??
    catalogue[0]
  );
}

/** The three pipeline stages. Each opens on its first figure. */
export function stageNav(current: StageId) {
  return el(
    'nav',
    { class: 'stage-nav', 'aria-label': '制作流程' },
    ...stages.flatMap((stage, index) => [
      index
        ? el('span', { class: 'stage-arrow', 'aria-hidden': 'true' }, '→')
        : null,
      el(
        'a',
        {
          href: figureHref(stage.groups[0].figures[0].id),
          class: 'stage-tab',
          'data-stage': stage.id,
          ...(stage.id === current ? { 'aria-current': 'page' } : {}),
        },
        stage.name,
      ),
    ]),
  );
}

/**
 * The figures of one stage, as links. Figures the current page can show are
 * selected in place through `onSelect`; the others navigate.
 */
export function figureNav(
  stage: StageId,
  local: (entry: FigureEntry) => boolean,
  onSelect: (id: string) => void,
) {
  const groups = stageOf(stage).groups;
  const list = el(
    'nav',
    { class: 'figure-list', 'aria-label': `${stageOf(stage).name}图例` },
    ...groups.map((group) =>
      el(
        'div',
        { class: 'figure-group' },
        el('h3', {}, group.name),
        ...group.figures.map((entry) => {
          const link = el(
            'a',
            {
              href: figureHref(entry.id),
              class: 'figure-link',
              'data-figure': entry.id,
            },
            entry.title,
          );
          link.addEventListener('click', (event) => {
            if (!local(entry) || event.metaKey || event.ctrlKey) return;
            event.preventDefault();
            onSelect(entry.id);
          });
          return link;
        }),
      ),
    ),
  );
  // On a phone the list becomes one native select.
  const mobile = el(
    'select',
    { class: 'figure-mobile', 'aria-label': '选择图例' },
    ...groups.map((group) =>
      el(
        'optgroup',
        { label: group.name },
        ...group.figures.map((entry) =>
          el('option', { value: entry.id }, entry.title),
        ),
      ),
    ),
  );
  mobile.addEventListener('change', () => {
    const entry = findFigure(mobile.value)!;
    if (local(entry)) onSelect(entry.id);
    else location.assign(figureHref(entry.id));
  });
  return {
    list,
    mobile,
    /** Mark the current figure; null when the workbench shows a custom setup. */
    mark(id: string | null) {
      list.querySelectorAll<HTMLAnchorElement>('.figure-link').forEach((a) => {
        if (a.dataset.figure === id) a.setAttribute('aria-current', 'true');
        else a.removeAttribute('aria-current');
      });
      mobile.value = id ?? '';
    },
  };
}

/** Turn 「figure title」 or 「stage name」 in a 看点 into a link. */
export function linkReferences(element: HTMLElement) {
  const parts = (element.textContent ?? '').split(/(「[^」]+」)/);
  if (parts.length < 2) return;
  element.replaceChildren(
    ...parts.flatMap((part) => {
      const name = /^「(.+)」$/.exec(part)?.[1];
      const id =
        catalogue.find((entry) => entry.title === name)?.id ??
        stages.find((stage) => stage.name === name)?.groups[0].figures[0].id;
      if (!name || !id) return [part];
      return [
        '「',
        el('a', { href: figureHref(id), class: 'figure-reference' }, name),
        '」',
      ];
    }),
  );
}
