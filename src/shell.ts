import { el, icon } from './dom';

// Top-level figure categories. The colour volume workbench stays at "/".
export const views = [
  { id: 'volume', name: '色体积', href: '/', count: 16 },
  { id: 'transform', name: 'RGB 变换', href: '/?view=transform', count: 6 },
  {
    id: 'chromaticity',
    name: '色度图',
    href: '/?view=chromaticity',
    count: 3,
  },
  { id: 'spectrum', name: '光谱', href: '/?view=spectrum', count: 7 },
  { id: 'curves', name: '曲线', href: '/?view=curves', count: 3 },
  { id: 'pixels', name: '采样与量化', href: '/?view=pixels', count: 3 },
] as const;
export type ViewId = (typeof views)[number]['id'];
export type FigureViewId = Exclude<ViewId, 'volume'>;
export const figureViews = views
  .map((view) => view.id)
  .filter((id): id is FigureViewId => id !== 'volume');

/** Figures that changed tab; old `?view=…&fig=…` links follow them. */
export const movedFigures: Record<string, FigureViewId> = {
  mixing: 'spectrum',
};

export function viewTabs(current: ViewId) {
  return el(
    'nav',
    { class: 'view-tabs', 'aria-label': '图类型' },
    el(
      'span',
      { class: 'view-brand' },
      icon('cube'),
      el('span', {}, 'Chromatic Volume'),
    ),
    el(
      'div',
      { class: 'view-tab-list' },
      ...views.map((view) =>
        el(
          'a',
          {
            href: view.href,
            class: 'view-tab',
            'data-view': view.id,
            ...(view.id === current ? { 'aria-current': 'page' } : {}),
          },
          view.name,
          el(
            'span',
            { class: 'view-tab-count', 'aria-label': `${view.count} 张图` },
            view.count,
          ),
        ),
      ),
    ),
  );
}
