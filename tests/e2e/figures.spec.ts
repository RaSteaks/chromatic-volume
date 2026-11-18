import { cssColor, fromDisplay } from '../../src/display';
import type { Vec3 } from '../../src/model';
import { expect, test, type Page } from '@playwright/test';
import { volumeFigures } from '../../src/volume-figures';
import { frame } from '../../src/figures/plot';
import { catalogue, figureTitle, stages } from '../../src/shell';

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}
const openAdvanced = (page: Page) =>
  page.locator('.advanced > summary').click();

test('the pipeline is the only navigation', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.stage-tab')).toHaveText(['拍摄', '调色', '交付']);
  await expect(page.locator('.stage-tab[aria-current="page"]')).toHaveText(
    '拍摄',
  );
  await expect(page.locator('.figure-heading h1')).toHaveText('黑体辐射');
  // No brand, counts, numbers, search, shortcuts or focus mode around the figure.
  await expect(
    page.locator(
      '.view-brand, .view-tab-count, .search-button, .focus-toggle, .gamut-toggle, .step-badge, kbd',
    ),
  ).toHaveCount(0);
  await page.getByRole('link', { name: '调色', exact: true }).click();
  await expect(page.locator('.figure-heading h1')).toHaveText('CIE 色度图');
  // A volume figure in the list opens the workbench in the same stage.
  await page.locator('.figure-link[data-figure="oklab"]').click();
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '729',
  );
  await expect(page.locator('.stage-tab[aria-current="page"]')).toHaveText(
    '调色',
  );
  await expect(
    page.locator('.figure-link[data-figure="oklab"]'),
  ).toHaveAttribute('aria-current', 'true');
  await page.locator('.figure-link[data-figure="hue-lines"]').click();
  await expect(page.locator('.figure-host')).toHaveAttribute(
    'data-figure',
    'hue-lines',
  );
});

for (const stage of stages) {
  test(`${stage.name} figures all render without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const entries = catalogue.filter((entry) => entry.stage === stage.id);
    const ids = entries
      .filter((entry) => entry.module !== 'volume')
      .map((entry) => entry.id);
    await page.goto(`/?fig=${ids[0]}`);
    await expect(page.locator('.figure-link')).toHaveCount(entries.length);
    for (const id of ids) {
      await page.locator(`.figure-link[data-figure="${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`fig=${id}`));
      await expect(page.locator('.figure-host')).toHaveAttribute(
        'data-figure',
        id,
      );
      await expect(page.locator('.figure-heading h1')).toHaveText(
        figureTitle(id),
      );
      const canvas = page.locator('.figure-host canvas').first();
      await expect(canvas).toHaveAttribute('data-painted', /\d+/);
      await expect(page.locator('.figure-highlight')).not.toBeEmpty();
      await expect(page.locator('.figure-conditions')).not.toBeEmpty();
      await expect(page.locator('.figure-reading')).not.toBeEmpty();
      expect(await page.locator('.figure-step').count()).toBeGreaterThan(0);
      expect(
        await page.locator('.figure-provenance dt').count(),
      ).toBeGreaterThan(0);
    }
    expect(errors).toEqual([]);
  });
}

test('old tab links open the figure in its pipeline stage', async ({
  page,
}) => {
  await page.goto('/?view=curves&fig=hd');
  await expect(page.locator('.figure-heading h1')).toHaveText(
    '胶片特性曲线（H&D）',
  );
  await expect(page.locator('.stage-tab[aria-current="page"]')).toHaveText(
    '拍摄',
  );
  // A removed figure opens its old tab's first figure.
  await page.goto('/?view=transform&fig=protan');
  await expect(page.locator('.figure-heading h1')).toHaveText(
    'ACES 1.x 色调映射（Hill 拟合）',
  );
});

test('pointing at the chromaticity diagram reads xy, u′v′, CCT and Duv', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=cie1931');
  const canvas = page.locator('.figure-host canvas');
  await expect(canvas).toHaveAttribute('data-plane', 'uv');
  await page.getByRole('button', { name: '白点附近' }).click();
  await canvas.focus();
  // Keyboard probing starts at the canvas centre, close to the Planckian locus.
  await canvas.press('ArrowRight');
  await expect(page.locator('.figure-readout')).toContainText('u′');
  await expect(page.locator('.figure-readout')).toContainText(/CCT \d+ K/);
  await page.getByRole('button', { name: 'xy', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-plane', 'xy');
});

test('curve code values switch between full and legal range', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=transfer');
  const srgb = page.locator('.curve-table span').filter({ hasText: 'sRGB' });
  // Cursor at diffuse white: sRGB is at full signal.
  await expect(srgb.locator('small')).toContainText('码值 1023');
  await page.getByRole('button', { name: 'Legal range' }).click();
  await expect(srgb.locator('small')).toContainText('码值 940');
  await page.getByRole('button', { name: '斜率' }).click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-view',
    'slope',
  );
});

test('chromaticity probe reports temperatures beyond its supported range', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=cie1931');
  const canvas = page.locator('.figure-host canvas');
  await expect(canvas).toHaveAttribute('data-plane', 'uv');
  const bounds = (await canvas.boundingBox())!;
  const f = frame(
    bounds.width,
    bounds.height,
    [0, 0.65],
    [0, 0.62],
    undefined,
    true,
  );
  // A physical blue-white chromaticity beyond the 100000 K end of the locus.
  await page.mouse.move(bounds.x + f.sx(0.18), bounds.y + f.sy(0.395));
  await expect(page.locator('.figure-readout')).toContainText(
    'CCT 超出计算范围（1000–100000 K）',
  );
  await expect(page.locator('.figure-readout')).not.toContainText(
    'CCT 100000 K',
  );
  await page.screenshot({
    path: 'artifacts/fix-cct-boundary.png',
    fullPage: true,
  });
});

test('10-degree CMF overlay leaves its blue peak inside the plot', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=cmf');
  const canvas = page.locator('.figure-host canvas');
  await expect(canvas).toHaveAttribute('data-painted', /\d+/);
  await page.locator('#lambda').fill('445');
  const before = Number(await canvas.getAttribute('data-painted'));
  await page.locator('#cmf-10').check();
  await expect
    .poll(async () => Number(await canvas.getAttribute('data-painted')))
    .toBeGreaterThan(before);
  await expect(page.locator('.figure-readout')).toContainText('2.02730');
  // Inspect actual blue curve pixels near the short-wave peak, excluding
  // the legend. A clipped overlay touches the plot's top edge at y = 24.
  const peakTop = await canvas.evaluate(async (c: HTMLCanvasElement) => {
    // Let the overlay's queued paint finish even if the slider also repainted.
    await new Promise<void>((resolve) =>
      requestAnimationFrame(() => resolve()),
    );
    const data = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
    for (let y = 0; y < c.height / 2; y++) {
      for (let x = Math.floor(c.width * 0.1); x < c.width * 0.35; x++) {
        const i = (y * c.width + x) * 4;
        if (data[i + 2] > data[i] + 25 && data[i + 2] > data[i + 1] + 15) {
          return (y * c.clientHeight) / c.height;
        }
      }
    }
    return null;
  });
  expect(peakTop).not.toBeNull();
  expect(peakTop!).toBeGreaterThan(30);
  await page.screenshot({ path: 'artifacts/fix-cmf10.png', fullPage: true });
});

test('quantization steps depend on code range, not the displayed signal interval', async ({
  page,
}) => {
  await page.goto('/?fig=bit-depth');
  const cells = page.locator('.readout-grid > span');
  for (const range of [
    { name: 'Full range', steps: ['0.392%', '0.098%'] },
    { name: 'Legal range', steps: ['0.457%', '0.114%'] },
  ]) {
    await page.getByRole('button', { name: range.name, exact: true }).click();
    for (const interval of ['暗部窄范围 0.20–0.30', '全范围 0–1']) {
      await page.getByRole('button', { name: interval, exact: true }).click();
      await expect(cells.nth(7)).toHaveText(range.steps[0]);
      await expect(cells.nth(11)).toHaveText(range.steps[1]);
    }
  }
});

test('figure links restore the selected figure and state buttons move the lattice', async ({
  page,
}) => {
  await page.goto('/?fig=rgc');
  await expect(page.locator('.figure-heading h1')).toHaveText(
    'ACES Reference Gamut Compression',
  );
  const canvas = page.locator('.figure-host canvas');
  // Figures open on the completed transform.
  await expect(canvas).toHaveAttribute('data-progress', '2.000');
  const state = (name: string) =>
    page.getByRole('button', { name, exact: true });
  await expect(state('RGC 后')).toHaveAttribute('aria-pressed', 'true');
  // A click animates to that state and stops there.
  await state('S-Gamut3').click();
  await expect(canvas).toHaveAttribute('data-progress', '0.000');
  await expect(page.locator('.figure-stage-label')).toContainText(
    'S-Gamut3 线性立方体',
  );
  await state('RGC 后').click();
  await expect(canvas).toHaveAttribute('data-progress', '2.000');
  await expect(page.locator('.figure-stage-label')).toContainText('（RGC）后');
  // The lattice is a draggable 3D view.
  const camera = await canvas.getAttribute('data-camera');
  await canvas.press('ArrowRight');
  await expect(canvas).not.toHaveAttribute('data-camera', camera!);
});
test('interactive figure controls change the drawing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=metamerism');
  await expect(page.locator('.figure-readout')).toContainText('ΔE2000 = 0.0');
  await page.getByRole('button', { name: 'A 白炽灯' }).click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-illuminant',
    'a',
  );
  const delta = await page.locator('.figure-readout').innerText();
  expect(Number(/ΔE2000 = ([\d.]+)/.exec(delta)![1])).toBeGreaterThan(1);

  await page.goto('/?fig=subsampling');
  await page.getByRole('button', { name: '4:2:2', exact: true }).click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-scheme',
    '422',
  );
  await expect(page.locator('.figure-readout')).toContainText('67%');
});

test('every volume figure applies its configuration', async ({ page }) => {
  const errors = collectErrors(page);
  for (const figure of volumeFigures) {
    await page.goto(`/?fig=${figure.id}`);
    await expect(page.locator('canvas').last()).toHaveAttribute(
      'data-model',
      figure.state.target,
    );
    await expect(
      page.locator(`.figure-link[data-figure="${figure.id}"]`),
    ).toHaveAttribute('aria-current', 'true');
    await expect(page.locator('.figure-heading h1')).toHaveText(
      figureTitle(figure.id),
    );
    await expect(page.locator('.figure-highlight')).toHaveText(
      figure.highlight,
    );
    if (figure.state.compare)
      await expect(page.locator('.volume-heading').first()).toContainText(
        '对照：',
      );
    if (figure.state.overlayOptimal || figure.state.overlayPointer)
      await expect(page.locator('.overlay-legend')).toBeVisible();
  }
  expect(errors).toEqual([]);
  // Overlays survive a shared URL.
  await openAdvanced(page);
  await page.getByRole('button', { name: '导出对比图' }).click();
  const link = page.locator('.export-feedback a[target="_blank"]');
  const href = (await link.getAttribute('href'))!;
  await page.goto(href);
  await expect(page.locator('#overlay-pointer')).toBeChecked();
  await expect(page.locator('.overlay-legend')).toContainText('Pointer 色域');
});

test('AgX curves and lattice swatches share the sRGB display encoding', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=tonemap');
  await expect(
    page
      .locator('.curve-table span')
      .filter({ hasText: 'AgX' })
      .locator('code'),
  ).toHaveText(/^0\.500/);
  await page.screenshot({
    path: 'artifacts/fix-agx-curve.png',
    fullPage: true,
  });
  await page.goto('/?fig=agx');
  // The first pair is the input/output swatch for scene grey 0.18.
  await expect(page.locator('.swatch-table i').nth(1)).toHaveCSS(
    'background-color',
    'rgb(128, 128, 128)',
  );
});

test('RGB state labels and AP1 counts describe the current state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=rgc');
  const status = page.locator('.figure-stage-label');
  const canvas = page.locator('.figure-host canvas');
  const state = (name: string) =>
    page.getByRole('button', { name, exact: true });
  // The figure opens on the completed transform; go back to the source state.
  await state('S-Gamut3').click();
  await expect(canvas).toHaveAttribute('data-progress', '0.000');
  await expect(status).not.toContainText('个节点在 AP1 之外');
  for (const [name, count] of [
    ['AP1', 206],
    ['RGC 后', 0],
  ] as const) {
    await state(name).click();
    await expect(status).toContainText(
      `当前 AP1 晶格：${count} / 729 个节点在 AP1 之外`,
    );
    await expect(status).not.toHaveText(/^过渡示意：/);
    await expect(canvas).toHaveAttribute(
      'aria-description',
      /R AP1、G AP1、B AP1/,
    );
  }
  await page.goto('/?fig=aces');
  await expect(page.locator('.figure-highlight')).toContainText(
    '最终趋向显示白',
  );
  await expect(status).toHaveText(/^输出：ACES 拟合/);
  await expect(canvas).toHaveAttribute('aria-description', /R′、G′、B′/);
  await state('输入').click();
  await expect(status).toHaveText(/^输入：每通道 log₂ 曝光/);
  await expect(canvas).toHaveAttribute('aria-description', /R EV、G EV、B EV/);
});

test('RGB transform figures follow one colour from input to output', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?fig=aces');
  const canvas = page.locator('.figure-host canvas');
  const readout = page.locator('.figure-readout');
  // The first preset is tracked on entry: scene grey 0.18 sits at 0 EV.
  await expect(readout).toContainText('跟踪：中灰 0.18');
  await expect(readout).toContainText('+0.0 EV');
  const red = page.getByRole('button', { name: '高亮红', exact: true });
  await red.click();
  await expect(red).toHaveAttribute('aria-pressed', 'true');
  await expect(canvas).toHaveAttribute('data-tracked', '高亮红');
  await expect(readout).toContainText('跟踪：高亮红');
  await expect(readout).toContainText('+5.2 EV');
  // Clicking a lattice node tracks that node instead: the centre node is 4·4·4.
  await page.getByRole('button', { name: '输入', exact: true }).click();
  await expect(canvas).toHaveAttribute('data-progress', '0.000');
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2 - 4);
  await expect(canvas).toHaveAttribute('data-tracked', /^节点 /);
  await expect(red).toHaveAttribute('aria-pressed', 'false');
});

test('Bayer figure displays reconstruction and PSNR in the documented domain', async ({
  page,
}) => {
  await page.goto('/?fig=bayer');
  await expect(page.locator('.figure-readout')).toContainText(
    'PSNR（sRGB 编码域）12.9 dB',
  );
  await page
    .getByRole('button', { name: '双线性去马赛克', exact: true })
    .click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-stage',
    'demosaic',
  );
  await page.screenshot({
    path: 'artifacts/fix-bayer-linear.png',
    fullPage: true,
  });
});

test('exported PNG labels match comparison and common plotting models', async ({
  page,
}) => {
  await page.goto('/?fig=luv-lab');
  await openAdvanced(page);
  for (const scenario of [
    {
      figure: 'luv-lab',
      plot: 'native',
      leftTitle: 'COMPARE: CIELAB · D65',
      leftPlot: 'CIELAB · D65',
      rightPlot: 'CIELUV',
    },
    {
      figure: 'ipt',
      plot: 'native',
      leftTitle: 'COMPARE: Oklab',
      leftPlot: 'Oklab',
      rightPlot: 'IPT',
    },
    {
      figure: 'ipt',
      plot: 'xyz-d65',
      leftTitle: 'SOURCE: sRGB',
      leftPlot: 'CIE XYZ · D65',
      rightPlot: 'CIE XYZ · D65',
    },
  ]) {
    await page
      .locator(`.figure-link[data-figure="${scenario.figure}"]`)
      .click();
    await page.getByLabel('绘图空间').selectOption(scenario.plot);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: '导出对比图' }).click();
    await (
      await download
    ).saveAs(`artifacts/fix-compare-${scenario.figure}-${scenario.plot}.png`);
    // Check the actual PNG text pixels against the requested labels without
    // replacing Canvas APIs or relying on the on-screen heading alone.
    const matches = await page
      .locator('.export-feedback a[download]')
      .evaluate(async (link: HTMLAnchorElement, expected) => {
        const image = new Image();
        image.src = link.href;
        await image.decode();
        const actual = document.createElement('canvas');
        actual.width = image.width;
        actual.height = image.height;
        const actualContext = actual.getContext('2d')!;
        actualContext.drawImage(image, 0, 0);
        const reference = document.createElement('canvas');
        reference.width = image.width;
        reference.height = image.height;
        const context = reference.getContext('2d')!;
        context.fillStyle = '#141619';
        context.fillRect(0, 0, reference.width, reference.height);
        context.fillStyle = '#eeeff4';
        context.font = '24px sans-serif';
        context.fillText(expected.leftTitle, 40, 55);
        context.font = '13px sans-serif';
        context.fillText(`PLOT: ${expected.leftPlot}`, 40, 82, 760);
        context.fillText(`PLOT: ${expected.rightPlot}`, 840, 82, 720);
        return [
          [40, 28, 760, 30],
          [40, 68, 760, 18],
          [840, 68, 720, 18],
        ].map(([x, y, w, h]) => {
          const a = actualContext.getImageData(x, y, w, h).data;
          const b = context.getImageData(x, y, w, h).data;
          return a.every((v, i) => v === b[i]);
        });
      }, scenario);
    expect(matches).toEqual([true, true, true]);
  }
});

for (const width of [390, 768]) {
  test(`figure pages fit ${width}px without horizontal scrolling`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 844 });
    for (const stage of stages) {
      const first = catalogue.find(
        (entry) => entry.stage === stage.id && entry.module !== 'volume',
      )!;
      await page.goto(`/?fig=${first.id}`);
      await expect(page.locator('.figure-host canvas').first()).toHaveAttribute(
        'data-painted',
        /\d+/,
      );
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
      ).toBe(true);
    }
    await page.goto('/?fig=bayer');
    if (width > 640) {
      await page.locator('.figure-link[data-figure="hd"]').click();
    } else {
      await expect(page.locator('.figure-link').first()).toBeHidden();
      await page.locator('.figure-mobile').selectOption('hd');
    }
    await expect(page.locator('.figure-heading h1')).toHaveText(
      '胶片特性曲线（H&D）',
    );
  });
}

test('compare select follows the plot space after leaving a Look', async ({
  page,
}) => {
  await page.goto('/?fig=oklab');
  await openAdvanced(page);
  const compare = page.locator('#compare');
  await expect(compare).toBeEnabled();
  await page.locator('#target').selectOption('stages');
  await expect(compare).toBeDisabled();
  // The plot stays in a common space after returning to a standard target.
  await page.locator('#target').selectOption('oklab');
  await expect(page.locator('#plot')).not.toHaveValue('native');
  await expect(compare).toBeDisabled();
  await page.locator('#plot').selectOption('native');
  await expect(compare).toBeEnabled();
});

test('a comparison model does not change the source → target morph', async ({
  page,
}) => {
  await page.goto('/?fig=luv-lab');
  await openAdvanced(page);
  await page.locator('#strength').fill('0');
  await page.locator('#vectors').check({ force: true });
  const right = page.locator('canvas').last();
  const withCompare = await right.evaluate((c: HTMLCanvasElement) =>
    c.toDataURL(),
  );
  await page.locator('#compare').selectOption('');
  await expect(page.locator('.volume-heading').first()).toContainText(
    '源：sRGB',
  );
  await expect
    .poll(() => right.evaluate((c: HTMLCanvasElement) => c.toDataURL()))
    .toBe(withCompare);
});

test('wide-gamut figures pin the density their captions quote', async ({
  page,
}) => {
  await page.goto('/?fig=oklab');
  await openAdvanced(page);
  await page.locator('#density').selectOption('13');
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-points',
    '2197',
  );
  const ap1 = page.locator('.figure-link[data-figure="ap1"]');
  await ap1.click();
  await expect(page.locator('#density')).toHaveValue('9');
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-points',
    '729',
  );
  await expect(page.locator('.figure-highlight')).toContainText('255 / 729');
  // Changing the density afterwards drops the figure's caption.
  await page.locator('#density').selectOption('5');
  await expect(ap1).not.toHaveAttribute('aria-current', 'true');
  await expect(page.locator('.figure-highlight')).not.toContainText('/ 729');
});

test('the mobile figure select mirrors the active figure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?fig=oklab');
  const select = page.locator('.figure-mobile');
  await expect(select).toHaveValue('oklab');
  await select.selectOption('dwg');
  await expect(page.locator('#source')).toHaveValue('dwg-linear');
  // A custom setting leaves the curated figure; 恢复默认 returns to it.
  await openAdvanced(page);
  await page.locator('#source').selectOption('srgb');
  await expect(select).toHaveValue('');
  await page.getByRole('button', { name: '恢复默认' }).click();
  await expect(select).toHaveValue('dwg');
  await expect(page.locator('#source')).toHaveValue('dwg-linear');
});

test('a stalled figure module cannot replace the failure screen', async ({
  page,
}) => {
  test.setTimeout(40000);
  const spectrumModule =
    /\/(?:src\/figures\/spectrum\.ts|assets\/spectrum-[^/]+\.js)(?:\?.*)?$/;
  await page.route(spectrumModule, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 13000));
    await route.continue();
  });
  await page.goto('/?fig=cmf', { waitUntil: 'commit' });
  await expect(page.getByRole('alert')).toContainText('页面未能加载', {
    timeout: 15000,
  });
  // Let the late module resolve; the failure screen must stay in place.
  await page.waitForTimeout(3000);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.figure-page')).toHaveCount(0);
});

test('history follows the figure list across both kinds of page', async ({
  page,
}) => {
  await page.goto('/?fig=transfer');
  await page.locator('.figure-link[data-figure="tonemap"]').click();
  await expect(page).toHaveURL(/fig=tonemap/);
  // A volume figure is drawn by the workbench: the link navigates.
  await page.locator('.figure-link[data-figure="ycbcr"]').click();
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-model',
    'ycbcr709',
  );
  await page.locator('.figure-link[data-figure="zcam"]').click();
  await expect(page).toHaveURL(/fig=zcam/);
  await page.goBack();
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-model',
    'ycbcr709',
  );
  await page.goBack();
  await expect(page.locator('.figure-heading h1')).toHaveText('色调映射曲线');
  await page.goBack();
  await expect(page.locator('.figure-heading h1')).toHaveText('传递函数');
});

test('Display P3 canvases draw beyond sRGB and say so', async ({ page }) => {
  await page.goto('/?fig=cie1931&display=p3');
  const canvas = page.locator('.figure-host canvas');
  // Browsers without Display P3 canvases keep the sRGB path, which every other test covers.
  test.skip(
    (await canvas.getAttribute('data-display')) !== 'p3',
    'this browser cannot draw Display P3 canvases',
  );
  await expect(canvas).toHaveAttribute('data-painted', /\d+/);
  await expect(page.locator('.figure-provenance')).toContainText(
    'Display P3 外裁剪',
  );
  // Read the drawing back in Display P3 and convert it to sRGB here: part of
  // the fill must land well outside sRGB (a negative channel).
  const drawn = await canvas.evaluate((element: HTMLCanvasElement) => {
    const ctx = element.getContext('2d')!;
    const { data } = ctx.getImageData(0, 0, element.width, element.height, {
      colorSpace: 'display-p3',
    });
    const pixels: number[][] = [];
    for (let y = 0; y < element.height; y += 12)
      for (let x = 0; x < element.width; x += 12) {
        const o = (y * element.width + x) * 4;
        pixels.push([data[o], data[o + 1], data[o + 2]]);
      }
    return { space: ctx.getContextAttributes().colorSpace, pixels };
  });
  expect(drawn.space).toBe('display-p3');
  const lowest = Math.min(
    ...drawn.pixels.flatMap((pixel) =>
      fromDisplay(pixel.map((v) => v / 255) as Vec3, 'p3'),
    ),
  );
  expect(lowest).toBeLessThan(-0.2);

  // Lattice edges are translucent. Alpha must be part of the colour syntax:
  // appending it to `color(display-p3 …)` once made every P3 edge invalid.
  for (const gamut of ['p3', 'srgb'] as const) {
    const translucent = cssColor([1, 0.5, 0], gamut, 0.55);
    expect(
      await page.evaluate((c) => CSS.supports('color', c), translucent),
      translucent,
    ).toBe(true);
  }

  await page.goto('/?fig=sgamut3&display=p3');
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-display',
    'p3',
  );
  await expect(page.locator('.model-status')).toContainText(
    '个目标点超出 Display P3 显示范围',
  );
  // The pinned sRGB choice still applies without the override.
  await page.goto('/?fig=cie1931');
  await expect(canvas).toHaveAttribute('data-display', 'srgb');
});
