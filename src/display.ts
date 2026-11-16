import type { Vec3 } from './model';

// The colour space of every canvas and swatch on the page. Colours travel
// through the app as encoded sRGB that may exceed 0–1 ("extended sRGB"); they
// are converted to the display space and clipped only here, at the last step.
export type DisplayGamut = 'srgb' | 'p3';

const KEY = 'display-gamut';
function stored() {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}
function canvasSupportsP3() {
  try {
    const context = document
      .createElement('canvas')
      .getContext('2d', { colorSpace: 'display-p3' });
    return (
      context?.getContextAttributes?.().colorSpace === 'display-p3' &&
      CSS.supports('color', 'color(display-p3 1 0 0)')
    );
  } catch {
    return false;
  }
}
const browser = typeof document !== 'undefined';
/** The browser can draw Display P3 canvases and CSS colours. */
export const p3Available = browser && canvasSupportsP3();
/** The screen reports a gamut of at least P3. */
export const p3Screen = browser && matchMedia('(color-gamut: p3)').matches;
// `?display=srgb|p3` overrides the stored choice for one page load (cover generation, tests).
const choice = browser
  ? (new URLSearchParams(location.search).get('display') ?? stored())
  : null;
/** Fixed for the lifetime of the page; changing it reloads. */
export const displayGamut: DisplayGamut =
  p3Available && (choice === 'p3' || (choice !== 'srgb' && p3Screen))
    ? 'p3'
    : 'srgb';
export const displayName = displayGamut === 'p3' ? 'Display P3' : 'sRGB';
export const canvasSettings: CanvasRenderingContext2DSettings = {
  colorSpace: displayGamut === 'p3' ? 'display-p3' : 'srgb',
};
export function setDisplayGamut(gamut: DisplayGamut) {
  try {
    localStorage.setItem(KEY, gamut);
  } catch {
    // Without storage the choice cannot outlive the reload; nothing else to do.
  }
  location.reload();
}

// sRGB and Display P3 share the D65 white point and the sRGB transfer function,
// so only the primaries differ. Linear sRGB ↔ linear Display P3 (IEC 61966-2-1, SMPTE EG 432-1).
const TO_P3 = [
  [0.8224619687, 0.1775380313, 0],
  [0.0331941989, 0.9668058011, 0],
  [0.0170826307, 0.0723974407, 0.9105199286],
];
const FROM_P3 = [
  [1.2249401763, -0.2249401763, 0],
  [-0.0420569547, 1.0420569547, 0],
  [-0.0196375546, -0.0786360456, 1.0982736001],
];
const apply = (m: number[][], v: number[]) =>
  m.map((row) => row[0] * v[0] + row[1] * v[1] + row[2] * v[2]);
// Sign-preserving, so out-of-range values survive the round trip.
const decode = (v: number) => {
  const a = Math.abs(v);
  return (
    Math.sign(v) * (a <= 0.04045 ? a / 12.92 : ((a + 0.055) / 1.055) ** 2.4)
  );
};
const encode = (v: number) => {
  const a = Math.abs(v);
  return (
    Math.sign(v) * (a <= 0.0031308 ? 12.92 * a : 1.055 * a ** (1 / 2.4) - 0.055)
  );
};
const clamp = (v: number) => Math.min(Math.max(v, 0), 1);

/** Linear sRGB → linear RGB of the display. */
export function linearToDisplay(linear: number[], gamut = displayGamut) {
  return gamut === 'p3' ? apply(TO_P3, linear) : linear;
}
/** Linear RGB of the display → linear sRGB. */
export function linearFromDisplay(linear: number[], gamut = displayGamut) {
  return gamut === 'p3' ? apply(FROM_P3, linear) : linear;
}
/** Encoded sRGB (may exceed 0–1) → encoded display coordinates, not clipped. */
export function toDisplay(srgb: Vec3, gamut = displayGamut): Vec3 {
  if (gamut === 'srgb') return srgb;
  return apply(TO_P3, srgb.map(decode)).map(encode) as Vec3;
}
/** Encoded display coordinates → encoded sRGB (may exceed 0–1). */
export function fromDisplay(coords: Vec3, gamut = displayGamut): Vec3 {
  if (gamut === 'srgb') return coords;
  return apply(FROM_P3, coords.map(decode)).map(encode) as Vec3;
}
export function inDisplay(srgb: Vec3, gamut = displayGamut, tolerance = 1e-6) {
  return toDisplay(srgb, gamut).every(
    (v) => v >= -tolerance && v <= 1 + tolerance,
  );
}
/** Per-channel clip into the display gamut, returned as encoded sRGB. */
export function clipToDisplay(srgb: Vec3, gamut = displayGamut): Vec3 {
  return fromDisplay(toDisplay(srgb, gamut).map(clamp) as Vec3, gamut);
}
/** 8-bit display channels: what is actually drawn, and a compact cache key. */
export function displayChannels(srgb: Vec3, gamut = displayGamut) {
  return toDisplay(srgb, gamut).map((v) => Math.round(clamp(v) * 255));
}
/** CSS colour for 8-bit display channels. */
export function channelsCss(channels: number[], gamut = displayGamut) {
  return gamut === 'p3'
    ? `color(display-p3 ${channels.map((v) => +(v / 255).toFixed(4)).join(' ')})`
    : `rgb(${channels.join(',')})`;
}
/** CSS colour for encoded sRGB, clipped to the display gamut. */
export function cssColor(srgb: Vec3, gamut = displayGamut) {
  return channelsCss(displayChannels(srgb, gamut), gamut);
}
