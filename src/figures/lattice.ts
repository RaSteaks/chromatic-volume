import type { Vec3 } from '../model';

export interface LatticeKeyframe {
  name: string;
  axes: [string, string, string];
  position: (u: Vec3) => Vec3;
  color: (u: Vec3) => Vec3;
}

/** Sample endpoints once; intermediate frames are geometric morphs, not model parameters. */
export function createLattice(keyframes: LatticeKeyframe[], nodes: Vec3[]) {
  const frames = keyframes.map((frame) => ({
    name: frame.name,
    axes: frame.axes,
    positions: nodes.map(frame.position),
    colors: nodes.map(frame.color),
  }));
  return (t: number) => {
    const k = Math.min(Math.floor(t), frames.length - 2);
    const local = t - k;
    const s = local * local * (3 - 2 * local);
    const a = frames[k],
      b = frames[k + 1];
    const endpoint = Number.isInteger(t) ? frames[t] : undefined;
    return {
      // Keep physical coordinates here; centering belongs only to the renderer.
      positions: a.positions.map(
        (p, i) =>
          p.map((v, axis) => v + (b.positions[i][axis] - v) * s) as Vec3,
      ),
      colors: a.colors.map(
        (c, i) => c.map((v, axis) => v + (b.colors[i][axis] - v) * s) as Vec3,
      ),
      label: endpoint?.name ?? `过渡示意：${a.name} → ${b.name}`,
      axes:
        endpoint?.axes ??
        (a.axes.map((axis, i) =>
          axis === b.axes[i] ? axis : `${['R', 'G', 'B'][i]}（过渡）`,
        ) as [string, string, string]),
    };
  };
}
