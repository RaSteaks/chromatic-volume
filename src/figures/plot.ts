import Color from 'colorjs.io';
import { button, el, icon, slider } from '../dom';
import type { Vec3 } from '../model';

export const INK = {
  canvas: '#141619',
  grid: '#ffffff0d',
  axis: '#ffffff2a',
  text: '#a0a3ae',
  bright: '#eeeff4',
  accent: '#b6a0f4',
};
export const SERIES = [
  '#e0797a',
  '#7fc8a9',
  '#7ea6e8',
  '#f0b35e',
  '#b6a0f4',
  '#5cc8d6',
  '#e993c9',
  '#c9cf6a',
];

/** A HiDPI 2D canvas that repaints on resize. */
export function createCanvas(
  host: HTMLElement,
  paint: (ctx: CanvasRenderingContext2D, width: number, height: number) => void,
  label: string,
) {
  const canvas = el('canvas', { role: 'img', 'aria-label': label });
  host.append(canvas);
  const ctx = canvas.getContext('2d')!;
  let width = 0,
    height = 0,
    frame = 0;
  const redraw = () => {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      if (!width || !height) return;
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(width * ratio),
        h = Math.round(height * ratio);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
      ctx.fillStyle = INK.canvas;
      ctx.fillRect(0, 0, width, height);
      paint(ctx, width, height);
      canvas.dataset.painted = String(Number(canvas.dataset.painted ?? 0) + 1);
    });
  };
  const observer = new ResizeObserver(() => {
    width = canvas.clientWidth;
    height = canvas.clientHeight;
    redraw();
  });
  observer.observe(canvas);
  return {
    canvas,
    redraw,
    destroy() {
      observer.disconnect();
      cancelAnimationFrame(frame);
    },
  };
}

export interface Frame {
  left: number;
  top: number;
  width: number;
  height: number;
  x: [number, number];
  y: [number, number];
  sx: (x: number) => number;
  sy: (y: number) => number;
}
/** Map a data rectangle into the canvas; `equal` keeps one unit square. */
export function frame(
  width: number,
  height: number,
  x: [number, number],
  y: [number, number],
  pad = { left: 52, right: 20, top: 20, bottom: 42 },
  equal = false,
): Frame {
  let w = width - pad.left - pad.right,
    h = height - pad.top - pad.bottom;
  let left = pad.left,
    top = pad.top;
  if (equal) {
    const scale = Math.min(w / (x[1] - x[0]), h / (y[1] - y[0]));
    const nw = scale * (x[1] - x[0]),
      nh = scale * (y[1] - y[0]);
    left += (w - nw) / 2;
    top += (h - nh) / 2;
    w = nw;
    h = nh;
  }
  return {
    left,
    top,
    width: w,
    height: h,
    x,
    y,
    sx: (v) => left + ((v - x[0]) / (x[1] - x[0])) * w,
    sy: (v) => top + h - ((v - y[0]) / (y[1] - y[0])) * h,
  };
}
export function ticks(from: number, to: number, step: number) {
  const values: number[] = [];
  for (let v = Math.ceil(from / step - 1e-9) * step; v <= to + 1e-9; v += step)
    values.push(Math.round(v / step) * step);
  return values;
}
export function axes(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  options: {
    xTicks: number[];
    yTicks: number[];
    xLabel?: string;
    yLabel?: string;
    xFormat?: (v: number) => string;
    yFormat?: (v: number) => string;
  },
) {
  ctx.save();
  ctx.lineWidth = 1;
  ctx.font = '10px ui-monospace, SFMono-Regular, monospace';
  ctx.fillStyle = INK.text;
  ctx.strokeStyle = INK.grid;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  for (const v of options.xTicks) {
    const x = Math.round(f.sx(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(x, f.top);
    ctx.lineTo(x, f.top + f.height);
    ctx.stroke();
    ctx.fillText((options.xFormat ?? String)(v), x, f.top + f.height + 6);
  }
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  for (const v of options.yTicks) {
    const y = Math.round(f.sy(v)) + 0.5;
    ctx.beginPath();
    ctx.moveTo(f.left, y);
    ctx.lineTo(f.left + f.width, y);
    ctx.stroke();
    ctx.fillText((options.yFormat ?? String)(v), f.left - 7, y);
  }
  ctx.strokeStyle = INK.axis;
  ctx.strokeRect(f.left + 0.5, f.top + 0.5, f.width, f.height);
  ctx.font = '11px -apple-system, "PingFang SC", sans-serif';
  if (options.xLabel) {
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(options.xLabel, f.left + f.width / 2, f.top + f.height + 38);
  }
  if (options.yLabel) {
    ctx.translate(14, f.top + f.height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(options.yLabel, 0, 0);
  }
  ctx.restore();
}
export function polyline(
  ctx: CanvasRenderingContext2D,
  f: Frame,
  points: [number, number][],
  color: string,
  width = 1.6,
  dash: number[] = [],
) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(f.left, f.top, f.width, f.height);
  ctx.clip();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.lineJoin = 'round';
  ctx.setLineDash(dash);
  ctx.beginPath();
  let pen = false;
  for (const [x, y] of points) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) {
      pen = false;
      continue;
    }
    if (pen) ctx.lineTo(f.sx(x), f.sy(y));
    else ctx.moveTo(f.sx(x), f.sy(y));
    pen = true;
  }
  ctx.stroke();
  ctx.restore();
}
export function label(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  color = INK.text,
  align: CanvasTextAlign = 'left',
  size = 11,
) {
  ctx.save();
  ctx.font = `${size}px -apple-system, "PingFang SC", sans-serif`;
  ctx.fillStyle = color;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y);
  ctx.restore();
}

/** D65 XYZ → displayable sRGB (0–1, clipped) and whether clipping happened. */
export function displayRgb(xyz: Vec3): { rgb: Vec3; clipped: boolean } {
  const rgb = new Color('xyz-d65', xyz)
    .to('srgb')
    .coords.map((v) => v ?? 0) as Vec3;
  const clipped = rgb.some((v) => v < -1e-6 || v > 1 + 1e-6);
  return {
    rgb: rgb.map((v) => Math.min(Math.max(v, 0), 1)) as Vec3,
    clipped,
  };
}
export const css = (rgb: Vec3) =>
  `rgb(${rgb.map((v) => Math.round(Math.min(Math.max(v, 0), 1) * 255)).join(',')})`;
/** Linear-light XYZ at full brightness: scale so the largest linear sRGB channel is 1. */
export function chromaticityColor(xyz: Vec3): Vec3 {
  const linear = new Color('xyz-d65', xyz)
    .to('srgb-linear')
    .coords.map((v) => Math.max(v ?? 0, 0));
  const peak = Math.max(...linear) || 1;
  return new Color('srgb-linear', linear.map((v) => v / peak) as Vec3)
    .to('srgb')
    .coords.map((v) => v ?? 0) as Vec3;
}

/**
 * A slider with a play button. Playback loops or bounces, pauses while the
 * page is hidden, and starts paused when reduced motion is requested.
 */
export function playback(options: {
  id: string;
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  /** Units per second. */
  speed: number;
  bounce?: boolean;
  autoplay?: boolean;
  format?: (v: number) => string;
  onChange: (value: number) => void;
}) {
  let value = options.value,
    direction = 1,
    playing = false,
    frame = 0,
    last = 0;
  const control = slider(
    options.id,
    options.label,
    value,
    options.min,
    options.max,
    options.step,
    (v) => {
      value = v;
      options.onChange(v);
    },
    options.format,
  );
  const toggle = button('播放', () => (playing ? pause() : play()), {
    icon: 'play',
    class: 'button subtle play-button',
  });
  const tick = (time: number) => {
    frame = 0;
    if (!playing) return;
    if (document.hidden) {
      last = 0;
      frame = requestAnimationFrame(tick);
      return;
    }
    const dt = last ? Math.min(time - last, 80) / 1000 : 0;
    last = time;
    value += direction * options.speed * dt;
    if (value > options.max || value < options.min) {
      if (options.bounce) {
        direction *= -1;
        value = Math.min(Math.max(value, options.min), options.max);
      } else value = options.min;
    }
    control.set(value);
    options.onChange(value);
    frame = requestAnimationFrame(tick);
  };
  const render = () => {
    toggle.setAttribute('aria-pressed', String(playing));
    toggle.replaceChildren(
      icon(playing ? 'pause' : 'play'),
      playing ? '暂停' : '播放',
    );
  };
  function play() {
    playing = true;
    last = 0;
    render();
    if (!frame) frame = requestAnimationFrame(tick);
  }
  function pause() {
    playing = false;
    render();
  }
  render();
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (options.autoplay !== false && !reduced) play();
  return {
    element: el('div', { class: 'playback' }, toggle, control.element),
    set(v: number) {
      value = v;
      control.set(v);
      options.onChange(v);
    },
    pause,
    destroy() {
      playing = false;
      cancelAnimationFrame(frame);
    },
  };
}

/** A small segmented choice. */
export function segmented<T extends string>(
  label: string,
  choices: readonly { id: T; name: string }[],
  value: T,
  onChange: (value: T) => void,
) {
  const buttons = choices.map((choice) => {
    const item = button(
      choice.name,
      () => {
        buttons.forEach((b) =>
          b.setAttribute('aria-pressed', String(b === item)),
        );
        onChange(choice.id);
      },
      { class: 'segment' },
    );
    item.setAttribute('aria-pressed', String(choice.id === value));
    item.dataset.choice = choice.id;
    return item;
  });
  return el(
    'div',
    { class: 'segmented', role: 'group', 'aria-label': label },
    ...buttons,
  );
}
export function select<T extends string>(
  label: string,
  choices: readonly { id: T; name: string }[],
  value: T,
  onChange: (value: T) => void,
) {
  const input = el(
    'select',
    { 'aria-label': label },
    ...choices.map((c) => el('option', { value: c.id }, c.name)),
  );
  input.value = value;
  input.addEventListener('change', () => onChange(input.value as T));
  return el('label', { class: 'figure-select' }, el('span', {}, label), input);
}
