import {
  displayGamut,
  displayName,
  p3Available,
  p3Screen,
  setDisplayGamut,
} from './display';
import { button, el, icon } from './dom';

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
  const nav = el(
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
    el(
      'div',
      { class: 'view-tools' },
      searchButton(),
      gamutToggle(),
      button('专注模式（F）', toggleFocus, {
        icon: 'expand',
        iconOnly: true,
        class: 'icon-button focus-toggle',
      }),
    ),
  );
  installShortcuts();
  // On a phone the tab bar scrolls sideways; keep the current tab in view.
  // Scroll the list itself: scrollIntoView would also move a page that embeds the site.
  requestAnimationFrame(() => {
    const tab = nav.querySelector<HTMLElement>('[aria-current]');
    const list = tab?.parentElement;
    if (tab && list)
      list.scrollLeft =
        tab.offsetLeft -
        list.offsetLeft -
        (list.clientWidth - tab.offsetWidth) / 2;
  });
  return nav;
}

/**
 * Which colour space the canvases draw in. Offered only where the browser can
 * draw Display P3; switching reloads, because every canvas is created in one space.
 */
function gamutToggle() {
  if (!p3Available) return null;
  const next = displayGamut === 'p3' ? 'srgb' : 'p3';
  const control = el(
    'button',
    {
      type: 'button',
      class: 'gamut-toggle',
      'data-gamut': displayGamut,
      'aria-label': `画布显示域：${displayName}，切换为 ${next === 'p3' ? 'Display P3' : 'sRGB'}`,
      title:
        `画布与色样按 ${displayName} 绘制，超出部分裁剪。点击切换为 ${next === 'p3' ? 'Display P3' : 'sRGB'}。` +
        (displayGamut === 'p3' && !p3Screen
          ? '当前显示器未报告 P3 色域，实际显示可能仍被压缩到 sRGB。'
          : ''),
    },
    el('i', {}),
    displayGamut === 'p3' ? 'P3' : 'sRGB',
  );
  control.addEventListener('click', () => setDisplayGamut(next));
  return control;
}

/** A neighbouring tab's address; stepping backwards lands on its last figure. */
export function neighbourHref(current: ViewId, direction: -1 | 1) {
  const view = views[views.findIndex((v) => v.id === current) + direction];
  if (!view) return null;
  const url = new URL(view.href, location.origin);
  if (direction < 0) url.searchParams.set('fig', 'last');
  return url.pathname + url.search;
}

// ---------------------------------------------------------------- focus mode
// Hides the figure list and the side panel so the drawing fills the frame.
// Kept for the session, because switching tabs reloads the page.
function focusStored() {
  try {
    return sessionStorage.getItem('focus') === '1';
  } catch {
    return false;
  }
}
function applyFocus(on: boolean) {
  document.documentElement.toggleAttribute('data-focus', on);
  document
    .querySelector('.focus-toggle')
    ?.setAttribute('aria-pressed', String(on));
  try {
    sessionStorage.setItem('focus', on ? '1' : '0');
  } catch {
    // Storage can be unavailable (private mode, sandboxed embed); the mode still works.
  }
}
function toggleFocus() {
  applyFocus(!document.documentElement.hasAttribute('data-focus'));
}

// ------------------------------------------------------------ figure search
interface Entry {
  number: number;
  title: string;
  detail: string;
  tab: string;
  href: string;
  text: string;
}
let entries: Promise<Entry[]> | null = null;
/** Every figure of every tab. Loaded on first use: it pulls in all figure modules. */
function catalogue() {
  entries ??= (async () => {
    const [{ volumeFigures }, { loadFigures }] = await Promise.all([
      import('./volume-figures'),
      import('./figures/page'),
    ]);
    const tabs = await Promise.all(
      figureViews.map(async (id) => ({
        id,
        figures: (await loadFigures(id)).flatMap((group) => group.figures),
      })),
    );
    const name = (id: ViewId) => views.find((view) => view.id === id)!.name;
    const all = [
      ...volumeFigures.map((figure, index) => ({
        number: index + 1,
        title: figure.title,
        detail: figure.caption,
        tab: name('volume'),
        href: `/?fig=${figure.id}`,
      })),
      ...tabs.flatMap(({ id, figures }) =>
        figures.map((figure) => ({
          number: figure.number,
          title: figure.title,
          detail: figure.conditions,
          tab: name(id),
          href: `/?view=${id}&fig=${figure.id}`,
        })),
      ),
    ];
    return all.map((entry) => ({
      ...entry,
      text: `${entry.number} ${entry.title} ${entry.detail} ${entry.tab}`.toLowerCase(),
    }));
  })();
  return entries;
}
/**
 * Turn 「tab name」 and 「figure title」 in a 看点 into links. Tab names resolve
 * at once; figure titles need the catalogue, which is only loaded if one is quoted.
 */
export function linkReferences(element: HTMLElement) {
  const text = element.textContent ?? '';
  const parts = text.split(/(「[^」]+」)/);
  if (parts.length < 2) return;
  const build = (all: Entry[] = []) => {
    let pending = false;
    const nodes = parts.flatMap((part) => {
      const name = /^「(.+)」$/.exec(part)?.[1];
      if (!name) return [part];
      const href =
        views.find((view) => view.name === name)?.href ??
        all.find((entry) => entry.title === name)?.href;
      if (!href) {
        pending = true;
        return [part];
      }
      return ['「', el('a', { href, class: 'figure-reference' }, name), '」'];
    });
    element.replaceChildren(...nodes);
    return pending;
  };
  if (build())
    catalogue().then(
      (all) => {
        // The panel may have moved on to another figure meanwhile.
        if (element.isConnected && element.textContent === text) build(all);
      },
      () => {},
    );
}
const mac = /Mac|iPhone|iPad/.test(navigator.platform);
function searchButton() {
  const control = el(
    'button',
    { type: 'button', class: 'search-button', 'aria-label': '搜索图例' },
    icon('search'),
    el('span', {}, '搜索图例'),
    el('kbd', {}, mac ? '⌘K' : 'Ctrl K'),
  );
  control.addEventListener('click', openSearch);
  return control;
}
let dialog: HTMLDialogElement | null = null;
function openSearch() {
  if (dialog?.open) return;
  dialog?.remove();
  const input = el('input', {
    type: 'search',
    role: 'combobox',
    'aria-label': '搜索全部图例',
    'aria-controls': 'figure-search-results',
    'aria-expanded': 'true',
    'aria-autocomplete': 'list',
    placeholder: '编号、名称或条件，如 PQ、Bradford',
    autocomplete: 'off',
    spellcheck: 'false',
  });
  const results = el('div', { id: 'figure-search-results', role: 'listbox' });
  const current = (dialog = el(
    'dialog',
    { class: 'figure-search', 'aria-label': '搜索全部图例' },
    el('div', { class: 'figure-search-field' }, icon('search'), input),
    results,
    el(
      'p',
      { class: 'figure-search-hint' },
      el('kbd', {}, '↑↓'),
      '选择',
      el('kbd', {}, 'Enter'),
      '打开',
      el('kbd', {}, '['),
      el('kbd', {}, ']'),
      '上一张 / 下一张',
      el('kbd', {}, 'F'),
      '专注模式',
    ),
  ));
  let shown: Entry[] = [];
  let active = 0;
  const mark = () => {
    [...results.children].forEach((row, index) =>
      row.setAttribute('aria-selected', String(index === active)),
    );
    const row = results.children[active] as HTMLElement | undefined;
    if (row) {
      // Keep the active row visible without scrollIntoView, which can move an embedding page.
      const top = row.offsetTop - results.offsetTop;
      if (top < results.scrollTop) results.scrollTop = top;
      else if (
        top + row.offsetHeight >
        results.scrollTop + results.clientHeight
      )
        results.scrollTop = top + row.offsetHeight - results.clientHeight;
    }
    if (row?.id) input.setAttribute('aria-activedescendant', row.id);
    else input.removeAttribute('aria-activedescendant');
  };
  const render = (all: Entry[]) => {
    const words = input.value.toLowerCase().split(/\s+/).filter(Boolean);
    shown = all.filter((entry) => words.every((w) => entry.text.includes(w)));
    active = 0;
    results.replaceChildren(
      ...(shown.length
        ? shown.map((entry, index) =>
            el(
              'a',
              {
                href: entry.href,
                role: 'option',
                id: `figure-result-${index}`,
                class: 'figure-result',
              },
              el('span', { class: 'mono' }, entry.number),
              el('span', {}, el('strong', {}, entry.title), entry.detail),
              el('span', { class: 'figure-result-tab' }, entry.tab),
            ),
          )
        : [el('p', { class: 'figure-search-empty' }, '没有匹配的图例')]),
    );
    mark();
  };
  results.replaceChildren(
    el('p', { class: 'figure-search-empty' }, '正在载入图例目录…'),
  );
  catalogue().then(
    (all) => {
      render(all);
      input.addEventListener('input', () => render(all));
    },
    () => {
      // Forget the failed load so reopening the search tries again.
      entries = null;
      results.replaceChildren(
        el('p', { class: 'figure-search-empty' }, '图例目录载入失败，请重试。'),
      );
    },
  );
  input.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!shown.length) return;
      active =
        (active + (event.key === 'ArrowDown' ? 1 : -1) + shown.length) %
        shown.length;
      mark();
    } else if (event.key === 'Enter' && shown[active]) {
      event.preventDefault();
      location.assign(shown[active].href);
    }
  });
  // A click on the backdrop lands on the dialog element itself.
  current.addEventListener('click', (event) => {
    if (event.target === current) current.close();
  });
  current.addEventListener('close', () => current.remove());
  document.body.append(current);
  current.showModal();
  input.focus();
}

// ----------------------------------------------------------------- shortcuts
let step: ((direction: -1 | 1) => void) | null = null;
/** The page's handler for [ and ]: previous / next figure. */
export function onFigureStep(handler: (direction: -1 | 1) => void) {
  step = handler;
}
let installed = false;
function installShortcuts() {
  if (installed) return;
  installed = true;
  if (focusStored()) applyFocus(true);
  window.addEventListener('keydown', (event) => {
    if (!event.key || event.isComposing) return;
    if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      openSearch();
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || dialog?.open) return;
    const target = event.target as HTMLElement | null;
    const typing =
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement ||
      (target instanceof HTMLInputElement &&
        !['range', 'checkbox', 'radio', 'file'].includes(target.type));
    if (typing) return;
    if (event.key === '/') {
      event.preventDefault();
      openSearch();
    } else if (event.key === '[' || event.key === ']') {
      step?.(event.key === '[' ? -1 : 1);
    } else if (event.key.toLowerCase() === 'f') {
      toggleFocus();
    } else if (
      event.key === 'Escape' &&
      document.documentElement.hasAttribute('data-focus')
    ) {
      applyFocus(false);
    }
  });
}
