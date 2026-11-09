---
version: alpha
name: Chromatic Volume
description: A focused, neutral-dark instrument for exploring color-space coordinates and RGB look transforms.
colors:
  background: '#17191c'
  surface: '#202226'
  canvas: '#141619'
  raised: '#2a2c32'
  text: '#eeeff4'
  muted: '#a0a3ae'
  accent: '#b6a0f4'
  accent-ink: '#211833'
  border: '#35373e'
  success: '#9ac9b0'
typography:
  display:
    fontFamily: 'Avenir Next, Trebuchet MS, PingFang SC, sans-serif'
  body:
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, PingFang SC, Microsoft YaHei, sans-serif'
  mono:
    fontFamily: 'SFMono-Regular, Consolas, Liberation Mono, monospace'
rounded:
  DEFAULT: '10px'
  control: '5px'
spacing:
  page: '16px'
components:
  button: {}
  slider: {}
  target-list: {}
  volume-canvas: {}
---

# Chromatic Volume

## Overview

This is a color-science figure collection for Chinese-speaking users. Six tabs group the figures by kind: 色体积 (the paired-volume workbench), 色彩变换 (morphing 3D lattices), 色度图, 光谱, 曲线 and 像素. The emphasis is on what each figure shows, not on how a conversion is computed: every figure opens with a short 看点 (what to look at), and conversion routes, formulas and scope notes sit in a collapsed 转换细节 block or a quiet note under it. There is still no brand hero, preset cards, guide sections, or marketing footer: the figure is visible immediately on entry.

The signature remains the synchronized pair of color-point volumes on the first tab; the other tabs share the same neutral instrument styling. Avoid decorative rainbow UI, promotional copy, and full-page explanations.

## Colors

The canonical runtime tokens live in `src/style.css` at `:root`; the frontmatter mirrors them. Each `colors` key maps directly to the CSS variable with the same name, e.g. `accent` → `--accent`. Shared buttons, slider tracks, controls, and text consume these variables. Canvas colors are intentionally fixed to match `--canvas`; sample colors come from the actual input or output sRGB coordinates.

Purple identifies a selected target or an editable value. Color itself never carries the only indication of a selection: labels, borders and `aria-pressed` accompany it.

## Typography

Use system fonts, with Chinese fallbacks, so the application runs without font-network dependencies. Body uses `--font-body`; display uses `--font-display`; numeric values and coordinates use `--font-mono` and tabular digits. Use Chinese labels alongside conventional model names. Dense utility labels may be smaller than body text; parameter explanations remain legible with generous line height.

## Layout

A 44 px tab bar (`.view-tabs`, a `nav`, never a `header`) sits at the top of the framed workbench. On the volume tab the desktop grid is figure list + all models / paired canvases / 看点 inspector; on figure tabs it is figure list / figure stage (title, canvas, one control row) / 看点 panel with live readouts and a scope note. The workbench begins at 16 px from the viewport and fills the available desktop area, with a minimum usable drawing height. Sidebars and the desktop inspector own their internal scrolling. At 1200 px the inspector moves below. At 640 px the sidebar is replaced by a native figure select, and the page scrolls naturally. Both volume canvases retain identical drawing dimensions for meaningful comparisons.

## Elevation & Depth

Tonal differences and borders establish hierarchy. New sessions use flat unlit color dots; simulated spherical shading is an explicit optional view. Independent sample swatches always stay flat. No decorative glass or page shadows. Feedback floats in a fixed status region without moving controls.

## Shapes

The workbench uses `--radius: 10px`, controls 5–7 px. A viewport-wide mobile workbench has no outer radius or page margin.

## Components

| Capability     | Canonical owner               | Source of truth | Allowed variants               | Verification                                     |
| -------------- | ----------------------------- | --------------- | ------------------------------ | ------------------------------------------------ |
| Select/Listbox | src/main.ts native select     | DESIGN.md       | native                         | tests/e2e/workbench.spec.ts                      |
| Form           | src/dom.ts and src/lut.ts     | DESIGN.md       | slider, sample index, LUT file | tests/model.test.ts; tests/e2e/workbench.spec.ts |
| Scrollbar      | src/style.css global baseline | DESIGN.md       | forced colors                  | artifacts/desktop.png                            |
| Toast          | src/main.ts notify            | DESIGN.md       | informational                  | tests/e2e/workbench.spec.ts                      |

- **Button / slider / toggle:** canonical owners are `src/dom.ts`; standard native semantics, pointer hover, visible focus, pressed and disabled states. Slider values update in place without replacing the focused input.
- **Select/Listbox:** native HTML selects intentionally accept OS-owned popup geometry and keyboard behavior. Desktop model choice uses labeled buttons; mobile uses the same model definitions in a select.
- **Form:** native labeled numeric sampling input and file input. Validate `.cube` content once at `src/lut.ts`; surface errors next to the file input and retain a previous valid LUT.
- **Scrollbar:** global `src/style.css` baseline with thumb, track, hover, active, and forced-color handling. No opt-in utility class.
- **Toast:** the `notify` function in `src/main.ts`, a single polite live region. File errors also stay inline.
- **Motion:** workbench drawing is on demand. Its automatic rotation is off initially, pauses when the document is hidden, and stops when the user enables reduced motion. Explicitly starting it is permitted. The separate card preview rotates automatically at up to 24 fps, pauses offscreen or when hidden, and uses `/cover.png` under reduced motion. CSS transitions are removed under reduced motion.
- **Delivery surfaces:** `/` is the complete responsive website; `/preview` is an automatic pair of color volumes, with portrait reflow and no interaction needed. Both are physical static HTML build entries. `/cover.png` is a reproducible 1600×1000 screenshot of `/preview?motion=off`; `/lab-entry.json` supplies origin-relative delivery fields. Preview modules avoid constructing the workbench UI. Startup has a 12-second module-loading deadline, an explicit error, a cover, and recovery actions.
- **Export recovery:** PNG creation keeps the blob and download link until the next export. Persistent feedback offers a parameter-preserving standalone link because sandboxed downloads may be silently blocked; feedback reports image generation rather than claiming a completed download. Imported LUT data remains local and must be reselected after opening a new tab.
- **Source selection:** `src/targets.ts` owns ten bounded RGB source presets and source sampling. Changing source resamples the entire lattice while retaining the target and camera. ACEScc samples the encoded endpoints of linear 0–1. Display clipping is separate from irreversible target-encoding limits: actual decoded target colors drive output swatches, and numerical XYZ round-trip loss is counted and identified for the selected sample. No additional coordinate clipping is applied. Legacy state URLs without `source` default to sRGB.
- **LUT contract:** input/output gamut and transfer are independent, initially unselected, and required to render. BT.1886 has separate black/white controls per endpoint. LUT mode forces a common plot space with identical axis scales and mixes in XYZ; standard conversions may retain the native-coordinate view. No filename inference. DOMAIN clipping is reported separately from display clipping.
- **Scientific controls:** new sessions default to equal-unit axes, flat color dots and tetrahedral LUT interpolation. Legacy URLs retain those settings; native teaching-stage plots migrate to common Oklab. A shared model transform owns both plots in native, common and preview modes; endpoint labels and accessible canvas descriptions show actual numeric values. Camera presets set gamut and transfer together, without guessing from a filename. Numeric swatches are distinct from the optional shaded illustration. All PNG exports record the actual plot spaces, scaling and coloring modes.
- **Color interpretation:** standard conversions decode the actual target coordinates for output colors and common plot positions; only lossless conversions coincide. Target-encoding loss and sRGB display clipping are distinct. Model axes and plot scaling must be explicit. Plot interpolation is not a meaningful intermediate color space. LUT and teaching-stage modes change RGB color response, always use a common plot space, and must be labeled separately.

## Do's and Don'ts

- Keep the actual workbench visible immediately on entry; figure tabs open on their first figure.
- Lead with the 看点 sentence; keep conversion detail collapsed or in the scope note.
- Label approximations honestly in the figure note (ACES fit is not ACES 2.0, AgX is a polynomial approximation, H&D and Kubelka–Munk pigments are illustrative).
- Tone maps return linear display RGB and share sRGB display encoding. Bayer sampling and interpolation operate in linear light; its displayed error and PSNR use the explicitly labeled sRGB code domain. The optimal-solid overlay is an illuminant-E reflectance limit adapted to D65, not a boundary of all visible stimuli; outside counts are not imaginary-color counts. Comparison exports use the same plot-model resolution as the canvas.
- Measured data (CIE observers, Pointer, MacAdam, TM-30 CES results, camera sensitivities) comes from `npm run generate:figure-data`; never hand-type tables.
- Share the renderer and state between the website and embedded usage.
- Keep `/preview` an automatic presentation of the actual sRGB → Oklab math and renderer, without a toolbar or nested iframe. The full website remains responsive to its own viewport; the blog owns the outer viewer toolbar.
- Never claim teaching stages reproduce FilmLight Eab or Chromogen.
- Never describe an existing LUT application or standard coordinate conversion as trained model fitting.
