import { fullSizeCube } from '../fixtures/cube';
import { expect, test, type Page } from '@playwright/test';
import { colorTargets } from '../../src/targets';
import { defaultState } from '../../src/model';
import { stateUrl } from '../../src/state';

async function ready(page: Page) {
  await page.goto('/');
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '729',
  );
}
async function image(page: Page, index: number) {
  return page
    .locator('canvas')
    .nth(index)
    .evaluate((canvas: HTMLCanvasElement) => canvas.toDataURL());
}
async function changeRange(page: Page, id: string, value: string) {
  await page.locator(`#${id}`).fill(value);
}

test('renders just the workbench and all available target models', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await ready(page);
  await expect(page.locator('header')).toHaveCount(0);
  await expect(page.locator('.hero,.guide,.presets')).toHaveCount(0);
  for (const target of colorTargets) {
    await page.locator(`[data-target="${target.id}"]`).click();
    await expect(page.locator('canvas').last()).toHaveAttribute(
      'data-model',
      target.id,
    );
    await expect(page.locator('.volume-heading')).toContainText([
      '源：sRGB',
      `目标：${target.name}`,
    ]);
    await expect(page.locator('#coordinate-values')).not.toContainText(
      'Infinity',
    );
    await expect(page.locator('canvas').last()).toHaveAttribute(
      'data-points',
      '729',
    );
  }
  expect(errors).toEqual([]);
  await page.locator('[data-target="oklab"]').click();
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-model',
    'oklab',
  );
  await page.screenshot({ path: 'artifacts/desktop.png', fullPage: true });
});
test('right drag follows the pointer and both views stay synchronized', async ({
  page,
}) => {
  await ready(page);
  const canvas = page.locator('canvas').first();
  const before = (await canvas.getAttribute('data-camera'))!;
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + box.width * 0.5, box.y + box.height * 0.5);
  await page.mouse.down();
  await page.mouse.move(
    box.x + box.width * 0.5 + 45,
    box.y + box.height * 0.5,
    { steps: 8 },
  );
  await page.mouse.up();
  await expect(canvas).not.toHaveAttribute('data-camera', before);
  const after = (await canvas.getAttribute('data-camera'))!;
  expect(Number(after.split(',')[0])).toBeLessThan(
    Number(before.split(',')[0]),
  );
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-camera',
    after,
  );
  await canvas.press('ArrowRight');
  await expect(canvas).not.toHaveAttribute('data-camera', after);
  await canvas.press('Home');
  await expect(canvas).toHaveAttribute('data-camera', '0.785,0.570,1.000');
  await canvas.press('+');
  await expect(page.locator('#zoom')).toHaveValue('1.1');
});
test('sRGB identity matches pixels; Oklab changes geometry and reports exact coordinates', async ({
  page,
}) => {
  await ready(page);
  await expect(page.locator('#coordinate-values')).toContainText('0.6280');
  await page.locator('[data-target="srgb"]').click();
  await expect
    .poll(async () => (await image(page, 0)) === (await image(page, 1)))
    .toBe(true);
  await page.locator('[data-target="oklab"]').click();
  await expect
    .poll(async () => (await image(page, 0)) !== (await image(page, 1)))
    .toBe(true);
  await page.getByLabel('采样点', { exact: true }).fill('1');
  await page.getByLabel('采样点', { exact: true }).press('Tab');
  await expect(page.locator('#input-values')).toHaveText(
    '0.0000 / 0.0000 / 0.0000',
  );
  await changeRange(page, 'strength', '0');
  await expect(page.locator('.canvas-caption').last()).toContainText(
    '图形插值 0%',
  );
});
test('custom stages alter output, bypass and zero strength restore it', async ({
  page,
}) => {
  await ready(page);
  await page.locator('[data-target="stages"]').click();
  await changeRange(page, 'param-redGreen', '1.7');
  await expect
    .poll(async () => (await image(page, 0)) !== (await image(page, 1)))
    .toBe(true);
  await page.getByLabel('启用色彩饱和度', { exact: true }).uncheck();
  await expect(page.locator('#param-redGreen')).toBeDisabled();
  await expect
    .poll(async () => (await image(page, 0)) === (await image(page, 1)))
    .toBe(true);
  await page.getByLabel('启用色彩饱和度', { exact: true }).check();
  await page.getByRole('button', { name: '后移', exact: true }).click();
  await expect(page.locator('.compact-stage-list li').nth(1)).toHaveAttribute(
    'data-stage',
    'saturation',
  );
  await changeRange(page, 'strength', '0');
  await expect
    .poll(async () => (await image(page, 0)) === (await image(page, 1)))
    .toBe(true);
});
test('LUT loading has empty, error and successful target states', async ({
  page,
}) => {
  await ready(page);
  await page.locator('[data-target="lut"]').click();
  await page
    .getByLabel('LUT 输入色域', { exact: true })
    .selectOption('srgb-linear');
  await page.getByLabel('LUT 输入 Gamma', { exact: true }).selectOption('srgb');
  await page
    .getByLabel('LUT 输出色域', { exact: true })
    .selectOption('srgb-linear');
  await page.getByLabel('LUT 输出 Gamma', { exact: true }).selectOption('srgb');
  await expect(page.locator('.empty-target')).toBeVisible();
  await page.locator('#lut-file').setInputFiles({
    name: 'bad.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from('LUT_3D_SIZE 2\n0 0 0'),
  });
  await expect(page.locator('.lut-feedback')).toContainText('采样数量不符');
  const swap =
    'LUT_3D_SIZE 2\n0 0 0\n0 1 0\n1 0 0\n1 1 0\n0 0 1\n0 1 1\n1 0 1\n1 1 1';
  await page.locator('#lut-file').setInputFiles({
    name: 'swap.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(swap),
  });
  await expect(page.locator('.empty-target')).toBeHidden();
  await expect(page.locator('#coordinate-values')).toContainText('1.0000');
  await expect(page.locator('#coordinate-values dd').nth(0)).toHaveText(
    '0.0000',
  );
  await expect(page.locator('#coordinate-values dd').nth(1)).toHaveText(
    '1.0000',
  );
});
test('preview automatically presents the paired volumes without a device shell', async ({
  page,
}) => {
  await page.goto('/preview');
  await expect(page.locator('.preview-page')).toHaveAttribute(
    'data-ready',
    'true',
  );
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '729',
  );
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-points',
    '729',
  );
  await expect(page.locator('iframe, button, input, select')).toHaveCount(0);
  const camera = await page
    .locator('canvas')
    .first()
    .getAttribute('data-camera');
  await expect(page.locator('canvas').first()).not.toHaveAttribute(
    'data-camera',
    camera!,
  );
  await page.screenshot({ path: 'artifacts/preview.png', fullPage: true });
});
test('can run inside a cross-origin iframe', async ({ page }) => {
  await page.goto('/');
  const source = new URL('/?embed=1', page.url());
  source.hostname = source.hostname === 'localhost' ? '127.0.0.1' : 'localhost';
  await page.setContent(
    `<iframe title="外部嵌入" src="${source.href}" width="1000" height="800"></iframe>`,
  );
  const frame = page.frameLocator('iframe');
  await expect(
    frame.getByRole('heading', { name: '色体积工作台' }),
  ).toBeVisible();
  await frame.locator('[data-target="lab"]').click();
  await expect(
    frame.getByText('目标：CIELAB · D50', { exact: true }),
  ).toBeVisible();
});
test('mobile, reduced motion, parameter restore and malformed state recovery', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const state = defaultState();
  state.target = 'hsl';
  state.density = 5;
  await page.goto(stateUrl(state, test.info().project.use.baseURL!));
  await expect(page.getByText('目标：HSL', { exact: true })).toBeVisible();
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '125',
  );
  await page.getByLabel('目标模型', { exact: true }).selectOption('oklab');
  await expect(page.getByRole('button', { name: '自动旋转' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-model',
    'oklab',
  );
  await page.screenshot({ path: 'artifacts/mobile.png', fullPage: true });
  await page.goto('/?state=broken');
  await expect(page.locator('.toast')).toContainText('分享参数无效');
  await expect(page.getByText('目标：Oklab', { exact: true })).toBeVisible();
});
test('exports the actual comparison as a PNG', async ({ page }) => {
  await ready(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '导出对比图' }).click();
  const result = await download;
  expect(result.suggestedFilename()).toBe('chromatic-volume.png');
  await result.saveAs('artifacts/export.png');
});

test('source selection resamples colors, coordinates, display and URL state', async ({
  page,
}) => {
  await ready(page);
  await page.getByLabel('采样点', { exact: true }).fill('325');
  await page.getByLabel('采样点', { exact: true }).press('Tab');
  const original = await image(page, 0);
  const originalCoords = await page.locator('#coordinate-values').innerText();
  await page.getByLabel('源色彩空间').selectOption('p3');
  await expect(page.getByText('源：Display P3', { exact: true })).toBeVisible();
  await expect
    .poll(() => page.locator('#coordinate-values').innerText())
    .not.toBe(originalCoords);
  await expect.poll(() => image(page, 0)).not.toBe(original);
  await page.screenshot({
    path: 'artifacts/source-desktop.png',
    fullPage: true,
  });
  await page.locator('[data-target="p3"]').click();
  await expect
    .poll(async () => (await image(page, 0)) === (await image(page, 1)))
    .toBe(true);
  await page.getByLabel('源色彩空间').selectOption('acescc');
  await page.getByLabel('采样点', { exact: true }).fill('1');
  await page.getByLabel('采样点', { exact: true }).press('Tab');
  await expect(page.locator('#input-values')).toContainText('-0.3584');
  await page.getByLabel('采样密度').selectOption('5');
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-points',
    '125',
  );
  await expect(page.locator('#input-values')).toContainText('-0.3584');
  const state = defaultState();
  state.source = 'rec2020';
  state.target = 'lab';
  await page.goto(stateUrl(state, test.info().project.use.baseURL!));
  await expect(page.getByLabel('源色彩空间')).toHaveValue('rec2020');
  await expect(page.getByText('源：Rec.2020', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: '全部重置', exact: true }).click();
  await expect(page.getByLabel('源色彩空间')).toHaveValue('srgb');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByLabel('源色彩空间').selectOption('prophoto');
  await page.getByLabel('目标模型', { exact: true }).selectOption('oklab');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'artifacts/source-mobile.png',
    fullPage: true,
  });
});

test('LUT requires explicit contracts and uses matching plot coordinates', async ({
  page,
}) => {
  await ready(page);
  await page.locator('[data-target="lut"]').click();
  const fixture =
    'LUT_3D_SIZE 2\n0 0 0\n1 0 0\n0 1 0\n1 1 0\n0 0 1\n1 0 1\n0 1 1\n1 1 1';
  await page.locator('#lut-file').setInputFiles({
    name: 'identity.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(fixture),
  });
  await expect(page.locator('.empty-target')).toBeVisible();
  await expect(page.locator('.empty-target')).toContainText('指定 LUT');
  for (const side of ['输入', '输出']) {
    await page
      .getByLabel(`LUT ${side}色域`, { exact: true })
      .selectOption('srgb-linear');
    await page
      .getByLabel(`LUT ${side} Gamma`, { exact: true })
      .selectOption('gamma24');
  }
  await expect(page.locator('.empty-target')).toBeHidden();
  await expect(page.getByLabel('绘图空间')).toHaveValue('oklab');
  await expect
    .poll(async () => (await image(page, 0)) === (await image(page, 1)))
    .toBe(true);
  await page.getByLabel('绘图空间').selectOption('xyz-d65');
  await expect(page.locator('canvas').first()).toHaveAttribute(
    'data-plot',
    'xyz-d65',
  );
  await expect(page.locator('canvas').last()).toHaveAttribute(
    'data-plot',
    'xyz-d65',
  );
  await page
    .getByLabel('LUT 输出 Gamma', { exact: true })
    .selectOption('bt1886');
  await page.getByLabel('LUT 输出黑位 cd/m²', { exact: true }).fill('0.1');
  await expect
    .poll(async () => (await image(page, 0)) !== (await image(page, 1)))
    .toBe(true);
  await page.getByLabel('处理强度', { exact: true }).fill('0');
  await expect
    .poll(async () => (await image(page, 0)) === (await image(page, 1)))
    .toBe(true);
  await page.getByLabel('处理强度', { exact: true }).fill('1');
  await page.getByLabel('源色彩空间').selectOption('p3');
  await expect(page.locator('.lab-status')).toContainText('DOMAIN');
  await page.screenshot({
    path: 'artifacts/lut-managed-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await expect
    .poll(() =>
      page
        .locator('canvas')
        .last()
        .evaluate((canvas: HTMLCanvasElement) => {
          const data = canvas
            .getContext('2d')!
            .getImageData(0, 0, canvas.width, canvas.height).data;
          let colored = 0;
          for (let i = 0; i < data.length; i += 4)
            if (
              Math.max(data[i], data[i + 1], data[i + 2]) -
                Math.min(data[i], data[i + 1], data[i + 2]) >
              40
            )
              colored++;
          return colored;
        }),
    )
    .toBeGreaterThan(100);
  await page.screenshot({
    path: 'artifacts/lut-managed-mobile.png',
    fullPage: true,
  });
});

for (const size of [33, 65] as const) {
  test(`imports and evaluates a full ${size}-point LUT`, async ({ page }) => {
    await ready(page);
    await page.locator('[data-target="lut"]').click();
    for (const side of ['输入', '输出']) {
      await page
        .getByLabel(`LUT ${side}色域`, { exact: true })
        .selectOption('srgb-linear');
      await page
        .getByLabel(`LUT ${side} Gamma`, { exact: true })
        .selectOption('gamma24');
    }
    await page.locator('#lut-file').setInputFiles({
      name: `verified-${size}.cube`,
      mimeType: 'text/plain',
      buffer: Buffer.from(fullSizeCube(size)),
    });
    await expect(page.locator('.empty-target')).toBeHidden();
    await expect(page.locator('.geometry-note')).toContainText(`${size}³`);
    await expect(page.locator('.geometry-note')).toContainText(
      size === 33 ? '35,937' : '274,625',
    );
    const values = page.locator('#coordinate-values dd');
    await expect(values.nth(0)).toHaveText('0.1000');
    await expect(values.nth(1)).toHaveText('0.2000');
    await expect(values.nth(2)).toHaveText('0.6500');
    await page.getByLabel('采样密度').selectOption('5');
    await page.getByLabel('采样点', { exact: true }).fill('101');
    await page.getByLabel('采样点', { exact: true }).press('Tab');
    await expect(values.nth(2)).toHaveText('0.6500');
    await expect(page.locator('.geometry-note')).toContainText(
      size === 33 ? '35,937' : '274,625',
    );
    await page.locator('#lut-file').setInputFiles({
      name: 'truncated.cube',
      mimeType: 'text/plain',
      buffer: Buffer.from(`LUT_3D_SIZE ${size}\n0 0 0`),
    });
    await expect(page.locator('.lut-feedback')).toContainText('采样数量不符');
    await expect(page.locator('.geometry-note')).toContainText(
      `verified-${size}.cube`,
    );
    await page.screenshot({
      path: `artifacts/lut-${size}.png`,
      fullPage: true,
    });
  });
}

test('scientific view exposes flat swatches, equal axes, interpolation and camera profiles', async ({
  page,
}) => {
  await ready(page);
  await expect(page.getByLabel('严格等比例', { exact: true })).toBeChecked();
  await expect(page.getByLabel('无光照点色', { exact: true })).toBeChecked();
  const pureRed = () =>
    page
      .locator('canvas')
      .first()
      .evaluate((canvas: HTMLCanvasElement) => {
        const pixels = canvas
          .getContext('2d')!
          .getImageData(0, 0, canvas.width, canvas.height).data;
        let count = 0;
        for (let i = 0; i < pixels.length; i += 4)
          if (pixels[i] === 255 && pixels[i + 1] === 0 && pixels[i + 2] === 0)
            count++;
        return count;
      });
  const flatCount = await pureRed();
  expect(flatCount).toBeGreaterThan(20);
  await page.getByLabel('无光照点色', { exact: true }).uncheck();
  await expect.poll(pureRed).toBeLessThan(flatCount);
  await page.getByLabel('无光照点色', { exact: true }).check();
  await expect(page.locator('.flat-swatch').first()).toHaveCSS(
    'background-color',
    'rgb(255, 0, 0)',
  );
  await page.locator('[data-target="lut"]').click();
  await page.locator('#lut-file').setInputFiles({
    name: 'nonlinear.cube',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'LUT_3D_SIZE 2\n0 0 0\n0 0 0\n0 0 0\n1 0 0\n0 0 0\n0 0 1\n0 1 0\n1 1 1',
    ),
  });
  await page
    .getByLabel('LUT 输出色域', { exact: true })
    .selectOption('srgb-linear');
  await page
    .getByLabel('LUT 输出 Gamma', { exact: true })
    .selectOption('gamma24');
  await page.getByLabel('采样点', { exact: true }).fill('365');
  await page.getByLabel('采样点', { exact: true }).press('Tab');
  for (let i = 0; i < 11; i++) {
    await page
      .getByLabel('LUT 输入摄影机预设', { exact: true })
      .selectOption(String(i));
    await expect(page.locator('.empty-target')).toBeHidden();
    await expect(page.locator('#lut-input-values')).not.toContainText('NaN');
  }
  await page
    .getByLabel('LUT 输入摄影机预设', { exact: true })
    .selectOption('1');
  await expect(page.getByLabel('LUT 输入色域', { exact: true })).toHaveValue(
    'camera-arri4',
  );
  await expect(page.getByLabel('LUT 输入 Gamma', { exact: true })).toHaveValue(
    'logc4',
  );
  const tetra = await page.locator('#coordinate-values').innerText();
  await page
    .getByLabel('LUT 插值方式', { exact: true })
    .selectOption('trilinear');
  await expect(page.locator('#coordinate-values')).not.toHaveText(tetra);
  await page
    .getByLabel('LUT 插值方式', { exact: true })
    .selectOption('tetrahedral');
  await page.screenshot({
    path: 'artifacts/scientific-camera-desktop.png',
    fullPage: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: 'artifacts/scientific-camera-mobile.png',
    fullPage: true,
  });
});
