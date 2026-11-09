import { clamp, type LabState, type Vec3 } from './model';

export interface VolumeData {
  guides?: {
    origin: Vec3;
    originLabel: string;
    ends: Vec3[];
    labels: string[];
  };
  positions: Vec3[];
  colors: Vec3[];
  axes: [string, string, string];
  cube: boolean;
  origins?: Vec3[];
  /** Polylines drawn over the points (overlays, lattices, paths). */
  lines?: {
    points: Vec3[];
    color: string;
    width: number;
    closed?: boolean;
    /** Optional per-vertex display colours, drawn as small dots. */
    dots?: Vec3[];
    /** Optional per-segment colours (lattice edges). */
    segmentColors?: string[];
  }[];
  /** Explicit dot radius in CSS px; otherwise derived from the sampling density. */
  radius?: number;
  /** Draw the polylines underneath the points (lattice wireframes). */
  linesBehind?: boolean;
}
interface Projected {
  x: number;
  y: number;
  z: number;
  index: number;
}
export class VolumeView {
  private context: CanvasRenderingContext2D;
  private width = 0;
  private height = 0;
  private points: Projected[] = [];
  private pointer: { id: number; x: number; y: number; moved: boolean } | null =
    null;
  private observer: ResizeObserver;
  private sprites = new Map<string, HTMLCanvasElement>();

  constructor(
    public canvas: HTMLCanvasElement,
    private state: LabState,
    onViewChange: () => void,
    onPick: (index: number) => void,
  ) {
    const context = canvas.getContext('2d');
    if (!context)
      throw new Error(
        '浏览器无法创建 Canvas 2D 画布，请使用支持 Canvas 的浏览器。',
      );
    this.context = context;
    this.observer = new ResizeObserver(() => {
      this.width = canvas.clientWidth;
      this.height = canvas.clientHeight;
      onViewChange();
    });
    this.observer.observe(canvas);
    canvas.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      canvas.focus({ preventScroll: true });
      canvas.setPointerCapture(event.pointerId);
      this.pointer = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        moved: false,
      };
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      const dx = event.clientX - this.pointer.x;
      const dy = event.clientY - this.pointer.y;
      if (Math.abs(dx) + Math.abs(dy) > 2) this.pointer.moved = true;
      // Rotate the object toward the pointer; camera-orbit signs invert direct manipulation.
      this.state.yaw = (this.state.yaw - dx * 0.008) % (2 * Math.PI);
      this.state.pitch = clamp(this.state.pitch + dy * 0.008, -1.5, 1.5);
      this.pointer.x = event.clientX;
      this.pointer.y = event.clientY;
      onViewChange();
    });
    canvas.addEventListener('pointerup', (event) => {
      if (!this.pointer || this.pointer.id !== event.pointerId) return;
      if (!this.pointer.moved) {
        const rect = canvas.getBoundingClientRect();
        const point = [...this.points]
          .reverse()
          .find(
            (p) =>
              Math.hypot(
                p.x - event.clientX + rect.left,
                p.y - event.clientY + rect.top,
              ) < 12,
          );
        if (point) onPick(point.index);
      }
      this.pointer = null;
    });
    canvas.addEventListener('lostpointercapture', () => {
      this.pointer = null;
    });
    canvas.addEventListener('pointercancel', () => {
      this.pointer = null;
    });
    // Require focus before consuming wheel events so the page remains scrollable on entry.
    canvas.addEventListener(
      'wheel',
      (event) => {
        if (document.activeElement !== canvas) return;
        event.preventDefault();
        this.state.zoom = clamp(
          this.state.zoom - event.deltaY * 0.001,
          0.55,
          1.65,
        );
        onViewChange();
      },
      { passive: false },
    );
    canvas.addEventListener('keydown', (event) => {
      if (
        ![
          'ArrowLeft',
          'ArrowRight',
          'ArrowUp',
          'ArrowDown',
          '+',
          '-',
          '=',
          'Home',
        ].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === 'ArrowLeft') this.state.yaw += 0.12;
      if (event.key === 'ArrowRight') this.state.yaw -= 0.12;
      if (event.key === 'ArrowUp')
        this.state.pitch = clamp(this.state.pitch - 0.12, -1.5, 1.5);
      if (event.key === 'ArrowDown')
        this.state.pitch = clamp(this.state.pitch + 0.12, -1.5, 1.5);
      if (event.key === '+' || event.key === '=')
        this.state.zoom = clamp(this.state.zoom + 0.1, 0.55, 1.65);
      if (event.key === '-')
        this.state.zoom = clamp(this.state.zoom - 0.1, 0.55, 1.65);
      if (event.key === 'Home') {
        this.state.yaw = Math.PI / 4;
        this.state.pitch = 0.57;
        this.state.zoom = 1;
      }
      this.state.yaw %= 2 * Math.PI;
      onViewChange();
    });
  }
  private project([x, y, z]: Vec3): Projected {
    const cy = Math.cos(this.state.yaw),
      sy = Math.sin(this.state.yaw);
    const cp = Math.cos(this.state.pitch),
      sp = Math.sin(this.state.pitch);
    const horizontal = x * cy - z * sy;
    const depth = x * sy + z * cy;
    const scale =
      Math.min(this.width * 0.58, this.height * 0.64) * this.state.zoom;
    return {
      x: this.width / 2 + horizontal * scale,
      y: this.height / 2 - (y * cp - depth * sp) * scale - 4,
      z: y * sp + depth * cp,
      index: 0,
    };
  }
  private line(start: Vec3, end: Vec3, color: string) {
    const p = this.project(start),
      q = this.project(end);
    this.context.beginPath();
    this.context.moveTo(p.x, p.y);
    this.context.lineTo(q.x, q.y);
    this.context.strokeStyle = color;
    this.context.stroke();
  }
  draw(data: VolumeData, selected: number | null) {
    if (!this.width || !this.height) return;
    if (data.guides) {
      const description = this.state.axes
        ? `坐标参考：原点 ${data.guides.originLabel}；${data.guides.labels.join('；')}`
        : '坐标参考已隐藏';
      if (this.canvas.getAttribute('aria-description') !== description)
        this.canvas.setAttribute('aria-description', description);
    }
    const ctx = this.context;
    // Resize and repaint atomically: changing the bitmap size clears it immediately.
    // Doing this in ResizeObserver would expose an empty frame before the next RAF.
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(this.width * ratio),
      height = Math.round(this.height * ratio);
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#141619';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.lineWidth = 1;
    // Both views share camera and plot units; model-specific axis scaling is explicit in the inspector.
    for (let n = 0; n <= 8; n++) {
      this.line(
        [n / 8 - 0.5, -0.62, -0.5],
        [n / 8 - 0.5, -0.62, 0.5],
        '#ffffff07',
      );
      this.line(
        [-0.5, -0.62, n / 8 - 0.5],
        [0.5, -0.62, n / 8 - 0.5],
        '#ffffff07',
      );
    }
    const axisLabels: { point: Vec3; text: string; color: string }[] = [];
    if (this.state.axes) {
      if (data.cube) {
        const corners: Vec3[] = [
          [-0.5, -0.5, -0.5],
          [0.5, -0.5, -0.5],
          [-0.5, 0.5, -0.5],
          [-0.5, -0.5, 0.5],
          [0.5, 0.5, -0.5],
          [0.5, -0.5, 0.5],
          [-0.5, 0.5, 0.5],
          [0.5, 0.5, 0.5],
        ];
        const edges = [
          [0, 1],
          [0, 2],
          [0, 3],
          [1, 4],
          [1, 5],
          [2, 4],
          [2, 6],
          [3, 5],
          [3, 6],
          [4, 7],
          [5, 7],
          [6, 7],
        ];
        ctx.setLineDash([3, 5]);
        edges.forEach(([a, b]) =>
          this.line(corners[a], corners[b], '#ffffff18'),
        );
        ctx.setLineDash([]);
      }
      const origin: Vec3 =
        data.guides?.origin ?? (data.cube ? [-0.5, -0.5, -0.5] : [0, -0.55, 0]);
      const ends: Vec3[] =
        data.guides?.ends ??
        (data.cube
          ? [
              [0.66, -0.5, -0.5],
              [-0.5, 0.66, -0.5],
              [-0.5, -0.5, 0.66],
            ]
          : [
              [0.6, -0.55, 0],
              [0, 0.66, 0],
              [0, -0.55, 0.6],
            ]);
      ends.forEach((end, i) => {
        this.line(origin, end, ['#c96e6c80', '#7fb59080', '#7b94d080'][i]);
        axisLabels.push({
          point: end,
          text: data.guides?.labels[i] ?? data.axes[i],
          color: ['#d99191', '#9bc7a7', '#99ade1'][i],
        });
      });
      if (data.guides) {
        axisLabels.push({
          point: origin,
          text: data.guides.originLabel,
          color: '#a0a3ae',
        });
      }
    }
    if (this.state.vectors && data.origins) {
      ctx.lineWidth = 0.6;
      data.origins.forEach((point, i) =>
        this.line(point, data.positions[i], '#b9a5fa35'),
      );
    }
    if (data.linesBehind) this.drawLines(data);
    this.points = data.positions
      .map((point, index) => ({ ...this.project(point), index }))
      .sort((a, b) => a.z - b.z);
    const radius =
      data.radius ??
      Math.max(
        2.2,
        (Math.min(this.width * 0.58, this.height * 0.64) /
          (this.state.density - 1)) *
          0.19,
      ) *
        this.state.pointSize *
        this.state.zoom;
    // Cache shaded sprites. The cache is bounded across parameter drags and needs no GPU.
    if (this.sprites.size > 6000) this.sprites.clear();
    for (const p of this.points) {
      const rgb = data.colors[p.index];
      const channels = rgb.map((channel) => Math.round(clamp(channel) * 255));
      const key = channels.join(',');
      if (this.state.flatColors) {
        ctx.fillStyle = `rgb(${key})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.fill();
        continue;
      }

      let sprite = this.sprites.get(key);
      if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = 32;
        sprite.height = 32;
        const sphere = sprite.getContext('2d')!;
        const gradient = sphere.createRadialGradient(11, 9, 1, 16, 16, 15);
        gradient.addColorStop(
          0,
          `rgb(${channels.map((v) => Math.round(v + (255 - v) * 0.27)).join(',')})`,
        );
        gradient.addColorStop(0.4, `rgb(${key})`);
        gradient.addColorStop(
          1,
          `rgb(${channels.map((v) => Math.round(v * 0.38 + 3)).join(',')})`,
        );
        sphere.fillStyle = gradient;
        sphere.beginPath();
        sphere.arc(16, 16, 15, 0, Math.PI * 2);
        sphere.fill();
        sphere.strokeStyle = '#ffffff22';
        sphere.lineWidth = 0.7;
        sphere.stroke();
        this.sprites.set(key, sprite);
      }
      ctx.drawImage(sprite, p.x - radius, p.y - radius, radius * 2, radius * 2);
    }
    if (!data.linesBehind) this.drawLines(data);
    if (selected !== null) {
      const point = this.points.find((p) => p.index === selected);
      if (point) {
        ctx.strokeStyle = '#f3edff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        // The selection halo is an annotation, not the sample position. Align it
        // to device pixels to avoid asymmetric stroke antialiasing between canvases.
        ctx.arc(
          Math.round(point.x * ratio) / ratio,
          Math.round(point.y * ratio) / ratio,
          Math.round((radius + 4) * ratio) / ratio,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
    // Numeric endpoints often coincide with sampled black, white or primaries.
    // Draw labels last with a backing so points cannot hide the actual scale.
    ctx.font = '10px ui-monospace, monospace';
    for (const label of axisLabels) {
      const point = this.project(label.point);
      // Snap annotation backing to device pixels; keep the plotted data unrounded.
      const x = Math.round((point.x + 6) * ratio) / ratio;
      const y = Math.round((point.y - 6) * ratio) / ratio;
      ctx.fillStyle = '#141619';
      ctx.fillRect(
        x - 2,
        y - 11,
        Math.ceil(ctx.measureText(label.text).width) + 4,
        14,
      );
      ctx.fillStyle = label.color;
      ctx.fillText(label.text, x, y);
    }
    this.canvas.dataset.points = String(data.positions.length);
    this.canvas.dataset.camera = `${this.state.yaw.toFixed(3)},${this.state.pitch.toFixed(3)},${this.state.zoom.toFixed(3)}`;
  }
  private drawLines(data: VolumeData) {
    const ctx = this.context;
    for (const line of data.lines ?? []) {
      if (line.points.length < 2) continue;
      const projected = line.points.map((point) => this.project(point));
      ctx.lineWidth = line.width;
      ctx.lineJoin = 'round';
      if (line.segmentColors) {
        for (let i = 0; i + 1 < projected.length; i++) {
          ctx.strokeStyle = line.segmentColors[i] ?? line.color;
          ctx.beginPath();
          ctx.moveTo(projected[i].x, projected[i].y);
          ctx.lineTo(projected[i + 1].x, projected[i + 1].y);
          ctx.stroke();
        }
      } else {
        ctx.strokeStyle = line.color;
        ctx.beginPath();
        projected.forEach((p, i) =>
          i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y),
        );
        if (line.closed) ctx.closePath();
        ctx.stroke();
      }
      if (line.dots) {
        projected.forEach((p, i) => {
          const rgb = line.dots![i];
          if (!rgb) return;
          ctx.fillStyle = `rgb(${rgb.map((v) => Math.round(clamp(v) * 255)).join(',')})`;
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = line.color;
          ctx.lineWidth = 1;
          ctx.stroke();
        });
      }
    }
  }
  destroy() {
    this.observer.disconnect();
  }
}
