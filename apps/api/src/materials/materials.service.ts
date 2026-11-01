/* eslint-disable @typescript-eslint/no-explicit-any */
import { quantity } from '../inventory/quantity.js';
export type CreateMaterialInput = {
  name: string;
  type: string;
  color: string;
  unit: string;
  initialQuantity?: string;
  lowStockThreshold?: string;
};

type Database = {
  $transaction<T>(callback: (tx: Database) => Promise<T>): Promise<T>;
  material: { create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>> };
  inventoryMovement: {
    create(args: { data: Record<string, unknown> }): Promise<Record<string, unknown>>;
  };
};

export type MaterialResult = Record<string, unknown> & { id: string; currentQuantity: string };

export class MaterialsService {
  constructor(private readonly db: Database) {}

  async create(input: CreateMaterialInput): Promise<MaterialResult> {
    const initialQuantity = quantity(input.initialQuantity ?? '0.00');
    const lowStockThreshold = input.lowStockThreshold == null ? null : quantity(input.lowStockThreshold);

    return this.db.$transaction(async (tx) => {
      const material = await tx.material.create({
        data: {
          name: input.name,
          type: input.type,
          color: input.color,
          unit: input.unit,
          currentQuantity: initialQuantity,
          lowStockThreshold,
        },
      });

      await tx.inventoryMovement.create({
          data: {
            materialId: material.id,
            quantityDelta: initialQuantity,
            reason: 'OPENING_BALANCE',
            occurredAt: new Date(),
          },
      });

      return { ...material, currentQuantity: initialQuantity } as MaterialResult;
    });
  }

  async list(filters: { q?: string; type?: string; color?: string; stockStatus?: string }): Promise<Array<Record<string, unknown>>> {
    const items = await (this.db as any).material.findMany({ where: { ...(filters.type ? { type: filters.type } : {}), ...(filters.color ? { color: filters.color } : {}) } });
    return items.filter((item: any) => {
      const quantity = Number(item.currentQuantity);
      if (filters.q && ![item.name, item.type, item.color].some((value) => String(value).includes(filters.q!))) return false;
      if (filters.stockStatus === 'OUT_OF_STOCK') return quantity === 0;
      if (filters.stockStatus === 'LOW') return quantity > 0 && item.lowStockThreshold != null && quantity <= Number(item.lowStockThreshold);
      if (filters.stockStatus === 'NORMAL') return quantity > 0 && !(item.lowStockThreshold != null && quantity <= Number(item.lowStockThreshold));
      return true;
    }).map((item: any) => ({ ...item, currentQuantity: String(item.currentQuantity), lowStockThreshold: item.lowStockThreshold == null ? null : String(item.lowStockThreshold) }));
  }

  async remove(id: string): Promise<void> {
    await this.db.$transaction(async (tx: any) => {
      const material = await tx.material.findUnique({ where: { id }, include: { movements: { select: { reason: true, quantityDelta: true } } } });
      if (!material) throw new Error('MATERIAL_NOT_FOUND');
      const zeroOpeningOnly = material.movements.length === 1 && material.movements[0].reason === 'OPENING_BALANCE' && String(material.movements[0].quantityDelta) === '0.00';
      if ((String(material.currentQuantity) !== '0' && String(material.currentQuantity) !== '0.00') || (material.movements.length > 0 && !zeroOpeningOnly)) {
        const error = new Error('该材料仍有库存或出入库历史，无法删除。');
        (error as Error & { code?: string }).code = 'MATERIAL_HAS_HISTORY';
        throw error;
      }
      await tx.material.delete({ where: { id } });
    });
  }
}
