export type StockStatus = 'NORMAL' | 'LOW' | 'OUT_OF_STOCK';

export interface Material {
  id: string;
  name: string;
  type: string;
  color: string;
  unit: string;
  currentQuantity: string;
  lowStockThreshold: string | null;
}

export interface MaterialFilters {
  q: string;
  type: string;
  color: string;
  stockStatus: StockStatus | '';
}

export interface CreateMaterialInput {
  name: string;
  type: string;
  color: string;
  unit: string;
  initialQuantity: string;
  lowStockThreshold?: string;
}

export class ApiError extends Error {
  constructor(public readonly code: string, message: string) { super(message); }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: init?.body ? { 'Content-Type': 'application/json', ...init.headers } : init?.headers,
  });
  const body = await response.json().catch(() => null) as T | { code?: string; message?: string } | null;
  if (!response.ok) {
    const error = body as { code?: string; message?: string } | null;
    throw new ApiError(error?.code ?? 'UNKNOWN_ERROR', error?.message ?? '请求失败，请稍后重试。');
  }
  return body as T;
}

export const materialsApi = {
  list(filters: MaterialFilters) {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([key, value]) => { if (value) params.set(key, value); });
    const query = params.toString();
    return request<Material[]>(`/api/v1/materials${query ? `?${query}` : ''}`);
  },
  create(input: CreateMaterialInput) {
    return request<Material>('/api/v1/materials', { method: 'POST', body: JSON.stringify(input) });
  },
  adjust(id: string, quantityDelta: string) {
    return request<{ ok: true }>(`/api/v1/materials/${id}/adjustments`, { method: 'POST', body: JSON.stringify({ quantityDelta }) });
  },
  remove(id: string) {
    return request<{ ok: true }>(`/api/v1/materials/${id}`, { method: 'DELETE' });
  },
};
