---
version: alpha
name: Chromatic Volume
description: A focused, neutral-dark instrument for colour science in film production, ordered 拍摄 → 调色 → 交付.
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
  figure-list: {}
  volume-canvas: {}
---

# Chromatic Volume

## Overview

This is a colour-science figure collection for Chinese-speaking film and post-production professionals. Navigation follows the production pipeline: three stages, 拍摄 → 调色 → 交付, each with a short grouped figure list (拍摄: 光源 / 被摄物 / 标准观察者 / 摄影机; 调色: 工作色域 / 感知空间 / 调色器参数; 交付: 显示变换 / 编码与 HDR / 视频信号). The catalogue in `src/shell.ts` is the only place figures are ordered and titled. Figures with no film or post-production use are not kept (colour-vision-deficiency simulations, pigment mixing and UI gradient paths were removed). Where a Chinese name would be inaccurate, use the original English term (Reference Gamut Compression, Legal range). Every figure shows, in order: title and grade, a mono conditions line, a 读图 line, the drawing, one row of controls; beside it the 看点, the live readout, and a collapsed 来源与近似 (or 转换细节) disclosure. Nothing else is on the page: no brand, counts, figure numbers, search, shortcuts, focus mode or status bar.

The signature remains the synchronized pair of colour-point volumes; volume figures and plotted figures share one frame and one list, so moving between them is invisible apart from the drawing. Avoid decorative rainbow UI, promotional copy, and full-page explanations.

## Colors

The canonical runtime tokens live in `src/style.css` at `:root`; the frontmatter mirrors them. Each `colors` key maps directly to the CSS variable with the same name, e.g. `accent` → `--accent`. Shared buttons, slider tracks, controls, and text consume these variables. Canvas colors are intentionally fixed to match `--canvas`; sample colors come from the actual input or output coordinates, shown in the active display space (sRGB or Display P3).

Purple identifies a selected target or an editable value. Color itself never carries the only indication of a selection: labels, borders and `aria-pressed` accompany it.

## Typography

Use system fonts, with Chinese fallbacks, so the application runs without font-network dependencies. Body uses `--font-body`; display uses `--font-display`; numeric values and coordinates use `--font-mono` and tabular digits. Use Chinese labels alongside conventional model names. The smallest text size is 11 px; dense utility labels may be smaller than body text but not below that floor; parameter explanations remain legible with generous line height.

## Layout

A 48 px stage bar (`.stage-nav`, a `nav`, never a `header`) sits at the top of the framed workbench: three links with a muted arrow between them; each opens the stage's first figure. Below it every page uses the same grid, `.figure-workspace`: figure list / stage (heading, drawing, controls) / 看点 panel, 220 / fluid / 300 px (240 / 320 above 1600 px). On desktop the frame fills the viewport and each column scrolls on its own. The volume stage holds the paired canvases (identical drawing dimensions), one control row (映射进度 slider, 等轴 / 正视 / 俯视, 自动旋转, a gesture note) and a closed 高级 drawer that holds every other workbench setting: 源, 目标 (all models, LUT import, teaching stages), 左侧 comparison, 绘图 space, 采样 density, display switches, overlays, zoom, 导出对比图 and 恢复默认. At 1200 px the 看点 panel moves below the figure, with the 看点 on the left and readout plus sources on the right. At 640 px the list becomes a native grouped select at the top of the heading, the volume canvases stack at full width, and the page scrolls naturally.

## Elevation & Depth

Tonal differences and borders establish hierarchy. New sessions use flat unlit color dots; simulated spherical shading is an explicit optional view. Independent sample swatches always stay flat. No decorative glass or page shadows. Feedback floats in a fixed status region without moving controls.

## Shapes

The workbench uses `--radius: 10px`, controls 4–7 px. A viewport-wide mobile workbench has no outer radius or page margin.

## Components

| Capability     | Canonical owner               | Source of truth | Allowed variants               | Verification                                     |
| -------------- | ----------------------------- | --------------- | ------------------------------ | ------------------------------------------------ |
| Select/Listbox | src/main.ts native select     | DESIGN.md       | native                         | tests/e2e/workbench.spec.ts                      |
| Form           | src/dom.ts and src/lut.ts     | DESIGN.md       | slider, sample index, LUT file | tests/model.test.ts; tests/e2e/workbench.spec.ts |
| Scrollbar      | src/style.css global baseline | DESIGN.md       | forced colors                  | artifacts/desktop.png                            |
| Toast          | src/main.ts notify            | DESIGN.md       | informational                  | tests/e2e/workbench.spec.ts                      |

- **Button / slider / toggle:** canonical owners are `src/dom.ts`; standard native semantics, pointer hover, visible focus, pressed and disabled states. Slider values update in place without replacing the focused input.
- **Select/Listbox:** native HTML selects intentionally accept OS-owned popup geometry and keyboard behavior. The workbench target model is one grouped select in the 高级 drawer; the phone figure list is a grouped select built from the same catalogue.
- **Form:** native labeled numeric sampling input and file input. Validate `.cube` content once at `src/lut.ts`; surface errors next to the file input and retain a previous valid LUT.
- **Scrollbar:** global `src/style.css` baseline with thumb, track, hover, active, and forced-color handling. No opt-in utility class.
- **Display domain:** `src/display.ts` is the only place colours are converted for the screen. Colours travel through the app as encoded sRGB that may exceed 0–1; canvases, sprites, the chromaticity raster and DOM swatches convert to the display space and clip there. On a screen that reports P3 (and a browser with Display P3 canvases) the display space is Display P3, otherwise sRGB; there is no on-page switch, `?display=srgb|p3` overrides it for one load (the cover script and the e2e suite pin sRGB). Every statement about clipping or "显示范围" names the active space via `displayName`, PNG exports record it, and data that is sRGB by definition (tone-mapped Rec.709 output, CVD lattices, the pixel test images) is drawn unchanged. Readback tests prove out-of-sRGB pixels numerically; never claim wide-gamut output from the screenshot alone.
- **Navigation:** `src/shell.ts` owns the stage catalogue, the stage bar, the grouped figure list (`figureNav`) and 「」 reference links. Every figure is addressed as `/?fig=<id>`; a figure drawn by the same page is selected in place and pushes a history entry, any other figure is a plain link. Old `?view=<tab>` links resolve through `requestedFigure`: a known `fig` wins, otherwise the old tab's first figure, otherwise the first figure of 拍摄. `?state=` opens the workbench with that state in the 调色 stage. There is no search, keyboard stepping, figure numbering or focus mode.
- **Toast:** the `notify` function in `src/main.ts`, a single polite live region. File errors also stay inline.
- **Guidance:** `reading` is a required field of every `FigureDef` and is rendered as `.figure-reading`, a plain line under the conditions; the workbench writes its own in `updateLabels` for the current mode and generates its conditions line from source, density, target, white and plot settings. `step(label, …controls)` in `src/figures/plot.ts` wraps each control group as `.figure-step` with a short visible label and no number. A step label is the only visible name of a `segmented` group. Canvas gestures (pointing, rotating) are listed as a step with `stepNote` text. Reading lines describe the drawing, not the concept, and are statements, not questions.
- **Motion:** figure playback never starts by itself: a figure opens paused on a stable state (RGB transform figures on the completed transform). A change between two discrete states (RGB transform states, MacAdam xy ↔ u′v′) is a button, not a slider: the click runs a transition of under a second that cannot be stopped midway, and jumps under reduced motion. Workbench drawing is on demand. Its automatic rotation is off initially, pauses when the document is hidden, and stops when the user enables reduced motion. Explicitly starting it is permitted. The separate card preview rotates automatically at up to 24 fps, pauses offscreen or when hidden, and uses `/cover.png` under reduced motion. CSS transitions are removed under reduced motion.
- **Delivery surfaces:** `/` is the complete responsive website; `/preview` is an automatic pair of color volumes, with portrait reflow and no interaction needed. Both are physical static HTML build entries. `/cover.png` is a reproducible 1600×1000 screenshot of `/preview?motion=off`; `/lab-entry.json` supplies origin-relative delivery fields. Preview modules avoid constructing the workbench UI. Startup has a 12-second module-loading deadline, an explicit error, a cover, and recovery actions.
- **Export recovery:** PNG creation keeps the blob and download link until the next export. Persistent feedback offers a parameter-preserving standalone link because sandboxed downloads may be silently blocked; feedback reports image generation rather than claiming a completed download. Imported LUT data remains local and must be reselected after opening a new tab.
- **Source selection:** `src/targets.ts` owns ten bounded RGB source presets and source sampling. Changing source resamples the entire lattice while retaining the target and camera. ACEScc samples the encoded endpoints of linear 0–1. Display clipping is separate from irreversible target-encoding limits: actual decoded target colors drive output swatches, and numerical XYZ round-trip loss is counted and identified for the selected sample. No additional coordinate clipping is applied. Legacy state URLs without `source` default to sRGB.
- **LUT contract:** input/output gamut and transfer are independent, initially unselected, and required to render. BT.1886 has separate black/white controls per endpoint. LUT mode forces a common plot space with identical axis scales and mixes in XYZ; standard conversions may retain the native-coordinate view. No filename inference. DOMAIN clipping is reported separately from display clipping.
- **Scientific controls:** new sessions default to equal-unit axes, flat color dots and tetrahedral LUT interpolation. Legacy URLs retain those settings; native teaching-stage plots migrate to common Oklab. A shared model transform owns both plots in native, common and preview modes; endpoint labels and accessible canvas descriptions show actual numeric values. Camera presets set gamut and transfer together, without guessing from a filename. Numeric swatches are distinct from the optional shaded illustration. All PNG exports record the actual plot spaces, scaling and coloring modes.
- **Color interpretation:** standard conversions decode the actual target coordinates for output colors and common plot positions; only lossless conversions coincide. Target-encoding loss and sRGB display clipping are distinct. Model axes and plot scaling must be explicit. Plot interpolation is not a meaningful intermediate color space. LUT and teaching-stage modes change RGB color response, always use a common plot space, and must be labeled separately.
- **RGB transform figures:** only keyframes claim a completed transform and only keyframes can be selected; frames in between appear during the transition, labeled as geometric transitions with coordinate-aware axes. One colour is always tracked: a preset swatch or any clicked lattice node. The canvas marks its position in every state, joins them with a line and enlarges the current one; the readout tabulates its coordinates and colour per state (tone-map inputs in EV). AP1 outside counts use current, uncentered coordinates and appear only after the lattice enters AP1. Swatch buttons show the input colour on the left half and the final output on the right; matrix details are labeled as final output rather than current-frame values.

## Do's and Don'ts

- Keep a figure visible immediately on entry: `/` opens the first figure of 拍摄, each stage link opens that stage's first figure. A new figure goes into the catalogue under the stage and group where a film crew would meet it; a figure with no film or post-production use does not go in.
- Write figure text for colour-science professionals: no introductory definitions. Each figure has a one-line `conditions` specification (observer, illuminant, domain, sampling), a `reading` line naming what is drawn, a `grade` (参考 / 近似 / 示意), a 看点 stating the non-obvious result, and structured `provenance` (数据源 / 计算域 / 近似 / 文献). A 看点 may only mention controls that exist. Numbers belong in the live readout and are computed by the figure code, never typed into prose unless verified against that computation.
- Relate figure captions and 看点 to cinematography and post-production: camera/workspace gamuts, grading and highlights, monitoring and white points, lighting and materials, exposure and film response, sampling and delivery. Keep the project's colour-science identity, the three stage names, technical models and controls. Describe the actual plotted samples; production examples are context, not claims of real footage, measured cinema-camera performance or complete film emulation.
- Plotted figures support pointing (pointer hover/drag, arrow keys) through `probe` in `src/figures/plot.ts`. Code values are shown in 10-bit with a Full / Legal range switch (`codeValue`). Moving a figure to another stage or group is a catalogue edit; its `/?fig=` address does not change. Figures carry no numbers.
- A 看点 that names another stage or figure quotes its exact name in 「」; `linkReferences` in `src/shell.ts` turns the quote into a link, so the quoted text must match the stage name or the catalogue title. `tests/catalogue.test.ts` checks that the catalogue and the figure definitions list the same figures.
- Lead with the 看点 sentence; keep conversion detail collapsed or in the scope note.
- Label approximations honestly in the figure note (ACES fit is not ACES 2.0, AgX is a polynomial approximation, H&D and Kubelka–Munk pigments are illustrative).
- Tone maps return linear display RGB and share sRGB display encoding. Bayer sampling and interpolation operate in linear light; its displayed error and PSNR use the explicitly labeled sRGB code domain. The optimal-solid overlay is an illuminant-E reflectance limit adapted to D65, not a boundary of all visible stimuli; outside counts are not imaginary-color counts. Comparison exports use the same plot-model resolution as the canvas.
- Measured data (CIE observers, Pointer, MacAdam, TM-30 CES results, camera sensitivities) comes from `npm run generate:figure-data`; never hand-type tables.
- Share the renderer and state between the website and embedded usage.
- Keep `/preview` an automatic presentation of the actual sRGB → Oklab math and renderer, without a toolbar or nested iframe. The full website remains responsive to its own viewport; the blog owns the outer viewer toolbar.
- Never claim teaching stages reproduce FilmLight Eab or Chromogen.
- Never describe an existing LUT application or standard coordinate conversion as trained model fitting.
