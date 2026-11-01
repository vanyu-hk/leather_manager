export class InsufficientStockError extends Error {
  readonly code = 'INSUFFICIENT_STOCK';

  constructor() {
    super('库存不足，无法完成扣减。');
  }
}

import { cents, decimal, quantity } from './quantity.js';
type ChangeBalanceInput = { quantityDelta: string };

type Database = {
  $transaction<T>(callback: (tx: Database) => Promise<T>): Promise<T>;
  material: {
    findUnique(args: { where: { id: string } }): Promise<
      | { id: string; currentQuantity: unknown }
      | null
    >;
    update?: (args: { where: { id: string }; data: { currentQuantity: string } }) => Promise<unknown>;
    updateMany?: (args: Record<string, unknown>) => Promise<{ count: number }>;
  };
  inventoryMovement?: {
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
};

export class InventoryService {
  constructor(private readonly db: Database) {}

  async changeBalance(materialId: string, input: ChangeBalanceInput): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const delta = cents(input.quantityDelta);
      const material = await tx.material.findUnique({ where: { id: materialId } });
      if (!material) throw new Error('MATERIAL_NOT_FOUND');

      const next = cents(material.currentQuantity) + delta;
      if (next < 0n) throw new InsufficientStockError();

      const currentQuantity = decimal(next);
      if (delta < 0n && tx.material.updateMany) {
        // Conditional UPDATE prevents concurrent decrements from overdrawing the balance.
        const result = await tx.material.updateMany({ where: { id: materialId, currentQuantity: { gte: decimal(-delta) } }, data: { currentQuantity: { decrement: decimal(-delta) } } });
        if (result.count !== 1) throw new InsufficientStockError();
      } else await tx.material.update?.({ where: { id: materialId }, data: { currentQuantity } });
      await tx.inventoryMovement?.create({
        data: {
          materialId,
          quantityDelta: quantity(input.quantityDelta, true),
          reason: 'ADJUSTMENT',
          occurredAt: new Date(),
        },
      });
    });
  }
}
