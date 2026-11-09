import { gamuts, transfers } from './color-management';
import { colorSources, getTarget } from './targets';
import { gradientPairs } from './overlays';
import {
  clamp,
  defaultState,
  definitions,
  type LabState,
  type Stage,
} from './model';

export function encodeState(state: LabState): string {
  return JSON.stringify({ v: 1, ...state });
}

// Shared URLs are the only untrusted model boundary. Validate the complete shape once.
export function decodeState(serialized: string): LabState | null {
  if (serialized.length > 12000) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(serialized);
  } catch {
    return null;
  }
  if (
    !isRecord(parsed) ||
    parsed.v !== 1 ||
    !Array.isArray(parsed.stages) ||
    parsed.stages.length !== definitions.length
  )
    return null;
  const stages: Stage[] = [];
  const seen = new Set<string>();
  for (const candidate of parsed.stages) {
    if (
      !isRecord(candidate) ||
      typeof candidate.id !== 'string' ||
      seen.has(candidate.id) ||
      typeof candidate.enabled !== 'boolean' ||
      !isRecord(candidate.values)
    )
      return null;
    const definition = definitions.find((item) => item.id === candidate.id);
    if (!definition) return null;
    seen.add(definition.id);
    const values: Record<string, number> = {};
    for (const parameter of definition.parameters) {
      const value = candidate.values[parameter.key];
      if (typeof value !== 'number' || !Number.isFinite(value)) return null;
      values[parameter.key] = clamp(value, parameter.min, parameter.max);
    }
    stages.push({ id: definition.id, enabled: candidate.enabled, values });
  }
  const state = defaultState();
  state.stages = stages;
  if (parsed.interpolation !== undefined) {
    if (
      parsed.interpolation !== 'trilinear' &&
      parsed.interpolation !== 'tetrahedral'
    )
      return null;
    state.interpolation = parsed.interpolation;
  } else state.interpolation = 'trilinear';
  for (const key of ['equalAxes', 'flatColors'] as const) {
    if (parsed[key] !== undefined && typeof parsed[key] !== 'boolean')
      return null;
    state[key] = parsed[key] === undefined ? false : parsed[key];
  }
  if (parsed.plot !== undefined) {
    if (
      typeof parsed.plot !== 'string' ||
      !['native', 'oklab', 'xyz-d65', 'lab', 'srgb-linear'].includes(
        parsed.plot,
      )
    )
      return null;
    state.plot = parsed.plot;
  }
  for (const key of ['lutInput', 'lutOutput'] as const) {
    const value = parsed[key];
    if (value === undefined) continue;
    if (
      !isRecord(value) ||
      typeof value.gamut !== 'string' ||
      (value.gamut !== '' && !gamuts.some((g) => g.id === value.gamut)) ||
      (value.gamma !== '' && !transfers.some((g) => g.id === value.gamma)) ||
      typeof value.black !== 'number' ||
      typeof value.white !== 'number' ||
      !Number.isFinite(value.black) ||
      !Number.isFinite(value.white) ||
      value.black < 0 ||
      value.black > 10 ||
      value.white < 20 ||
      value.white > 1000 ||
      value.white <= value.black
    )
      return null;
    state[key] = {
      gamut: value.gamut,
      gamma: value.gamma as typeof state.lutInput.gamma,
      black: value.black,
      white: value.white,
    };
  }

  // Existing v1 links without a source were authored with sRGB.
  if (
    parsed.source !== undefined &&
    !colorSources.some((source) => source.id === parsed.source)
  )
    return null;
  state.source = typeof parsed.source === 'string' ? parsed.source : 'srgb';
  const bounds = {
    strength: [0, 1],
    yaw: [-Math.PI * 2, Math.PI * 2],
    pitch: [-1.5, 1.5],
    zoom: [0.55, 1.65],
    pointSize: [0.5, 1.6],
  } as const;
  for (const key of Object.keys(bounds) as (keyof typeof bounds)[]) {
    const value = parsed[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    state[key] = clamp(value, ...bounds[key]);
  }
  if (
    ![5, 9, 13].includes(Number(parsed.density)) ||
    typeof parsed.target !== 'string' ||
    (!getTarget(parsed.target) && !['stages', 'lut'].includes(parsed.target))
  )
    return null;
  state.density = Number(parsed.density);
  state.target = parsed.target as string;
  if (['lut', 'stages'].includes(state.target) && state.plot === 'native')
    state.plot = 'oklab';
  for (const key of ['preserve', 'vectors', 'axes'] as const) {
    if (typeof parsed[key] !== 'boolean') return null;
    state[key] = parsed[key];
  }
  // Figure fields were added later; absent values keep the defaults.
  for (const key of ['overlayOptimal', 'overlayPointer'] as const) {
    if (parsed[key] === undefined) continue;
    if (typeof parsed[key] !== 'boolean') return null;
    state[key] = parsed[key];
  }
  if (parsed.compare !== undefined) {
    if (
      typeof parsed.compare !== 'string' ||
      (parsed.compare !== '' && !getTarget(parsed.compare))
    )
      return null;
    state.compare = parsed.compare;
  }
  if (parsed.gradient !== undefined) {
    if (
      typeof parsed.gradient !== 'string' ||
      (parsed.gradient !== '' &&
        !gradientPairs.some((pair) => pair.id === parsed.gradient))
    )
      return null;
    state.gradient = parsed.gradient;
  }
  return state;
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function stateUrl(
  state: LabState,
  origin: string,
  embed = false,
): string {
  const url = new URL('/', origin);
  if (embed) url.searchParams.set('embed', '1');
  url.searchParams.set('state', encodeState(state));
  return url.href;
}
