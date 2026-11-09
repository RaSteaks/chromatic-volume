import { el, icon } from './dom';

// Top-level figure categories. The colour volume workbench stays at "/".
export const views = [
  { id: 'volume', name: '色体积', href: '/' },
  { id: 'transform', name: '色彩变换', href: '/?view=transform' },
  { id: 'chromaticity', name: '色度图', href: '/?view=chromaticity' },
  { id: 'spectrum', name: '光谱', href: '/?view=spectrum' },
  { id: 'curves', name: '曲线', href: '/?view=curves' },
  { id: 'pixels', name: '像素', href: '/?view=pixels' },
] as const;
export type ViewId = (typeof views)[number]['id'];
export type FigureViewId = Exclude<ViewId, 'volume'>;
export const figureViews = views
  .map((view) => view.id)
  .filter((id): id is FigureViewId => id !== 'volume');

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
        ),
      ),
    ),
  );
}
