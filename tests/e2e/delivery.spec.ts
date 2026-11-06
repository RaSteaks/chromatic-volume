import { expect, test, type Page } from '@playwright/test';

const viewports = [
  { width: 360, height: 800 },
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1280, height: 800 },
  { width: 1440, height: 900 },
  { width: 844, height: 390 },
];

async function embed(page: Page, width = 390, height = 600, downloads = true) {
  await page.goto('/');
  const source = new URL('/', page.url());
  source.hostname = source.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  await page.setContent(`
    <style>body { margin: 0 } iframe { display: block; border: 0 }</style>
    <iframe title="博客中的完整网站" width="${width}" height="${height}"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox ${downloads ? 'allow-downloads' : ''}"
      src="${source.href}"></iframe>
  `);
  const frame = page.frameLocator('iframe');
  await expect(frame.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '729',
  );
  return frame;
}

for (const viewport of viewports) {
  test(`full website fits ${viewport.width}×${viewport.height} standalone and embedded`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    await expect(page.locator('canvas').last()).toHaveAttribute(
      'data-points',
      '729',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `artifacts/delivery-site-${viewport.width}.png`,
      fullPage: true,
    });

    // Deliberately keep the parent desktop-sized: the website must respond to the iframe's viewport.
    await page.setViewportSize({ width: 1500, height: 1050 });
    const frame = await embed(page, viewport.width, viewport.height);
    expect(await frame.locator('html').evaluate(() => innerWidth)).toBe(
      viewport.width,
    );
    expect(
      await frame
        .locator('html')
        .evaluate(() => document.documentElement.scrollWidth <= innerWidth),
    ).toBe(true);
    const canvas = frame.locator('canvas').first();
    const camera = await canvas.getAttribute('data-camera');
    await canvas.press('ArrowRight');
    await expect(canvas).not.toHaveAttribute('data-camera', camera!);
    expect(
      await canvas.evaluate((node) => getComputedStyle(node).outlineStyle),
    ).toBe('solid');
    await page.screenshot({
      path: `artifacts/delivery-iframe-${viewport.width}.png`,
      fullPage: true,
    });
    const originalUrl = page.url();
    await frame.getByRole('button', { name: '俯视', exact: true }).click();
    expect(page.url()).toBe(originalUrl);
    const status = frame.locator('.lab-status');
    await status.scrollIntoViewIfNeeded();
    await expect(status).toBeInViewport();
  });

  test(`automatic preview fits ${viewport.width}×${viewport.height}`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    const requested: string[] = [];
    page.on('request', (request) => requested.push(request.url()));
    await page.goto('/preview?motion=off');
    await expect(page.locator('.preview-page')).toHaveAttribute(
      'data-ready',
      'true',
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollHeight <= innerHeight,
      ),
    ).toBe(true);
    await expect(page.locator('canvas')).toHaveCount(2);
    expect(requested.some((url) => url.includes('/src/main.ts'))).toBe(false);
    await page.screenshot({
      path: `artifacts/delivery-preview-${viewport.width}.png`,
    });
  });
}

test('preview has direct, refreshable static entries and a 1600×1000 cover', async ({
  page,
  request,
}) => {
  for (const route of ['/preview', '/preview/', '/preview/index.html']) {
    await page.goto(`${route}?motion=off`);
    await expect(page.locator('.preview-page')).toHaveAttribute(
      'data-ready',
      'true',
    );
    await page.reload();
    await expect(page.locator('.preview-page')).toHaveAttribute(
      'data-ready',
      'true',
    );
  }
  const entry = await request.get('/lab-entry.json');
  expect(await entry.json()).toMatchObject({
    url: '/',
    preview_url: '/preview',
    cover_image: '/cover.png',
  });
  const cover = await request.get('/cover.png');
  expect(cover.headers()['content-type']).toContain('image/png');
  const png = await cover.body();
  expect(png.readUInt32BE(16)).toBe(1600);
  expect(png.readUInt32BE(20)).toBe(1000);
});

test('reduced motion uses the cover and stops a running preview', async ({
  page,
}) => {
  await page.goto('/preview');
  await expect(page.locator('.preview-page')).toHaveAttribute(
    'data-motion',
    'running',
  );
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '729',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(page.locator('.preview-page')).toHaveAttribute(
    'data-motion',
    'paused',
  );
  await expect(page.locator('.preview-cover')).toBeVisible();
  await expect(page.locator('.preview-status')).toContainText('静态封面');
  const camera = await page
    .locator('canvas')
    .first()
    .getAttribute('data-camera');
  await page.waitForTimeout(200);
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-camera',
    camera!,
  );
  await page.screenshot({ path: 'artifacts/delivery-reduced-motion.png' });
  await page.reload();
  await expect(page.locator('.preview-cover')).toBeVisible();
  await expect(page.locator('canvas').first()).not.toHaveAttribute(
    'data-points',
  );
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect(page.locator('.preview-page')).toHaveAttribute(
    'data-motion',
    'running',
  );
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '729',
  );
});

test('the card preview plays inside a cross-origin iframe and pauses offscreen', async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  const source = new URL('/preview', page.url());
  source.hostname = 'localhost';
  await page.setContent(`
    <style>body { margin: 0 } iframe { display: block; border: 0 }</style>
    <iframe title="动态作品卡片" src="${source.href}" width="1280" height="800"
      sandbox="allow-scripts allow-same-origin"></iframe>
    <footer style="margin-top: 1200px">页面底部</footer>
  `);
  const preview = page.frameLocator('iframe');
  await expect(preview.locator('.preview-page')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(preview.locator('.preview-page')).toHaveAttribute(
    'data-motion',
    'running',
  );
  await expect(preview.locator('iframe, button, input, select')).toHaveCount(0);
  const camera = await preview
    .locator('canvas')
    .first()
    .getAttribute('data-camera');
  await expect(preview.locator('canvas').first()).not.toHaveAttribute(
    'data-camera',
    camera!,
  );
  await page
    .locator('iframe')
    .screenshot({ path: 'artifacts/delivery-preview-iframe.png' });
  await page.locator('footer').scrollIntoViewIfNeeded();
  await expect(preview.locator('.preview-page')).toHaveAttribute(
    'data-motion',
    'paused',
  );
  await page.locator('iframe').scrollIntoViewIfNeeded();
  await expect(preview.locator('.preview-page')).toHaveAttribute(
    'data-motion',
    'running',
  );
});

test('failed and stalled preview modules leave a cover and recovery actions', async ({
  page,
}) => {
  const previewModule =
    /\/(?:src\/preview\.ts|assets\/preview-[^/]+\.js)(?:\?.*)?$/;
  await page.route(previewModule, (route) => route.abort());
  await page.goto('/preview');
  await expect(page.getByRole('alert')).toContainText('动态预览暂不可用');
  await expect(page.getByRole('button', { name: '重新加载' })).toBeVisible();
  await expect(
    page.getByRole('link', { name: '独立打开工作台' }),
  ).toHaveAttribute('target', '_blank');
  await page.screenshot({ path: 'artifacts/delivery-load-failure.png' });
  await page.unroute(previewModule);
  await page.route(previewModule, async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 13000));
    await route.continue();
  });
  await page.goto('/preview', { waitUntil: 'commit' });
  await expect(page.getByRole('alert')).toContainText('动态预览暂不可用', {
    timeout: 15000,
  });
});

test('LUT import and PNG download work in a real cross-origin sandboxed iframe', async ({
  page,
}) => {
  const frame = await embed(page, 1000, 800);
  await frame.locator('[data-target="lut"]').click();
  await expect(frame.locator('.empty-target')).toBeVisible();
  for (const side of ['输入', '输出']) {
    await frame
      .getByLabel(`LUT ${side}色域`, { exact: true })
      .selectOption('srgb-linear');
    await frame
      .getByLabel(`LUT ${side} Gamma`, { exact: true })
      .selectOption('srgb');
  }
  await frame.locator('#lut-file').setInputFiles({
    name: 'invalid.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from('LUT_3D_SIZE 2\n0 0 0'),
  });
  await expect(frame.locator('.lut-feedback')).toContainText('采样数量不符');
  await frame.locator('#lut-file').setInputFiles({
    name: 'identity.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1',
    ),
  });
  await expect(frame.locator('.empty-target')).toBeHidden();
  const downloadPromise = page.waitForEvent('download');
  await frame.getByRole('button', { name: '导出对比图' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('chromatic-volume.png');
  await download.saveAs('artifacts/delivery-iframe-export.png');
  expect(await download.failure()).toBeNull();
});

test('download recovery persists when the iframe does not allow downloads', async ({
  page,
}) => {
  const frame = await embed(page, 390, 600, false);
  await frame.getByLabel('目标模型', { exact: true }).selectOption('hsv');
  await frame.getByRole('button', { name: '导出对比图' }).click();
  await expect(frame.locator('.export-feedback')).toContainText(
    '如果下载未开始',
  );
  await expect(frame.getByRole('link', { name: '下载 PNG' })).toHaveAttribute(
    'href',
    /^blob:/,
  );
  const popupPromise = page.waitForEvent('popup');
  await frame.getByRole('link', { name: '独立打开后导出' }).click();
  const popup = await popupPromise;
  await expect(popup.getByText('目标：HSV', { exact: true })).toBeVisible();
  await popup.reload();
  await expect(popup.getByText('目标：HSV', { exact: true })).toBeVisible();
  await popup.close();
  await page.screenshot({
    path: 'artifacts/delivery-download-recovery.png',
    fullPage: true,
  });
});
