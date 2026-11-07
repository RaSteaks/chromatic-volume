import { expect, test } from '@playwright/test';
import { colorSources } from '../../src/targets';

test('shared plots show target encoding loss instead of assuming color identity', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('源色彩空间').selectOption('p3');
  await page.locator('[data-target="rec1886"]').click();
  await page.getByLabel('绘图空间').selectOption('xyz-d65');
  await expect(page.locator('#coordinate-values')).toContainText('1.0882');
  await expect(page.locator('#conversion-warning')).toBeVisible();
  await expect(page.locator('.lab-status')).toContainText(
    '点在目标转换中损失颜色',
  );
  const images = () =>
    page
      .locator('canvas')
      .evaluateAll((canvases: HTMLCanvasElement[]) =>
        canvases.map((canvas) => canvas.toDataURL()),
      );
  await expect
    .poll(async () => {
      const [left, right] = await images();
      return left === right;
    })
    .toBe(false);
  await page.screenshot({
    path: 'artifacts/fix-color-loss.png',
    fullPage: true,
  });
  await page.locator('[data-target="p3"]').click();
  await expect(page.locator('#conversion-warning')).toBeHidden();
  await expect(page.locator('.lab-status')).toContainText(
    '0 点在目标转换中损失颜色',
  );
  await expect
    .poll(async () => {
      const [left, right] = await images();
      return left === right;
    })
    .toBe(true);

  // AP1 cannot encode every ProPhoto color with the normative ACEScc negative floor.
  await page.getByLabel('源色彩空间').selectOption('prophoto');
  await page.locator('[data-target="acescc"]').click();
  await page.getByLabel('采样点', { exact: true }).fill('41');
  await page.getByLabel('采样点', { exact: true }).press('Tab');
  await expect(page.locator('#conversion-warning')).toBeVisible();
  const swatches = await page
    .locator('.flat-swatch')
    .evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).backgroundColor),
    );
  expect(swatches[0]).not.toBe(swatches[1]);
});

test('ACEScc shadow readout and neutral HSL/HSV hue use the corrected conversions', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('源色彩空间').selectOption('p3');
  await page.locator('[data-target="acescc"]').click();
  await page.getByLabel('采样密度').selectOption('13');
  await page.getByLabel('采样点', { exact: true }).fill('170');
  await page.getByLabel('采样点', { exact: true }).press('Tab');
  await expect(page.locator('#coordinate-values dd').nth(2)).toHaveText(
    '-0.3060',
  );
  await expect(page.locator('#conversion-warning')).toBeHidden();
  await page.screenshot({ path: 'artifacts/fix-acescc.png', fullPage: true });
  await page.getByLabel('采样密度').selectOption('9');
  await page.getByLabel('源色彩空间').selectOption('rec2020');
  await page.getByLabel('采样点', { exact: true }).fill('365');
  await page.getByLabel('采样点', { exact: true }).press('Tab');
  for (const id of ['hsl', 'hsv']) {
    await page.locator(`[data-target="${id}"]`).click();
    await expect(page.locator('#coordinate-values dd').first()).toHaveText(
      '未定义',
    );
    await expect(page.locator('#coordinate-values dd').nth(1)).toHaveText(
      '0.0000',
    );
    await expect(page.locator('#conversion-warning')).toBeHidden();
  }
});

test('zero-strength teaching stages keep all source spaces coincident', async ({
  page,
}) => {
  await page.goto('/');
  await page.locator('[data-target="stages"]').click();
  await expect(page.getByLabel('绘图空间')).toHaveValue('oklab');
  await expect(page.locator('#plot option[value="native"]')).toBeDisabled();
  await page.getByLabel('处理强度', { exact: true }).fill('0');
  for (const source of colorSources) {
    await page.getByLabel('源色彩空间').selectOption(source.id);
    await expect
      .poll(
        async () => {
          const [left, right] = await page
            .locator('canvas')
            .evaluateAll((canvases: HTMLCanvasElement[]) =>
              canvases.map((canvas) => canvas.toDataURL()),
            );
          return left === right;
        },
        { message: `${source.name} must stay coincident at zero strength` },
      )
      .toBe(true);
  }
  await page.getByLabel('源色彩空间').selectOption('srgb-linear');
  await page.screenshot({
    path: 'artifacts/fix-stage-bypass.png',
    fullPage: true,
  });
  await page.getByLabel('处理强度', { exact: true }).fill('1');
  await page.locator('#param-redGreen').fill('1.7');
  await expect
    .poll(async () => {
      const [left, right] = await page
        .locator('canvas')
        .evaluateAll((canvases: HTMLCanvasElement[]) =>
          canvases.map((canvas) => canvas.toDataURL()),
        );
      return left === right;
    })
    .toBe(false);
});

test('native and common plots expose numeric guides; export records its actual plot', async ({
  page,
}) => {
  await page.goto('/');
  for (const [id, labels] of [
    ['lab', 'a* 100；L* 100；b* 100'],
    ['luv', 'u* 140；L* 100；v* 140'],
    ['oklch', 'C cos h 0.4；L 1；C sin h 0.4'],
    ['acescc', 'R 0.56；G 0.56；B 0.56'],
  ]) {
    await page.locator(`[data-target="${id}"]`).click();
    await expect(page.locator('canvas').last()).toHaveAttribute(
      'aria-description',
      new RegExp(labels.replaceAll('*', '\\*')),
    );
  }
  await page.locator('[data-target="lab"]').click();
  await page.screenshot({
    path: 'artifacts/fix-native-lab.png',
    fullPage: true,
  });
  await page.locator('[data-target="oklab"]').click();
  await page.getByLabel('绘图空间').selectOption('xyz-d65');
  await page.getByLabel('严格等比例', { exact: true }).uncheck();
  await page.getByLabel('无光照点色', { exact: true }).uncheck();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出对比图' }).click();
  const result = await download;
  await result.saveAs('artifacts/fix-export-xyz.png');
  // Inspect the generated PNG itself: both plot captions and the all-mode view
  // metadata must occupy their reserved text bands, outside the point cloud.
  const textBands = await page
    .locator('.export-feedback a[download]')
    .evaluate(async (link: HTMLAnchorElement) => {
      const image = new Image();
      image.src = link.href;
      await image.decode();
      const canvas = document.createElement('canvas');
      canvas.width = image.width;
      canvas.height = image.height;
      const context = canvas.getContext('2d')!;
      context.drawImage(image, 0, 0);
      return [
        [40, 68, 760, 18],
        [840, 68, 720, 18],
        [40, 821, 1520, 18],
      ].map(([x, y, width, height]) => {
        const pixels = context.getImageData(x, y, width, height).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] > 100 && pixels[i + 1] > 100 && pixels[i + 2] > 100)
            count++;
        return count;
      });
    });
  textBands.forEach((count) => expect(count).toBeGreaterThan(100));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({
    path: 'artifacts/fix-science-mobile.png',
    fullPage: true,
  });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
