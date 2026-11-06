import { clamp, type Vec3 } from './model';
export type Interpolation = 'trilinear' | 'tetrahedral';
export interface CubeLut {
  name: string;
  size: number;
  min: Vec3;
  max: Vec3;
  data: Vec3[];
}
export function parseCube(text: string, name = '导入 LUT'): CubeLut {
  if (text.length > 32 * 1024 * 1024)
    throw new Error('LUT 文件不能超过 32 MB。');
  let size = 0;
  let min: Vec3 = [0, 0, 0],
    max: Vec3 = [1, 1, 1];
  const data: Vec3[] = [];
  const headers = new Set<string>();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    if (!line) continue;
    if (line.startsWith('TITLE ')) continue;
    const tokens = line.split(/\s+/);
    const key = tokens[0];
    if (['LUT_3D_SIZE', 'DOMAIN_MIN', 'DOMAIN_MAX'].includes(key)) {
      if (headers.has(key)) throw new Error(`重复的 ${key} 声明。`);
      headers.add(key);
      if (data.length) throw new Error('LUT 头信息必须在采样数据之前。');
      if (key === 'LUT_3D_SIZE') {
        size = Number(tokens[1]);
        if (
          tokens.length !== 2 ||
          !Number.isInteger(size) ||
          size < 2 ||
          size > 65
        )
          throw new Error('仅支持尺寸为 2–65 的三维 .cube LUT。');
      } else {
        const values = tokens.slice(1).map(Number);
        if (values.length !== 3 || values.some((v) => !Number.isFinite(v)))
          throw new Error('DOMAIN 必须包含三个有限数值。');
        if (key === 'DOMAIN_MIN') min = values as Vec3;
        else max = values as Vec3;
      }
      continue;
    }
    if (/^[A-Za-z_]/.test(key))
      throw new Error(
        `不支持 ${key}；请选择不含一维 shaper 的三维 .cube LUT。`,
      );
    const values = tokens.map(Number);
    if (!size || values.length !== 3 || values.some((v) => !Number.isFinite(v)))
      throw new Error(
        'LUT 数据格式无效：需要先声明 LUT_3D_SIZE，每行包含三个有限数值。',
      );
    data.push(values as Vec3);
    if (data.length > size ** 3)
      throw new Error('LUT 采样行数超过声明的尺寸。');
  }
  if (!size || data.length !== size ** 3)
    throw new Error(
      `LUT 采样数量不符：需要 ${size ** 3} 行，实际 ${data.length} 行。`,
    );
  if (min.some((v, i) => v >= max[i]))
    throw new Error('每个 DOMAIN_MAX 都必须大于 DOMAIN_MIN。');
  return { name, size, min, max, data };
}
export function applyLut(
  rgb: Vec3,
  lut: CubeLut,
  interpolation: Interpolation = 'trilinear',
): Vec3 {
  const position = rgb.map(
    (v, i) =>
      clamp((v - lut.min[i]) / (lut.max[i] - lut.min[i])) * (lut.size - 1),
  );
  const base = position.map(Math.floor),
    weight = position.map((v, i) => v - base[i]);
  if (interpolation === 'tetrahedral') {
    // Sorting the three fractions selects one of the six tetrahedra sharing
    // the cell's 000–111 diagonal. Ties lie on shared faces and stay continuous.
    const axes = [0, 1, 2].sort((a, b) => weight[b] - weight[a]);
    const offsets = [0, 0, 0];
    const sample = () =>
      lut.data[
        Math.min(base[0] + offsets[0], lut.size - 1) +
          Math.min(base[1] + offsets[1], lut.size - 1) * lut.size +
          Math.min(base[2] + offsets[2], lut.size - 1) * lut.size ** 2
      ];
    const vertices = [sample()];
    for (const axis of axes) {
      offsets[axis] = 1;
      vertices.push(sample());
    }
    const [u, v, w] = axes.map((axis) => weight[axis]);
    return [0, 1, 2].map(
      (channel) =>
        (1 - u) * vertices[0][channel] +
        (u - v) * vertices[1][channel] +
        (v - w) * vertices[2][channel] +
        w * vertices[3][channel],
    ) as Vec3;
  }
  const output: Vec3 = [0, 0, 0];
  // .cube is red-fastest. Interpolate all eight surrounding samples, including endpoints.
  for (let b = 0; b < 2; b++)
    for (let g = 0; g < 2; g++)
      for (let r = 0; r < 2; r++) {
        const ri = Math.min(base[0] + r, lut.size - 1),
          gi = Math.min(base[1] + g, lut.size - 1),
          bi = Math.min(base[2] + b, lut.size - 1);
        const sample = lut.data[ri + gi * lut.size + bi * lut.size * lut.size];
        const w =
          (r ? weight[0] : 1 - weight[0]) *
          (g ? weight[1] : 1 - weight[1]) *
          (b ? weight[2] : 1 - weight[2]);
        output[0] += sample[0] * w;
        output[1] += sample[1] * w;
        output[2] += sample[2] * w;
      }
  return output;
}
