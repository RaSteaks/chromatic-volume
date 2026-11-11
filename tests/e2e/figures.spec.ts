import { expect, test, type Page } from '@playwright/test';
import { volumeFigures } from '../../src/volume-figures';
import { frame } from '../../src/figures/plot';

const pages = {
  transform: ['aces', 'agx', 'protan', 'deutan', 'tritan', 'rgc'],
  chromaticity: ['cie1931', 'macadam', 'hue-lines'],
  spectrum: [
    'cmf',
    'rgb-cmf',
    'blackbody',
    'metamerism',
    'tm30',
    'luther',
    'mixing',
  ],
  curves: ['transfer', 'tonemap', 'hd'],
  pixels: ['subsampling', 'bit-depth', 'bayer'],
} as const;

function collectErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  return errors;
}

test('tabs link every figure category from the volume workbench', async ({
  page,
}) => {
  await page.goto('/');
  const tabs = page.locator('.view-tab');
  await expect(tabs).toHaveCount(6);
  await expect(page.locator('.view-tab[aria-current="page"]')).toContainText(
    '色体积',
  );
  await page.getByRole('link', { name: '色度图' }).click();
  await expect(page).toHaveURL(/view=chromaticity/);
  await expect(page.locator('.figure-heading h1')).toHaveText('22. CIE 色度图');
  await page.getByRole('link', { name: '色体积' }).click();
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '729',
  );
});

for (const [view, ids] of Object.entries(pages)) {
  test(`${view} figures all render without errors`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto(`/?view=${view}`);
    await expect(page.locator('.figure-button[data-figure]')).toHaveCount(
      ids.length,
    );
    for (const id of ids) {
      await page.locator(`.figure-button[data-figure="${id}"]`).click();
      await expect(page).toHaveURL(new RegExp(`fig=${id}`));
      await expect(page.locator('.figure-host')).toHaveAttribute(
        'data-figure',
        id,
      );
      const canvas = page.locator('.figure-host canvas').first();
      await expect(canvas).toHaveAttribute('data-painted', /\d+/);
      await expect(page.locator('.figure-highlight')).not.toBeEmpty();
      await expect(page.locator('.figure-conditions')).not.toBeEmpty();
      await expect(page.locator('.figure-provenance dt').first()).toBeVisible();
    }
    // The tab badge matches the number of figures in the tab.
    await expect(
      page.locator(`.view-tab[data-view="${view}"] .view-tab-count`),
    ).toHaveText(String(ids.length));
    expect(errors).toEqual([]);
  });
}

test('old links to a moved figure open it on its new tab', async ({ page }) => {
  await page.goto('/?view=pixels&fig=mixing');
  await expect(page).toHaveURL(/view=spectrum/);
  await expect(page.locator('.figure-heading h1')).toHaveText(
    '31. 加色混合与减色混合',
  );
});

test('pointing at the chromaticity diagram reads xy, u′v′, CCT and Duv', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?view=chromaticity&fig=cie1931');
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
  await page.goto('/?view=curves&fig=transfer');
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
  await page.goto('/?view=chromaticity&fig=cie1931');
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
  await page.goto('/?view=spectrum&fig=cmf');
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
  await page.goto('/?view=pixels&fig=bit-depth');
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

test('figure links restore the selected figure and play controls animate', async ({
  page,
}) => {
  await page.goto('/?view=transform&fig=rgc');
  await expect(page.locator('.figure-heading h1')).toHaveText(
    '21. ACES Reference Gamut Compression',
  );
  const canvas = page.locator('.figure-host canvas');
  await page.getByRole('button', { name: '暂停' }).click();
  const before = await canvas.getAttribute('data-progress');
  await page.locator('#morph').fill('2');
  await expect(canvas).toHaveAttribute('data-progress', '2.000');
  expect(before).not.toBe('2.000');
  await expect(page.locator('.figure-stage-label')).toContainText('压缩后');
  // The lattice is a draggable 3D view.
  const camera = await canvas.getAttribute('data-camera');
  await canvas.press('ArrowRight');
  await expect(canvas).not.toHaveAttribute('data-camera', camera!);
});

test('interactive figure controls change the drawing', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?view=spectrum&fig=metamerism');
  await expect(page.locator('.figure-readout')).toContainText('ΔE2000 = 0.0');
  await page.getByRole('button', { name: 'A 白炽灯' }).click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-illuminant',
    'a',
  );
  const delta = await page.locator('.figure-readout').innerText();
  expect(Number(/ΔE2000 = ([\d.]+)/.exec(delta)![1])).toBeGreaterThan(1);

  await page.goto('/?view=pixels&fig=subsampling');
  await page.getByRole('button', { name: '4:2:2', exact: true }).click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-scheme',
    '422',
  );
  await expect(page.locator('.figure-readout')).toContainText('67%');
});

test('every volume figure applies its configuration', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/');
  for (const figure of volumeFigures) {
    await page.locator(`[data-figure="${figure.id}"]`).click();
    await expect(page.locator('canvas').last()).toHaveAttribute(
      'data-model',
      figure.state.target,
    );
    await expect(page.locator(`[data-figure="${figure.id}"]`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.locator('.figure-highlight')).toHaveText(
      figure.highlight,
    );
    if (figure.state.compare)
      await expect(page.locator('.volume-heading').first()).toContainText(
        '对照：',
      );
    if (figure.state.overlayOptimal || figure.state.gradient)
      await expect(page.locator('.overlay-legend')).toBeVisible();
  }
  expect(errors).toEqual([]);
  // Overlays survive a shared URL.
  await page.locator('[data-figure="gradient"]').click();
  await page.getByRole('button', { name: '导出对比图' }).click();
  const link = page.locator('.export-feedback a[target="_blank"]');
  const href = (await link.getAttribute('href'))!;
  await page.goto(href);
  await expect(page.locator('#gradient-pair')).toHaveValue('blue-yellow');
  await expect(page.locator('.overlay-legend')).toContainText('Oklab 插值');
});

test('AgX curves and lattice swatches share the sRGB display encoding', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/?view=curves&fig=tonemap');
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
  await page.goto('/?view=transform&fig=agx');
  // The first pair is the input/output swatch for scene grey 0.18.
  await expect(page.locator('.swatch-table i').nth(1)).toHaveCSS(
    'background-color',
    'rgb(128, 128, 128)',
  );
});

test('Bayer figure displays reconstruction and PSNR in the documented domain', async ({
  page,
}) => {
  await page.goto('/?view=pixels&fig=bayer');
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
  await page.goto('/');
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
    await page.locator(`[data-figure="${scenario.figure}"]`).click();
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
    for (const view of Object.keys(pages)) {
      await page.goto(`/?view=${view}`);
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
    await page.goto('/?view=curves');
    if (width > 640) {
      await page.locator('.figure-button[data-figure="hd"]').click();
    } else {
      await expect(page.locator('.figure-button').first()).toBeHidden();
      await page.locator('.figure-mobile').selectOption('hd');
    }
    await expect(page.locator('.figure-heading h1')).toHaveText(
      '34. 胶片特性曲线（H&D）',
    );
  });
}

test('compare select follows the plot space after leaving a Look', async ({
  page,
}) => {
  await page.goto('/');
  const compare = page.locator('#compare');
  await expect(compare).toBeEnabled();
  await page.locator('[data-target="stages"]').click();
  await expect(compare).toBeDisabled();
  // The plot stays in a common space after returning to a standard target.
  await page.locator('[data-target="oklab"]').click();
  await expect(page.locator('#plot')).not.toHaveValue('native');
  await expect(compare).toBeDisabled();
  await page.locator('#plot').selectOption('native');
  await expect(compare).toBeEnabled();
});

test('a comparison model does not change the source → target morph', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-figure="luv-lab"]').click();
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
  await page.goto('/');
  await page.locator('#density').selectOption('13');
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-points',
    '2197',
  );
  await page.locator('[data-figure="ap1"]').click();
  await expect(page.locator('#density')).toHaveValue('9');
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-points',
    '729',
  );
  await expect(page.locator('.figure-highlight')).toContainText('255 / 729');
  // Changing the density afterwards drops the figure's caption.
  await page.locator('#density').selectOption('5');
  await expect(page.locator('[data-figure="ap1"]')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await expect(page.locator('.figure-highlight')).not.toContainText('/ 729');
});

test('the mobile figure select mirrors the active figure', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const select = page.locator('.mobile-figure');
  await expect(select).toHaveValue('oklab');
  await select.selectOption('dwg');
  await expect(page.locator('#source')).toHaveValue('dwg-linear');
  await page.getByRole('button', { name: '全部重置' }).click();
  await expect(select).toHaveValue('oklab');
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
  await page.goto('/?view=spectrum', { waitUntil: 'commit' });
  await expect(page.getByRole('alert')).toContainText('工作台未能加载', {
    timeout: 15000,
  });
  // Let the late module resolve; the failure screen must stay in place.
  await page.waitForTimeout(3000);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.locator('.figure-page')).toHaveCount(0);
});
