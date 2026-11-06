import './style.css';
import { button, el } from './dom';

const root = document.querySelector<HTMLDivElement>('#app')!;
const path = location.pathname.replace(/\/+$/, '') || '/';
const preview = path === '/preview' || path === '/preview/index.html';

function showFailure() {
  document.title = '页面加载失败 · Chromatic Volume';
  root.replaceChildren(
    el(
      'main',
      { class: 'startup startup-error', role: 'alert' },
      el('img', {
        src: '/cover.png',
        width: 1600,
        height: 1000,
        alt: 'sRGB 与 Oklab 色体积对比',
      }),
      el('h1', {}, preview ? '动态预览暂不可用' : '工作台未能加载'),
      el('p', {}, '请检查网络或浏览器的 Canvas 支持，然后重试。'),
      el(
        'div',
        { class: 'startup-actions' },
        button('重新加载', () => location.reload()),
        el(
          'a',
          { href: '/', target: '_blank', rel: 'noopener', class: 'button' },
          '独立打开工作台',
        ),
      ),
    ),
  );
}

if (path === '/' || preview) {
  // Bound module loading so an interrupted connection cannot leave an endless loading state.
  let timedOut = false;
  const timeout = window.setTimeout(() => {
    timedOut = true;
    showFailure();
  }, 12000);
  try {
    if (preview) {
      const { mountPreviewPage } = await import('./preview');
      if (!timedOut) mountPreviewPage(root);
    } else {
      const { mountLab } = await import('./main');
      if (!timedOut) mountLab();
    }
  } catch {
    showFailure();
  } finally {
    window.clearTimeout(timeout);
  }
} else {
  document.title = '页面未找到 · Chromatic Volume';
  root.replaceChildren(
    el(
      'main',
      { class: 'not-found' },
      el('h1', {}, '页面未找到'),
      el('a', { href: '/', class: 'button primary' }, '返回工作台'),
    ),
  );
}
