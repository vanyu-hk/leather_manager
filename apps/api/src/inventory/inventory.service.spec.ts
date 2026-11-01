import { describe, expect, it } from 'vitest';
import { InventoryService } from './inventory.service.js';

describe('InventoryService', () => {
  it('rejects a decrease that would make inventory negative', async () => {
    const service = new InventoryService(new BalanceDatabase('2.00') as never);

    await expect(
      service.changeBalance('material-1', {
        quantityDelta: '-3.00',
        note: '盘点',
      }),
    ).rejects.toMatchObject({ code: 'INSUFFICIENT_STOCK' });
  });

  it('normalizes a successful adjustment and persists one ADJUSTMENT movement', async () => {
    const db = new WritableBalanceDatabase('1.00');
    await new InventoryService(db as never).changeBalance('material-1', { quantityDelta: '1', note: '盘点' });
    expect(db.currentQuantity).toBe('2.00');
    expect(db.movements).toEqual([expect.objectContaining({ reason: 'ADJUSTMENT', quantityDelta: '1.00', note: '盘点' })]);
  });
});

class BalanceDatabase {
  constructor(private readonly quantity: string) {}

  material = {
    findUnique: async () => ({ id: 'material-1', currentQuantity: this.quantity }),
  };

  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

class WritableBalanceDatabase {
  currentQuantity: string; movements: Array<Record<string, unknown>> = [];
  constructor(quantity: string) { this.currentQuantity = quantity; }
  material = { findUnique: async () => ({ id: 'material-1', currentQuantity: this.currentQuantity }), update: async ({ data }: { data: { currentQuantity: string } }) => { this.currentQuantity = data.currentQuantity; } };
  inventoryMovement = { create: async ({ data }: { data: Record<string, unknown> }) => { this.movements.push(data); } };
  async $transaction<T>(callback: (tx: this) => Promise<T>): Promise<T> { return callback(this); }
}
