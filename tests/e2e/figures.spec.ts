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
    'ACES 2.0 输出变换',
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
  const sony = page
    .locator('.curve-table > span')
    .filter({ hasText: 'S-Log3' });
  await expect(sony.locator('small')).toContainText(
    'Legal 重映射 · 原生码值 610',
  );
  await expect(
    page
      .locator('.curve-table > span')
      .filter({ hasText: 'LogC4' })
      .locator('small'),
  ).toContainText('原生码值');
  await page.getByRole('button', { name: '斜率' }).click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-view',
    'slope',
  );
});

test('CIE distinguishes monochromatic primaries from interior and exterior chromaticities', async ({
  page,
}) => {
  await page.goto('/?fig=cie1931');
  const info = page.locator('.figure-readout');
  await expect(info).toContainText('内部 3 · 近边界 0 · 外部 0');
  await page.locator('#gamut-cycle').fill('3');
  await expect(info).toContainText('内部 0 · 近边界 3 · 外部 0');
  await page.getByRole('button', { name: 'xy', exact: true }).click();
  const bounds = (await page.locator('.figure-host canvas').boundingBox())!;
  const f = frame(
    bounds.width,
    bounds.height,
    [0, 0.8],
    [0, 0.9],
    undefined,
    true,
  );
  // On the red spectral edge x + y ≈ 1, a neighbouring point above it is exterior.
  await page.mouse.move(bounds.x + f.sx(0.708), bounds.y + f.sy(0.292));
  await expect(info).toContainText('接近可见色度边界');
  await page.screenshot({ path: 'artifacts/math-fixes/rec2020-boundary.png' });
  await page.mouse.move(bounds.x + f.sx(0.708), bounds.y + f.sy(0.31));
  await expect(info).toContainText('非物理刺激');
  await page.locator('#gamut-cycle').fill('8');
  await expect(info).toContainText('内部 0 · 近边界 0 · 外部 3');
});

test('parameter plots, comparisons and overlays describe the visible geometry', async ({
  page,
}) => {
  await page.goto('/?fig=hsl-bicone');
  await expect(page.locator('.figure-conditions')).toContainText(
    '右图六棱锥参数比例',
  );
  await page.locator('.conversion-details summary').click();
  await expect(page.locator('#plot-scale-note')).toContainText('C = max − min');
  await openAdvanced(page);
  await page.locator('#target').selectOption('hsv');
  await expect(page.locator('.figure-conditions')).toContainText(
    '右图圆柱参数比例',
  );
  await expect(page.locator('#plot-scale-note')).toHaveText(/半径 0–0.5/);
  await page.locator('.figure-link[data-figure="luv-lab"]').click();
  await page.locator('#plot').selectOption('oklab');
  await expect(page.locator('.figure-highlight')).toContainText(
    '同一组 Oklab 坐标轴',
  );
  await expect(page.locator('.figure-highlight')).not.toContainText(
    'LUV 的红色角',
  );
  await page.goto('/?fig=optimal');
  await openAdvanced(page);
  await page.locator('#overlay-optimal').uncheck();
  await expect(page.locator('.figure-highlight')).not.toContainText('白色线圈');
  await expect(page.locator('.overlay-legend')).toBeHidden();
  await page.locator('.figure-link[data-figure="pointer"]').click();
  await page.locator('#overlay-pointer').uncheck();
  await expect(page.locator('.figure-highlight')).not.toContainText('金色线圈');
  await expect(page.locator('.overlay-legend')).toBeHidden();
});

test('HLG shows its formula beyond nominal peak without assigning delivery codes', async ({
  page,
}) => {
  await page.goto('/?fig=transfer');
  const hlg = page.locator('.curve-table span').filter({ hasText: 'HLG' });
  await expect(hlg.locator('code')).toHaveText('0.7500');
  await expect(hlg.locator('small')).toContainText('码值 767');
  await page.getByRole('slider', { name: '曝光游标' }).fill('3.3');
  await expect(hlg.locator('code')).toHaveText('1.1742');
  await expect(hlg.locator('small')).toHaveText(/公式外推 · 0\.\d+ 信号\/档/);
  await page.screenshot({
    path: 'artifacts/hlg-transfer-extension.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Legal range' }).click();
  await page.getByRole('slider', { name: '曝光游标' }).fill('7');
  await expect(hlg.locator('code')).toHaveText('1.6344');
  await expect(hlg.locator('small')).toContainText('公式外推');
  await page.getByRole('slider', { name: '曝光游标' }).fill('0');
  await expect(hlg.locator('small')).toContainText('码值 721');
});

test('transfer curves switch to extrapolation at their own nominal peaks', async ({
  page,
}) => {
  await page.goto('/?fig=transfer');
  const cursor = page.getByRole('slider', { name: '曝光游标' });
  const rows = page
    .locator('.curve-table > span')
    .filter({ has: page.locator('code') });
  for (const [stops, names] of [
    ['0', []],
    ['0.05', ['sRGB', 'Rec.709', 'Gamma 2.4']],
    ['5.25', ['sRGB', 'Rec.709', 'Gamma 2.4', 'HLG']],
    ['5.3', ['sRGB', 'Rec.709', 'Gamma 2.4', 'HLG', 'S-Log3']],
    ['5.65', ['sRGB', 'Rec.709', 'Gamma 2.4', 'HLG', 'S-Log3', 'PQ']],
    [
      '6.65',
      [
        'sRGB',
        'Rec.709',
        'Gamma 2.4',
        'HLG',
        'S-Log3',
        'PQ',
        'DaVinci Intermediate',
      ],
    ],
  ] as const) {
    await cursor.fill(stops);
    const outside = rows.filter({ hasText: '公式外推' });
    await expect(outside).toHaveCount(names.length);
    for (const name of names) {
      const row = outside.filter({ hasText: name });
      expect(Number(await row.locator('code').textContent())).toBeGreaterThan(
        1,
      );
      await expect(row.locator('small')).not.toContainText('码值');
    }
  }
  await page.screenshot({
    path: 'artifacts/transfer-nominal-ranges.png',
    fullPage: true,
  });
  await page.getByRole('button', { name: '斜率' }).click();
  await page.getByRole('button', { name: 'Legal range' }).click();
  await expect(rows.filter({ hasText: '公式外推' })).toHaveCount(7);
  const logc4 = rows.filter({ hasText: 'LogC4' });
  await cursor.fill('8.85');
  await expect(logc4).toContainText('码值');
  await cursor.fill('8.9');
  await expect(logc4).toContainText('公式外推');
  await cursor.press('End');
  await expect(cursor).toHaveValue('10');
  await expect(logc4).toContainText('公式外推');
  await page.getByRole('button', { name: '信号', exact: true }).click();
  await expect(page.locator('.figure-host canvas')).toHaveAttribute(
    'data-view',
    'signal',
  );
  await page.screenshot({
    path: 'artifacts/transfer-logc4-plus10.png',
    fullPage: true,
  });
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

test('the 2000 K red tail and the Rec.709 extrapolated slope reach the right edge', async ({
  page,
}) => {
  for (const id of ['blackbody', 'transfer']) {
    await page.goto(`/?fig=${id}`);
    const canvas = page.locator('.figure-host canvas');
    if (id === 'blackbody') {
      await page.locator('#temperature').fill('2000');
      await expect(canvas).toHaveAttribute('data-temperature', '2000');
    } else {
      await page.getByRole('button', { name: '斜率' }).click();
      await page.locator('#exposure').fill('10');
      await expect(
        page.locator('.curve-table > span').filter({ hasText: 'Rec.709' }),
      ).toContainText('7.7566 信号/档');
    }
    // Look for the warm-coloured curve at the high-x end. Both previously
    // disappeared above the canvas well before the end of their input range.
    await expect
      .poll(() =>
        canvas.evaluate((c: HTMLCanvasElement) => {
          const scale = c.width / c.clientWidth;
          const x = Math.floor((c.clientWidth - 25) * scale);
          const pixels = c
            .getContext('2d')!
            .getImageData(
              x,
              Math.ceil(30 * scale),
              Math.ceil(6 * scale),
              Math.floor((c.clientHeight - 100) * scale),
            ).data;
          for (let i = 0; i < pixels.length; i += 4)
            if (
              pixels[i] > 160 &&
              pixels[i] - pixels[i + 1] > 25 &&
              pixels[i + 1] - pixels[i + 2] > 40
            )
              return true;
          return false;
        }),
      )
      .toBe(true);
    await page.screenshot({ path: `artifacts/math-fixes/${id}-range.png` });
  }
});

test('Look tracking follows the colour toggle and exports only applicable metadata', async ({
  page,
}) => {
  await page.goto('/?fig=oklab');
  await openAdvanced(page);
  await page.locator('#target').selectOption('stages');
  await page.locator('#param-redGreen').fill('0');
  await page.locator('#param-blueYellow').fill('0');
  await expect(page.locator('.figure-reading')).toContainText('点色保留输入色');
  await page.locator('#preserve').uncheck();
  await expect(page.locator('.figure-reading')).toContainText(
    '点色显示当前强度下的输出色',
  );
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出对比图' }).click();
  await (await downloading).saveAs('artifacts/math-fixes/look-desaturated.png');
  const matches = await page
    .locator('.export-feedback a[download]')
    .evaluate(async (link: HTMLAnchorElement) => {
      const image = new Image();
      image.src = link.href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(image, 0, 0);
      const actual = ctx.getImageData(40, 818, 1520, 22).data;
      ctx.fillStyle = '#141619';
      ctx.fillRect(0, 818, 1600, 22);
      ctx.font = '13px sans-serif';
      ctx.fillStyle = '#eeeff4';
      ctx.fillText(
        'DISPLAY: sRGB | AXES: Equal-unit axes | DOTS: Flat | COLORS: Actual output',
        40,
        835,
      );
      return ctx
        .getImageData(40, 818, 1520, 22)
        .data.every((v, i) => v === actual[i]);
    });
  expect(matches).toBe(true);
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
    '本晶格内没有节点到达显示白',
  );
  await expect(status).toHaveText(/^输出：ACES 2\.0/);
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
  await expect(page.locator('.figure-highlight')).toContainText('254 / 729');
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
