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
export interface FigureDef {
  id: string;
  /** Running number in the figure catalogue (1–37). */
  number: number;
  title: string;
  caption: string;
  highlight: string;
  /** Honest scope note: approximations, data sources, what is not shown. */
  note?: string;
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
  const caption = el('p', { class: 'figure-caption' });
  const host = el('div', { class: 'figure-host' });
  const controls = el('div', { class: 'figure-controls' });
  const readout = el('div', { class: 'figure-readout' });
  const highlight = el('p', { class: 'figure-highlight' });
  const note = el('p', { class: 'figure-note' });

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
              el('strong', {}, `${figure.number}. ${figure.title}`),
              el('span', {}, figure.caption),
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
    caption.textContent = current.caption;
    highlight.textContent = current.highlight;
    note.textContent = current.note ?? '';
    note.hidden = !current.note;
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
              el('div', {}, title, caption),
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
              note,
            ),
          ),
        ),
      ),
    ),
  );
  render();
  window.addEventListener('pagehide', () => unmount?.());
}
