import { el, icon } from '../dom';
import { viewTabs, views, type FigureViewId } from '../shell';

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
  id: string;
  /** Running number in the figure catalogue (1–37). */
  number: number;
  title: string;
  /** One specification line: observer, illuminant, domain, sampling. */
  conditions: string;
  grade: FigureGrade;
  /** The non-obvious result; live numbers belong in the readout. */
  highlight: string;
  provenance: Provenance;
  mount(context: FigureContext): () => void;
}
export type FigureGroup = { name: string; figures: FigureDef[] };

// Typed against the tab list, so a new tab cannot be added without a loader.
const loaders: Record<FigureViewId, () => Promise<FigureGroup[]>> = {
  transform: () => import('./transform').then((m) => m.groups),
  chromaticity: () => import('./chromaticity').then((m) => m.groups),
  spectrum: () => import('./spectrum').then((m) => m.groups),
  curves: () => import('./curves').then((m) => m.groups),
  pixels: () => import('./pixels').then((m) => m.groups),
};

/** Load a tab's figure modules; separate so the caller can bound it with a timeout. */
export function loadFigures(view: FigureViewId): Promise<FigureGroup[]> {
  return loaders[view]();
}
export function mountFigures(view: FigureViewId, groups: FigureGroup[]) {
  const root = document.querySelector<HTMLDivElement>('#app')!;
  const figures = groups.flatMap((group) => group.figures);
  const params = new URLSearchParams(location.search);
  let current =
    figures.find((figure) => figure.id === params.get('fig')) ?? figures[0];
  let unmount: (() => void) | null = null;

  const list = el('div', {
    class: 'figure-list',
    role: 'group',
    'aria-label': '图例',
  });
  const mobile = el(
    'select',
    { class: 'mobile-figure figure-mobile', 'aria-label': '选择图例' },
    ...figures.map((figure) =>
      el('option', { value: figure.id }, `${figure.number}. ${figure.title}`),
    ),
  );
  mobile.addEventListener('change', () =>
    select(figures.find((f) => f.id === mobile.value)!),
  );
  const title = el('h1', {});
  const titleGrade = el('span', { class: 'figure-title-grade' });
  const conditions = el('p', { class: 'figure-conditions' });
  const host = el('div', { class: 'figure-host' });
  const controls = el('div', { class: 'figure-controls' });
  const readout = el('div', { class: 'figure-readout' });
  const highlight = el('p', { class: 'figure-highlight' });
  const provenance = el('dl', { class: 'figure-provenance' });
  const gradeTag = (grade: FigureGrade) =>
    el(
      'span',
      { class: 'figure-grade', 'data-grade': grade, title: gradeTitles[grade] },
      gradeNames[grade],
    );

  function renderList() {
    list.replaceChildren(
      ...groups.map((group) =>
        el(
          'div',
          { class: 'figure-group' },
          groups.length > 1 ? el('h3', {}, group.name) : null,
          ...group.figures.map((figure) => {
            const item = el(
              'button',
              {
                type: 'button',
                class: 'figure-button',
                'data-figure': figure.id,
                'aria-pressed': String(figure === current),
              },
              el(
                'strong',
                {},
                `${figure.number}. ${figure.title}`,
                figure.grade === 'reference' ? null : gradeTag(figure.grade),
              ),
              el('span', {}, figure.conditions),
            );
            item.addEventListener('click', () => select(figure));
            return item;
          }),
        ),
      ),
    );
  }
  function select(figure: FigureDef) {
    current = figure;
    const url = new URL(location.href);
    url.searchParams.set('view', view);
    url.searchParams.set('fig', figure.id);
    history.replaceState(null, '', url);
    render();
  }
  function render() {
    unmount?.();
    host.replaceChildren();
    controls.replaceChildren();
    readout.replaceChildren();
    title.textContent = `${current.number}. ${current.title}`;
    titleGrade.replaceChildren(gradeTag(current.grade));
    conditions.textContent = current.conditions;
    highlight.textContent = current.highlight;
    provenance.replaceChildren(
      ...provenanceLabels.flatMap(([key, name]) =>
        current.provenance[key]
          ? [el('dt', {}, name), el('dd', {}, current.provenance[key]!)]
          : [],
      ),
    );
    mobile.value = current.id;
    host.dataset.figure = current.id;
    document.title = `${current.title} · ${views.find((v) => v.id === view)!.name} · Chromatic Volume`;
    renderList();
    unmount = current.mount({ host, controls, readout });
  }

  root.replaceChildren(
    el(
      'main',
      { class: 'workbench-page figure-page' },
      el(
        'section',
        {
          class: 'lab figure-lab',
          'aria-label': `${views.find((v) => v.id === view)!.name}图例`,
        },
        viewTabs(view),
        el(
          'div',
          { class: 'figure-workspace' },
          el(
            'aside',
            { class: 'pipeline target-sidebar', 'aria-label': '图例列表' },
            el(
              'div',
              { class: 'panel-heading' },
              el('h2', {}, '图例'),
              el('span', { class: 'mono muted' }, String(figures.length)),
            ),
            el('div', { class: 'sidebar-scroll' }, list),
          ),
          el(
            'section',
            { class: 'figure-stage' },
            el(
              'div',
              { class: 'figure-heading' },
              el(
                'div',
                {},
                el('div', { class: 'figure-title-row' }, title, titleGrade),
                conditions,
              ),
              mobile,
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
              el('div', { class: 'stage-category' }, icon('info'), '看点'),
              highlight,
              readout,
              provenance,
            ),
          ),
        ),
      ),
    ),
  );
  render();
  window.addEventListener('pagehide', () => unmount?.());
}
