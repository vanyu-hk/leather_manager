import { expect, test, type Page } from '@playwright/test';

type Material = { id: string; name: string; type: string; color: string; unit: string; currentQuantity: string; lowStockThreshold: string | null };

async function interceptMaterials(page: Page) {
  const materials: Material[] = [
    { id: 'seed-1', name: '植鞣革', type: '牛皮', color: '原色', unit: '平方尺', currentQuantity: '8.00', lowStockThreshold: '2.00' },
    { id: 'seed-2', name: '黄铜扣', type: '五金', color: '黄铜色', unit: '个', currentQuantity: '20.00', lowStockThreshold: '5.00' },
  ];
  await page.route('**/api/v1/materials**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const idMatch = url.pathname.match(/\/materials\/([^/]+)(?:\/adjustments)?$/);
    if (request.method() === 'GET') {
      let rows = [...materials];
      const q = url.searchParams.get('q'); const type = url.searchParams.get('type'); const color = url.searchParams.get('color'); const status = url.searchParams.get('stockStatus');
      if (q) rows = rows.filter((item) => [item.name, item.type, item.color].some((value) => value.includes(q)));
      if (type) rows = rows.filter((item) => item.type === type);
      if (color) rows = rows.filter((item) => item.color === color);
      if (status === 'NORMAL') rows = rows.filter((item) => Number(item.currentQuantity) > Number(item.lowStockThreshold ?? -1));
      return route.fulfill({ json: rows });
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/adjustments') && idMatch) {
      const item = materials.find((candidate) => candidate.id === idMatch[1])!;
      const body = request.postDataJSON() as { quantityDelta: string };
      item.currentQuantity = (Number(item.currentQuantity) + Number(body.quantityDelta)).toFixed(2);
      return route.fulfill({ json: { ok: true } });
    }
    if (request.method() === 'POST') {
      const body = request.postDataJSON() as Record<string, string>;
      const created: Material = { id: `created-${materials.length}`, name: body.name, type: body.type, color: body.color, unit: body.unit, currentQuantity: Number(body.initialQuantity).toFixed(2), lowStockThreshold: body.lowStockThreshold || null };
      materials.push(created);
      return route.fulfill({ status: 201, json: created });
    }
    if (request.method() === 'DELETE' && idMatch) {
      const index = materials.findIndex((item) => item.id === idMatch[1]);
      materials.splice(index, 1);
      return route.fulfill({ json: { ok: true } });
    }
    return route.fallback();
  });
}

test('deep links, traps modal focus, and completes the material inventory flow', async ({ page }) => {
  await interceptMaterials(page);
  await page.goto('/materials?q=%E6%A4%8D%E9%9E%A3');
  await expect(page.getByRole('heading', { name: '材料库存' })).toBeVisible();
  await expect(page.getByRole('searchbox', { name: '搜索材料' })).toHaveValue('植鞣');
  await expect(page.getByText('植鞣革', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('searchbox', { name: '搜索材料' })).toHaveValue('植鞣');

  const opener = page.getByRole('button', { name: '新增材料' });
  await opener.click();
  const dialog = page.getByRole('dialog', { name: '新增材料' });
  await expect(dialog.getByLabel('材料名称')).toBeFocused();
  await dialog.getByRole('button', { name: '关闭' }).focus();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: '保存材料' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: '关闭' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(opener).toBeFocused();

  await page.getByRole('searchbox', { name: '搜索材料' }).fill('');
  await opener.click();
  await dialog.getByLabel('材料名称').fill('马缰革');
  await dialog.getByLabel('材料类型').fill('牛皮');
  await dialog.getByLabel('颜色').fill('棕色');
  await dialog.getByLabel('计量单位').fill('平方尺');
  await dialog.getByLabel('初始库存').fill('5.5');
  await dialog.getByRole('button', { name: '保存材料' }).click();
  await expect(page.getByRole('status')).toContainText('材料已新增');

  await page.getByRole('searchbox', { name: '搜索材料' }).fill('马缰');
  await expect(page).toHaveURL(/q=%E9%A9%AC%E7%BC%B0/);
  const card = page.getByRole('article').filter({ hasText: '马缰革' });
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: '调整库存' }).click();
  await page.getByLabel('调整数量').fill('-1.25');
  await page.getByRole('button', { name: '确认调整' }).click();
  await expect(page.getByRole('status')).toContainText('库存已调整');
  await expect(card).toContainText('4.25 平方尺');

  await card.getByRole('button', { name: '删除' }).click();
  await page.getByRole('dialog', { name: '确认删除材料' }).getByRole('button', { name: '确认删除' }).click();
  await expect(page.getByRole('status')).toContainText('材料已删除');
  await expect(card).toHaveCount(0);

  await page.getByRole('link', { name: '仪表盘' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/materials\?q=/);
  await expect(page.getByRole('searchbox', { name: '搜索材料' })).toHaveValue('马缰');
});

test('390px viewport has no horizontal document overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await interceptMaterials(page);
  await page.goto('/materials');
  await expect(page.getByRole('navigation', { name: '移动端主导航' })).toBeVisible();
  const dimensions = await page.evaluate(() => ({ scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.innerWidth);
});
