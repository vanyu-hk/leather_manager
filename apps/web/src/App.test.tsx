import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';

const material = { id: 'material-1', name: '植鞣革', type: '牛皮', color: '原色', unit: '平方尺', currentQuantity: '12.50', lowStockThreshold: '3.00' };

function json(body: unknown, status = 200) {
  return Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));
}

function mockViewport(mobile: boolean) {
  vi.stubGlobal('matchMedia', vi.fn().mockImplementation((query: string) => ({
    matches: mobile && query.includes('max-width'), media: query, onchange: null,
    addEventListener: vi.fn(), removeEventListener: vi.fn(), addListener: vi.fn(), removeListener: vi.fn(), dispatchEvent: vi.fn(),
  })));
}

beforeEach(() => {
  mockViewport(false);
  vi.stubGlobal('fetch', vi.fn(() => json([material])));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('材料库存', () => {
it('loads real material fields and sends all selected filters', async () => {
  const user = userEvent.setup();
  render(<App />);
  expect(await screen.findByText('植鞣革')).toBeVisible();
  expect(screen.getByText('12.50 平方尺')).toBeVisible();
  await user.type(screen.getByRole('searchbox', { name: '搜索材料' }), '植鞣');
  await user.selectOptions(screen.getByLabelText('材料类型'), '牛皮');
  await user.selectOptions(screen.getByLabelText('颜色'), '原色');
  await user.selectOptions(screen.getByLabelText('库存状态'), 'NORMAL');
  await waitFor(() => {
    const latest = String(vi.mocked(fetch).mock.calls.at(-1)?.[0]);
    expect(latest).toContain('q=%E6%A4%8D%E9%9E%A3');
    expect(latest).toContain('type=%E7%89%9B%E7%9A%AE');
    expect(latest).toContain('color=%E5%8E%9F%E8%89%B2');
    expect(latest).toContain('stockStatus=NORMAL');
  });
});

it('creates a material and only reports success after the API succeeds', async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockImplementationOnce(() => json([])).mockImplementationOnce((_url, init) => {
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toMatchObject({ name: '马缰革', type: '牛皮', color: '棕色', unit: '平方尺', initialQuantity: '5.5' });
    return json({ ...material, name: '马缰革' });
  }).mockImplementation(() => json([{ ...material, name: '马缰革' }]));
  render(<App />);
  await screen.findByText('还没有材料');
  await user.click(screen.getByRole('button', { name: '新增材料' }));
  await user.type(screen.getByLabelText('材料名称'), '马缰革');
  await user.type(screen.getByLabelText('材料类型', { selector: 'input' }), '牛皮');
  await user.type(screen.getByLabelText('颜色', { selector: 'input' }), '棕色');
  await user.type(screen.getByLabelText('计量单位'), '平方尺');
  await user.type(screen.getByLabelText('初始库存'), '5.5');
  await user.click(screen.getByRole('button', { name: '保存材料' }));
  expect(await screen.findByRole('status')).toHaveTextContent('材料已新增');
  expect(await screen.findByText('马缰革')).toBeVisible();
});

it('shows an API creation error and keeps entered values', async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockImplementationOnce(() => json([])).mockImplementationOnce(() => json({ code: 'INVALID_QUANTITY', message: '数量格式不正确。' }, 400));
  render(<App />);
  await screen.findByText('还没有材料');
  await user.click(screen.getByRole('button', { name: '新增材料' }));
  await user.type(screen.getByLabelText('材料名称'), '马缰革');
  await user.type(screen.getByLabelText('材料类型', { selector: 'input' }), '牛皮');
  await user.type(screen.getByLabelText('颜色', { selector: 'input' }), '棕色');
  await user.type(screen.getByLabelText('计量单位'), '平方尺');
  await user.type(screen.getByLabelText('初始库存'), '99999999999');
  await user.click(screen.getByRole('button', { name: '保存材料' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('数量格式不正确');
  expect(screen.getByLabelText('材料名称')).toHaveValue('马缰革');
  expect(screen.getByLabelText('初始库存')).toHaveValue(99999999999);
});

it('keeps the adjustment quantity when stock is insufficient', async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockImplementationOnce(() => json([material])).mockImplementationOnce((_url, init) => {
    expect(init?.method).toBe('POST'); expect(JSON.parse(String(init?.body))).toEqual({ quantityDelta: '-20' });
    return json({ code: 'INSUFFICIENT_STOCK', message: '库存不足，无法完成扣减。' }, 409);
  });
  render(<App />);
  const card = (await screen.findByText('植鞣革')).closest('article')!;
  await user.click(within(card).getByRole('button', { name: '调整库存' }));
  await user.type(screen.getByLabelText('调整数量'), '-20');
  await user.click(screen.getByRole('button', { name: '确认调整' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('库存不足');
  expect(screen.getByLabelText('调整数量')).toHaveValue(-20);
});

it('shows the backend restriction when deleting a material with history', async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockImplementationOnce(() => json([material])).mockImplementationOnce((_url, init) => {
    expect(init?.method).toBe('DELETE');
    return json({ code: 'MATERIAL_HAS_HISTORY', message: '该材料仍有库存或出入库历史，无法删除。' }, 409);
  });
  render(<App />);
  const card = (await screen.findByText('植鞣革')).closest('article')!;
  await user.click(within(card).getByRole('button', { name: '删除' }));
  const dialog = screen.getByRole('dialog', { name: '确认删除材料' });
  await user.click(within(dialog).getByRole('button', { name: '确认删除' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('无法删除');
  expect(screen.queryByText('材料已删除')).not.toBeInTheDocument();
});
});

it('uses a mobile bottom navigation at narrow viewport', () => {
  mockViewport(true);
  render(<App />);
  const nav = screen.getByRole('navigation', { name: '移动端主导航' });
  expect(nav).toBeVisible();
  expect(within(nav).getByRole('link', { name: '材料库存' })).toHaveAttribute('aria-current', 'page');
  expect(screen.queryByRole('navigation', { name: '桌面端主导航' })).not.toBeInTheDocument();
});
