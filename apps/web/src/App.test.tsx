import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { Dialog } from './Dialog';

const styles = readFileSync(`${process.cwd()}/src/styles.css`, 'utf8');

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
  window.history.replaceState({}, '', '/materials');
  mockViewport(false);
  vi.stubGlobal('fetch', vi.fn(() => json([material])));
});

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('材料库存', () => {
it('restores URL-synced filters across browser Back, Forward, and reload-style remounts', async () => {
  const user = userEvent.setup();
  const second = { ...material, id: 'material-2', name: '黄铜扣', type: '五金', color: '黄铜色' };
  vi.mocked(fetch).mockImplementation(() => json([material, second]));
  const view = render(<App />);
  await screen.findByText('植鞣革');
  await user.type(screen.getByRole('searchbox', { name: '搜索材料' }), '植鞣');
  await user.selectOptions(screen.getByLabelText('材料类型'), '牛皮');
  await user.selectOptions(screen.getByLabelText('颜色'), '原色');
  await user.selectOptions(screen.getByLabelText('库存状态'), 'NORMAL');
  expect(window.location.search).toContain('q=%E6%A4%8D%E9%9E%A3');
  expect(window.location.search).toContain('type=%E7%89%9B%E7%9A%AE');
  expect(window.location.search).toContain('color=%E5%8E%9F%E8%89%B2');
  expect(window.location.search).toContain('stockStatus=NORMAL');
  const wentBack = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
  await act(async () => { window.history.back(); await wentBack; });
  await waitFor(() => expect(screen.getByLabelText('库存状态')).toHaveValue(''));
  const wentForward = new Promise<void>((resolve) => window.addEventListener('popstate', () => resolve(), { once: true }));
  await act(async () => { window.history.forward(); await wentForward; });
  await waitFor(() => expect(screen.getByLabelText('库存状态')).toHaveValue('NORMAL'));
  const savedUrl = window.location.href;
  view.unmount();
  window.history.replaceState({}, '', savedUrl);
  render(<App />);
  expect(await screen.findByRole('searchbox', { name: '搜索材料' })).toHaveValue('植鞣');
  await waitFor(() => expect(screen.getByLabelText('材料类型')).toHaveValue('牛皮'));
});

it('keeps complete type and color facets while filtered rows change', async () => {
  const user = userEvent.setup();
  const hardware = { ...material, id: 'material-2', name: '黄铜扣', type: '五金', color: '黄铜色' };
  window.history.replaceState({}, '', '/materials?type=%E7%89%9B%E7%9A%AE');
  vi.mocked(fetch).mockImplementation((input) => {
    const url = String(input);
    if (url.includes('type=')) return json(url.includes('%E7%89%9B%E7%9A%AE') ? [material] : [hardware]);
    return json([material, hardware]);
  });
  render(<App />);
  await screen.findByText('植鞣革');
  await user.selectOptions(screen.getByLabelText('材料类型'), '牛皮');
  expect(await screen.findByText('植鞣革')).toBeVisible();
  expect(screen.getByRole('option', { name: '五金' })).toBeInTheDocument();
  await user.selectOptions(screen.getByLabelText('材料类型'), '五金');
  expect(await screen.findByText('黄铜扣')).toBeVisible();
  expect(screen.getByRole('option', { name: '原色' })).toBeInTheDocument();
});
it('shows a Chinese loading error and retries the request', async () => {
  const user = userEvent.setup();
  let finish!: (response: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>((resolve) => { finish = resolve; })).mockImplementationOnce(() => json([material]));
  render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('正在读取材料库存');
  finish(await json({ code: 'SERVER_ERROR', message: '库存服务暂时不可用。' }, 500));
  expect(await screen.findByRole('alert')).toHaveTextContent('库存服务暂时不可用');
  await user.click(screen.getByRole('button', { name: '重新加载' }));
  expect(await screen.findByText('植鞣革')).toBeVisible();
  expect(fetch).toHaveBeenCalledTimes(2);
});

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

it.each([['5.25', '5.25'], ['-2.50', '-2.5']])('submits a successful %s decimal adjustment and refreshes the list', async (quantity, expectedQuantity) => {
  const user = userEvent.setup();
  vi.mocked(fetch)
    .mockImplementationOnce(() => json([material]))
    .mockImplementationOnce((_url, init) => { expect(JSON.parse(String(init?.body))).toEqual({ quantityDelta: expectedQuantity }); return json({ ok: true }); })
    .mockImplementationOnce(() => json([{ ...material, currentQuantity: quantity.startsWith('-') ? '10.00' : '17.75' }]));
  render(<App />);
  const card = (await screen.findByText('植鞣革')).closest('article')!;
  await user.click(within(card).getByRole('button', { name: '调整库存' }));
  await user.type(screen.getByLabelText('调整数量'), quantity);
  await user.click(screen.getByRole('button', { name: '确认调整' }));
  expect(await screen.findByRole('status')).toHaveTextContent('库存已调整');
  await waitFor(() => expect(fetch).toHaveBeenCalledTimes(3));
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

it('deletes a material only after the API succeeds and refreshes the list', async () => {
  const user = userEvent.setup();
  vi.mocked(fetch).mockImplementationOnce(() => json([material])).mockImplementationOnce((_url, init) => {
    expect(init?.method).toBe('DELETE'); return json({ ok: true });
  }).mockImplementationOnce(() => json([]));
  render(<App />);
  const card = (await screen.findByText('植鞣革')).closest('article')!;
  await user.click(within(card).getByRole('button', { name: '删除' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '确认删除' }));
  expect(await screen.findByRole('status')).toHaveTextContent('材料已删除');
  expect(await screen.findByText('还没有材料')).toBeVisible();
});

it('traps focus in the dialog in both directions, closes with Escape, and restores focus', async () => {
  const user = userEvent.setup();
  const { container } = render(<App />);
  const opener = await screen.findByRole('button', { name: '新增材料' });
  await user.click(opener);
  const dialog = screen.getByRole('dialog', { name: '新增材料' });
  const first = within(dialog).getByLabelText('材料名称');
  const firstTabStop = within(dialog).getByRole('button', { name: '关闭' });
  const last = within(dialog).getByRole('button', { name: '保存材料' });
  expect(first).toHaveFocus();
  expect(container).toHaveAttribute('inert');
  firstTabStop.focus();
  await user.tab({ shift: true });
  expect(last).toHaveFocus();
  await user.tab();
  expect(firstTabStop).toHaveFocus();
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
  expect(container).not.toHaveAttribute('inert');
});

it('does not reset dialog focus when a parent rerenders with a fresh close callback', async () => {
  const onClose = vi.fn();
  const preHidden = document.createElement('div');
  preHidden.setAttribute('inert', ''); preHidden.inert = true; preHidden.setAttribute('aria-hidden', 'false');
  document.body.append(preHidden);
  const view = render(<Dialog title="重渲染测试" onClose={() => onClose()}><label>第一项<input /></label><label>第二项<input /></label></Dialog>);
  const second = screen.getByLabelText('第二项');
  second.focus();
  view.rerender(<Dialog title="重渲染测试" onClose={() => onClose()}><label>第一项<input /></label><label>第二项<input /></label></Dialog>);
  expect(second).toHaveFocus();
  await userEvent.setup().keyboard('{Escape}');
  expect(onClose).toHaveBeenCalledOnce();
  view.unmount();
  expect(preHidden).toHaveAttribute('inert');
  expect(preHidden).toHaveAttribute('aria-hidden', 'false');
  preHidden.remove();
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

it('routes all five navigation destinations without presenting fake content', async () => {
  const user = userEvent.setup();
  render(<App />);
  for (const destination of ['仪表盘', '作品库', '成品档案', '设置']) {
    await user.click(screen.getByRole('link', { name: destination }));
    expect(screen.getByRole('heading', { name: destination })).toBeVisible();
    expect(screen.getByText('这个功能正在开发中，敬请期待。')).toBeVisible();
  }
  await user.click(screen.getByRole('link', { name: '材料库存' }));
  expect(screen.getByRole('heading', { name: '材料库存' })).toBeVisible();
});

it('keeps narrow layouts fluid and wraps card content to prevent horizontal overflow', () => {
  expect(styles).toContain('min-width: 280px');
  expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.main-content \{ margin-left: 0;/);
  expect(styles).toMatch(/@media \(max-width: 760px\)[\s\S]*?\.page \{ padding: 28px 16px 40px;/);
  expect(styles).toContain('grid-template-columns: 44px minmax(0, 1fr)');
  expect(styles).toContain('overflow-wrap: anywhere');
});
