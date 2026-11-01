import { useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ApiError, materialsApi, type CreateMaterialInput, type Material, type MaterialFilters, type StockStatus } from './api';
import { Dialog } from './Dialog';

const emptyFilters: MaterialFilters = { q: '', type: '', color: '', stockStatus: '' };
const stockLabels: Record<StockStatus, string> = { NORMAL: '库存正常', LOW: '库存偏低', OUT_OF_STOCK: '已耗尽' };

function statusOf(item: Material): StockStatus {
  const quantity = Number(item.currentQuantity);
  if (quantity === 0) return 'OUT_OF_STOCK';
  if (item.lowStockThreshold != null && quantity <= Number(item.lowStockThreshold)) return 'LOW';
  return 'NORMAL';
}

function errorMessage(error: unknown) { return error instanceof ApiError ? error.message : '网络异常，请稍后重试。'; }

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="field"><span>{label}</span>{children}</label>;
}

function CreateDialog({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [form, setForm] = useState<CreateMaterialInput>({ name: '', type: '', color: '', unit: '', initialQuantity: '', lowStockThreshold: '' });
  const [validation, setValidation] = useState('');
  const mutation = useMutation({ mutationFn: materialsApi.create, onSuccess });
  const update = (key: keyof CreateMaterialInput, value: string) => setForm((current) => ({ ...current, [key]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault(); setValidation('');
    if (!form.name.trim() || !form.type.trim() || !form.color.trim() || !form.unit.trim()) { setValidation('请填写所有必填项。'); return; }
    if (form.initialQuantity === '' || Number(form.initialQuantity) < 0 || !Number.isFinite(Number(form.initialQuantity))) { setValidation('初始库存必须是大于或等于零的数字。'); return; }
    if (form.lowStockThreshold && (Number(form.lowStockThreshold) < 0 || !Number.isFinite(Number(form.lowStockThreshold)))) { setValidation('低库存阈值必须是大于或等于零的数字。'); return; }
    mutation.mutate({ ...form, name: form.name.trim(), type: form.type.trim(), color: form.color.trim(), unit: form.unit.trim(), ...(form.lowStockThreshold ? {} : { lowStockThreshold: undefined }) });
  };
  return <Dialog title="新增材料" onClose={onClose}><form onSubmit={submit} className="form-grid">
    <Field label="材料名称"><input value={form.name} onChange={(e) => update('name', e.target.value)} required /></Field>
    <Field label="材料类型"><input value={form.type} onChange={(e) => update('type', e.target.value)} required placeholder="如：牛皮、五金" /></Field>
    <Field label="颜色"><input value={form.color} onChange={(e) => update('color', e.target.value)} required /></Field>
    <Field label="计量单位"><input value={form.unit} onChange={(e) => update('unit', e.target.value)} required placeholder="如：平方尺、个" /></Field>
    <Field label="初始库存"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.initialQuantity} onChange={(e) => update('initialQuantity', e.target.value)} required /></Field>
    <Field label="低库存阈值（可选）"><input type="number" inputMode="decimal" min="0" step="0.01" value={form.lowStockThreshold} onChange={(e) => update('lowStockThreshold', e.target.value)} /></Field>
    {(validation || mutation.error) && <p className="message error" role="alert">{validation || errorMessage(mutation.error)}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? '保存中…' : '保存材料'}</button></div>
  </form></Dialog>;
}

function AdjustDialog({ material, onClose, onSuccess }: { material: Material; onClose: () => void; onSuccess: () => void }) {
  const [quantity, setQuantity] = useState('');
  const [validation, setValidation] = useState('');
  const mutation = useMutation({ mutationFn: () => materialsApi.adjust(material.id, quantity), onSuccess });
  const submit = (event: FormEvent) => { event.preventDefault(); setValidation(''); if (!quantity || Number(quantity) === 0 || !Number.isFinite(Number(quantity))) { setValidation('请输入非零的调整数量。'); return; } mutation.mutate(); };
  return <Dialog title={`调整库存 · ${material.name}`} onClose={onClose}><form onSubmit={submit} className="form-grid">
    <p className="form-note">当前库存 <strong>{material.currentQuantity} {material.unit}</strong>。入库填写正数，出库填写负数。</p>
    <Field label="调整数量"><input type="number" inputMode="decimal" step="0.01" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder="如：5 或 -2.5" required /></Field>
    <p className="reason-note">记录原因：库存调整（ADJUSTMENT）</p>
    {(validation || mutation.error) && <p className="message error" role="alert">{validation || errorMessage(mutation.error)}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button className="button primary" disabled={mutation.isPending}>{mutation.isPending ? '调整中…' : '确认调整'}</button></div>
  </form></Dialog>;
}

function DeleteDialog({ material, onClose, onSuccess }: { material: Material; onClose: () => void; onSuccess: () => void }) {
  const mutation = useMutation({ mutationFn: () => materialsApi.remove(material.id), onSuccess });
  return <Dialog title="确认删除材料" onClose={onClose}><p>确定删除“{material.name}”吗？只有零库存且没有出入库历史的材料可以删除。</p>
    {mutation.error && <p className="message error" role="alert">{errorMessage(mutation.error)}</p>}
    <div className="dialog-actions"><button type="button" className="button secondary" onClick={onClose}>取消</button><button type="button" className="button danger" disabled={mutation.isPending} onClick={() => mutation.mutate()}>{mutation.isPending ? '删除中…' : '确认删除'}</button></div>
  </Dialog>;
}

export function MaterialPage() {
  const client = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const filters: MaterialFilters = {
    q: searchParams.get('q') ?? emptyFilters.q,
    type: searchParams.get('type') ?? emptyFilters.type,
    color: searchParams.get('color') ?? emptyFilters.color,
    stockStatus: (searchParams.get('stockStatus') as StockStatus | null) ?? emptyFilters.stockStatus,
  };
  const [createOpen, setCreateOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<Material | null>(null);
  const [deleting, setDeleting] = useState<Material | null>(null);
  const [notice, setNotice] = useState('');
  const hasFilters = Object.values(filters).some(Boolean);
  const facetsQuery = useQuery({ queryKey: ['materials', 'facets'], queryFn: () => materialsApi.list(emptyFilters) });
  const filteredQuery = useQuery({ queryKey: ['materials', 'filtered', filters], queryFn: () => materialsApi.list(filters), enabled: hasFilters });
  const query = hasFilters ? filteredQuery : facetsQuery;
  const materials = query.data ?? [];
  const types = useMemo(() => [...new Set((facetsQuery.data ?? []).map((item) => item.type))], [facetsQuery.data]);
  const colors = useMemo(() => [...new Set((facetsQuery.data ?? []).map((item) => item.color))], [facetsQuery.data]);
  const updateFilter = (key: keyof MaterialFilters, value: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value); else next.delete(key);
    setSearchParams(next, { replace: key === 'q' });
  };
  const completed = async (message: string, close: () => void) => { close(); setNotice(message); await client.invalidateQueries({ queryKey: ['materials'] }); };

  return <section className="page">
    <header className="page-header"><div><p className="eyebrow">工作室 · 库存</p><h1>材料库存</h1><p>管理皮料、五金与辅料的库存状态。</p></div><button aria-label="新增材料" className="button primary add-button" onClick={() => { setNotice(''); setCreateOpen(true); }}>＋ 新增材料</button></header>
    {notice && <div className="message success" role="status">{notice}</div>}
    <div className="filter-panel">
      <label className="search-field"><span className="sr-only">搜索材料</span><span aria-hidden="true">⌕</span><input type="search" aria-label="搜索材料" placeholder="搜索名称、类型或颜色" value={filters.q} onChange={(e) => updateFilter('q', e.target.value)} /></label>
      <label><span>材料类型</span><select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)}><option value="">全部类型</option>{types.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>颜色</span><select value={filters.color} onChange={(e) => updateFilter('color', e.target.value)}><option value="">全部颜色</option>{colors.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label><span>库存状态</span><select value={filters.stockStatus} onChange={(e) => updateFilter('stockStatus', e.target.value)}><option value="">全部状态</option><option value="NORMAL">库存正常</option><option value="LOW">库存偏低</option><option value="OUT_OF_STOCK">已耗尽</option></select></label>
    </div>
    {query.isPending && <div className="state-card" role="status"><span className="spinner" />正在读取材料库存…</div>}
    {query.isError && <div className="state-card error-state" role="alert"><strong>材料库存加载失败</strong><span>{errorMessage(query.error)}</span><button className="button secondary" onClick={() => query.refetch()}>重新加载</button></div>}
    {query.isSuccess && materials.length === 0 && <div className="state-card empty-state"><span className="empty-icon">⌑</span><strong>还没有材料</strong><span>新增第一项材料，开始记录工作室库存。</span></div>}
    {query.isSuccess && materials.length > 0 && <div className="materials-grid">{materials.map((item) => { const status = statusOf(item); return <article className="material-card" key={item.id}>
      <div className="card-top"><div className="material-swatch" aria-hidden="true">{item.name.slice(0, 1)}</div><div><h2>{item.name}</h2><p>{item.type} · {item.color}</p></div><span className={`status ${status.toLowerCase()}`}>{stockLabels[status]}</span></div>
      <div className="quantity"><span>当前库存</span><strong>{item.currentQuantity} {item.unit}</strong></div>
      <div className="threshold">低库存阈值：{item.lowStockThreshold == null ? '未设置' : `${item.lowStockThreshold} ${item.unit}`}</div>
      <div className="card-actions"><button className="button secondary" onClick={() => setAdjusting(item)}>调整库存</button><button className="button text-danger" onClick={() => setDeleting(item)}>删除</button></div>
    </article>; })}</div>}
    {createOpen && <CreateDialog onClose={() => setCreateOpen(false)} onSuccess={() => void completed('材料已新增。', () => setCreateOpen(false))} />}
    {adjusting && <AdjustDialog material={adjusting} onClose={() => setAdjusting(null)} onSuccess={() => void completed('库存已调整。', () => setAdjusting(null))} />}
    {deleting && <DeleteDialog material={deleting} onClose={() => setDeleting(null)} onSuccess={() => void completed('材料已删除。', () => setDeleting(null))} />}
  </section>;
}
