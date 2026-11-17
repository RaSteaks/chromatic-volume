import { el } from '../dom';
import {
  figureNav,
  figureTitle,
  linkReferences,
  stageNav,
  stageOf,
  type PlotModule,
  type StageId,
} from '../shell';

export interface FigureContext {
  /** Drawing area; figures append their own canvas(es). */
  host: HTMLElement;
  /** Control row under the figure. */
  controls: HTMLElement;
  /** Live values beside the figure (numbers, swatches). */
  readout: HTMLElement;
}
/**
 * How far a figure can be trusted as a reference:
 * - reference: a published standard, model or measured dataset, implemented as written;
 * - approximate: a fit or simplification of such a standard;
 * - illustrative: constructed data or a deliberately simple algorithm.
 */
export type FigureGrade = 'reference' | 'approximate' | 'illustrative';
export const gradeNames: Record<FigureGrade, string> = {
  reference: '参考',
  approximate: '近似',
  illustrative: '示意',
};
const gradeTitles: Record<FigureGrade, string> = {
  reference: '按公开标准、文献模型或实测数据实现',
  approximate: '对标准的拟合或简化，数值与完整实现有差别',
  illustrative: '构造数据或简化算法，只说明机制',
};
export interface Provenance {
  /** Datasets and their origin. */
  data?: string;
  /** Observer, illuminant, adaptation, encoding domain. */
  domain?: string;
  /** What is fitted, simplified or left out. */
  approximation?: string;
  /** Standards and papers. */
  reference?: string;
}
const provenanceLabels: [keyof Provenance, string][] = [
  ['data', '数据源'],
  ['domain', '计算域'],
  ['approximation', '近似'],
  ['reference', '文献'],
];
export interface FigureDef {
  /** Key into the stage catalogue in `src/shell.ts`, which holds the title. */
  id: string;
  /** One specification line: observer, illuminant, domain, sampling. */
  conditions: string;
  /** How to read the drawing: what the marks, positions and colours stand for. */
  reading: string;
  grade: FigureGrade;
  /** The non-obvious result; live numbers belong in the readout. */
  highlight: string;
  provenance: Provenance;
  mount(context: FigureContext): () => void;
}
export type FigureGroup = { figures: FigureDef[] };

const loaders: Record<PlotModule, () => Promise<FigureGroup[]>> = {
  transform: () => import('./transform').then((m) => m.groups),
  chromaticity: () => import('./chromaticity').then((m) => m.groups),
  spectrum: () => import('./spectrum').then((m) => m.groups),
  curves: () => import('./curves').then((m) => m.groups),
  pixels: () => import('./pixels').then((m) => m.groups),
};

/**
 * Load every figure module a stage draws on; separate so the caller can bound
 * it with a timeout. Volume figures are not included: they live in the workbench.
 */
export async function loadFigures(stage: StageId) {
  const modules = [
    ...new Set(
      stageOf(stage)
        .groups.flatMap((group) => group.figures)
        .map((entry) => entry.module)
        .filter((module): module is PlotModule => module !== 'volume'),
    ),
  ];
  const groups = await Promise.all(modules.map((module) => loaders[module]()));
  return new Map(
    groups
      .flat()
      .flatMap((group) => group.figures)
      .map((figure) => [figure.id, figure]),
  );
}
export function mountFigures(
  stage: StageId,
  initial: string,
  figures: Map<string, FigureDef>,
) {
  const root = document.querySelector<HTMLDivElement>('#app')!;
  let current = figures.get(initial)!;
  let unmount: (() => void) | null = null;

  const nav = figureNav(
    stage,
    (entry) => figures.has(entry.id),
    (id) => select(figures.get(id)!),
  );
  const title = el('h1', {});
  const titleGrade = el('span', { class: 'figure-title-grade' });
  const conditions = el('p', { class: 'figure-conditions' });
  const reading = el('p', { class: 'figure-reading' });
  const host = el('div', { class: 'figure-host' });
  const controls = el('div', { class: 'figure-controls' });
  const readout = el('div', { class: 'figure-readout' });
  const highlight = el('p', { class: 'figure-highlight' });
  const provenance = el('dl', { class: 'figure-provenance' });

  function select(figure: FigureDef) {
    current = figure;
    const url = new URL(location.href);
    url.search = '';
    url.searchParams.set('fig', figure.id);
    // Each figure is a history entry, so Back returns to the previous one.
    if (url.href !== location.href) history.pushState(null, '', url);
    render();
  }
  function render() {
    unmount?.();
    host.replaceChildren();
    controls.replaceChildren();
    readout.replaceChildren();
    const name = figureTitle(current.id);
    title.textContent = name;
    titleGrade.replaceChildren(gradeTag(current.grade));
    conditions.textContent = current.conditions;
    reading.textContent = current.reading;
    highlight.textContent = current.highlight;
    linkReferences(highlight);
    provenance.replaceChildren(
      ...provenanceLabels.flatMap(([key, label]) =>
        current.provenance[key]
          ? [el('dt', {}, label), el('dd', {}, current.provenance[key]!)]
          : [],
      ),
    );
    nav.mark(current.id);
    host.dataset.figure = current.id;
    document.title = `${name} · ${stageOf(stage).name} · Chromatic Volume`;
    unmount = current.mount({ host, controls, readout });
  }

  root.replaceChildren(
    el(
      'main',
      { class: 'workbench-page figure-page' },
      el(
        'section',
        { class: 'lab figure-lab', 'aria-label': stageOf(stage).name },
        stageNav(stage),
        el(
          'div',
          { class: 'figure-workspace' },
          el(
            'aside',
            { class: 'target-sidebar', 'aria-label': '图例列表' },
            nav.list,
          ),
          el(
            'section',
            { class: 'figure-stage' },
            el(
              'div',
              { class: 'figure-heading' },
              nav.mobile,
              el('div', { class: 'figure-title-row' }, title, titleGrade),
              conditions,
              reading,
            ),
            host,
            controls,
          ),
          el(
            'aside',
            { class: 'inspector figure-inspector', 'aria-label': '看点' },
            el(
              'div',
              { class: 'inspector-content' },
              highlight,
              readout,
              sourceDetails(provenance),
            ),
          ),
        ),
      ),
    ),
  );
  render();
  window.addEventListener('popstate', () => {
    const figure = figures.get(
      new URLSearchParams(location.search).get('fig') ?? '',
    );
    // A figure of another page (or of the workbench) needs a full load.
    if (!figure) location.reload();
    else if (figure !== current) {
      current = figure;
      render();
    }
  });
  window.addEventListener('pagehide', () => unmount?.());
}

export function gradeTag(grade: FigureGrade) {
  return el(
    'span',
    { class: 'figure-grade', 'data-grade': grade, title: gradeTitles[grade] },
    gradeNames[grade],
  );
}
/** Data sources, domain and approximations stay one click away. */
export function sourceDetails(...children: Node[]) {
  return el(
    'details',
    { class: 'source-details' },
    el('summary', {}, '来源与近似'),
    ...children,
  );
}
