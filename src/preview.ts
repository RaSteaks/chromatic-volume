import { el } from './dom';
import { defaultState } from './model';
import {
  createSourceSamples,
  convertColor,
  getTarget,
  sourcePosition,
  targetPosition,
  plotGuides,
} from './targets';
import { VolumeView, type VolumeData } from './volume';

// The card owns a small presentation surface, sharing the website's actual color math and renderer.
export function mountPreviewPage(root: HTMLElement) {
  document.title = '色体积自动预览 · Chromatic Volume';
  const state = defaultState();
  // Leave room for the cube's corners throughout a full turn, including shallow card viewports.
  state.zoom = 0.82;
  const target = getTarget('oklab')!;
  const samples = createSourceSamples(state.density, state.source);
  const source: VolumeData = {
    guides: plotGuides(getTarget(state.source)!, state.equalAxes),
    positions: samples.map(sourcePosition),
    colors: samples,
    axes: ['R', 'G', 'B'],
    cube: true,
  };
  const destination: VolumeData = {
    guides: plotGuides(target, state.equalAxes),
    positions: samples.map((point) =>
      targetPosition(convertColor(point, target), target, state.equalAxes),
    ),
    colors: samples,
    axes: target.axes,
    cube: false,
  };
  const canvases = [
    el('canvas', { role: 'img', 'aria-label': '源 sRGB 色体积' }),
    el('canvas', { role: 'img', 'aria-label': '目标 Oklab 色体积' }),
  ];
  const stage = el(
    'div',
    { class: 'preview-volumes', 'aria-label': 'sRGB 到 Oklab 自动演示' },
    ...canvases.map((canvas, index) =>
      el(
        'section',
        { class: 'preview-volume' },
        el('h2', {}, index === 0 ? '源 · sRGB' : '目标 · Oklab'),
        canvas,
        el('p', {}, index === 0 ? 'R / G / B' : 'L / a / b'),
      ),
    ),
  );
  const cover = el('img', {
    class: 'preview-cover',
    src: '/cover.png',
    width: 1600,
    height: 1000,
    alt: 'Chromatic Volume：源 sRGB 与目标 Oklab 的三维色体积对比',
  });
  const status = el('p', { class: 'preview-status', role: 'status' });
  const page = el(
    'main',
    { class: 'preview-page', 'data-ready': 'false' },
    cover,
    el(
      'div',
      { class: 'preview-presentation' },
      el(
        'div',
        { class: 'preview-title' },
        el('h1', {}, 'Chromatic Volume'),
        el('p', {}, 'sRGB 色域在 Oklab 中的映射'),
      ),
      stage,
      el(
        'p',
        { class: 'preview-meta' },
        `${samples.length} 个采样点 · D65 · 等单位轴比例`,
      ),
    ),
    status,
  );
  root.replaceChildren(page);

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const motionOff =
    new URLSearchParams(location.search).get('motion') === 'off';
  let views: VolumeView[] = [];
  let frame = 0;
  let lastPaint = 0;
  let inView = true;
  let running = false;

  function draw(time: number) {
    frame = 0;
    if (document.hidden || reducedMotion.matches || !inView) return;
    // Limit raster work to 24 fps; use elapsed time so rotation is independent of display refresh rate.
    if (!lastPaint || time - lastPaint >= 1000 / 24) {
      if (running && lastPaint)
        state.yaw =
          (state.yaw + Math.min(time - lastPaint, 100) * 0.00016) %
          (2 * Math.PI);
      lastPaint = time;
      views[0].draw(source, null);
      views[1].draw(destination, null);
      if (canvases.every((canvas) => canvas.dataset.points))
        page.dataset.ready = 'true';
    }
    if (running) frame = requestAnimationFrame(draw);
  }
  function requestDraw() {
    if (!frame) frame = requestAnimationFrame(draw);
  }
  function updatePlayback() {
    cancelAnimationFrame(frame);
    frame = 0;
    lastPaint = 0;
    page.dataset.static = String(reducedMotion.matches);
    running =
      !motionOff && !reducedMotion.matches && !document.hidden && inView;
    page.dataset.motion = running ? 'running' : 'paused';
    status.textContent = reducedMotion.matches
      ? '已按减少动态效果设置显示静态封面'
      : '';
    if (reducedMotion.matches) return;
    if (!views.length) {
      views = canvases.map(
        (canvas) => new VolumeView(canvas, state, requestDraw, () => {}),
      );
    }
    requestDraw();
  }
  const observer = new IntersectionObserver(([entry]) => {
    inView = entry.isIntersecting;
    updatePlayback();
  });
  observer.observe(page);
  updatePlayback();
  reducedMotion.addEventListener('change', updatePlayback);
  document.addEventListener('visibilitychange', updatePlayback);
  window.addEventListener('pagehide', () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    views.forEach((view) => view.destroy());
    reducedMotion.removeEventListener('change', updatePlayback);
    document.removeEventListener('visibilitychange', updatePlayback);
  });
}
